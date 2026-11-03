/**
 * Structural validation with degradation. The guiding rule from the spec: anything
 * the engine doesn't recognise is kept and shown as text with a warning badge. Only
 * a missing id, kind, name or source makes an element unusable.
 */

import {
  ABILITIES,
  ACTIVATIONS,
  MODIFIER_OPS,
  PROFICIENCY_LEVELS,
  RECHARGES,
  type ChoiceDef,
  type Diagnostic,
  type Modifier,
  type Requirement,
  type ResourceDef,
} from "../types";
import { checkExpression } from "../expr/evaluate";

const KNOWN_PARTS = ["grants", "choices", "modifiers", "resources", "actions", "effects"] as const;

/** Parts a class/subclass level entry may carry, mirroring element parts. */
const LEVEL_PARTS = KNOWN_PARTS;

export interface ValidationResult {
  /** False when the element can't be indexed at all. */
  usable: boolean;
  diagnostics: Diagnostic[];
}

function err(code: Diagnostic["code"], message: string, subject: string | undefined, path?: string): Diagnostic {
  return { severity: "error", code, message, subject, path };
}
function warn(code: Diagnostic["code"], message: string, subject: string | undefined, path?: string): Diagnostic {
  return { severity: "warning", code, message, subject, path };
}

function validateModifier(m: unknown, subject: string | undefined, path: string, out: Diagnostic[]): void {
  if (!m || typeof m !== "object" || Array.isArray(m)) {
    out.push(err("invalid-element", "modifier must be an object", subject, path));
    return;
  }
  const mod = m as Partial<Modifier> & Record<string, unknown>;
  if (typeof mod.target !== "string" || !mod.target)
    out.push(err("invalid-element", "modifier needs a target stat path", subject, path));
  if (typeof mod.op !== "string") {
    out.push(err("invalid-element", "modifier needs an op", subject, path));
  } else if (!(MODIFIER_OPS as readonly string[]).includes(mod.op)) {
    out.push(warn("unknown-op", `unknown modifier op "${mod.op}"; shown as text`, subject, path));
  }
  const numericOps = ["add", "multiply", "set", "min", "max", "base"];
  if (typeof mod.op === "string" && numericOps.includes(mod.op)) {
    if (mod.value === undefined) {
      out.push(err("invalid-element", `op "${mod.op}" needs a value`, subject, path));
    } else if (typeof mod.value === "number" || typeof mod.value === "string") {
      const e = checkExpression(mod.value);
      if (e) out.push(warn("expression-error", e, subject, `${path}.value`));
    } else {
      out.push(err("invalid-element", `op "${mod.op}" needs a number or expression`, subject, path));
    }
  }
  if (mod.op === "include" && !Array.isArray(mod.value) && typeof mod.value !== "string")
    out.push(err("invalid-element", 'op "include" needs a string or array of strings', subject, path));
  if (
    mod.op === "proficiency" &&
    !(PROFICIENCY_LEVELS as readonly string[]).includes(String(mod.value ?? "proficient"))
  )
    out.push(
      warn("invalid-element", `unknown proficiency level "${String(mod.value)}"`, subject, path),
    );
  if (mod.when !== undefined) {
    const w = mod.when as unknown as Record<string, unknown>;
    if (!w || typeof w !== "object" || typeof w.text !== "string")
      out.push(err("invalid-element", "when needs a text description", subject, `${path}.when`));
  }
}

