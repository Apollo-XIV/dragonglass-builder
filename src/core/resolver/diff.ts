/**
 * What a save would change (spec 7.9).
 *
 * Deliberately shallow: it reads two build files and says what is different in
 * the words the builder uses, so the player can see "Fighting Style: Defence →
 * Protection" before committing. It is not a merge tool and makes no attempt to
 * explain consequences — the change report in `validity.ts` does that.
 */

import type { BuildFile } from "../types";
import { ABILITIES } from "../types";
import { classLevels } from "./levels";

export interface BuildDiff {
  lines: string[];
  count: number;
}

/** `nameOf` turns element ids into names; pass the identity if you have no index. */
export function diffBuilds(base: BuildFile, next: BuildFile, nameOf: (id: string) => string = (id) => id): BuildDiff {
  const lines: string[] = [];
  const names = (ids: string[]): string => (ids.length ? ids.map(nameOf).join(", ") : "nothing");

  if ((base.name ?? "") !== (next.name ?? "")) lines.push(`Name: ${base.name || "unnamed"} → ${next.name || "unnamed"}`);
  if ((base.xp ?? 0) !== (next.xp ?? 0)) lines.push(`XP: ${base.xp ?? 0} → ${next.xp ?? 0}`);
  if (base.species !== next.species)
    lines.push(`Species: ${base.species ? nameOf(base.species) : "none"} → ${next.species ? nameOf(next.species) : "none"}`);
  if (base.background !== next.background)
    lines.push(
      `Background: ${base.background ? nameOf(base.background) : "none"} → ${next.background ? nameOf(next.background) : "none"}`,
    );

  if (base.abilities.method !== next.abilities.method)
    lines.push(`Ability method: ${base.abilities.method} → ${next.abilities.method}`);
  for (const ability of ABILITIES) {
    const from = base.abilities.base[ability];
    const to = next.abilities.base[ability];
    if (from !== to) lines.push(`${ability.toUpperCase()}: ${from} → ${to}`);
  }

  // Levels are reported by class, because that is how a player thinks about
  // them: "Paladin 5 → Paladin 6", not "entry 6 appeared".
  const before = classLevels(base);
  const after = classLevels(next);
  for (const classId of new Set([...before.keys(), ...after.keys()])) {
    const from = before.get(classId) ?? 0;
    const to = after.get(classId) ?? 0;
    if (from !== to) lines.push(`${nameOf(classId)}: level ${from} → ${to}`);
  }

  for (const [choiceId, from, to] of choicePairs(base, next)) {
    if (sameAnswer(from, to)) continue;
    lines.push(`${nameOf(choiceId)}: ${names(from)} → ${names(to)}`);
  }

  const plannedBefore = (base.planned ?? []).length;
  const plannedAfter = (next.planned ?? []).length;
  if (plannedBefore !== plannedAfter) lines.push(`Planned levels: ${plannedBefore} → ${plannedAfter}`);

  return { lines, count: lines.length };
}

/** Every choice id either side mentions, with both answers. */
function choicePairs(base: BuildFile, next: BuildFile): [string, string[], string[]][] {
  const read = (build: BuildFile): Map<string, string[]> => {
    const all = new Map<string, string[]>();
    for (const [id, chosen] of Object.entries(build.choices ?? {})) all.set(id, chosen);
    for (const level of build.levels ?? [])
      for (const [id, chosen] of Object.entries(level.choices ?? {})) all.set(id, chosen);
    return all;
  };
  const from = read(base);
  const to = read(next);
  return [...new Set([...from.keys(), ...to.keys()])].map((id) => [id, from.get(id) ?? [], to.get(id) ?? []]);
}

function sameAnswer(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
