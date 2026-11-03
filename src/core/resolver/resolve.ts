/**
 * The resolver: a pure function from loaded content plus a character's files to a
 * resolved character. The sheet, the builder and every exporter read its output,
 * and none of them compute rules themselves.
 *
 * Order of operations, per the spec:
 *   1. Collect elements, following grants recursively.
 *   2. Check choices.
 *   3. Compute stats (base, modifiers, `base` races, stackKey rules).
 *   4. Attach situational modifiers as annotations.
 *   5. Overlay live state, when state.5e is supplied.
 *
 * Stats are computed twice when state is supplied: once to learn the resource maxes
 * and recharge rules the event log needs to fold, then again with the active effects'
 * modifiers included. Both passes are cheap and pure.
 */

import {
  ABILITIES,
  type Ability,
  type ActionDef,
  type BuildFile,
  type ClassElement,
  type Diagnostic,
  type EffectDef,
  type Element,
  type InventoryFile,
  type ItemElement,
  type ProficiencyLevel,
  type ResourceDef,
  type SpellElement,
  type SpellsFile,
  type Spellcasting,
  type StateFile,
  type SubclassElement,
} from "../types";
import type { ContentIndex } from "../content";
import { checkRequirement, describeRequirement, type RequirementContext } from "../content/requirements";
import { resolveDice, tryEvaluate } from "../expr/evaluate";
import {
  canonicalPoolKey,
  foldState,
  tempMaxHpTotal,
  type FoldRules,
  type LiveState,
  type PoolRule,
} from "../state/fold";
import { collect, type CollectResult, type DeclaredChoice, type PartSource } from "./collect";
import {
  averageForDie,
  casterLevel,
  maxForDie,
  pactSlots,
  proficiencyBonusFor,
  slotsForCasterLevel,
} from "./spellslots";
import { limitDiagnostics, spellLimits } from "./spell-limits";
import { StatEngine, proficiencyMultiplier, type StatInput } from "./stats";
import type {
  AbilityBlock,
  Annotation,
  ChoiceOption,
  Contribution,
  LiveStatus,
  NumericStat,
  PendingChoice,
  ResolvedAction,
  ResolvedCharacter,
  ResolvedClass,
  ResolvedEffect,
  ResolvedElement,
  ResolvedItem,
  ResolvedResource,
  ResolvedSpell,
  ResolvedSpellcasting,
  ResolvedSpellcastingClass,
  SetStat,
  SkillBlock,
  SlotPool,
} from "./resolved";

export interface ResolveOptions {
  /** Hide options whose prerequisites aren't met, rather than warning on them. */
  enforceRequirements?: boolean;
}

export interface ResolveInput {
  content: ContentIndex;
  build: BuildFile;
  inventory?: InventoryFile;
  spells?: SpellsFile;
  /** Omit for level state; supply for live state. */
  state?: StateFile;
  /** Display extras read from details.5e. */
  details?: { name?: string; avatar?: string };
  options?: ResolveOptions;
}

const SET_PATHS = ["resistances", "immunities", "vulnerabilities", "languages", "conditionImmunities"];

