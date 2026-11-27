/**
 * Starting equipment as a reconciliation. The build says which options are chosen; each
 * option's `equipment` part (and the picks of its `to: "inventory"` choices) is what it
 * should have put in the inventory. `build.starting` remembers what has been put there,
 * so a change touches only the difference: a pick swapped removes the old item and adds
 * the new, and something the player deleted by hand is not added back.
 *
 * Class equipment is the first character level's only: a choice declared at any other
 * level is ignored, so multiclassing adds none, and a reorder that changes the first
 * level's class moves the equipment exactly as a class change does. Background equipment
 * is build-scoped and always applies.
 */

import type { ContentIndex } from "./content";
import { addStartingEquipment, applyGoldDelta, sweepEntries, type Currency, type EntryOrigin } from "./inventory";
import { collect, type CollectResult } from "./resolver/collect";
import type { PendingChoice } from "./resolver/resolved";
import type { BuildFile, Element, InventoryEntry, InventoryFile, StartingState } from "./types";

const COINS = ["cp", "sp", "ep", "gp", "pp"] as const;

export interface PlannedGroup {
  origin: EntryOrigin;
  items: { id: string; quantity?: number }[];
}

export interface StartingPlan {
  /** By `element|choice`. */
  groups: Record<string, PlannedGroup>;
  /** By element id: what each has put in the purse, the rolled gold included. */
  currency: Record<string, Currency>;
  /** Options with gold to roll or type, for the builder to ask X of. */
  golds: { element: string; dice?: string; multiplier: number }[];
}

export const groupKey = (origin: { element: string; choice: string }): string => `${origin.element}|${origin.choice}`;

const sameOrigin = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** What the chosen options say the inventory should hold. */
export function startingPlan(collected: CollectResult, build: BuildFile): StartingPlan {
  const plan: StartingPlan = { groups: {}, currency: {}, golds: [] };
  const add = (origin: EntryOrigin, id: string, quantity = 1): void => {
    const group = (plan.groups[groupKey(origin)] ??= { origin, items: [] });
    const at = group.items.find((i) => i.id === id);
    if (at) at.quantity = (at.quantity ?? 1) + quantity;
    else group.items.push(quantity === 1 ? { id } : { id, quantity });
  };

  for (const el of collected.elements) {
    const lines = el.element.equipment ?? [];
    const picks = collected.choices.filter(
      (c) => c.definition.to === "inventory" && c.owner.id === el.element.id && sameOrigin(c.origin, el.origin),
    );
    if (!lines.length && !picks.length) continue;
    // A level-scoped one counts only at character level one.
    if (el.scope === "level" && el.levelIndex !== 0) continue;
    const choice = el.occurrence?.split("@")[0] ?? "grant";
    const origin = { element: el.element.id, choice };
    const purse: Currency = {};
    for (const line of lines) {
      if (line.item) add(origin, line.item, line.quantity);
      if (line.currency)
        for (const coin of COINS) if (line.currency[coin]) purse[coin] = (purse[coin] ?? 0) + line.currency[coin]!;
      if (line.gold) {
        const multiplier = line.gold.multiplier ?? 1;
        if (line.gold.dice) {
          plan.golds.push({ element: el.element.id, dice: line.gold.dice, multiplier });
          const x = build.starting?.gold?.[el.element.id]?.x;
          if (x) purse.gp = (purse.gp ?? 0) + x * multiplier;
        } else {
          plan.golds.push({ element: el.element.id, multiplier });
          purse.gp = (purse.gp ?? 0) + multiplier;
        }
      }
    }
    if (Object.keys(purse).length) plan.currency[el.element.id] = purse;

    for (const declared of picks) {
      for (const id of declared.chosen) add({ element: el.element.id, choice: declared.definition.id }, id);
    }
  }
  return plan;
}

export interface StartingResult {
  build: BuildFile;
  inventory: InventoryFile;
  /** Entries taken out of the inventory. */
  removed: InventoryEntry[];
  /** Entries left in because the player is using them; now ordinary items. */
  kept: InventoryEntry[];
  changed: boolean;
}

