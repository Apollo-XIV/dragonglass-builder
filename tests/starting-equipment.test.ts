import { describe, expect, it } from "vitest";
import {
  addInventoryItem,
  addStartingEquipment,
  containerChoices,
  setContainer,
  spendOneInventoryItem,
  applyGoldDelta,
  goldAmount,
  goldOutOfRange,
  startingItems,
  sweepOrigin,
} from "../src/core/inventory";
import { diceRange } from "../src/core/dice";
import { validateElement } from "../src/core/content/validate";
import { resolve } from "../src/core/resolver/resolve";
import type { Element, InventoryFile } from "../src/core/types";
import { TEST_BOOK, build, testIndex } from "./helpers";

const counter = (): (() => string) => {
  let n = 0;
  return () => `u${++n}`;
};
const file = (items: InventoryFile["items"] = [], gp?: number): InventoryFile => ({
  kind: "inventory",
  schemaVersion: 1,
  items,
  ...(gp === undefined ? {} : { currency: { gp } }),
});
const origin = { element: "test:class:paladin", choice: "test:paladin:equipment" };

describe("starting equipment entries", () => {
  it("appends tagged entries and never merges into a plain one", () => {
    const next = counter();
    let f = addInventoryItem(file(), "i:sword", () => true, next);
    f = addStartingEquipment(f, origin, [{ id: "i:sword" }], next);
    expect(f.items).toHaveLength(2);
    expect(f.items[1].origin).toEqual(origin);
  });

  it("a plain add never merges into a tagged entry", () => {
    const next = counter();
    const f = addStartingEquipment(file(), origin, [{ id: "i:sword" }], next);
    expect(addInventoryItem(f, "i:sword", () => true, next).items).toHaveLength(2);
  });

  it("packs a kit's contents inside it", () => {
    const f = addStartingEquipment(file(), origin, [{ id: "i:pack" }, { id: "i:rope", within: 0 }], counter());
    expect(f.items[1].container).toBe(f.items[0].uid);
  });

  it("lists the fixed items of an equipment part", () => {
    expect(startingItems([{ item: "a", quantity: 2 }, { currency: { gp: 5 } }, { gold: { multiplier: 10 } }])).toEqual([
      { id: "a", quantity: 2 },
    ]);
  });
});

describe("sweepOrigin", () => {
  const start = (): InventoryFile =>
    addStartingEquipment(
      file(),
      origin,
      [{ id: "i:mail" }, { id: "i:pack" }, { id: "i:rope", within: 1 }, { id: "i:torch", within: 1 }],
      counter(),
    );

  it("removes an unused tagged entry, a pack and its unused contents included", () => {
    const { file: out, removed, kept } = sweepOrigin(start(), { element: origin.element });
    expect(out.items).toEqual([]);
    expect(removed).toHaveLength(4);
    expect(kept).toEqual([]);
  });

  it("keeps what is equipped or attuned, untagged", () => {
    const f = start();
    f.items[0] = { ...f.items[0], equipped: true };
    f.items[1] = { ...f.items[1], attuned: true };
    const { file: out, kept } = sweepOrigin(f, origin);
    expect(out.items.map((e) => e.id)).toEqual(["i:mail", "i:pack"]);
    expect(out.items.every((e) => e.origin === undefined)).toBe(true);
    expect(kept).toHaveLength(2);
  });

  it("keeps an entry the player put in their own bag", () => {
    const f = start();
    f.items.push({ uid: "mine", id: "i:bag" });
    f.items[0] = { ...f.items[0], container: "mine" };
    const { file: out } = sweepOrigin(f, origin);
    expect(out.items.map((e) => e.uid)).toEqual([f.items[0].uid, "mine"]);
    expect(out.items[0]).toEqual({ uid: f.items[0].uid, id: "i:mail", container: "mine" });
  });

  it("does not protect an entry for its notes or quantity", () => {
    const f = start();
    f.items[0] = { ...f.items[0], notes: "lucky", quantity: 3 };
    expect(sweepOrigin(f, origin).file.items).toEqual([]);
  });

  it("brings what the player put in a removed pack out into the open", () => {
    const f = start();
    f.items.push({ uid: "gem", id: "i:gem", container: f.items[1].uid });
    const { file: out } = sweepOrigin(f, origin);
    expect(out.items).toEqual([{ uid: "gem", id: "i:gem" }]);
  });

  it("leaves untagged entries and other origins alone", () => {
    const other = { element: "test:background:acolyte", choice: "x" };
    const f = addStartingEquipment(file([{ uid: "p", id: "i:plain" }]), other, [{ id: "i:book" }], counter());
    const { file: out } = sweepOrigin(f, origin);
    expect(out.items).toEqual(f.items);
  });

  it("a kept entry is not swept by a later change", () => {
    const f = start();
    f.items[0] = { ...f.items[0], equipped: true };
    const again = sweepOrigin(sweepOrigin(f, origin).file, origin);
    expect(again.removed).toEqual([]);
    expect(again.file.items.map((e) => e.id)).toEqual(["i:mail"]);
  });

  it("matching by choice leaves the element's other choices", () => {
    const f = addStartingEquipment(file(), { element: origin.element, choice: "other" }, [{ id: "i:x" }], counter());
    expect(sweepOrigin(f, origin).file.items).toHaveLength(1);
  });
});