export function resolve(input: ResolveInput): ResolvedCharacter {
  const { content, build, inventory, spells, state, options } = input;
  const diagnostics: Diagnostic[] = [];

  const collected = collect(content, build, inventory);
  diagnostics.push(...collected.diagnostics);

  const totalLevel = Math.max(build.levels?.length ?? 0, 0) || build.level || 0;
  const classLevelOf = (ref: string): number => {
    const cls = content.classByRef(ref);
    const id = cls?.id ?? ref;
    return collected.classLevels.find((c) => c.id === id)?.level ?? 0;
  };

  const tableLookup = (ref: string, column: string): number | undefined => {
    const cls = content.classByRef(ref);
    if (!cls) return undefined;
    const level = classLevelOf(cls.id);
    if (!level) return undefined;
    // A subclass may extend or override its class's tables.
    const sources: Element[] = [
      ...(collected.classLevels.find((c) => c.id === cls.id)?.subclasses ?? []),
      cls,
    ];
    for (const owner of sources) {
      const tables = (owner as ClassElement).tables;
      const col = tables?.[column];
      if (!col) continue;
      const raw = Array.isArray(col) ? col[level - 1] : col[String(level)];
      if (raw === undefined || raw === null) continue;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(n)) return n;
      return undefined;
    }
    return undefined;
  };

  const baseModifiers: StatInput[] = collected.modifiers.map(({ def, from }) => ({ mod: def, from }));

  // Slot counts depend only on class levels, so the plan is available before any
  // stat is computed — which is what lets spell slots be poolRules for the fold,
  // and what lets "spellcasting.all.dc" know which classes to fan out over.
  const plan = spellPlan(collected);
  const spellcastingKeys = plan.casting.map(({ cls }) => shortKey(cls));

  // Every engine built during resolution, so lazily-produced diagnostics from both
  // passes are collected once all the reads are done.
  const engines: StatEngine[] = [];
  const makeEngine = (extra: StatInput[]): StatEngine => {
    const built = new StatEngine({
      index: content,
      modifiers: [...baseModifiers, ...extra],
      totalLevel,
      classLevel: classLevelOf,
      table: tableLookup,
      base: (path, info) => baseFor(path, info.proficiency, info.engine, build, collected, totalLevel, content),
      spellcastingKeys,
    });
    engines.push(built);
    return built;
  };

  // --- pass A: level state, which is all the fold rules need -----------------
  let engine = makeEngine([]);
  let resources = resolveResources(collected, engine, {}, content);
  let hitDice = resolveHitDice(collected, {});
  let maxHp = engine.get("hp.max").value;

  // --- phase 5: overlay live state ------------------------------------------
  let live: LiveState | undefined;
  const effectDefs = collectEffects(collected);
  if (state) {
    const rules: FoldRules = {
      maxHp,
      hitDice: hitDice.map((h) => ({ die: h.die, max: h.max })),
      pools: poolRules(resources, plan),
    };
    live = foldState(state, rules);
    const activeIds = new Set(live.effects.map((e) => e.effect));
    const effectModifiers: StatInput[] = [];
    for (const { def, from } of effectDefs) {
      if (!activeIds.has(def.id)) continue;
      for (const mod of def.modifiers ?? []) effectModifiers.push({ mod, from, fromEffect: true });
    }
    engine = makeEngine(effectModifiers);
    const tempMax = tempMaxHpTotal(live);
    maxHp = engine.get("hp.max").value + tempMax;
    resources = resolveResources(collected, engine, live.spent.resources, content);
    hitDice = resolveHitDice(collected, live.spent.hitDice);
  }

  // --- stats ----------------------------------------------------------------
  const proficiencyBonus = engine.get("proficiencyBonus");
  const abilities = {} as Record<Ability, AbilityBlock>;
  for (const ability of ABILITIES) {
    abilities[ability] = {
      ability,
      score: engine.get(`abilities.${ability}.score`),
      mod: engine.abilityMod(ability),
      save: engine.get(`saves.${ability}`),
      check: engine.get(`checks.${ability}`),
    };
  }

  // Which skills exist, and what each one rolls, comes from content. A vault with
  // no source declaring skills has an empty skill list, which is correct rather
  // than a gap: there is nothing to roll.
  const skills: SkillBlock[] = content.skillKeys().map((key) => {
    const stat = engine.get(`skills.${key}`);
    const ability = content.skillAbility(key)!;
    return {
      key,
      name: content.skill(key)?.name ?? titleCase(key),
      ability,
      stat,
      passive: 10 + stat.value,
    };
  });

  const ac = engine.get("ac");
  const initiative = engine.get("initiative");
  const hpMax = engine.get("hp.max");

  const speed: Record<string, NumericStat> = {};
  const senses: Record<string, NumericStat> = {};
  const stats: Record<string, NumericStat> = {};
  const sets: Record<string, SetStat> = {};

  for (const path of engine.paths()) {
    if (engine.isSetPath(path)) {
      sets[path] = engine.getSet(path);
      continue;
    }
    const stat = engine.get(path);
    stats[path] = stat;
    if (path.startsWith("speed.")) speed[path.slice("speed.".length)] = stat;
    if (path.startsWith("senses.")) senses[path.slice("senses.".length)] = stat;
  }
  for (const path of SET_PATHS) if (!sets[path]) sets[path] = engine.getSet(path);
  for (const ability of ABILITIES) {
    stats[`abilities.${ability}.score`] = abilities[ability].score;
    stats[`saves.${ability}`] = abilities[ability].save;
    stats[`checks.${ability}`] = abilities[ability].check;
  }
  for (const skill of skills) stats[`skills.${skill.key}`] = skill.stat;
  stats["ac"] = ac;
  stats["initiative"] = initiative;
  stats["hp.max"] = hpMax;
  stats["proficiencyBonus"] = proficiencyBonus;
  if (!speed.walk) speed.walk = engine.get("speed.walk");

  // --- choices --------------------------------------------------------------
  const requirementContext = makeRequirementContext(content, engine, collected, totalLevel, classLevelOf, sets);
  const pendingChoices = resolveChoices(collected, content, requirementContext, options, diagnostics);

  // --- actions, effects, spells, inventory ----------------------------------
  const spellcasting = resolveSpellcasting(plan, collected, engine, content, spells, live, diagnostics);
  const actions = resolveActions(collected, engine, resources, spellcasting, live, content, diagnostics);
  const effects = resolveEffects(effectDefs, live);
  const items = resolveInventory(collected, inventory);

  // --- features by kind -----------------------------------------------------
  const elements: ResolvedElement[] = collected.elements.map((c) => toResolved(c.element, content, c));
  const features: Record<string, ResolvedElement[]> = {};
  for (const el of elements) (features[el.kind] ??= []).push(el);

  const classes: ResolvedClass[] = collected.classLevels.map((c) => ({
    id: c.id,
    name: c.element.name,
    level: c.level,
    hitDie: String((c.element as ClassElement).hitDie ?? "d8"),
    subclass: c.subclasses[0] ? { id: c.subclasses[0].id, name: c.subclasses[0].name } : undefined,
    element: c.element,
  }));

  const strScore = abilities.str.score.value;
  const carriedWeight = items.reduce((n, i) => n + i.weight * i.quantity, 0);

  const status: LiveStatus = {
    conditions: live?.conditions ?? [],
    exhaustion: live?.exhaustion ?? 0,
    deathSaves: live?.deathSaves ?? { successes: 0, failures: 0 },
    concentration: live?.concentration
      ? { ...live.concentration, name: content.get(live.concentration.on)?.name }
      : null,
    inspiration: live?.inspiration ?? false,
    tempMaxHpEffects: live?.tempMaxHp ?? [],
  };

  const tempMax = live ? tempMaxHpTotal(live) : 0;
  const effectiveMax = hpMax.value + tempMax;

  for (const built of engines) diagnostics.push(...built.diagnostics);
  dedupeDiagnostics(diagnostics);

  return {
    name: input.details?.name ?? build.name ?? "Unnamed",
    level: totalLevel,
    xp: build.xp,
    live: Boolean(state),
    species: collected.byId.get(build.species ?? "")
      ? toResolved(content.get(build.species!)!, content, collected.byId.get(build.species!))
      : undefined,
    background: build.background && collected.byId.get(build.background)
      ? toResolved(content.get(build.background)!, content, collected.byId.get(build.background))
      : undefined,
    classes,
    proficiencyBonus,
    abilities,
    skills,
    stats,
    sets,
    hp: {
      max: hpMax,
      current: Math.max(0, effectiveMax - (live?.damage ?? 0)),
      damage: live?.damage ?? 0,
      temp: live?.tempHp ?? 0,
      tempMax,
      hitDice,
    },
    ac,
    initiative,
    speed,
    senses,
    resources,
    actions,
    effects,
    spellcasting,
    inventory: items,
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...(inventory?.currency ?? {}) },
    carried: { weight: round2(carriedWeight), capacity: strScore * 15 },
    features,
    elements,
    pendingChoices,
    status,
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// Base values for computed stat paths
// ---------------------------------------------------------------------------

