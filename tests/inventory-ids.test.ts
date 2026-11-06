import { describe, expect, it } from "vitest";
import {
  addInventoryItem,
  hasMissingIds,
  removeInventoryEntry,
  withInventoryIds,
} from "../src/core/inventory";
import type { InventoryFile } from "../src/core/types";

const file = (items: InventoryFile["items"]): InventoryFile => ({ kind: "inventory", schemaVersion: 1, items });
const counter = (): (() => string) => {
  let n = 0;
  return () => `u${++n}`;
};

describe("withInventoryIds", () => {
  it("gives ids to entries without one and keeps existing ones", () => {
    const out = withInventoryIds(file([{ id: "a" }, { uid: "keep", id: "b" }, { id: "c" }]), counter());
    expect(out.items.map((e) => e.uid)).toEqual(["u1", "keep", "u2"]);
  });

  it("returns the same object when nothing needs an id", () => {
    const f = file([{ uid: "x", id: "a" }]);
    expect(withInventoryIds(f, counter())).toBe(f);
  });

  it("replaces a repeated uid and skips ids already taken", () => {
    const next = ((ids) => () => ids.shift()!)(["x", "y"]);
    const out = withInventoryIds(file([{ uid: "x", id: "a" }, { uid: "x", id: "b" }]), next);
    expect(out.items.map((e) => e.uid)).toEqual(["x", "y"]);
  });

  it("generates real ids that are unique", () => {
    const out = withInventoryIds(file(Array.from({ length: 50 }, () => ({ id: "a" }))));
    expect(new Set(out.items.map((e) => e.uid)).size).toBe(50);
    expect(out.items[0].uid).toMatch(/^inv-[a-z0-9]{8}$/);
  });

  it("detects missing ids without changing anything", () => {
    expect(hasMissingIds(file([{ id: "a" }]))).toBe(true);
    expect(hasMissingIds(file([{ id: "a", uid: "z" }]))).toBe(false);
    expect(hasMissingIds(undefined)).toBe(false);
  });
});

describe("addInventoryItem", () => {
  it("adds a second copy as quantity, not a second entry", () => {
    let f = addInventoryItem(file([]), "srd:item:rope", counter());
    f = addInventoryItem(f, "srd:item:rope", counter());
    expect(f.items).toHaveLength(1);
    expect(f.items[0]).toMatchObject({ id: "srd:item:rope", quantity: 2, uid: "u1" });
  });

  it("does not merge into a copy that is inside a bag", () => {
    const f = addInventoryItem(file([{ uid: "bag", id: "b" }, { uid: "r", id: "rope", container: "bag" }]), "rope", counter());
    expect(f.items).toHaveLength(3);
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
