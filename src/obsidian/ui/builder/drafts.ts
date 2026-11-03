/**
 * Drafts (spec 7.9): the work in progress that survives leaving the builder.
 *
 * A draft lives outside the character's files, so the sheet keeps showing the
 * last saved version while a half-finished rebuild waits to be resumed. It
 * records what the character looked like when the edit began, so resuming after
 * the character has changed elsewhere — a sync, another device, an edit on the
 * sheet — can say so rather than quietly overwriting it.
 */

import type { BuildFile } from "../../../core/types";

export interface Draft {
  /** The working copy. */
  build: BuildFile;
  /** The character's build as it was when the edit began. */
  base: BuildFile;
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
export function baseHasMoved(draft: Draft, current: BuildFile | undefined): boolean {
  if (!current) return false;
  return JSON.stringify(draft.base) !== JSON.stringify(current);
}