function row(source: string, sourceName: string, value: number | string, op: Contribution["op"] = "base"): Contribution {
  return { source, sourceName, op, value, applied: true };
}

function baseFor(
  path: string,
  proficiency: ProficiencyLevel,
  engine: StatEngine,
  build: BuildFile,
  collected: CollectResult,
  totalLevel: number,
  content: ContentIndex,
): { value: number; rows: Contribution[] } | undefined {
  if (path === "proficiencyBonus") {
    const value = proficiencyBonusFor(totalLevel);
    return { value, rows: [row("rules", `Level ${totalLevel || 1}`, value)] };
  }

  const score = path.match(/^abilities\.(str|dex|con|int|wis|cha)\.score$/);
  if (score) {
    const ability = score[1] as Ability;
    const value = build.abilities?.base?.[ability] ?? 10;
    return { value, rows: [row("build", methodLabel(build), value)] };
  }

  const saveOrCheck = path.match(/^(saves|checks)\.(str|dex|con|int|wis|cha)$/);
  if (saveOrCheck) {
    const ability = saveOrCheck[2] as Ability;
    return abilityWithProficiency(engine, ability, proficiency, `${ability.toUpperCase()} modifier`);
  }

  if (path.startsWith("skills.")) {
    const key = path.slice("skills.".length);
    const ability = content.skillAbility(key);
    if (!ability) return undefined;
    return abilityWithProficiency(engine, ability, proficiency, `${ability.toUpperCase()} modifier`);
  }

  if (path === "initiative") {
    return abilityWithProficiency(engine, "dex", proficiency, "DEX modifier");
  }

  if (path === "ac") {
    // Unarmoured: 10 + DEX. Armour and Unarmored Defense add `base` candidates that
    // compete with this one, which is why it goes in as a base rather than an add.
    const dex = engine.abilityMod("dex");
    return {
      value: 10 + dex,
      rows: [row("rules", "Unarmoured", 10), row("rules", "DEX modifier", dex, "add")],
    };
  }

  if (path === "hp.max") return hitPointBase(build, collected, engine);

  const spellcasting = path.match(/^spellcasting\.(.+)\.(dc|attack)$/);
  if (spellcasting) {
    const [, classRef, which] = spellcasting;
    const cls = content.classByRef(classRef);
    const sc = (cls as ClassElement | undefined)?.spellcasting;
    if (!cls || !sc) return undefined;
    const mod = engine.abilityMod(sc.ability);
    const prof = engine.get("proficiencyBonus").value;
    const rows = [
      row("rules", which === "dc" ? "Base DC" : "Proficiency bonus", which === "dc" ? 8 : prof),
      row(cls.id, `${sc.ability.toUpperCase()} modifier`, mod, "add"),
    ];
    if (which === "dc") rows.push(row("rules", "Proficiency bonus", prof, "add"));
    return { value: (which === "dc" ? 8 + prof : prof) + mod, rows };
  }

  return undefined;
}

