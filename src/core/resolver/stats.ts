/**
 * Phase 3 and 4: the stat engine.
 *
 * Stats resolve lazily and memoise, so a CON modifier that feeds HP, and HP that
 * feeds nothing, both come out right without a hand-written evaluation order.
 * A stat that depends on itself reports a cycle rather than looping.
 *
 * Stacking, from the spec: `base` candidates compete and the highest wins;
 * modifiers sharing a `stackKey` don't stack; `min` is a floor. Modifiers with a
 * `when` never fold into the value — they attach as annotations.
 */

import { ABILITIES, type Ability, type Diagnostic, type Modifier, type ProficiencyLevel } from "../types";
import type { ContentIndex } from "../content";
import { evaluate, type ExprContext } from "../expr/evaluate";
import type { PartSource } from "./collect";
import type { Annotation, Contribution, NumericStat, SetStat } from "./resolved";

export interface StatInput {
  mod: Modifier;
  from: PartSource;
  /** True when the modifier comes from an active effect rather than the build. */
  fromEffect?: boolean;
}

export interface BaseResult {
  value: number;
  /** Rows shown before the modifiers in a breakdown tooltip. */
  rows: Contribution[];
}

export interface BaseProvider {
  (path: string, info: { proficiency: ProficiencyLevel; engine: StatEngine }): BaseResult | undefined;
}

export interface StatEngineOptions {
  index: ContentIndex;
  modifiers: StatInput[];
  /** Base values for computed paths: abilities, saves, HP, and so on. */
  base: BaseProvider;
  totalLevel: number;
  classLevel(ref: string): number;
  table(ref: string, column: string): number | undefined;
  /** Short keys of the classes this character casts from, for the fan-out. */
  spellcastingKeys?: readonly string[];
}

const PROFICIENCY_ORDER: ProficiencyLevel[] = ["none", "half", "proficient", "expertise"];

const SET_PATH_PREFIXES = ["resistances", "immunities", "vulnerabilities", "languages", "proficiencies", "conditionImmunities"];

export function proficiencyRank(level: ProficiencyLevel): number {
  return PROFICIENCY_ORDER.indexOf(level);
}

export function proficiencyMultiplier(level: ProficiencyLevel): number {
  switch (level) {
    case "half":
      return 0.5;
    case "proficient":
      return 1;
    case "expertise":
      return 2;
    default:
      return 0;
  }
}

/** The members of each open family, for the `.all` fan-outs below. */
export interface TargetFamilies {
  /**
   * Which skills exist. Content's business, not the engine's — a source that adds
   * a skill gets it covered by "skills.all" without the engine learning its name.
   */
  skills?: readonly string[];
  /**
   * The short keys of the classes this character casts from. The character's, not
   * content's: "spellcasting.all.dc" on a Rod of the Pact Keeper has to mean the
   * classes the holder actually casts with, and a fighter holding it gets nothing.
   */
  spellcasting?: readonly string[];
}

/**
 * "saves.all" and friends fan out to every member of the family.
 *
 * `attacks.all` is deliberately absent: `resolver/attacks.ts` reads it directly
 * when it assembles an attack, because the member there is the weapon in hand
 * rather than anything knowable here.
 */
export function expandTarget(target: string, families: TargetFamilies = {}): string[] {
  if (target === "saves.all") return ABILITIES.map((a) => `saves.${a}`);
  if (target === "checks.all") return ABILITIES.map((a) => `checks.${a}`);
  if (target === "skills.all") return (families.skills ?? []).map((s) => `skills.${s}`);
  if (target === "abilities.all.score") return ABILITIES.map((a) => `abilities.${a}.score`);
  // "spellcasting.all.dc" and "spellcasting.all.attack"
  const spellcasting = target.match(/^spellcasting\.all\.(dc|attack)$/);
  if (spellcasting) {
    return (families.spellcasting ?? []).map((key) => `spellcasting.${key}.${spellcasting[1]}`);
  }
  return [target];
}

export class StatEngine {
  private readonly byPath = new Map<string, StatInput[]>();
  private readonly numeric = new Map<string, NumericStat>();
  private readonly sets = new Map<string, SetStat>();
  private readonly resolving = new Set<string>();
  readonly diagnostics: Diagnostic[] = [];
  readonly ctx: ExprContext;