const quantityOf = (items: { id: string; quantity?: number }[] | undefined, id: string): number =>
  (items ?? []).filter((i) => i.id === id).reduce((n, i) => n + (i.quantity ?? 1), 0);

/**
 * Brings the inventory and the purse in line with the plan, from what was last applied.
 * Returns the very same objects when there is nothing to do.
 */
export function reconcileStarting(
  build: BuildFile,
  inventory: InventoryFile,
  plan: StartingPlan,
  next?: () => string,
): StartingResult {
  const prev: StartingState = build.starting ?? { items: {}, gold: {}, currency: {} };
  let file = inventory;
  const removed: InventoryEntry[] = [];
  const kept: InventoryEntry[] = [];

  const keys = new Set([...Object.keys(prev.items), ...Object.keys(plan.groups)]);
  for (const key of keys) {
    const was = prev.items[key];
    const now = plan.groups[key]?.items;
    const [element, ...rest] = key.split("|");
    const origin: EntryOrigin = plan.groups[key]?.origin ?? { element, choice: rest.join("|") };
    const ids = new Set([...(was ?? []).map((i) => i.id), ...(now ?? []).map((i) => i.id)]);
    for (const id of ids) {
      const before = quantityOf(was, id);
      const after = quantityOf(now, id);
      if (before === after) continue;
      if (before > 0) {
        const swept = sweepEntries(file, (e) => e.id === id && e.origin?.element === origin.element && e.origin.choice === origin.choice);
        file = swept.file;
        removed.push(...swept.removed);
        kept.push(...swept.kept);
      }
      if (after > 0) file = addStartingEquipment(file, origin, [{ id, quantity: after }], next);
    }
  }

  const elements = new Set([...Object.keys(prev.currency), ...Object.keys(plan.currency)]);
  for (const element of elements) {
    const was = prev.currency[element] ?? {};
    const now = plan.currency[element] ?? {};
    for (const coin of COINS) {
      const delta = (now[coin] ?? 0) - (was[coin] ?? 0);
      if (!delta) continue;
      const current = file.currency?.[coin] ?? 0;
      file = coin === "gp" ? applyGoldDelta(file, delta) : { ...file, currency: { ...file.currency, [coin]: Math.max(0, current + delta) } };
    }
  }

  const state: StartingState = {
    items: Object.fromEntries(Object.entries(plan.groups).map(([k, g]) => [k, g.items])),
    gold: prev.gold,
    currency: plan.currency,
  };
  const same = JSON.stringify(state) === JSON.stringify(prev) && file === inventory;
  return {
    build: same ? build : { ...build, starting: state },
    inventory: file,
    removed,
    kept,
    changed: !same,
  };
}

/** The whole thing from a build: collect, plan, reconcile. */
export function applyStarting(
  index: ContentIndex,
  build: BuildFile,
  inventory: InventoryFile | undefined,
  next?: () => string,
): StartingResult {
  const file = inventory ?? { kind: "inventory" as const, schemaVersion: 1, items: [] };
  return reconcileStarting(build, file, startingPlan(collect(index, build, inventory), build), next);
}

/** Whether an element, or something it offers, puts items in the inventory. */
function givesEquipment(index: ContentIndex, el: Element | undefined, depth = 3): boolean {
  if (!el || depth < 0) return false;
  if (el.equipment?.length) return true;
  return (el.choices ?? []).some(
    (c) => c.to === "inventory" || (c.from.ids ?? []).some((id) => givesEquipment(index, index.get(id), depth - 1)),
  );
}

/**
 * The pending choices that are about starting equipment: the ones that put picks in the
 * inventory, and the ones whose options lead to something that does. Only where it applies,
 * so a later class's level one is left out.
 */
export function equipmentChoices(pending: PendingChoice[], index: ContentIndex): PendingChoice[] {
  return pending.filter(
    (c) =>
      (c.scope === "build" || c.levelIndex === 0) &&
      (c.definition.to === "inventory" || c.options.some((o) => givesEquipment(index, index.get(o.id)))),
  );
}

/** The element a starting choice belongs to: the class or background it was reached from. */
export const equipmentRoot = (c: PendingChoice): string => c.origin[0] ?? c.source;