function validateChoice(c: unknown, subject: string | undefined, path: string, out: Diagnostic[]): void {
  if (!c || typeof c !== "object" || Array.isArray(c)) {
    out.push(err("invalid-element", "choice must be an object", subject, path));
    return;
  }
  const ch = c as Partial<ChoiceDef> & Record<string, unknown>;
  if (typeof ch.id !== "string" || !ch.id)
    out.push(err("invalid-element", "choice needs an id", subject, path));
  if (typeof ch.count !== "number" || ch.count < 1)
    out.push(err("invalid-element", "choice needs a count of at least 1", subject, path));
  if (!ch.from || typeof ch.from !== "object")
    out.push(err("invalid-element", "choice needs a `from` filter", subject, path));
  else {
    const f = ch.from as Record<string, unknown>;
    if (f.kind === undefined && f.tags === undefined && f.ids === undefined && f.allTags === undefined)
      out.push(
        err("invalid-element", "`from` needs at least one of kind, tags, allTags, ids", subject, path),
      );
  }
  if (ch.repeatable !== undefined && typeof ch.repeatable !== "boolean")
    out.push(err("invalid-element", "choice `repeatable` must be a boolean", subject, path));
  if (ch.repeatable === true && typeof ch.count === "number" && ch.count < 2)
    out.push(
      warn(
        "invalid-element",
        "`repeatable` does nothing on a choice that only makes one pick",
        subject,
        path,
      ),
    );
  if (ch.maxPer !== undefined && (typeof ch.maxPer !== "number" || ch.maxPer < 1))
    out.push(err("invalid-element", "choice `maxPer` must be a number of at least 1", subject, path));
  if (ch.maxPer !== undefined && ch.repeatable !== true)
    out.push(
      warn(
        "invalid-element",
        "`maxPer` does nothing without `repeatable`, since each option can only be taken once",
        subject,
        path,
      ),
    );
  if (ch.requires) validateRequirement(ch.requires, subject, `${path}.requires`, out);
}

function validateResource(r: unknown, subject: string | undefined, path: string, out: Diagnostic[]): void {
  if (!r || typeof r !== "object" || Array.isArray(r)) {
    out.push(err("invalid-element", "resource must be an object", subject, path));
    return;
  }
  const res = r as Partial<ResourceDef> & Record<string, unknown>;
  if (typeof res.id !== "string" || !res.id)
    out.push(err("invalid-element", "resource needs an id", subject, path));
  if (typeof res.name !== "string" || !res.name)
    out.push(warn("invalid-element", "resource has no name", subject, path));
  if (res.max === undefined) out.push(err("invalid-element", "resource needs a max", subject, path));
  else {
    const e = checkExpression(res.max as string | number);
    if (e) out.push(warn("expression-error", e, subject, `${path}.max`));
  }
  if (typeof res.recharge !== "string") {
    out.push(err("invalid-element", "resource needs a recharge rule", subject, path));
  } else if (!(RECHARGES as readonly string[]).includes(res.recharge)) {
    out.push(warn("invalid-element", `unknown recharge "${res.recharge}"; treated as manual`, subject, path));
  }
}

function validateAction(a: unknown, subject: string | undefined, path: string, out: Diagnostic[]): void {
  if (!a || typeof a !== "object" || Array.isArray(a)) {
    out.push(err("invalid-element", "action must be an object", subject, path));
    return;
  }
  const act = a as Record<string, unknown>;
  if (typeof act.id !== "string" || !act.id)
    out.push(err("invalid-element", "action needs an id", subject, path));
  if (typeof act.activation !== "string" || !act.activation)
    out.push(err("invalid-element", "action needs an activation", subject, path));
  if (act.cost !== undefined) {
    if (!act.cost || typeof act.cost !== "object" || Array.isArray(act.cost)) {
      out.push(err("invalid-element", "cost must be a map of pool to amount", subject, `${path}.cost`));
    } else {
      for (const [key, amount] of Object.entries(act.cost as Record<string, unknown>)) {
        const ok =
          typeof amount === "number" ||
          (!!amount &&
            typeof amount === "object" &&
            typeof (amount as Record<string, unknown>).min === "number" &&
            typeof (amount as Record<string, unknown>).max === "number");
        if (!ok)
          out.push(
            err("invalid-element", `cost "${key}" must be a number or {min,max}`, subject, `${path}.cost`),
          );
      }
    }
  }
  if (act.save !== undefined) {
    const s = act.save as Record<string, unknown>;
    if (!s || typeof s !== "object" || !(ABILITIES as readonly string[]).includes(String(s.ability)))
      out.push(err("invalid-element", "save needs a valid ability", subject, `${path}.save`));
    if (s && s.dc !== undefined) {
      const e = checkExpression(s.dc as string | number);
      if (e) out.push(warn("expression-error", e, subject, `${path}.save.dc`));
    }
  }
}

