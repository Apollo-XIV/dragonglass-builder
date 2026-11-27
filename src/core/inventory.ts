/**
 * Inventory entries are instances: an entry has its own `uid`, so a container can
 * point at a particular bag rather than at "a bag". Two copies of one item are one
 * entry with a quantity, so an entry is only ever split when it is put somewhere else.
 *
 * An entry gets its id the moment it is added, so what the builder holds and what
 * is saved always agree. Nothing gives an id to an entry that lacks one.
 */

import { diceRange } from "./dice";
import type { Element, EquipmentEntry, InventoryEntry, InventoryFile } from "./types";

export type UidSource = () => string;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Eight random base-36 characters: short enough to read in a hand-edited file. */
export function randomUid(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `inv-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

/** A uid no entry in the file has. */
export function newEntryUid(file: InventoryFile, next: UidSource = randomUid): string {
  const taken = new Set(file.items.map((e) => e.uid));
  let uid = next();
  while (taken.has(uid)) uid = next();
  return uid;
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
  return { ...file, items: [...file.items, { uid: newEntryUid(file, next), id }] };
}

/** Appends an entry, giving it its id now. */
export function appendInventoryEntry(
  file: InventoryFile,
  entry: Omit<InventoryEntry, "uid">,
  next: UidSource = randomUid,
): InventoryFile {
  return { ...file, items: [...file.items, { ...entry, uid: newEntryUid(file, next) }] };
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


// ---------------------------------------------------------------------------
// Starting equipment
// ---------------------------------------------------------------------------

export type EntryOrigin = NonNullable<InventoryEntry["origin"]>;

/** What an origin has to say to match: the element, or the element and one of its choices. */
export type OriginMatch = { element: string; choice?: string };

const matches = (origin: InventoryEntry["origin"], match: OriginMatch): boolean =>
  !!origin && origin.element === match.element && (match.choice === undefined || origin.choice === match.choice);

/** One thing starting equipment adds. `within` is the index of the line in the same list that holds it. */
export interface StartingItem {
  id: string;
  quantity?: number;
  within?: number;
}

/**
 * Appends starting equipment, each entry tagged with `origin`. These never merge into a
 * plain entry, and a plain add never merges into one of these: the tag is an extra key,
 * which is what makes an entry non-plain.
 */
export function addStartingEquipment(
  file: InventoryFile,
  origin: EntryOrigin,
  items: StartingItem[],
  next: UidSource = randomUid,
): InventoryFile {
  const uids: string[] = [];
  let out = file;
  items.forEach((line, i) => {
    const uid = newEntryUid(out, next);
    uids[i] = uid;
    const entry: InventoryEntry = { uid, id: line.id, origin: { ...origin } };
    if (line.quantity !== undefined && line.quantity !== 1) entry.quantity = line.quantity;
    const holder = line.within === undefined ? undefined : uids[line.within];
    if (holder) entry.container = holder;
    out = { ...out, items: [...out.items, entry] };
  });
  return out;
}

/** The fixed items of an `equipment` part, in order. Currency and gold are not entries. */
export function startingItems(lines: EquipmentEntry[] | undefined): StartingItem[] {
  return (lines ?? []).flatMap((l) => (l.item ? [{ id: l.item, quantity: l.quantity }] : []));
}

export interface OriginSweep {
  file: InventoryFile;
  /** Entries taken out. */
  removed: InventoryEntry[];
  /** Entries left in, now untagged. */
  kept: InventoryEntry[];
}

/**
 * Takes out what an origin added, except what the player is using: equipped, attuned, or
 * put by the player in a container. A container the same sweep is removing is the kit's
 * own packing and protects nothing. Notes and a changed quantity protect nothing either.
 * A kept entry loses its tag and is an ordinary item from here on. What a removed
 * container held that is kept comes out into the open.
 *
 * Calling this and not using `file` is the preview the change's diff is drawn from.
 */
export function sweepOrigin(file: InventoryFile, match: OriginMatch): OriginSweep {
  const swept = new Set(file.items.filter((e) => matches(e.origin, match)).map((e) => e.uid));
  const inUse = (e: InventoryEntry): boolean => !!e.equipped || !!e.attuned || (!!e.container && !swept.has(e.container));
  const removed: InventoryEntry[] = [];
  const kept: InventoryEntry[] = [];
  const gone = new Set<string>();
  for (const e of file.items) {
    if (!swept.has(e.uid)) continue;
    if (inUse(e)) kept.push(e);
    else {
      removed.push(e);
      gone.add(e.uid);
    }
  }
  const keptIds = new Set(kept.map((e) => e.uid));
  const items = file.items
    .filter((e) => !gone.has(e.uid))
    .map((e) => {
      let next = e;
      if (keptIds.has(e.uid)) {
        const { origin: _origin, ...rest } = next;
        next = rest;
      }
      if (next.container && gone.has(next.container)) {
        const { container: _container, ...rest } = next;
        next = rest;
      }
      return next;
    });
  return { file: { ...file, items }, removed, kept: kept.map(({ origin: _o, ...e }) => e) };
}

// -- gold ---------------------------------------------------------------------

export type Currency = NonNullable<InventoryFile["currency"]>;

/** X times the multiplier, in gold pieces. */
export const goldAmount = (x: number, multiplier = 1): number => x * multiplier;

/** Whether a typed X is one the dice could not roll. Accepted either way; this is the warning. */
export function goldOutOfRange(dice: string, x: number): boolean {
  const { min, max } = diceRange(dice);
  return x < min || x > max;
}

/** Applies a change in gold pieces to the currency, never below zero. */
export function applyGoldDelta(file: InventoryFile, deltaGp: number): InventoryFile {
  const gp = Math.max(0, (file.currency?.gp ?? 0) + deltaGp);
  return { ...file, currency: { ...file.currency, gp } };
}
