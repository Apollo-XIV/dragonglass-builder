/**
 * Pools of values and which ability each chip went to, kept apart from any input. Tapping a
 * chip then a tile, dragging, and anything added later all call these same functions on
 * `build.abilities`, and get back a new one in which the base scores and the chips agree.
 *
 * A chip is a slot in a pool, named `pool:slot`, so two 14s are two chips. Rolled pools are
 * stored in the build; the standard array is one fixed pool that never is.
 */

import { ABILITIES, type Ability, type AbilityMethod, type AbilityPool, type BuildAbilities } from "../../../core/types";
import { rollMethod, type RollMethod } from "./roll-methods";

export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];
export const STANDARD_POOL = "standard";
export const POOL_SIZE = 6;

/** What a pool method's row needs to draw a pool. `method` is absent for the standard array. */
export interface PoolView {
  id: string;
  values: readonly (number | null)[];
  method?: RollMethod;
}

export function isPoolMethod(method: AbilityMethod): boolean {
  return method === "rolled" || method === "standard-array";
}

export function chipId(pool: string, slot: number): string {
  return `${pool}:${slot}`;
}

export function parseChip(chip: string): { pool: string; slot: number } | undefined {
  const at = chip.lastIndexOf(":");
  const slot = Number(chip.slice(at + 1));
  if (at <= 0 || !Number.isInteger(slot) || slot < 0 || slot >= POOL_SIZE) return undefined;
  return { pool: chip.slice(0, at), slot };
}

export function poolsOf(abilities: BuildAbilities): PoolView[] {
  if (abilities.method === "standard-array") return [{ id: STANDARD_POOL, values: STANDARD_ARRAY }];
  if (abilities.method !== "rolled") return [];
  return (abilities.pools ?? []).map((p) => ({ id: p.id, values: p.values, method: rollMethod(p.method) }));
}

export function chipValue(abilities: BuildAbilities, chip: string): number | null {
  const at = parseChip(chip);
  if (!at) return null;
  const pool = poolsOf(abilities).find((p) => p.id === at.pool);
  return pool?.values[at.slot] ?? null;
}

/** Each chip in use and the ability it went to. A chip that no longer exists is not in use. */
export function usedChips(abilities: BuildAbilities): Map<string, Ability> {
  const used = new Map<string, Ability>();
  for (const ability of ABILITIES) {
    const chip = abilities.assigned?.[ability];
    if (chip !== undefined && chipValue(abilities, chip) !== null && !used.has(chip)) used.set(chip, ability);
  }
  return used;
}

/** The chip an ability's score came from, if it came from one that still exists. */
export function chipOf(abilities: BuildAbilities, ability: Ability): string | undefined {
  const chip = abilities.assigned?.[ability];
  return chip !== undefined && usedChips(abilities).get(chip) === ability ? chip : undefined;
}

/**
 * A score carried over from manual that the pool method could not have given: out of the
 * method's range, or not a chip of the pool at all (a standard array has no 2, or a third 15).
 */
export function isInvalidBase(abilities: BuildAbilities, ability: Ability): boolean {
  const value = abilities.base[ability];
  if (!isPoolMethod(abilities.method) || value === undefined) return false;
  const chip = chipOf(abilities, ability);
  if (chip === undefined) return true;
  const method = poolsOf(abilities).find((p) => p.id === parseChip(chip)?.pool)?.method;
  return method !== undefined && (value < method.min || value > method.max);
}

/** An invalid score goes back to empty, and the out-of-range value it was left in the pool goes with it. */
export function resetAbility(abilities: BuildAbilities, ability: Ability): BuildAbilities {
  const chip = chipOf(abilities, ability);
  return chip === undefined ? unassign(abilities, ability) : setValue(abilities, chip, null);
}

function withAbility(
  abilities: BuildAbilities,
  ability: Ability,
  value: number | undefined,
  chip: string | undefined,
): BuildAbilities {
  const base = { ...abilities.base };
  const assigned = { ...abilities.assigned };
  if (value === undefined) delete base[ability];
  else base[ability] = value;
  if (chip === undefined) delete assigned[ability];
  else assigned[ability] = chip;
  return { ...abilities, base, assigned };
}

/**
 * The chip goes to the ability. Whatever the ability held goes back to the pool, unless the
 * chip came from another ability, in which case the two swap.
 */
export function assign(abilities: BuildAbilities, chip: string, ability: Ability): BuildAbilities {
  const value = chipValue(abilities, chip);
  if (value === null) return abilities;
  const from = usedChips(abilities).get(chip);
  if (from === ability) return abilities;
  // An invalid score is not worth keeping: it is replaced rather than swapped across.
  const held = isInvalidBase(abilities, ability)
    ? { value: undefined, chip: undefined }
    : { value: abilities.base[ability], chip: chipOf(abilities, ability) };
  let next = withAbility(abilities, ability, value, chip);
  if (from) next = withAbility(next, from, held.value, held.chip);
  return next;
}

/**
 * An invalid score is picked up and put on another tile. The score there, if it is a valid
 * one, moves to where the invalid one was, and the destination is left blank; the invalid
 * score itself is dropped. Onto an empty or invalid tile nothing happens.
 */
export function moveInvalid(abilities: BuildAbilities, from: Ability, to: Ability): BuildAbilities {
  const chip = chipOf(abilities, to);
  if (from === to || !isInvalidBase(abilities, from) || chip === undefined || isInvalidBase(abilities, to)) return abilities;
  return assign(unassign(abilities, from), chip, from);
}

/** The ability goes back to empty, and its chip back to the pool. */
export function unassign(abilities: BuildAbilities, ability: Ability): BuildAbilities {
  return withAbility(abilities, ability, undefined, undefined);
}