describe("starting gold", () => {
  it("is X times the multiplier", () => expect(goldAmount(12, 10)).toBe(120));

  it("applies the difference, so changing X, switching options and dropping the choice all balance", () => {
    let f = applyGoldDelta(file([], 5), goldAmount(12, 10));
    expect(f.currency?.gp).toBe(125);
    f = applyGoldDelta(f, goldAmount(15, 10) - goldAmount(12, 10));
    expect(f.currency?.gp).toBe(155);
    f = applyGoldDelta(f, -goldAmount(15, 10));
    expect(f.currency?.gp).toBe(5);
  });

  it("clamps at zero and keeps other coins", () => {
    const f: InventoryFile = { ...file(), currency: { gp: 10, sp: 4 } };
    expect(applyGoldDelta(f, -50).currency).toEqual({ gp: 0, sp: 4 });
  });

  it("warns about an X the dice cannot roll, but only warns", () => {
    expect(diceRange("5d4")).toEqual({ min: 5, max: 20 });
    expect(goldOutOfRange("5d4", 12)).toBe(false);
    expect(goldOutOfRange("5d4", 4)).toBe(true);
    expect(goldOutOfRange("5d4", 21)).toBe(true);
    expect(applyGoldDelta(file(), goldAmount(21, 10)).currency?.gp).toBe(210);
  });
});

describe("the equipment part", () => {
  const base = { id: "t:x", kind: "option", name: "X", source: "test" };
  const codes = (el: object) => validateElement({ ...base, ...el }).diagnostics.map((d) => d.path ?? d.code);

  it("accepts items, currency and gold", () => {
    expect(
      codes({ equipment: [{ item: "a" }, { currency: { gp: 15 } }, { gold: { dice: "5d4", multiplier: 10 } }] }),
    ).toEqual([]);
  });

  it("rejects bad dice, an empty entry and two things at once", () => {
    expect(codes({ equipment: [{ gold: { dice: "five", multiplier: 10 } }] })).toContain("equipment[0].gold.dice");
    expect(codes({ equipment: [{}] })).toContain("equipment[0]");
    expect(codes({ equipment: [{ item: "a", currency: { gp: 1 } }] })).toContain("equipment[0]");
  });

  it("warns about `to` on a choice that is not of items", () => {
    expect(
      codes({ choices: [{ id: "c", count: 1, to: "inventory", from: { kind: "spell" } }] }),
    ).toEqual(["choices[0].to"]);
  });

  it("reports an item id that resolves to nothing", () => {
    const el = { ...base, id: "test:opt", equipment: [{ item: "test:item:missing" }] } as Element;
    const index = testIndex([TEST_BOOK, el]);
    expect(index.diagnostics.some((d) => d.code === "unresolved-reference" && d.path === "equipment[0].item")).toBe(true);
  });
});

describe("linked custom items", () => {
  const longsword: Element = {
    id: "test:item:longsword",
    kind: "item",
    name: "Longsword",
    source: "test",
    itemType: "weapon",
    weight: 3,
    weapon: { damage: "1d8", damageType: "slashing" },
  } as Element;
  const content = testIndex([TEST_BOOK, longsword]);
  const run = (item: object) =>
    resolve({
      content,
      build: build(),
      inventory: { kind: "inventory", schemaVersion: 1, items: [{ uid: "a", item }] },
    });

  it("resolves from the base with the overrides on top", () => {
    const r = run({ base: "test:item:longsword", id: "custom:plus-one", name: "+1 Longsword", weight: 4 });
    const el = r.inventory[0].element as Element & { weight: number; weapon: unknown };
    expect(el.name).toBe("+1 Longsword");
    expect(el.weight).toBe(4);
    expect(el.weapon).toEqual({ damage: "1d8", damageType: "slashing" });
    expect(r.diagnostics.filter((d) => d.code === "unresolved-reference")).toEqual([]);
  });

  it("resolves from the overrides alone when the base is gone, and says so", () => {
    const r = run({ base: "test:item:gone", name: "Sword" });
    expect(r.inventory[0].element.name).toBe("Sword");
    expect(r.diagnostics.some((d) => d.code === "unresolved-reference" && d.subject === "test:item:gone")).toBe(true);
  });

  it("a detached copy ignores the source entirely", () => {
    const r = run({ id: "custom:copy", name: "Copy", weapon: { damage: "1d10" } });
    expect(r.diagnostics.filter((d) => d.code === "unresolved-reference")).toEqual([]);
    expect((r.inventory[0].element as Element & { weapon: unknown }).weapon).toEqual({ damage: "1d10" });
  });
});

describe("moving and spending entries", () => {
  const bag = (items: InventoryFile["items"]): InventoryFile => file(items);

  it("offers containers other than the entry and what it holds", () => {
    const f = bag([
      { uid: "pack", id: "i:pack" },
      { uid: "pouch", id: "i:pouch", container: "pack" },
      { uid: "rope", id: "i:rope" },
    ]);
    const all = () => true;
    expect(containerChoices(f, 2, all).map((e) => e.uid)).toEqual(["pack", "pouch"]);
    expect(containerChoices(f, 0, all).map((e) => e.uid)).toEqual(["rope"]);
  });

  it("puts an entry in a bag and takes it out, and refuses a cycle", () => {
    let f = bag([{ uid: "pack", id: "i:pack" }, { uid: "pouch", id: "i:pouch", container: "pack" }]);
    expect(setContainer(f, 0, "pouch")).toBe(f);
    expect(setContainer(f, 0, "pack")).toBe(f);
    f = setContainer(f, 1, undefined);
    expect(f.items[1]).toEqual({ uid: "pouch", id: "i:pouch" });
    expect(setContainer(f, 1, "pack").items[1].container).toBe("pack");
  });

  it("spends one, and removes the entry at zero", () => {
    let f = bag([{ uid: "p", id: "i:potion", quantity: 2 }]);
    f = spendOneInventoryItem(f, 0);
    expect(f.items[0].quantity).toBe(1);
    expect(spendOneInventoryItem(f, 0).items).toEqual([]);
  });
});