function abilityWithProficiency(
  engine: StatEngine,
  ability: Ability,
  proficiency: ProficiencyLevel,
  label: string,
): { value: number; rows: Contribution[] } {
  const mod = engine.abilityMod(ability);
  const rows = [row("rules", label, mod)];
  let value = mod;
  if (proficiency !== "none") {
    const prof = Math.floor(engine.get("proficiencyBonus").value * proficiencyMultiplier(proficiency));
    value += prof;
    rows.push(row("rules", proficiencyLabel(proficiency), prof, "add"));
  }
  return { value, rows };
}

function proficiencyLabel(level: ProficiencyLevel): string {
  switch (level) {
    case "half":
      return "Half proficiency";
    case "expertise":
      return "Expertise";
    default:
      return "Proficiency bonus";
  }
}

function methodLabel(build: BuildFile): string {
  switch (build.abilities?.method) {
    case "point-buy":
      return "Point buy";
    case "standard-array":
      return "Standard array";
    case "rolled":
      return "Rolled";
    default:
      return "Base score";
  }
}

/**
 * Hit points: the die's maximum at first level, then each level's recorded choice,
 * plus the CON modifier per level. Never less than one per level.
 */
function hitPointBase(
  build: BuildFile,
  collected: CollectResult,
  engine: StatEngine,
): { value: number; rows: Contribution[] } {
  const con = engine.abilityMod("con");
  const rows: Contribution[] = [];
  const perClass = new Map<string, { name: string; total: number; levels: number }>();
  let total = 0;

  (build.levels ?? []).forEach((lvl, i) => {
    const cls = collected.classLevels.find((c) => c.id === lvl?.class)?.element as ClassElement | undefined;
    const die = String(cls?.hitDie ?? "d8");
    const rolled = i === 0 ? maxForDie(die) : hpForChoice(lvl?.hp, die);
    const gained = Math.max(1, rolled + con);
    total += gained;
    const bucket = perClass.get(lvl?.class ?? "?") ?? {
      name: cls?.name ?? lvl?.class ?? "Unknown class",
      total: 0,
      levels: 0,
    };
    bucket.total += gained;
    bucket.levels += 1;
    perClass.set(lvl?.class ?? "?", bucket);
  });

  for (const [id, bucket] of perClass)
    rows.push(
      row(
        id,
        `${bucket.name} ${bucket.levels === 1 ? "level 1" : `levels 1-${bucket.levels}`} (CON ${signed(con)})`,
        bucket.total,
      ),
    );

  return { value: total, rows };
}

function hpForChoice(choice: BuildFile["levels"][number]["hp"] | undefined, die: string): number {
  if (typeof choice === "number") return choice;
  if (choice === "max") return maxForDie(die);
  return averageForDie(die);
}

// ---------------------------------------------------------------------------
// Resources, actions, effects
// ---------------------------------------------------------------------------

/** Resource keys are namespaced by their owning element unless already namespaced. */
export function resourceKey(def: ResourceDef, from: PartSource): string {
  return def.id.includes(":") ? def.id : `${from.element.id}:${def.id}`;
}

function resolveResources(
  collected: CollectResult,
  engine: StatEngine,
  spent: Record<string, number>,
  content: ContentIndex,
): ResolvedResource[] {
  const byKey = new Map<string, ResolvedResource>();
  for (const { def, from } of collected.resources) {
    const key = resourceKey(def, from);
    const { value, error } = tryEvaluate(def.max, engine.ctx, 0);
    if (error)
      engine.diagnostics.push({
        severity: "warning",
        code: "expression-error",
        message: `resource "${def.name || def.id}" max: ${error}`,
        subject: from.element.id,
      });
    const max = Math.max(0, Math.floor(value));
    // Spent amounts above a new max are clamped, so a level-down can't leave a
    // resource reading -2 remaining.
    const used = Math.min(spent[key] ?? 0, max);
    const rechargeAmount = def.rechargeAmount === undefined ? undefined : tryEvaluate(def.rechargeAmount, engine.ctx, max).value;
    const existing = byKey.get(key);
    if (existing && existing.max >= max) continue;
    byKey.set(key, {
      key,
      id: def.id,
      name: def.name || content.get(from.element.id)?.name || def.id,
      max,
      spent: used,
      remaining: Math.max(0, max - used),
      recharge: def.recharge,
      rechargeAmount,
      unit: def.unit,
      die: def.die,
      pin: def.pin,
      source: from.element.id,
      sourceName: from.element.name,
      notes: def.notes,
    });
  }
  return [...byKey.values()];
}

function resolveHitDice(
  collected: CollectResult,
  spent: Record<string, number>,
): ResolvedCharacter["hp"]["hitDice"] {
  const byDie = new Map<string, number>();
  for (const cls of collected.classLevels) {
    const die = String((cls.element as ClassElement).hitDie ?? "d8");
    byDie.set(die, (byDie.get(die) ?? 0) + cls.level);
  }
  return [...byDie.entries()]
    .sort((a, b) => maxForDie(b[0]) - maxForDie(a[0]))
    .map(([die, max]) => {
      const used = Math.min(spent[die] ?? 0, max);
      return { die, max, spent: used, remaining: max - used };
    });
}