function validateEffect(e: unknown, subject: string | undefined, path: string, out: Diagnostic[]): void {
  if (!e || typeof e !== "object" || Array.isArray(e)) {
    out.push(err("invalid-element", "effect must be an object", subject, path));
    return;
  }
  const eff = e as Record<string, unknown>;
  if (typeof eff.id !== "string" || !eff.id)
    out.push(err("invalid-element", "effect needs an id", subject, path));
  if (typeof eff.name !== "string" || !eff.name)
    out.push(warn("invalid-element", "effect has no name", subject, path));
  if (Array.isArray(eff.modifiers))
    eff.modifiers.forEach((m, i) => validateModifier(m, subject, `${path}.modifiers[${i}]`, out));
}

function validatePredicate(p: unknown, subject: string | undefined, path: string, out: Diagnostic[]): void {
  if (!p || typeof p !== "object" || Array.isArray(p)) {
    out.push(err("invalid-element", "predicate must be an object", subject, path));
    return;
  }
  const pred = p as Record<string, unknown>;
  // A nested requirement is a valid predicate.
  if (pred.all || pred.any || pred.not) {
    validateRequirement(pred as Requirement, subject, path, out);
    return;
  }
  switch (String(pred.type)) {
    case "class-level":
      if (typeof pred.class !== "string" || typeof pred.min !== "number")
        out.push(err("invalid-element", "class-level needs class and min", subject, path));
      break;
    case "level":
      if (typeof pred.min !== "number")
        out.push(err("invalid-element", "level needs min", subject, path));
      break;
    case "ability":
      if (!(ABILITIES as readonly string[]).includes(String(pred.ability)) || typeof pred.min !== "number")
        out.push(err("invalid-element", "ability needs a valid ability and min", subject, path));
      break;
    case "has":
      if (typeof pred.id !== "string")
        out.push(err("invalid-element", "has needs an id", subject, path));
      break;
    case "proficiency":
      if (typeof pred.proficiency !== "string")
        out.push(err("invalid-element", "proficiency needs a proficiency", subject, path));
      break;
    case "spellcaster":
      break;
    default:
      out.push(warn("unknown-part", `unknown predicate type "${String(pred.type)}"; ignored`, subject, path));
  }
}

export function validateRequirement(r: unknown, subject: string | undefined, path: string, out: Diagnostic[]): void {
  if (!r || typeof r !== "object" || Array.isArray(r)) {
    out.push(err("invalid-element", "requires must be an object", subject, path));
    return;
  }
  const req = r as Record<string, unknown>;
  for (const key of ["all", "any", "not"] as const) {
    const list = req[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      out.push(err("invalid-element", `requires.${key} must be an array`, subject, path));
      continue;
    }
    list.forEach((p, i) => validatePredicate(p, subject, `${path}.${key}[${i}]`, out));
  }
}

