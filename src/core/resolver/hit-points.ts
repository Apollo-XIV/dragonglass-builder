/**
 * Hit points taken at each level, before the CON modifier. The total hit point
 * stat and the per-level list an export carries both come from here, so they
 * cannot disagree about the first-level rule.
 */

import type { BuildFile, HpChoice } from "../types";
import { averageForDie, maxForDie } from "./spellslots";

export interface HpLevel {
  /** 1-based position in `build.levels`. */
  characterLevel: number;
  /** Class element id. */
  class: string;
  /** The level within that class: the third Paladin entry is Paladin 3. */
  classLevel: number;
  die: string;
  /** How the value was arrived at. The character's first level is always `max`. */
  method: HpChoice;
  /** What the die contributed: the face for `max`, face / 2 + 1 for `average`, or the number. */
  value: number;
  /** True when the stored choice was overridden by the first-level rule. */
  forced: boolean;
}

export function hitPointLevels(build: BuildFile, dieOf: (classId: string) => string): HpLevel[] {
  const seen = new Map<string, number>();
  return (build.levels ?? []).map((lvl, i) => {
    const classLevel = (seen.get(lvl?.class) ?? 0) + 1;
    seen.set(lvl?.class, classLevel);
    const die = dieOf(lvl?.class);
    const stored: HpChoice = lvl?.hp ?? "average";
    const method: HpChoice = i === 0 ? "max" : stored;
    return {
      characterLevel: i + 1,
      class: lvl?.class,
      classLevel,
      die,
      method,
      value: valueFor(method, die),
      forced: i === 0 && stored !== "max",
    };
  });
}

function valueFor(choice: HpChoice, die: string): number {
  if (typeof choice === "number") return choice;
  return choice === "max" ? maxForDie(die) : averageForDie(die);
}