function poolRules(resources: ResolvedResource[], plan: SpellPlan): PoolRule[] {
  const pools: PoolRule[] = resources.map((r) => ({
    key: canonicalPoolKey(r.key),
    max: r.max,
    recharge: r.recharge,
    rechargeAmount: r.rechargeAmount,
  }));
  // Spell slots are pools like any other: they recharge on a long rest, and pact
  // magic slots come back on a short one.
  plan.slotMaxes.forEach((max, i) => pools.push({ key: `slots.${i + 1}`, max, recharge: "long-rest" }));
  if (plan.pact) pools.push({ key: "slots.pact", max: plan.pact.count, recharge: "short-rest" });
  return pools;
}

function collectEffects(collected: CollectResult): { def: EffectDef; from: PartSource }[] {
  const seen = new Set<string>();
  const out: { def: EffectDef; from: PartSource }[] = [];
  for (const { def, from } of collected.effects) {
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    out.push({ def, from });
  }
  return out;
}

function resolveEffects(defs: { def: EffectDef; from: PartSource }[], live?: LiveState): ResolvedEffect[] {
  const active = new Map((live?.effects ?? []).map((e) => [e.effect, e]));
  return defs.map(({ def, from }) => ({
    id: def.id,
    name: def.name,
    duration: def.duration,
    concentration: def.concentration,
    active: active.has(def.id),
    since: active.get(def.id)?.since,
    modifiers: def.modifiers ?? [],
    text: def.text,
    notes: def.notes,
    source: from.element.id,
    sourceName: from.element.name,
    definition: def,
  }));
}

function resolveActions(
  collected: CollectResult,
  engine: StatEngine,
  resources: ResolvedResource[],
  spellcasting: ResolvedSpellcasting | undefined,
  live: LiveState | undefined,
  content: ContentIndex,
  diagnostics: Diagnostic[],
): ResolvedAction[] {
  const out: ResolvedAction[] = [];
  const hitDicePools = resolveHitDice(collected, live?.spent.hitDice ?? {});
  for (const { def, from } of collected.actions) {
    const key = def.id.includes(":") ? def.id : `${from.element.id}:${def.id}`;
    const resolvedCost: ResolvedAction["resolvedCost"] = [];
    let available = true;
    let unavailableReason: string | undefined;

    for (const [costKey, amount] of Object.entries(def.cost ?? {})) {
      const pool = resolvePoolKey(costKey, from, resources, spellcasting, hitDicePools);
      if (!pool) {
        diagnostics.push({
          severity: "warning",
          code: "unresolved-reference",
          message: `action "${def.name ?? def.id}" costs "${costKey}", which is not a pool this character has`,
          subject: from.element.id,
        });
        continue;
      }
      resolvedCost.push({ key: pool.key, amount, label: pool.label });
      if (live) {
        const need = typeof amount === "number" ? amount : amount.min;
        if (pool.remaining !== undefined && pool.remaining < need) {
          available = false;
          unavailableReason = `Not enough ${pool.label}`;
        }
      }
    }

    const damage = def.damage ? resolveDice(def.damage, engine.ctx) : undefined;
    if (damage?.error)
      diagnostics.push({
        severity: "warning",
        code: "expression-error",
        message: `action "${def.name ?? def.id}" damage: ${damage.error}`,
        subject: from.element.id,
      });

    let save: ResolvedAction["save"];
    if (def.save) {
      const dc =
        def.save.dc !== undefined
          ? tryEvaluate(def.save.dc, engine.ctx, 0).value
          : defaultSaveDc(from, engine, content);
      save = { ability: def.save.ability, dc };
    }

    out.push({
      key,
      id: def.id,
      name: def.name ?? from.element.name,
      activation: def.activation,
      cost: def.cost,
      resolvedCost: resolvedCost.length ? resolvedCost : undefined,
      applies: def.applies,
      range: def.range,
      target: def.target,
      damage: def.damage,
      damageResolved: damage?.text,
      damageType: def.damageType,
      save,
      text: def.text,
      notes: def.notes,
      source: from.element.id,
      sourceName: from.element.name,
      available,
      unavailableReason,
      definition: def satisfies ActionDef,
    });
  }
  return out;
}

/** The spell save DC of the class the action's element came from, when there is one. */
function defaultSaveDc(from: PartSource, engine: StatEngine, content: ContentIndex): number {
  const classId = from.class;
  const cls = classId ? content.get(classId) : undefined;
  const sc = (cls as ClassElement | undefined)?.spellcasting;
  if (!cls || !sc) return 8 + engine.get("proficiencyBonus").value;
  return engine.get(`spellcasting.${shortKey(cls)}.dc`).value;
}