function editPool(abilities: BuildAbilities, id: string, edit: (pool: AbilityPool) => AbilityPool): BuildAbilities {
  return { ...abilities, pools: (abilities.pools ?? []).map((p) => (p.id === id ? edit(p) : p)) };
}

/**
 * Sets a slot of a rolled pool. A chip in use keeps its ability, whose score follows it;
 * a chip emptied lets its ability go.
 */
export function setValue(abilities: BuildAbilities, chip: string, value: number | null): BuildAbilities {
  const at = parseChip(chip);
  if (!at || !(abilities.pools ?? []).some((p) => p.id === at.pool)) return abilities;
  const ability = usedChips(abilities).get(chip);
  let next = editPool(abilities, at.pool, (p) => {
    const values = padded(p.values);
    values[at.slot] = value;
    return { ...p, values };
  });
  if (ability) next = value === null ? unassign(next, ability) : withAbility(next, ability, value, chip);
  return next;
}

function padded(values: readonly (number | null)[]): (number | null)[] {
  return Array.from({ length: POOL_SIZE }, (_, i) => values[i] ?? null);
}

function nextPoolId(pools: readonly AbilityPool[]): string {
  const taken = pools.map((p) => Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0));
  return `p${Math.max(0, ...taken) + 1}`;
}

/** A new empty pool at the end, rolled the same way as the pools before it. */
export function addPool(abilities: BuildAbilities, fallbackMethod: string): { abilities: BuildAbilities; pool: string } {
  const pools = abilities.pools ?? [];
  const id = nextPoolId(pools);
  const method = pools[pools.length - 1]?.method ?? fallbackMethod;
  return {
    abilities: { ...abilities, pools: [...pools, { id, method, values: padded([]) }] },
    pool: id,
  };
}

function releasePool(abilities: BuildAbilities, id: string): BuildAbilities {
  let next = abilities;
  for (const [chip, ability] of usedChips(abilities)) if (parseChip(chip)?.pool === id) next = unassign(next, ability);
  return next;
}

/** Empties a pool. The abilities its chips went to go back to empty. */
export function resetPool(abilities: BuildAbilities, id: string): BuildAbilities {
  return editPool(releasePool(abilities, id), id, (p) => ({ ...p, values: padded([]) }));
}

/** Removes a pool, or resets it when it is the only one, since a rolled method always has one. */
export function removePool(abilities: BuildAbilities, id: string): BuildAbilities {
  const pools = abilities.pools ?? [];
  if (pools.length <= 1) return resetPool(abilities, id);
  const next = releasePool(abilities, id);
  return { ...next, pools: pools.filter((p) => p.id !== id) };
}

/**
 * Changes the method. Scores carry over only to or from manual; going straight between two
 * other methods starts the new one clean. Into rolled, a score the roll method cannot produce gets no chip. A score still holding the value of
 * the chip it had last time rolled was used goes back to that chip; the rest become chips of a
 * new pool, in ability order, already assigned. Into the standard array, a score takes an
 * unused value of the array if there is one, or stays in its tile until something replaces
 * it. Out of a pool method, an ability still empty starts at 8, where point buy starts, and
 * the chips each score came from are kept for coming back.
 */
export function switchMethod(abilities: BuildAbilities, method: AbilityMethod, rollWith: string): BuildAbilities {
  if (abilities.method === method) return abilities;
  if (abilities.method !== "manual" && method !== "manual") {
    const { pools: _pools, assigned: _assigned, ...rest } = abilities;
    abilities = { ...rest, base: {} };
  }
  if (!isPoolMethod(method)) {
    const base = Object.fromEntries(ABILITIES.map((a) => [a, abilities.base[a] ?? 8])) as Record<Ability, number>;
    return { ...abilities, method, base };
  }

  // A standard array chip never names a rolled pool's slot, so only rolled chips come back.
  const previous = abilities.assigned ?? {};
  let next: BuildAbilities = { ...abilities, method, assigned: {} };
  const unmatched: Ability[] = [];
  for (const ability of ABILITIES) {
    const value = abilities.base[ability];
    if (value === undefined) continue;
    const used = usedChips(next);
    const chip =
      method === "rolled"
        ? [previous[ability]].find((c) => c !== undefined && chipValue(next, c) === value && !used.has(c))
        : poolsOf(next)
            .flatMap((p) => p.values.map((v, slot) => ({ chip: chipId(p.id, slot), v })))
            .find(({ chip, v }) => v === value && !used.has(chip))?.chip;
    if (chip) next = withAbility(next, ability, value, chip);
    else unmatched.push(ability);
  }

  if (method === "rolled" && (unmatched.length || !(next.pools ?? []).length)) {
    const added = addPool(next, rollWith);
    next = added.abilities;
    const range = poolsOf(next).find((p) => p.id === added.pool)?.method;
    unmatched.forEach((ability, slot) => {
      const value = abilities.base[ability]!;
      // A score the method cannot roll leaves its slot empty; its tile keeps it, flagged, until reset.
      if (range && (value < range.min || value > range.max)) return;
      const chip = chipId(added.pool, slot);
      next = withAbility(setValue(next, chip, value), ability, value, chip);
    });
  }
  return next;
}

/** Rolls the given slots of a pool, returning the new abilities and what each slot got. */
export function rollSlots(
  abilities: BuildAbilities,
  pool: string,
  slots: readonly number[],
  random: () => number = Math.random,
): BuildAbilities {
  const view = poolsOf(abilities).find((p) => p.id === pool);
  if (!view?.method) return abilities;
  let next = abilities;
  for (const slot of slots) next = setValue(next, chipId(pool, slot), view.method.roll(random));
  return next;
}