  constructor(private readonly opts: StatEngineOptions) {
    for (const input of opts.modifiers) {
      for (const target of expandTarget(input.mod.target, {
        skills: opts.index.skillKeys(),
        spellcasting: opts.spellcastingKeys,
      })) {
        const list = this.byPath.get(target) ?? [];
        list.push(target === input.mod.target ? input : { ...input, mod: { ...input.mod, target } });
        this.byPath.set(target, list);
      }
    }
    this.ctx = {
      lookup: (path) => this.lookup(path),
      classLevel: (ref) => opts.classLevel(ref),
      table: (ref, column) => opts.table(ref, column),
    };
  }

  /** Every path with a modifier or a declared definition. */
  paths(): string[] {
    const out = new Set<string>(this.byPath.keys());
    for (const def of this.opts.index.allStatPaths()) if (!def.key.includes("*")) out.add(def.key);
    return [...out];
  }

  modifiersFor(path: string): StatInput[] {
    return this.byPath.get(path) ?? [];
  }

  isSetPath(path: string): boolean {
    const def = this.opts.index.statPath(path);
    if (def) return def.valueType === "set";
    if (SET_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}.`))) return true;
    return this.modifiersFor(path).some((i) => i.mod.op === "include");
  }

  private lookup(path: string): number | undefined {
    if (path === "level") return this.opts.totalLevel;
    if (path === "prof") return this.get("proficiencyBonus").value;
    const abilityMod = path.match(/^abilities\.(str|dex|con|int|wis|cha)\.mod$/);
    if (abilityMod) return this.abilityMod(abilityMod[1] as Ability);
    if (this.isSetPath(path)) return undefined;
    const known =
      this.byPath.has(path) || this.opts.index.statPath(path) !== undefined || this.isComputedPath(path);
    if (!known) return undefined;
    return this.get(path).value;
  }

  private isComputedPath(path: string): boolean {
    return (
      path === "proficiencyBonus" ||
      path === "initiative" ||
      path === "ac" ||
      path === "hp.max" ||
      /^abilities\.(str|dex|con|int|wis|cha)\.score$/.test(path) ||
      /^(saves|checks)\.(str|dex|con|int|wis|cha)$/.test(path) ||
      /^skills\./.test(path) ||
      /^spellcasting\./.test(path)
    );
  }

  abilityMod(ability: Ability): number {
    return Math.floor((this.get(`abilities.${ability}.score`).value - 10) / 2);
  }

  /** Resolved proficiency level for a path: the highest any modifier grants. */
  proficiencyFor(path: string): ProficiencyLevel {
    let best: ProficiencyLevel = "none";
    for (const { mod } of this.modifiersFor(path)) {
      if (mod.op !== "proficiency" || mod.when) continue;
      const level = (typeof mod.value === "string" ? mod.value : "proficient") as ProficiencyLevel;
      if (proficiencyRank(level) > proficiencyRank(best)) best = level;
    }
    return best;
  }

  get(path: string): NumericStat {
    const cached = this.numeric.get(path);
    if (cached) return cached;

    if (this.resolving.has(path)) {
      this.diagnostics.push({
        severity: "error",
        code: "expression-cycle",
        message: `"${path}" depends on itself`,
        subject: path,
      });
      const broken: NumericStat = {
        path,
        value: 0,
        base: 0,
        breakdown: [],
        annotations: [],
        advantage: "none",
      };
      // Cached so the cycle is reported once and the rest of the sheet still resolves.
      this.numeric.set(path, broken);
      return broken;
    }
    this.resolving.add(path);
    const stat = this.compute(path);
    this.resolving.delete(path);
    this.numeric.set(path, stat);
    return stat;
  }

  getSet(path: string): SetStat {
    const cached = this.sets.get(path);
    if (cached) return cached;
    const def = this.opts.index.statPath(path);
    const values: string[] = [];
    const breakdown: Contribution[] = [];
    const annotations: Annotation[] = [];

    for (const input of this.modifiersFor(path)) {
      const { mod, from } = input;
      const raw = mod.value;
      const incoming = Array.isArray(raw) ? raw.map(String) : raw === undefined ? [] : [String(raw)];
      if (mod.when) {
        annotations.push({
          when: mod.when,
          op: mod.op,
          value: incoming,
          source: from.element.id,
          sourceName: from.element.name,
        });
        continue;
      }
      if (mod.op === "set") {
        values.length = 0;
        values.push(...incoming);
      } else if (mod.op === "include") {
        for (const v of incoming) if (!values.includes(v)) values.push(v);
      } else {
        this.diagnostics.push({
          severity: "warning",
          code: "unknown-op",
          message: `op "${mod.op}" has no meaning on set stat "${path}"; ignored`,
          subject: from.element.id,
        });
        continue;
      }
      breakdown.push({
        source: from.element.id,
        sourceName: from.element.name,
        op: mod.op,
        value: incoming,
        applied: true,
        fromEffect: input.fromEffect,
      });
    }

    const stat: SetStat = { path, values, breakdown, annotations };
    if (def?.label) stat.path = path;
    this.sets.set(path, stat);
    return stat;
  }

  private compute(path: string): NumericStat {
    const inputs = this.modifiersFor(path);
    const proficiency = this.proficiencyFor(path);
    const annotations: Annotation[] = [];
    const breakdown: Contribution[] = [];

    const provided = this.opts.base(path, { proficiency, engine: this });
    const definition = this.opts.index.statPath(path);
    let baseValue = provided?.value ?? 0;
    if (provided) breakdown.push(...provided.rows);
    else if (definition?.base !== undefined) {
      const { value, row } = this.evaluateFor(definition.base, {
        source: definition.id,
        sourceName: definition.label ?? definition.name,
        op: "base",
      });
      baseValue = value;
      breakdown.push(row);
    } else if (!this.byPath.has(path) && !this.isComputedPath(path)) {
      this.diagnostics.push({
        severity: "info",
        code: "unknown-stat-path",
        message: `"${path}" has no definition; treated as 0`,
        subject: path,
      });
    }

    // Split by op, evaluating expressions as we go.
    type Candidate = { value: number; row: Contribution; stackKey?: string };
    const baseCandidates: Candidate[] = [];
    const setValues: Candidate[] = [];
    const adds: Candidate[] = [];
    const multipliers: Candidate[] = [];
    const floors: Candidate[] = [];
    const ceilings: Candidate[] = [];
    let advantage = false;
    let disadvantage = false;

    for (const input of inputs) {
      const { mod, from } = input;
      if (mod.when) {
        annotations.push({
          when: mod.when,
          op: mod.op,
          value: numericish(mod.value) ? this.tryValue(mod.value) : (mod.value as string | string[]),
          source: from.element.id,
          sourceName: from.element.name,
        });
        continue;
      }
      const meta = { source: from.element.id, sourceName: from.element.name, op: mod.op, fromEffect: input.fromEffect };
      switch (mod.op) {
        case "advantage":
          advantage = true;
          breakdown.push({ ...meta, value: "advantage", applied: true });
          break;
        case "disadvantage":
          disadvantage = true;
          breakdown.push({ ...meta, value: "disadvantage", applied: true });
          break;
        case "proficiency": {
          const level = (typeof mod.value === "string" ? mod.value : "proficient") as ProficiencyLevel;
          breakdown.push({ ...meta, value: level, applied: level === proficiency });
          break;
        }
        case "include":
          this.diagnostics.push({
            severity: "warning",
            code: "unknown-op",
            message: `op "include" has no meaning on numeric stat "${path}"; ignored`,
            subject: from.element.id,
          });
          break;
        case "base":
        case "set":
        case "add":
        case "multiply":
        case "min":
        case "max": {
          const { value, row } = this.evaluateFor(mod.value as string | number, { ...meta, op: mod.op }, mod.stackKey);
          const bucket: { value: number; row: Contribution; stackKey?: string }[] =
            mod.op === "base"
              ? baseCandidates
              : mod.op === "set"
                ? setValues
                : mod.op === "add"
                  ? adds
                  : mod.op === "multiply"
                    ? multipliers
                    : mod.op === "min"
                      ? floors
                      : ceilings;
          bucket.push({ value, row, stackKey: mod.stackKey });
          break;
        }
        default:
          this.diagnostics.push({
            severity: "warning",
            code: "unknown-op",
            message: `unknown op "${mod.op}" on "${path}"; shown as text only`,
            subject: from.element.id,
          });
          breakdown.push({ ...meta, value: String(mod.value ?? ""), applied: false, suppressedBy: "unknown op" });
      }
    }

    // `base` candidates compete with the computed base; the highest wins. This is how
    // armour, Unarmored Defense and Mage Armor coexist.
    let value = baseValue;
    if (baseCandidates.length) {
      const best = baseCandidates.reduce((a, b) => (b.value > a.value ? b : a));
      if (best.value >= value) {
        value = best.value;
        for (const row of breakdown) if (row.op === "base") markSuppressed(row, best.row.sourceName);
      }
      for (const candidate of baseCandidates) {
        candidate.row.applied = candidate === best && best.value >= baseValue;
        if (!candidate.row.applied) candidate.row.suppressedBy = candidate === best ? "the stat's own base" : best.row.sourceName;
        breakdown.push(candidate.row);
      }
    }

    if (setValues.length) {
      const best = setValues.reduce((a, b) => (b.value > a.value ? b : a));
      value = best.value;
      for (const s of setValues) {
        s.row.applied = s === best;
        if (!s.row.applied) s.row.suppressedBy = best.row.sourceName;
        breakdown.push(s.row);
      }
      for (const row of breakdown) if (row.op === "base" && row.applied) markSuppressed(row, best.row.sourceName);
    }

    // Modifiers sharing a stackKey don't stack; the largest applies.
    const bestMultiplierByKey = new Map<string, { value: number; row: Contribution }>();
    for (const multiplier of multipliers) {
      if (!multiplier.stackKey) continue;
      const current = bestMultiplierByKey.get(multiplier.stackKey);
      if (!current || multiplier.value > current.value) bestMultiplierByKey.set(multiplier.stackKey, multiplier);
    }

    const bestByKey = new Map<string, { value: number; row: Contribution }>();
    for (const add of adds) {
      if (!add.stackKey) continue;
      const current = bestByKey.get(add.stackKey);
      if (!current || add.value > current.value) bestByKey.set(add.stackKey, add);
    }
    for (const add of adds) {
      const winner = add.stackKey ? bestByKey.get(add.stackKey) : undefined;
      const applied = !add.stackKey || winner === add;
      add.row.applied = applied;
      if (!applied) add.row.suppressedBy = winner?.row.sourceName;
      if (applied) value += add.value;
      breakdown.push(add.row);
    }

    // Multiplication comes after the bonuses, because "your speed is doubled"
    // doubles the speed you have, and before the clamps, because a floor still
    // holds afterwards. Several multipliers compose, the way several bonuses
    // accumulate; the result rounds down, as 5e rounds down.
    for (const multiplier of multipliers) {
      const winner = multiplier.stackKey ? bestMultiplierByKey.get(multiplier.stackKey) : undefined;
      const applied = !multiplier.stackKey || winner === multiplier;
      multiplier.row.applied = applied;
      if (!applied) multiplier.row.suppressedBy = winner?.row.sourceName;
      if (applied) value = Math.floor(value * multiplier.value);
      breakdown.push(multiplier.row);
    }

    for (const floor of floors) {
      const applied = floor.value > value;
      floor.row.applied = applied;
      if (applied) value = floor.value;
      else floor.row.suppressedBy = "already higher";
      breakdown.push(floor.row);
    }
    for (const ceiling of ceilings) {
      const applied = ceiling.value < value;
      ceiling.row.applied = applied;
      if (applied) value = ceiling.value;
      else ceiling.row.suppressedBy = "already lower";
      breakdown.push(ceiling.row);
    }

    if (definition?.floor !== undefined && value < definition.floor) value = definition.floor;

    return {
      path,
      value,
      base: baseValue,
      breakdown,
      annotations,
      advantage: advantage && disadvantage ? "both" : advantage ? "advantage" : disadvantage ? "disadvantage" : "none",
      proficiency: proficiency === "none" ? undefined : proficiency,
    };
  }

  private evaluateFor(
    expr: string | number | undefined,
    meta: { source: string; sourceName: string; op: Contribution["op"]; fromEffect?: boolean },
    stackKey?: string,
  ): { value: number; row: Contribution } {
    if (expr === undefined)
      return {
        value: 0,
        row: { ...meta, value: 0, applied: false, suppressedBy: "no value", stackKey },
      };
    try {
      const value = evaluate(expr, this.ctx);
      return { value, row: { ...meta, value, applied: true, stackKey } };
    } catch (e) {
      this.diagnostics.push({
        severity: "warning",
        code: "expression-error",
        message: e instanceof Error ? e.message : String(e),
        subject: meta.source,
      });
      return {
        value: 0,
        row: { ...meta, value: String(expr), applied: false, suppressedBy: "expression error", stackKey },
      };
    }
  }

  private tryValue(expr: unknown): number | string {
    if (typeof expr !== "number" && typeof expr !== "string") return String(expr);
    try {
      return evaluate(expr, this.ctx);
    } catch {
      return String(expr);
    }
  }
}

function numericish(v: unknown): v is number | string {
  return typeof v === "number" || typeof v === "string";
}

function markSuppressed(row: Contribution, by: string): void {
  row.applied = false;
  row.suppressedBy = by;
}
