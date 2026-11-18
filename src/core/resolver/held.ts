/**
 * What a choice's options already give the character from somewhere else.
 *
 * A picker over languages, skills or tools marks an option it would add nothing
 * through, and says where the character has it from. Read from the modifiers rather than
 * the elements, so a species that states "Common" inline counts the same as one that
 * grants the language element, and a skill held as expertise covers one offered as
 * proficiency.
 *
 * "Elsewhere" is the base build: everything but this choice's own picks, and everything
 * but inventory, which comes and goes in play and is not what a build is made from.
 * A modifier with a `when` never counts, as it never folds into a value either.
 */
import type { Element, Modifier, ProficiencyLevel } from "../types";
import type { ContentIndex } from "../content";
import { occurrencePrefix, type CollectResult, type DeclaredChoice } from "./collect";

/** The kinds of option whose picks are about not having a thing twice. */
const HELD_KINDS: ReadonlySet<string> = new Set(["language", "skill", "tool"]);

const RANK: Record<ProficiencyLevel, number> = { none: 0, half: 1, proficient: 2, expertise: 3 };

/** One thing a modifier gives: a member of a set, or a proficiency level in a skill. */
interface Claim {
  key: string;
  /** Set members all rank 1; a skill ranks by its proficiency level. */
  rank: number;
}

function claimsOf(modifiers: readonly Modifier[]): Claim[] {
  const out: Claim[] = [];
  for (const m of modifiers) {
    if (m.when) continue;
    if (m.op === "include" && (m.target === "languages" || m.target.startsWith("proficiencies."))) {
      // Language names are written by hand, so they match without regard to case.
      const fold = (v: unknown): string => (m.target === "languages" ? String(v).toLowerCase() : String(v));
      for (const v of Array.isArray(m.value) ? m.value : []) out.push({ key: `${m.target}=${fold(v)}`, rank: 1 });
    } else if (m.op === "proficiency" && m.target.startsWith("skills.") && typeof m.value === "string") {
      const rank = RANK[m.value as ProficiencyLevel];
      if (rank !== undefined) out.push({ key: m.target, rank });
    }
  }
  return out;
}

/** What an option gives. A language the content gives no modifier for is itself. */
function optionClaims(option: Element): Claim[] {
  const claims = claimsOf(option.modifiers ?? []);
  if (!claims.length && option.kind === "language") {
    return [{ key: `languages=${option.name.toLowerCase()}`, rank: 1 }];
  }
  return claims;
}

/**
 * For one choice, a lookup from an option to where the character already has all it
 * would give, or undefined when it would add something. Named after what the character
 * was built from — the species, the background, the class — not the element that
 * happens to carry the modifier.
 */
export function heldElsewhere(
  collected: CollectResult,
  content: ContentIndex,
  declared: DeclaredChoice,
): (option: Element) => string | undefined {
  const own = occurrencePrefix(declared.definition.id, declared.scope, declared.levelIndex);
  const have: (Claim & { holder: string })[] = [];
  for (const { def, from } of collected.modifiers) {
    if (from.itemIndex !== undefined || from.occurrence?.startsWith(own)) continue;
    const top = from.origin?.[0];
    const holder = (top ? content.get(top)?.name : undefined) ?? from.element.name;
    for (const claim of claimsOf([def])) have.push({ ...claim, holder });
  }
  if (!have.length) return () => undefined;

  return (option) => {
    if (!HELD_KINDS.has(option.kind)) return undefined;
    const claims = optionClaims(option);
    if (!claims.length) return undefined;
    const holders = new Set<string>();
    for (const claim of claims) {
      const covering = have.filter((h) => h.key === claim.key && h.rank >= claim.rank);
      if (!covering.length) return undefined;
      for (const h of covering) holders.add(h.holder);
    }
    return [...holders].join(", ");
  };
}
