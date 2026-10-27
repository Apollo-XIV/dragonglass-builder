/**
 * Spell slot progressions.
 *
 * Single-class casters use their own class table, which for half and third casters
 * rounds the caster level up. Multiclass characters use the PHB's shared table,
 * which rounds half and third caster levels down. The two genuinely differ, so the
 * caller says which case it is rather than the tables being averaged into one rule.
 */

import type { ProgressionKind } from "../types";

/** Slots by caster level, 1..20, each row listing slots for spell levels 1..9. */
const FULL_CASTER: number[][] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Pact magic: slot count and slot level by warlock level. */
const PACT: { count: number; level: number }[] = [
  { count: 1, level: 1 },
  { count: 2, level: 1 },
  { count: 2, level: 2 },
  { count: 2, level: 2 },
  { count: 2, level: 3 },
  { count: 2, level: 3 },
  { count: 2, level: 4 },
  { count: 2, level: 4 },
  { count: 2, level: 5 },
  { count: 2, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
];

export const PROGRESSION_DIVISOR: Record<ProgressionKind, number> = {
  full: 1,
  half: 2,
  third: 3,
  pact: 1,
  none: 0,
};

/**
 * The level a class contributes to the slot table.
 * `shared` is true when more than one class contributes, which is the multiclass
 * rule (round down); on its own a half caster follows its own table (round up).
 */
export function casterLevel(progression: ProgressionKind, classLevel: number, shared: boolean): number {
  if (classLevel <= 0) return 0;
  const divisor = PROGRESSION_DIVISOR[progression];
  if (!divisor) return 0;
  if (progression === "pact") return 0;
  if (divisor === 1) return classLevel;
  return shared ? Math.floor(classLevel / divisor) : Math.ceil(classLevel / divisor);
}

/** Slots for spell levels 1..9 at a given caster level. */
export function slotsForCasterLevel(level: number): number[] {
  if (level <= 0) return [];
  const row = FULL_CASTER[Math.min(level, FULL_CASTER.length) - 1];
  return [...row];
}

export function pactSlots(warlockLevel: number): { count: number; level: number } | undefined {
  if (warlockLevel <= 0) return undefined;
  return { ...PACT[Math.min(warlockLevel, PACT.length) - 1] };
}

/** The standard 2 + level/4 progression, used when no class overrides it. */
export function proficiencyBonusFor(totalLevel: number): number {
  return 2 + Math.floor((Math.max(1, totalLevel) - 1) / 4);
}

/** Average hit points rolled for a die, the "take the average" option. */
export function averageForDie(die: string): number {
  const size = Number(die.replace(/^d/i, "")) || 0;
  return Math.floor(size / 2) + 1;
}

export function maxForDie(die: string): number {
  return Number(die.replace(/^d/i, "")) || 0;
}
