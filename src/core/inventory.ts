/**
 * Inventory entries are instances: an entry has its own `uid`, so a container can
 * point at a particular bag rather than at "a bag". Two copies of one item are one
 * entry with a quantity, so an entry is only ever split when it is put somewhere else.
 *
 * Ids are given when the inventory is written, never when it is read, so opening a
 * character never rewrites its files.
 */

import type { Element, InventoryEntry, InventoryFile } from "./types";

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

/** Entry fields that are about the item rather than about this particular copy. */
const SHARED_FIELDS = new Set(["uid", "id", "quantity"]);

/**
 * Whether copies of an item are interchangeable: it has no charges to spend and
 * nothing to attune to. An item that cannot be found is not assumed to be.
 */
export function isStackable(item: Element | undefined): boolean {
  if (!item) return false;
  const resources = item.resources;
  return !item.attunement && !item.charges && !(Array.isArray(resources) && resources.length > 0);
}

/** An entry that is nothing but "n of this item": equipped, attuned, named, noted or held, it is not. */
function isPlain(entry: InventoryEntry, id: string): boolean {
  return entry.id === id && Object.keys(entry).every((k) => SHARED_FIELDS.has(k));
}

/**
 * Adds one copy of an item. A plain entry for the same item takes the copy as
 * quantity, if copies of the item are interchangeable. Anything with a state of
 * its own (equipped, attuned, in a bag, with notes or charges) is left as it is
 * and the copy gets an entry of its own.
 */
export function addInventoryItem(
  file: InventoryFile,
  id: string,
  stackable: (id: string) => boolean,
  next: UidSource = randomUid,
): InventoryFile {
  const at = stackable(id) ? file.items.findIndex((e) => isPlain(e, id)) : -1;
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

/**
 * Gives entries in `working` the ids `saved` has, where the entry at the same
 * position is the same item. For an inventory edited in a session after its ids
 * were written: the working copy may have been given ids of its own meanwhile, and
 * saving it should keep the ones that were exported. Containers follow the change.
 */
export function adoptSavedIds(working: InventoryFile, saved: InventoryFile): InventoryFile {
  const renamed = new Map<string, string>();
  const items = working.items.map((entry, i) => {
    const was = saved.items[i];
    const same = was?.uid && was.uid !== entry.uid && was.id === entry.id && (was.item?.id ?? "") === (entry.item?.id ?? "");
    if (!same) return entry;
    if (entry.uid) renamed.set(entry.uid, was.uid!);
    return { ...entry, uid: was.uid };
  });
  if (!renamed.size) return working;
  return {
    ...working,
    items: items.map((e) => (e.container && renamed.has(e.container) ? { ...e, container: renamed.get(e.container) } : e)),
  };
}
