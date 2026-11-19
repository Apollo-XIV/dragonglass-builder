/**
 * Which expertise picks count.
 *
 * Expertise is an option like any other, so the collector applies a pick's modifiers
 * whether or not its `requires` still holds. That is wrong here: a pick the character
 * can no longer back with proficiency must be inert, and must stop counting as the
 * proficiency that justified it. So before stats are built this reads the base build
 * *without* the expertise picks, and drops the modifiers of any pick that is not
 * proficient there, is already doubled by content outright, or is doubled by an earlier
 * pick. Nothing is stored: take the proficiency back and the pick applies again.
 */
import type { ContentIndex } from "../content";
import { checkRequirement } from "../content/requirements";
import type { ProficiencyLevel } from "../types";
import type { CollectResult } from "./collect";

export const EXPERTISE_KIND = "expertise";
export const TOOL_EXPERTISE = "proficiencies.tool-expertise";

/** Whether a proficiency level counts as being proficient. Half is not. */
export const isProficient = (level: ProficiencyLevel): boolean => level === "proficient" || level === "expertise";

const RANK: Record<ProficiencyLevel, number> = { none: 0, half: 1, proficient: 2, expertise: 3 };

/** The targets an expertise element doubles: `skills.x` paths and tool ids. */
function doubled(mods: readonly { target: string; op: string; value?: unknown; when?: unknown }[]): string[] {
  const out: string[] = [];
  for (const m of mods) {
    if (m.when) continue;
    if (m.op === "proficiency" && m.target.startsWith("skills.") && m.value === "expertise") out.push(m.target);
    else if (m.op === "include" && m.target === TOOL_EXPERTISE && Array.isArray(m.value))
      for (const v of m.value) out.push(`${TOOL_EXPERTISE}=${String(v)}`);
  }
  return out;
}

/**
 * Removes the modifiers of every expertise pick that does not count, from `collected`,
 * and returns the occurrences it removed.
 */
export function settleExpertise(content: ContentIndex, collected: CollectResult, totalLevel: number): Set<string> {
  const isPick = (from: CollectResult["modifiers"][number]["from"]): boolean =>
    from.element.kind === EXPERTISE_KIND && from.occurrence !== undefined;
  if (!collected.modifiers.some(({ from }) => isPick(from))) return new Set();

  // The base build, expertise picks left out.
  const proficiencies = new Set<string>();
  const levels = new Map<string, ProficiencyLevel>();
  const fixed = new Set<string>();
  for (const { def, from } of collected.modifiers) {
    if (def.when || isPick(from)) continue;
    for (const t of doubled([def])) fixed.add(t);
    if (def.op === "proficiency" && def.target.startsWith("skills.") && typeof def.value === "string") {
      const level = def.value as ProficiencyLevel;
      if (RANK[level] > RANK[levels.get(def.target) ?? "none"]) levels.set(def.target, level);
    } else if (def.op === "include" && def.target.startsWith("proficiencies.") && def.target !== TOOL_EXPERTISE) {
      for (const v of Array.isArray(def.value) ? def.value : []) proficiencies.add(String(v));
    }
  }
  for (const key of content.skillKeys()) if (isProficient(levels.get(`skills.${key}`) ?? "none")) proficiencies.add(key);

  const context = {
    totalLevel,
    classLevel: (ref: string) => {
      const id = content.classByRef(ref)?.id ?? ref;
      return collected.classLevels.find((c) => c.id === id)?.level ?? 0;
    },
    abilityScore: () => 10,
    has: (id: string) => collected.byId.has(id),
    hasTag: () => false,
    hasProficiency: (p: string) => proficiencies.has(p),
    isSpellcaster: false,
  };

  // Picks in the order the build collected them: the earlier one wins.
  const taken = new Set(fixed);
  const inert = new Set<string>();
  const seen = new Set<string>();
  for (const { from } of collected.modifiers) {
    if (!isPick(from) || seen.has(from.occurrence!)) continue;
    seen.add(from.occurrence!);
    const targets = doubled(
      collected.modifiers.filter((p) => p.from.occurrence === from.occurrence).map((p) => p.def),
    );
    const met = checkRequirement(from.element.requires, { ...context, candidate: from.element.id }).met;
    if (!met || targets.some((t) => taken.has(t))) inert.add(from.occurrence!);
    else for (const t of targets) taken.add(t);
  }

  if (inert.size) {
    collected.modifiers = collected.modifiers.filter(({ from }) => !(isPick(from) && inert.has(from.occurrence!)));
  }
  return inert;
}
