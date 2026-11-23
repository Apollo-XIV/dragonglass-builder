/**
 * Drafts (spec 7.9): the work in progress that survives leaving the builder.
 *
 * A draft lives outside the character's files, so the sheet keeps showing the
 * last saved version while a half-finished rebuild waits to be resumed. It
 * records what the character looked like when the edit began, so resuming after
 * the character has changed elsewhere — a sync, another device, an edit on the
 * sheet — can say so rather than quietly overwriting it.
 */

import type { BuildFile, InventoryFile, SpellsFile } from "../../../core/types";

export interface Draft {
  /** The working copy. */
  build: BuildFile;
  /** The working spell list and inventory. Absent in drafts written before the builder held them. */
  spells?: SpellsFile;
  inventory?: InventoryFile;
  /** The character's build as it was when the edit began. */
  base: BuildFile;
  /** The spell list and inventory as they were when the edit began. */
  baseSpells?: SpellsFile;
  baseInventory?: InventoryFile;
  /** ISO timestamp of the last keystroke. */
  saved: string;
}

export interface DraftStore {
  get(folder: string): Draft | undefined;
  set(folder: string, draft: Draft): void;
  clear(folder: string): void;
}

export const NO_DRAFTS: DraftStore = { get: () => undefined, set: () => {}, clear: () => {} };

/**
 * Has the character moved on since this draft started? Compared by value rather
 * than by a timestamp: a write that changed nothing is not a conflict, and the
 * files are small enough that this is cheaper than keeping a version counter
 * honest across devices.
 */
export function baseHasMoved(draft: Draft, current: DraftFiles): boolean {
  const moved = (from: unknown, to: unknown): boolean => from !== undefined && to !== undefined && JSON.stringify(from) !== JSON.stringify(to);
  return moved(draft.base, current.build) || moved(draft.baseSpells, current.spells) || moved(draft.baseInventory, current.inventory);
}

/** The files a builder session holds. */
export interface DraftFiles {
  build?: BuildFile;
  spells?: SpellsFile;
  inventory?: InventoryFile;
}
