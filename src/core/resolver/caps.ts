/**
 * Soft caps: the values a stat is not *expected* to exceed.
 *
 * An ability score stops at 20 by the rules, and then a Tome of Clear Thought
 * takes it to 21. So the cap is advisory and lives in content, as `softMax` on a
 * `stat-path` element — the engine never clamps, and a table that houserules the
 * cap moves one number in one file.
 *
 * What the builder does with a breach is ask. That is the whole design: nothing
 * is refused, and the player confirms the thing the rules would not normally
 * allow, exactly as they confirm removing a level.
 */

import type { ContentIndex } from "../content";
import type { ResolvedCharacter } from "./resolved";

export interface CapBreach {
  /** The stat path that went over. */
  path: string;
  /** What to call it in a sentence: "Strength". */
  label: string;
  value: number;
  softMax: number;
}

/** Every stat sitting above its soft cap, in path order. */
export function capBreaches(character: ResolvedCharacter, index: ContentIndex): CapBreach[] {
  const out: CapBreach[] = [];
  for (const [path, stat] of Object.entries(character.stats)) {
    const softMax = index.statPath(path)?.softMax;
    if (typeof softMax !== "number" || stat.value <= softMax) continue;
    out.push({ path, label: labelFor(path, index), value: stat.value, softMax });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Breaches a change would newly cause.
 *
 * A character already over a cap — because an item put them there — must not be
 * asked about it again on every later edit, so only what the change itself
 * crosses is reported.
 */
export function newBreaches(before: CapBreach[], after: CapBreach[]): CapBreach[] {
  const was = new Map(before.map((b) => [b.path, b.value]));
  return after.filter((breach) => {
    const previous = was.get(breach.path);
    return previous === undefined || breach.value > previous;
  });
}

/**
 * A readable name for a stat path.
 *
 * The stat-path element's own `label` is the general answer, but it is shared by
 * a whole wildcard family ("Ability score" for all six), so the varying part of
 * the path is what distinguishes one from another.
 */
function labelFor(path: string, index: ContentIndex): string {
  const ability = /^abilities\.([a-z]{3})\.score$/.exec(path);
  if (ability) return ABILITY_NAMES[ability[1]] ?? ability[1].toUpperCase();
  return index.statPath(path)?.label ?? path;
}

const ABILITY_NAMES: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};