function resolvePoolKey(
  costKey: string,
  from: PartSource,
  resources: ResolvedResource[],
  spellcasting: ResolvedSpellcasting | undefined,
  hitDice: ResolvedCharacter["hp"]["hitDice"],
): { key: string; label: string; remaining?: number } | undefined {
  if (costKey === "pact" || costKey === "slots.pact")
    return { key: "pact", label: "pact slots", remaining: spellcasting?.pact?.remaining };
  if (costKey.startsWith("slots.")) {
    const level = Number(costKey.slice("slots.".length));
    const pool = spellcasting?.slots.find((s) => s.level === level);
    // A slot level the character can't reach is not a pool it has; the action is
    // listed but unaffordable rather than silently free.
    return { key: costKey, label: `level ${level} slots`, remaining: pool?.remaining ?? 0 };
  }
  if (costKey.startsWith("hitDice.")) {
    const die = costKey.slice("hitDice.".length);
    return {
      key: costKey,
      label: `${die} hit dice`,
      remaining: hitDice.find((h) => h.die === die)?.remaining,
    };
  }

  // Local ids resolve against the element that declared the cost first.
  const local = `${from.element.id}:${costKey}`;
  const match =
    resources.find((r) => r.key === local) ??
    resources.find((r) => r.key === costKey) ??
    resources.find((r) => r.key.endsWith(`:${costKey}`)) ??
    resources.find((r) => r.id === costKey);
  if (!match) return undefined;
  return { key: match.key, label: match.name, remaining: match.remaining };
}

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

function makeRequirementContext(
  content: ContentIndex,
  engine: StatEngine,
  collected: CollectResult,
  totalLevel: number,
  classLevelOf: (ref: string) => number,
  sets: Record<string, SetStat>,
): RequirementContext {
  const proficiencies = new Set<string>();
  for (const [path, stat] of Object.entries(sets))
    if (path.startsWith("proficiencies")) for (const v of stat.values) proficiencies.add(v);
  for (const key of content.skillKeys())
    if (engine.proficiencyFor(`skills.${key}`) !== "none") proficiencies.add(key);

  const anySpellcasting = collected.classLevels.some(
    (c) => (c.element as ClassElement).spellcasting && (c.element as ClassElement).spellcasting!.progression !== "none",
  );

  return {
    totalLevel,
    classLevel: classLevelOf,
    abilityScore: (ability) => engine.get(`abilities.${ability}.score`).value,
    has: (id) => collected.byId.has(id),
    hasProficiency: (proficiency) => proficiencies.has(proficiency),
    isSpellcaster: anySpellcasting,
    nameOf: (id) => content.get(id)?.name,
  };
}

function resolveChoices(
  collected: CollectResult,
  content: ContentIndex,
  requirements: RequirementContext,
  options: ResolveOptions | undefined,
  diagnostics: Diagnostic[],
): PendingChoice[] {
  const out: PendingChoice[] = [];
  for (const declared of collected.choices) {
    const { definition, owner } = declared;
    const matches = content.query(definition.from);
    for (const missing of content.unresolvedIn(definition.from))
      diagnostics.push({
        severity: "warning",
        code: "unresolved-reference",
        message: `choice "${definition.id}" lists "${missing}", which is not loaded`,
        subject: owner.id,
      });

    const optionList: ChoiceOption[] = matches.map((element) => {
      const check = checkRequirement(element.requires, requirements);
      return {
        id: element.id,
        name: element.name,
        kind: element.kind,
        source: element.source,
        abbreviation: content.abbreviation(element.source),
        page: element.page,
        text: typeof element.text === "string" ? element.text : undefined,
        tags: element.tags ?? [],
        allowed: check.met,
        warnings: check.reasons,
        element,
      };
    });

    const visible = options?.enforceRequirements ? optionList.filter((o) => o.allowed) : optionList;
    const valid = new Set(visible.map((o) => o.id));
    const invalid = declared.chosen.filter((id) => !valid.has(id));
    const gate = checkRequirement(definition.requires, requirements);

    for (const id of invalid)
      diagnostics.push({
        severity: "warning",
        code: "choice-invalid",
        message: `"${content.get(id)?.name ?? id}" is no longer a valid pick for ${definition.name ?? definition.id}`,
        subject: owner.id,
      });

    // Too many of one option. The picks are kept and the excess reported, like
    // any other pick that no longer fits: a hand-edited file is told what is
    // wrong with it rather than quietly obeyed or quietly rewritten.
    for (const [id, taken] of overCap(declared.chosen, definition)) {
      const cap = definition.maxPer as number;
      for (let i = cap; i < taken; i++) invalid.push(id);
      diagnostics.push({
        severity: "warning",
        code: "choice-invalid",
        message: `${definition.name ?? definition.id} takes "${
          content.get(id)?.name ?? id
        }" ${taken} times, and allows at most ${cap}`,
        subject: owner.id,
      });
    }

    out.push({
      id: definition.id,
      name: definition.name ?? defaultChoiceName(definition, content),
      count: definition.count,
      chosen: declared.chosen,
      invalid,
      options: visible,
      definition,
      source: owner.id,
      sourceName: owner.name,
      scope: declared.scope,
      levelIndex: declared.levelIndex,
      level: declared.level,
      class: declared.class,
      complete: declared.chosen.length >= definition.count && invalid.length === 0,
      blocked: !gate.met,
      blockedReason: gate.met ? undefined : describeRequirement(definition.requires, requirements) || gate.reasons.join(", "),
    });
  }
  return out;
}