/** Validates one element in isolation. Reference checks happen in the content index. */
export function validateElement(raw: unknown): ValidationResult {
  const out: Diagnostic[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { usable: false, diagnostics: [err("invalid-element", "element must be a JSON object", undefined)] };
  }
  const el = raw as Record<string, unknown>;
  const subject = typeof el.id === "string" && el.id ? el.id : undefined;

  let usable = true;
  for (const field of ["id", "kind", "name", "source"] as const) {
    if (typeof el[field] !== "string" || !el[field]) {
      out.push(err("invalid-element", `missing required field "${field}"`, subject, field));
      usable = false;
    }
  }
  if (el.tags !== undefined && !(Array.isArray(el.tags) && el.tags.every((t) => typeof t === "string")))
    out.push(err("invalid-element", "tags must be an array of strings", subject, "tags"));
  if (el.text !== undefined && typeof el.text !== "string")
    out.push(err("invalid-element", "text must be a string", subject, "text"));

  if (el.grants !== undefined) {
    if (!Array.isArray(el.grants)) out.push(err("invalid-element", "grants must be an array", subject, "grants"));
    else
      el.grants.forEach((g, i) => {
        const ok = typeof g === "string" || (!!g && typeof g === "object" && typeof (g as Record<string, unknown>).id === "string");
        if (!ok) out.push(err("invalid-element", "grant must be an id or {id}", subject, `grants[${i}]`));
      });
  }
  if (el.modifiers !== undefined) {
    if (!Array.isArray(el.modifiers))
      out.push(err("invalid-element", "modifiers must be an array", subject, "modifiers"));
    else el.modifiers.forEach((m, i) => validateModifier(m, subject, `modifiers[${i}]`, out));
  }
  if (el.choices !== undefined) {
    if (!Array.isArray(el.choices)) out.push(err("invalid-element", "choices must be an array", subject, "choices"));
    else el.choices.forEach((c, i) => validateChoice(c, subject, `choices[${i}]`, out));
  }
  if (el.resources !== undefined) {
    if (!Array.isArray(el.resources))
      out.push(err("invalid-element", "resources must be an array", subject, "resources"));
    else el.resources.forEach((r, i) => validateResource(r, subject, `resources[${i}]`, out));
  }
  if (el.actions !== undefined) {
    if (!Array.isArray(el.actions)) out.push(err("invalid-element", "actions must be an array", subject, "actions"));
    else el.actions.forEach((a, i) => validateAction(a, subject, `actions[${i}]`, out));
  }
  if (el.effects !== undefined) {
    if (!Array.isArray(el.effects)) out.push(err("invalid-element", "effects must be an array", subject, "effects"));
    else el.effects.forEach((e, i) => validateEffect(e, subject, `effects[${i}]`, out));
  }
  if (el.requires !== undefined) validateRequirement(el.requires, subject, "requires", out);

  // Class and subclass progressions carry the same parts, keyed by level.
  if (el.levels !== undefined) {
    if (el.levelsBy !== undefined && el.levelsBy !== "class" && el.levelsBy !== "character")
      out.push(err("invalid-element", '`levelsBy` must be "class" or "character"', subject, "levelsBy"));
    // A `levels` map on anything but a class defaults to class level, which only
    // gets read if a class governs the element. That is right for a subclass and
    // almost never right for a species, so say so once — and setting `levelsBy`
    // either way silences it, which is the escape hatch for a custom
    // class-governed kind.
    if (el.levelsBy === undefined && el.kind !== "class" && el.kind !== "subclass")
      out.push(
        warn(
          "unknown-part",
          `\`levels\` on a "${String(el.kind)}" is read against class level, so nothing reads it unless a class grants this element. Set \`levelsBy: "character"\` to stage it against character level, or "class" to say you meant this.`,
          subject,
          "levels",
        ),
      );
    if (!el.levels || typeof el.levels !== "object" || Array.isArray(el.levels)) {
      out.push(err("invalid-element", "levels must be a map of level to entry", subject, "levels"));
    } else {
      for (const [lvl, entry] of Object.entries(el.levels as Record<string, unknown>)) {
        const n = Number(lvl);
        if (!Number.isInteger(n) || n < 1 || n > 20)
          out.push(warn("invalid-element", `level key "${lvl}" is not 1..20`, subject, `levels.${lvl}`));
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          out.push(err("invalid-element", "level entry must be an object", subject, `levels.${lvl}`));
          continue;
        }
        const e = entry as Record<string, unknown>;
        for (const part of LEVEL_PARTS) {
          const v = e[part];
          if (v === undefined) continue;
          if (!Array.isArray(v)) {
            out.push(err("invalid-element", `levels.${lvl}.${part} must be an array`, subject, `levels.${lvl}.${part}`));
            continue;
          }
          const p = `levels.${lvl}.${part}`;
          if (part === "modifiers") v.forEach((m, i) => validateModifier(m, subject, `${p}[${i}]`, out));
          if (part === "choices") v.forEach((c, i) => validateChoice(c, subject, `${p}[${i}]`, out));
          if (part === "resources") v.forEach((r, i) => validateResource(r, subject, `${p}[${i}]`, out));
          if (part === "actions") v.forEach((a, i) => validateAction(a, subject, `${p}[${i}]`, out));
          if (part === "effects") v.forEach((x, i) => validateEffect(x, subject, `${p}[${i}]`, out));
        }
        for (const key of Object.keys(e))
          if (!(LEVEL_PARTS as readonly string[]).includes(key) && key !== "text" && !key.startsWith("x-"))
            out.push(warn("unknown-part", `unknown level part "${key}"; kept as data`, subject, `levels.${lvl}.${key}`));
      }
    }
  }

  if (el.tables !== undefined && (!el.tables || typeof el.tables !== "object" || Array.isArray(el.tables)))
    out.push(err("invalid-element", "tables must be a map of column name to values", subject, "tables"));

  if (el.spellcasting !== undefined) {
    const sc = el.spellcasting as Record<string, unknown>;
    if (!sc || typeof sc !== "object") {
      out.push(err("invalid-element", "spellcasting must be an object", subject, "spellcasting"));
    } else {
      if (!(ABILITIES as readonly string[]).includes(String(sc.ability)))
        out.push(err("invalid-element", "spellcasting needs a valid ability", subject, "spellcasting.ability"));
      if (!["full", "half", "third", "pact", "none"].includes(String(sc.progression)))
        out.push(err("invalid-element", `unknown progression "${String(sc.progression)}"`, subject, "spellcasting.progression"));
      if (!["prepared", "known", "spellbook"].includes(String(sc.type)))
        out.push(err("invalid-element", `unknown preparation type "${String(sc.type)}"`, subject, "spellcasting.type"));
      if (typeof sc.list !== "string")
        out.push(err("invalid-element", "spellcasting needs a spell list tag", subject, "spellcasting.list"));
      for (const f of ["cantrips", "known", "prepared", "spellbook", "maxSpellLevel"] as const) {
        if (sc[f] === undefined) continue;
        const e = checkExpression(sc[f] as string | number);
        if (e) out.push(warn("expression-error", e, subject, `spellcasting.${f}`));
      }
      if (sc.extra !== undefined) {
        if (!Array.isArray(sc.extra))
          out.push(err("invalid-element", "spellcasting.extra must be a list", subject, "spellcasting.extra"));
        else
          (sc.extra as Record<string, unknown>[]).forEach((pick, i) => {
            const at = `spellcasting.extra.${i}`;
            if (!pick || typeof pick !== "object" || !Number.isInteger(pick.level) || !Number.isInteger(pick.choose))
              out.push(err("invalid-element", "an extra spell pick needs an integer level and choose", subject, at));
            else if (
              pick.spellLevels !== undefined &&
              (!Array.isArray(pick.spellLevels) || pick.spellLevels.some((n) => !Number.isInteger(n)))
            )
              out.push(err("invalid-element", "spellLevels must be a list of integers", subject, `${at}.spellLevels`));
          });
      }
    }
  }

  // Kind definitions and stat paths need their own key.
  if (el.kind === "kind" && typeof el.key !== "string")
    out.push(err("invalid-element", "kind definition needs a key", subject, "key"));
  if (el.kind === "stat-path") {
    if (typeof el.key !== "string")
      out.push(err("invalid-element", "stat-path needs a key", subject, "key"));
    if (!["number", "set"].includes(String(el.valueType)))
      out.push(err("invalid-element", 'stat-path needs valueType "number" or "set"', subject, "valueType"));
  }
  // An action element is itself an action, so it declares what it costs.
  if (el.kind === "action") {
    if (typeof el.activation !== "string" || !el.activation) {
      out.push(err("invalid-element", "action needs an activation", subject, "activation"));
    } else if (!(ACTIVATIONS as readonly string[]).includes(el.activation)) {
      out.push(
        warn("unknown-activation", `Unknown activation "${el.activation}"`, subject, "activation"),
      );
    }
  }

  // A skill declares which ability its checks use; nothing else knows.
  if (el.kind === "skill" && !(ABILITIES as readonly string[]).includes(String(el.ability)))
    out.push(
      err(
        "invalid-element",
        `skill needs an ability, one of ${ABILITIES.join(", ")}`,
        subject,
        "ability",
      ),
    );
  if (el.kind === "sourcebook" && typeof el.abbreviation !== "string")
    out.push(err("invalid-element", "sourcebook needs an abbreviation", subject, "abbreviation"));

  return { usable: usable && !out.some((d) => d.severity === "error"), diagnostics: out };
}

export { KNOWN_PARTS };
