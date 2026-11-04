/**
 * The Progression list as data: one ordered list, active levels above a PLANNED
 * divider and the queue below it. Kept apart from any component so the rows, the
 * keys and what a drop means are tested without a view.
 */

import {
  activeRefs,
  classLevels,
  normalisedQueue,
  progressionKey,
  type ProgressionRef,
} from "../../../core/resolver/levels";
import type { BuildFile } from "../../../core/types";

/** The divider's key. It has no class, so it conflicts with nothing. */
export const DIVIDER_KEY = "·planned·";

export interface ProgressionRow {
  key: string;
  kind: "level" | "planned" | "divider";
  class?: string;
  classLevel?: number;
  /** Into `build.levels`, for an active level. */
  index?: number;
  /** In the build file's queue, rather than a look-ahead the build has never heard of. */
  stored?: boolean;
}

/**
 * Every row of the list, top to bottom.
 *
 * Below the divider is the build's own queue, then — so a queue need not have been
 * written out before it can be dragged — the levels each class has ahead of it that
 * the queue does not yet mention, `perClass` of them, up to level 20. Dragging one writes it into
 * the queue, which is the first time the build file hears of it.
 */
export function progressionRows(
  build: BuildFile,
  perClass: number,
): ProgressionRow[] {
  const rows: ProgressionRow[] = activeRefs(build).map((ref, i) => ({
    key: progressionKey(ref),
    kind: "level",
    class: ref.class,
    classLevel: ref.classLevel,
    index: i,
  }));
  rows.push({ key: DIVIDER_KEY, kind: "divider" });

  const queue = normalisedQueue(build);
  for (const entry of queue)
    rows.push({
      key: progressionKey(entry),
      kind: "planned",
      class: entry.class,
      classLevel: entry.classLevel,
      stored: true,
    });

  // Every class level is a level, whether or not the class has anything new to say at
  // it, so the look-ahead is contiguous: the queue must be able to hand over "the next
  // level" without skipping one.
  const reached = new Map(classLevels(build));
  for (const entry of queue) reached.set(entry.class, Math.max(reached.get(entry.class) ?? 0, entry.classLevel));
  for (const classId of classLevels(build).keys()) {
    for (let level = (reached.get(classId) ?? 0) + 1, found = 0; level <= 20 && found < perClass; level++, found++)
      rows.push({ key: progressionKey({ class: classId, classLevel: level }), kind: "planned", class: classId, classLevel: level });
  }
  return rows;
}

/**
 * What a drop means for the build: the order of every level, and how many of
 * them sit above the divider.
 */
export function orderFromKeys(
  keys: string[],
  rows: ProgressionRow[],
): { order: ProgressionRef[]; active: number } {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const order: ProgressionRef[] = [];
  let active = 0;
  for (const key of keys) {
    if (key === DIVIDER_KEY) {
      active = order.length;
      continue;
    }
    const row = byKey.get(key);
    if (row?.class && row.classLevel !== undefined) order.push({ class: row.class, classLevel: row.classLevel });
  }
  return { order, active };
}

/** Levels above the divider in an order of keys: what the divider's readout counts. */
export function activeCount(keys: string[]): number {
  const at = keys.indexOf(DIVIDER_KEY);
  return at < 0 ? keys.length : at;
}