/**
 * Options taken more often than `maxPer` allows, with how many times each was
 * taken. Empty unless the choice declares a cap.
 */
function overCap(chosen: string[], definition: DeclaredChoice["definition"]): [string, number][] {
  if (typeof definition.maxPer !== "number") return [];
  const counts = new Map<string, number>();
  for (const id of chosen) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].filter(([, taken]) => taken > definition.maxPer!);
}

function defaultChoiceName(definition: DeclaredChoice["definition"], content: ContentIndex): string {
  const kind = Array.isArray(definition.from.kind) ? definition.from.kind[0] : definition.from.kind;
  if (kind) return `Choose ${definition.count} ${content.kindLabel(kind, definition.count > 1).toLowerCase()}`;
  return `Choose ${definition.count}`;
}

// ---------------------------------------------------------------------------
// Spellcasting
// ---------------------------------------------------------------------------

function shortKey(cls: Element): string {
  return typeof cls.key === "string" ? cls.key : cls.id.split(":").pop() ?? cls.id;
}

/** Everything about spellcasting that depends on class levels alone. */
export interface SpellPlan {
  casting: { cls: Element; sc: Spellcasting; level: number; slotLevel: number }[];
  /** True when more than one class feeds the shared slot table (the multiclass rule). */
  shared: boolean;
  sharedLevel: number;
  /** Slot maxima for spell levels 1..9. */
  slotMaxes: number[];
  pact?: { level: number; count: number };
}

export function spellPlan(collected: CollectResult): SpellPlan {
  const found: { cls: Element; sc: Spellcasting; level: number }[] = [];
  for (const entry of collected.classLevels) {
    // A subclass can grant spellcasting its class doesn't have.
    const fromSubclass = entry.subclasses.find((s) => (s as SubclassElement).spellcasting);
    const sc =
      ((entry.element as ClassElement).spellcasting ??
        (fromSubclass as SubclassElement | undefined)?.spellcasting) || undefined;
    if (!sc || sc.progression === "none") continue;
    if (entry.level < (sc.startsAt ?? 1)) continue;
    found.push({ cls: entry.element, sc, level: entry.level });
  }

  const shared = found.filter((c) => c.sc.progression !== "pact").length > 1;
  let sharedLevel = 0;
  const casting = found.map((entry) => {
    const slotLevel = casterLevel(entry.sc.progression, entry.level, shared);
    if (entry.sc.progression !== "pact") sharedLevel += slotLevel;
    return { ...entry, slotLevel };
  });

  const warlock = casting.find((c) => c.sc.progression === "pact");
  return {
    casting,
    shared,
    sharedLevel,
    slotMaxes: slotsForCasterLevel(sharedLevel),
    pact: warlock ? pactSlots(warlock.level) : undefined,
  };
}

