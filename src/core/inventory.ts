/**
 * Inventory entries are instances: an entry has its own `uid`, so a container can
 * point at a particular bag rather than at "a bag". Two copies of one item are one
 * entry with a quantity, so an entry is only ever split when it is put somewhere else.
 *
 * Ids are given when the inventory is written, never when it is read, so opening a
 * character never rewrites its files.
 */

import type { InventoryEntry, InventoryFile } from "./types";

export type UidSource = () => string;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Eight random base-36 characters: short enough to read in a hand-edited file. */
export function randomUid(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `inv-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

/**
 * Gives every entry without a `uid` one (and replaces a repeated one, which a
 * hand-copied entry produces), leaving the rest of the file as it was. Returns the
 * same object when nothing needed an id, so callers can tell nothing changed.
 */
export function withInventoryIds(file: InventoryFile, next: UidSource = randomUid): InventoryFile {
  const taken = new Set<string>();
  let changed = false;
  const fresh = (): string => {
    let uid = next();
    while (taken.has(uid)) uid = next();
    return uid;
  };
  const items = file.items.map((entry) => {
    if (entry.uid && !taken.has(entry.uid)) {
      taken.add(entry.uid);
      return entry;
    }
    changed = true;
    const uid = fresh();
    taken.add(uid);
    return { ...entry, uid };
  });
  return changed ? { ...file, items } : file;
}

export function hasMissingIds(file: InventoryFile | undefined): boolean {
  return !!file && withInventoryIds(file, () => "x") !== file;
}

/**
 * Adds one copy of an item. A plain entry for the same item in the same place takes
 * the copy as quantity; anything else (it is in a bag, or is a custom item) gets an
 * entry of its own.
 */
export function addInventoryItem(
  file: InventoryFile,
  id: string,
  next: UidSource = randomUid,
): InventoryFile {
  const at = file.items.findIndex((e) => e.id === id && !e.container);
  if (at >= 0) {
    const items = file.items.map((e, i) => (i === at ? { ...e, quantity: (e.quantity ?? 1) + 1 } : e));
    return { ...file, items };
  }
  return withInventoryIds({ ...file, items: [...file.items, { id }] }, next);
}

/** Appends an entry, giving it an id. */
export function appendInventoryEntry(
  file: InventoryFile,
  entry: InventoryEntry,
  next: UidSource = randomUid,
): InventoryFile {
  return withInventoryIds({ ...file, items: [...file.items, entry] }, next);
}

/**
 * Removes the entry at `index`. What it held comes out of the container and into
 * the open, rather than pointing at an entry that is gone.
 */
export function removeInventoryEntry(file: InventoryFile, index: number): InventoryFile {
  const gone = file.items[index];
  const items = file.items
    .filter((_, i) => i !== index)
    .map((e) => {
      if (!gone?.uid || e.container !== gone.uid) return e;
      const { container: _container, ...rest } = e;
      return rest;
    });
  return { ...file, items };
}
