/**
 * Prerequisite checking. Enforcement is optional (a builder toggle), so this
 * always returns both the verdict and a human-readable reason: with enforcement
 * off the reason becomes a warning on the option instead of hiding it.
 */

import type { Ability, Predicate, Requirement } from "../types";

export interface RequirementContext {
  totalLevel: number;
  /** Level in one class, by short key or full id. */
  classLevel(ref: string): number;
  abilityScore(ability: Ability): number;
  /** Does the character already have this element? */
  has(id: string): boolean;
  /** Proficiency values the character holds, e.g. "srd:tool:smiths-tools", "stealth". */
  hasProficiency(proficiency: string, of?: string): boolean;
  isSpellcaster: boolean;
  /** For rendering ids as names in reasons. */
  nameOf?(id: string): string | undefined;
}

export interface RequirementResult {
  met: boolean;
  /** One line per failed predicate. Empty when met. */
  reasons: string[];
}

function isRequirement(p: Predicate): p is Requirement {
  const r = p as Requirement;
  return r.all !== undefined || r.any !== undefined || r.not !== undefined;
}

function label(ctx: RequirementContext, id: string): string {
  return ctx.nameOf?.(id) ?? id;
}

function checkPredicate(p: Predicate, ctx: RequirementContext): RequirementResult {
  if (isRequirement(p)) return checkRequirement(p, ctx);
  switch (p.type) {
    case "class-level": {
      const have = ctx.classLevel(p.class);
      return have >= p.min
        ? { met: true, reasons: [] }
        : { met: false, reasons: [`${label(ctx, p.class)} level ${p.min} (you have ${have})`] };
    }
    case "level":
      return ctx.totalLevel >= p.min
        ? { met: true, reasons: [] }
        : { met: false, reasons: [`level ${p.min} (you are level ${ctx.totalLevel})`] };
    case "ability": {
      const have = ctx.abilityScore(p.ability);
      return have >= p.min
        ? { met: true, reasons: [] }
        : { met: false, reasons: [`${p.ability.toUpperCase()} ${p.min} (you have ${have})`] };
    }
    case "has":
      return ctx.has(p.id)
        ? { met: true, reasons: [] }
        : { met: false, reasons: [`requires ${label(ctx, p.id)}`] };
    case "proficiency":
      return ctx.hasProficiency(p.proficiency, p.of)
        ? { met: true, reasons: [] }
        : { met: false, reasons: [`proficiency with ${label(ctx, p.proficiency)}`] };
    case "spellcaster":
      return ctx.isSpellcaster
        ? { met: true, reasons: [] }
        : { met: false, reasons: ["the ability to cast at least one spell"] };
    default:
      // Unknown predicate types never block: degradation beats a false negative.
      return { met: true, reasons: [] };
  }
}

export function checkRequirement(req: Requirement | undefined, ctx: RequirementContext): RequirementResult {
  if (!req) return { met: true, reasons: [] };
  const reasons: string[] = [];

  for (const p of req.all ?? []) {
    const r = checkPredicate(p, ctx);
    if (!r.met) reasons.push(...r.reasons);
  }

  if (req.any?.length) {
    const results = req.any.map((p) => checkPredicate(p, ctx));
    if (!results.some((r) => r.met))
      reasons.push(`one of: ${results.flatMap((r) => r.reasons).join(" or ")}`);
  }

  for (const p of req.not ?? []) {
    const r = checkPredicate(p, ctx);
    if (r.met) reasons.push(`must not have ${describePredicate(p, ctx)}`);
  }

  if (reasons.length && req.text) return { met: false, reasons: [req.text] };
  return { met: reasons.length === 0, reasons };
}

export function describePredicate(p: Predicate, ctx?: RequirementContext): string {
  if (isRequirement(p)) return describeRequirement(p, ctx);
  const name = (id: string) => ctx?.nameOf?.(id) ?? id;
  switch (p.type) {
    case "class-level":
      return `${name(p.class)} level ${p.min}`;
    case "level":
      return `level ${p.min}`;
    case "ability":
      return `${p.ability.toUpperCase()} ${p.min}`;
    case "has":
      return name(p.id);
    case "proficiency":
      return `proficiency with ${name(p.proficiency)}`;
    case "spellcaster":
      return "spellcasting";
    default:
      return "an unrecognised prerequisite";
  }
}

/** A one-line summary for the element info panel. */
export function describeRequirement(req: Requirement | undefined, ctx?: RequirementContext): string {
  if (!req) return "";
  if (req.text) return req.text;
  const parts: string[] = [];
  const all = (req.all ?? []).map((p) => describePredicate(p, ctx));
  if (all.length) parts.push(all.join(", "));
  const any = (req.any ?? []).map((p) => describePredicate(p, ctx));
  if (any.length) parts.push(any.join(" or "));
  const not = (req.not ?? []).map((p) => describePredicate(p, ctx));
  if (not.length) parts.push(`not ${not.join(", not ")}`);
  return parts.join("; ");
}