function resolveSpellcasting(
  plan: SpellPlan,
  collected: CollectResult,
  engine: StatEngine,
  content: ContentIndex,
  spellsFile: SpellsFile | undefined,
  live: LiveState | undefined,
  diagnostics: Diagnostic[],
): ResolvedSpellcasting | undefined {
  const grantedSpells = collected.elements.filter((c) => c.element.kind === "spell");
  if (!plan.casting.length && !grantedSpells.length && !spellsFile?.spells?.length) return undefined;

  const count = (expr: Spellcasting["prepared"]): number | undefined =>
    expr === undefined ? undefined : tryEvaluate(expr, engine.ctx, 0).value;
  const classes: ResolvedSpellcastingClass[] = plan.casting.map(({ cls, sc, level, slotLevel }) => {
    const key = shortKey(cls);
    return {
      class: cls.id,
      name: cls.name,
      ability: sc.ability,
      progression: sc.progression,
      type: sc.type,
      list: sc.list,
      level,
      slotLevel,
      dc: engine.get(`spellcasting.${key}.dc`),
      attack: engine.get(`spellcasting.${key}.attack`),
      prepared: count(sc.prepared),
      known: count(sc.known),
      spellbook: count(sc.spellbook),
      cantrips: count(sc.cantrips),
      maxSpellLevel:
        count(sc.maxSpellLevel) ??
        // A pact caster's spells are as high as its slots; everyone else's as high as the
        // highest slot they hold, which for a multiclass character is the shared table.
        (sc.progression === "pact"
          ? plan.pact?.level ?? 0
          : plan.slotMaxes.reduce((top, max, i) => (max > 0 ? i + 1 : top), 0)),
      extraPicks: sc.extra ?? [],
    };
  });

  const slots: SlotPool[] = plan.slotMaxes.map((max, i) => {
    const level = i + 1;
    const spent = Math.min(live?.spent.slots?.[String(level)] ?? 0, max);
    return { level, max, spent, remaining: max - spent };
  });

  const pactInfo = plan.pact;
  const pact = pactInfo
    ? {
        level: pactInfo.level,
        max: pactInfo.count,
        spent: Math.min(live?.spent.slots?.["pact"] ?? 0, pactInfo.count),
        remaining: Math.max(0, pactInfo.count - Math.min(live?.spent.slots?.["pact"] ?? 0, pactInfo.count)),
      }
    : undefined;

  // Spells come from the spellbook plus anything the build granted outright.
  const spells: ResolvedSpell[] = [];
  const orphaned: ResolvedSpell[] = [];
  const classIds = new Set(classes.map((c) => c.class));
  const listTags = new Map(classes.map((c) => [c.class, c.list]));
  const seen = new Set<string>();

  const push = (
    element: Element,
    entry: ResolvedSpell["entry"],
    alwaysPrepared: boolean,
    classId?: string,
  ): void => {
    if (seen.has(element.id)) return;
    seen.add(element.id);
    const spell = element as SpellElement;
    const resolved: ResolvedSpell = {
      id: element.id,
      name: element.name,
      spellLevel: typeof spell.spellLevel === "number" ? spell.spellLevel : 0,
      school: spell.school,
      castingTime: spell.castingTime,
      range: spell.range,
      components: spell.components,
      duration: spell.duration,
      concentration: spell.concentration,
      ritual: spell.ritual,
      text: typeof element.text === "string" ? element.text : undefined,
      higherLevels: spell.higherLevels,
      prepared: alwaysPrepared || entry.prepared === true,
      alwaysPrepared,
      extra: entry.extra === true,
      class: classId,
      source: element.source,
      abbreviation: content.abbreviation(element.source),
      page: element.page,
      entry,
      element,
    };
    const fits = !classId || classIds.has(classId);
    if (!fits) orphaned.push(resolved);
    else spells.push(resolved);

    // An extra spell is learned outside the class, so its list says nothing about it.
    if (fits && classId && !resolved.extra) {
      const tag = listTags.get(classId);
      if (tag && !(element.tags ?? []).includes(tag))
        diagnostics.push({
          severity: "warning",
          code: "spell-mismatch",
          message: `"${element.name}" is not on the ${content.get(classId)?.name ?? classId} spell list`,
          subject: element.id,
        });
    }
  };

  for (const granted of grantedSpells)
    push(granted.element, { id: granted.element.id, alwaysPrepared: true }, true, granted.class);

  for (const entry of spellsFile?.spells ?? []) {
    const element = content.get(entry.id);
    if (!element) {
      diagnostics.push({
        severity: "warning",
        code: "unresolved-reference",
        message: `spell "${entry.id}" is not in any loaded source`,
        subject: entry.id,
      });
      continue;
    }
    push(element, entry, entry.alwaysPrepared === true, entry.class);
  }

  if (!classes.length && spells.length)
    diagnostics.push({
      severity: "warning",
      code: "spell-mismatch",
      message: "This character has spells but no spellcasting class",
      subject: "spells",
    });

  spells.sort((a, b) => a.spellLevel - b.spellLevel || a.name.localeCompare(b.name));

  diagnostics.push(...limitDiagnostics(classes, spells));
  return { classes, slots, pact, spells, orphaned, limits: spellLimits(classes, spells) };
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

function resolveInventory(collected: CollectResult, inventory?: InventoryFile): ResolvedItem[] {
  void inventory;
  return collected.items.map(({ entry, index, element }) => {
    const item = element as ItemElement;
    return {
      entry,
      index,
      element,
      name: element.name,
      quantity: entry.quantity ?? 1,
      equipped: entry.equipped === true,
      attuned: entry.attuned === true,
      weight: typeof item.weight === "number" ? item.weight : 0,
      value: typeof item.value === "number" ? item.value : 0,
      resolvedRef: !entry.item,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toResolved(
  element: Element,
  content: ContentIndex,
  collected?: { origin: string[]; level?: number; class?: string },
): ResolvedElement {
  return {
    id: element.id,
    kind: element.kind,
    name: element.name,
    source: element.source,
    abbreviation: content.abbreviation(element.source),
    page: element.page,
    text: typeof element.text === "string" ? element.text : undefined,
    tags: element.tags ?? [],
    level: collected?.level,
    class: collected?.class,
    origin: collected?.origin ?? [],
    element,
  };
}

function titleCase(key: string): string {
  return key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The same unresolved reference can surface from several places; report it once. */
function dedupeDiagnostics(diagnostics: Diagnostic[]): void {
  const seen = new Set<string>();
  let write = 0;
  for (const d of diagnostics) {
    const key = `${d.severity}|${d.code}|${d.subject ?? ""}|${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    diagnostics[write++] = d;
  }
  diagnostics.length = write;
}

/** Situational annotations across every stat, for a single "conditional" panel. */
export function allAnnotations(character: ResolvedCharacter): { path: string; annotation: Annotation }[] {
  const out: { path: string; annotation: Annotation }[] = [];
  for (const [path, stat] of Object.entries(character.stats))
    for (const annotation of stat.annotations) out.push({ path, annotation });
  for (const [path, stat] of Object.entries(character.sets))
    for (const annotation of stat.annotations) out.push({ path, annotation });
  return out;
}
