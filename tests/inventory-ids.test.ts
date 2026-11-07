import { describe, expect, it } from "vitest";
import {
  addInventoryItem,
  appendInventoryEntry,
  newEntryUid,
  isStackable,
  removeInventoryEntry,
} from "../src/core/inventory";
import type { Element, InventoryFile } from "../src/core/types";

const file = (items: InventoryFile["items"] = []): InventoryFile => ({ kind: "inventory", schemaVersion: 1, items });
const counter = (): (() => string) => {
  let n = 0;
  return () => `u${++n}`;
};

describe("newEntryUid", () => {
  it("makes real ids that are unique", () => {
    let f = file([]);
    for (let i = 0; i < 50; i++) f = appendInventoryEntry(f, { id: "a" });
    expect(new Set(f.items.map((e) => e.uid)).size).toBe(50);
    expect(f.items[0].uid).toMatch(/^inv-[a-z0-9]{8}$/);
  });

  it("skips an id the file already has", () => {
    const next = ((ids) => () => ids.shift()!)(["x", "y"]);
    expect(newEntryUid(file([{ uid: "x", id: "a" }]), next)).toBe("y");
  });
});

describe("appendInventoryEntry", () => {
  it("gives the entry its id as it is added", () => {
    const f = appendInventoryEntry(file([]), { item: { id: "c", name: "C" }, quantity: 1 }, counter());
    expect(f.items).toEqual([{ uid: "u1", item: { id: "c", name: "C" }, quantity: 1 }]);
  });
});

describe("addInventoryItem", () => {
  const always = () => true;

  it("adds a second copy as quantity, not a second entry", () => {
    let f = addInventoryItem(file([]), "srd:item:rope", always, counter());
    f = addInventoryItem(f, "srd:item:rope", always, counter());
    expect(f.items).toHaveLength(1);
    expect(f.items[0]).toMatchObject({ id: "srd:item:rope", quantity: 2, uid: "u1" });
  });

  it("keeps stacking on the same entry", () => {
    let f = file([]);
    for (let i = 0; i < 3; i++) f = addInventoryItem(f, "rope", always, counter());
    expect(f.items).toHaveLength(1);
    expect(f.items[0].quantity).toBe(3);
  });

  it.each([
    ["equipped", { equipped: true }],
    ["attuned", { attuned: true }],
    ["held in a bag", { container: "bag" }],
    ["noted", { notes: "Grandfather's" }],
    ["named", { name: "Biter" }],
    ["unknown state", { "x-charges-spent": 2 }],
  ])("does not stack onto an entry that is %s", (_why, state) => {
    const f = addInventoryItem(
      file([{ uid: "a", id: "sword", quantity: 1, ...state } as never]),
      "sword",
      always,
      counter(),
    );
    expect(f.items).toHaveLength(2);
    expect(f.items[0].quantity).toBe(1);
    expect(f.items[1]).toMatchObject({ id: "sword", uid: "u1" });
  });

  it("stacks onto a plain entry past one that has state", () => {
    const f = addInventoryItem(
      file([{ uid: "a", id: "sword", equipped: true }, { uid: "b", id: "sword", quantity: 2 }]),
      "sword",
      always,
      counter(),
    );
    expect(f.items.map((e) => e.quantity)).toEqual([undefined, 3]);
  });

  it("never stacks an item that fails the stackable test", () => {
    let f = addInventoryItem(file([]), "wand", () => false, counter());
    f = addInventoryItem(f, "wand", () => false, counter());
    expect(f.items.map((e) => e.id)).toEqual(["wand", "wand"]);
    expect(new Set(f.items.map((e) => e.uid)).size).toBe(2);
  });
});

describe("isStackable", () => {
  const el = (extra: object): Element => ({ id: "x", kind: "item", name: "X", source: "s", ...extra });

  it("allows plain gear", () => {
    expect(isStackable(el({}))).toBe(true);
    expect(isStackable(el({ resources: [] }))).toBe(true);
  });

  it("refuses an item with charges, resources or attunement, or one it cannot find", () => {
    expect(isStackable(el({ charges: { id: "c", name: "Charges", max: 7, recharge: [{ on: "dawn", amount: "all" }] } }))).toBe(false);
    expect(isStackable(el({ resources: [{ id: "c", name: "Uses", max: 1, recharge: [{ on: "dawn", amount: "all" }] }] }))).toBe(false);
    expect(isStackable(el({ attunement: true }))).toBe(false);
    expect(isStackable(undefined)).toBe(false);
  });
});

describe("removeInventoryEntry", () => {
  it("takes what a removed container held out into the open", () => {
    const f = file([
      { uid: "bag", id: "srd:item:backpack" },
      { uid: "r", id: "srd:item:rope", container: "bag" },
    ]);
    const out = removeInventoryEntry(f, 0);
    expect(out.items).toEqual([{ uid: "r", id: "srd:item:rope" }]);
  });
});
