/**
 * Starting equipment over the real slice: the Acolyte's fixed list, and the Paladin's
 * nested kit and gold alternative, reconciled into an inventory as the build changes.
 */

import { describe, expect, it } from "vitest";
import { applyStarting } from "../../src/core/starting-equipment";
import { collect } from "../../src/core/resolver/collect";
import { startingPlan } from "../../src/core/starting-equipment";
import type { BuildFile, Element, InventoryFile } from "../../src/core/types";
import { TEST_BOOK, build as plainBuild, srdIndex, testIndex } from "../helpers";

const index = srdIndex();
let n = 0;
const next = () => `u${++n}`;

const PAL = "srd:class:paladin";
const EQ = "srd:paladin:starting-equipment";

function paladin(choices: Record<string, string[]> = {}, starting?: BuildFile["starting"]): BuildFile {
  return {
    kind: "build",
    schemaVersion: 1,
    level: 1,
    species: "srd:species:dwarf",
    background: "srd:background:acolyte",
    abilities: { method: "manual", base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } },
    levels: [{ class: PAL, hp: "max", choices: { [EQ]: [], ...choices } }],
    ...(starting ? { starting } : {}),
  };
}

const empty = (): InventoryFile => ({ kind: "inventory", schemaVersion: 1, items: [] });
/** Applies one build to the inventory, carrying the applied state forward as the store does. */
function apply(build: BuildFile, inventory: InventoryFile) {
  const r = applyStarting(index, build, inventory, next);
  return { ...r, build: r.build };
}
const ids = (f: InventoryFile): string[] => f.items.map((e) => e.id!).sort();

describe("the Acolyte's fixed list", () => {
  it("adds its items, its pouch and 15 gp, tagged with where they came from", () => {
    const { inventory, build } = apply(paladin(), empty());
    expect(ids(inventory)).toEqual(
      ["srd:item:clothes-common", "srd:item:holy-symbol", "srd:item:incense-stick", "srd:item:pouch", "srd:item:vestments"].sort(),
    );
    expect(inventory.items.find((e) => e.id === "srd:item:incense-stick")?.quantity).toBe(5);
    expect(inventory.items.every((e) => e.origin?.element === "srd:background:acolyte")).toBe(true);
    expect(inventory.currency?.gp).toBe(15);
    expect(build.starting?.currency["srd:background:acolyte"]).toEqual({ gp: 15 });
  });

  it("adds the prayer book or wheel the player picks, and swaps it for the other", () => {
    let r = apply(paladin(), empty());
    const withBook = { ...r.build, choices: { ...r.build.choices, "srd:background:acolyte:prayer": ["srd:item:prayer-book"] } };
    r = apply(withBook, r.inventory);
    expect(ids(r.inventory)).toContain("srd:item:prayer-book");
    r = apply({ ...r.build, choices: { ...r.build.choices, "srd:background:acolyte:prayer": ["srd:item:prayer-wheel"] } }, r.inventory);
    expect(ids(r.inventory)).toContain("srd:item:prayer-wheel");
    expect(ids(r.inventory)).not.toContain("srd:item:prayer-book");
  });

  it("changes nothing when nothing has changed, and does not add back what the player removed", () => {
    const first = apply(paladin(), empty());
    const again = apply(first.build, first.inventory);
    expect(again.changed).toBe(false);
    expect(again.inventory).toBe(first.inventory);
    const without = { ...first.inventory, items: first.inventory.items.filter((e) => e.id !== "srd:item:vestments") };
    const third = apply(first.build, without);
    expect(ids(third.inventory)).not.toContain("srd:item:vestments");
  });

  it("is gone with the background, apart from what is in use", () => {
    const first = apply(paladin(), empty());
    const worn = { ...first.inventory, items: first.inventory.items.map((e) => (e.id === "srd:item:vestments" ? { ...e, equipped: true } : e)) };
    const r = apply({ ...first.build, background: undefined }, worn);
    expect(r.inventory.items).toEqual([{ uid: expect.any(String), id: "srd:item:vestments", equipped: true }]);
    expect(r.kept).toHaveLength(1);
    expect(r.removed.length).toBeGreaterThan(3);
    expect(r.inventory.currency?.gp).toBe(0);
  });
});

describe("the Paladin's kit", () => {
  const kit = (extra: Record<string, string[]> = {}) =>
    paladin({
      [EQ]: ["srd:paladin:kit"],
      "srd:paladin:kit:weapons": ["srd:paladin:kit:martial-and-shield"],
      "srd:paladin:kit:martial": ["srd:item:longsword"],
      "srd:paladin:kit:melee": ["srd:paladin:kit:javelins"],
      "srd:paladin:kit:pack": ["srd:item:priests-pack"],
      ...extra,
    });

  it("gives the fixed gear and each nested pick", () => {
    const { inventory } = apply(kit(), empty());
    const kitItems = inventory.items.filter((e) => e.origin?.element.startsWith("srd:paladin"));
    expect(kitItems.map((e) => e.id).sort()).toEqual(
      ["srd:item:chain-mail", "srd:item:holy-symbol", "srd:item:javelin", "srd:item:longsword", "srd:item:priests-pack", "srd:item:shield"].sort(),
    );
    expect(kitItems.find((e) => e.id === "srd:item:javelin")?.quantity).toBe(5);
  });

  it("swaps a pick: the old weapon goes, the new one comes", () => {
    const first = apply(kit(), empty());
    const r = apply({ ...first.build, levels: [{ ...first.build.levels[0], choices: { ...first.build.levels[0].choices, "srd:paladin:kit:martial": ["srd:item:battleaxe"] } }] }, first.inventory);
    expect(ids(r.inventory)).toContain("srd:item:battleaxe");
    expect(ids(r.inventory)).not.toContain("srd:item:longsword");
    expect(r.removed.map((e) => e.id)).toEqual(["srd:item:longsword"]);
  });

  it("keeps a swapped-out weapon the player has equipped, as an ordinary item", () => {
    const first = apply(kit(), empty());
    const held = { ...first.inventory, items: first.inventory.items.map((e) => (e.id === "srd:item:longsword" ? { ...e, equipped: true } : e)) };
    const r = apply({ ...first.build, levels: [{ ...first.build.levels[0], choices: { ...first.build.levels[0].choices, "srd:paladin:kit:martial": ["srd:item:battleaxe"] } }] }, held);
    const sword = r.inventory.items.find((e) => e.id === "srd:item:longsword");
    expect(sword).toMatchObject({ equipped: true });
    expect(sword?.origin).toBeUndefined();
    expect(r.kept).toHaveLength(1);
  });

  it("two martial weapons may be the same weapon, which is two of it", () => {
    const { inventory } = apply(
      kit({ "srd:paladin:kit:weapons": ["srd:paladin:kit:two-martial"], "srd:paladin:kit:martial-two": ["srd:item:longsword", "srd:item:longsword"] }),
      empty(),
    );
    expect(inventory.items.find((e) => e.id === "srd:item:longsword")?.quantity).toBe(2);
  });
});

describe("the gold alternative", () => {
  const goldBuild = (x?: number) => ({
    ...paladin({ [EQ]: ["srd:paladin:gold"] }),
    ...(x === undefined ? {} : { starting: { items: {}, currency: {}, gold: { "srd:paladin:gold": { x } } } }),
  });

  it("is X times ten, applied as a difference when X changes and when the option goes", () => {
    let r = apply(goldBuild(12), empty());
    expect(r.inventory.currency?.gp).toBe(15 + 120);
    r = apply({ ...r.build, starting: { ...r.build.starting!, gold: { "srd:paladin:gold": { x: 15 } } } }, r.inventory);
    expect(r.inventory.currency?.gp).toBe(15 + 150);
    r = apply({ ...r.build, levels: [{ ...r.build.levels[0], choices: { [EQ]: [] } }] }, r.inventory);
    expect(r.inventory.currency?.gp).toBe(15);
  });

  it("swapping from the kit to gold takes the kit's gear out", () => {
    const first = apply(paladin({ [EQ]: ["srd:paladin:kit"] }), empty());
    expect(ids(first.inventory)).toContain("srd:item:chain-mail");
    const r = apply({ ...first.build, levels: [{ ...first.build.levels[0], choices: { [EQ]: ["srd:paladin:gold"] } }] }, first.inventory);
    expect(ids(r.inventory)).not.toContain("srd:item:chain-mail");
  });

  it("clamps at zero when the purse has been spent", () => {
    let r = apply(goldBuild(12), empty());
    r = { ...r, inventory: { ...r.inventory, currency: { gp: 20 } } };
    r = apply({ ...r.build, levels: [{ ...r.build.levels[0], choices: { [EQ]: [] } }] }, r.inventory);
    expect(r.inventory.currency?.gp).toBe(0);
  });

  it("asks for X only when the option is chosen", () => {
    expect(startingPlan(collect(index, goldBuild(), undefined), goldBuild()).golds).toEqual([
      { element: "srd:paladin:gold", dice: "5d4", multiplier: 10 },
    ]);
    expect(startingPlan(collect(index, paladin(), undefined), paladin()).golds).toEqual([]);
  });
});

describe("only the class at character level one", () => {
  const kind = (id: string, extra: object = {}): Element => ({ id, kind: "class", name: id, source: "test", hitDie: "d8", ...extra }) as Element;
  const option = (id: string): Element => ({ id, kind: "kit", name: id, source: "test", equipment: [{ item: `item-of-${id}` }] }) as Element;
  const choice = (cls: string) => ({ id: `${cls}:eq`, count: 1, from: { kind: "kit", ids: [`${cls}-kit`] } });
  const synthetic = testIndex([
    TEST_BOOK,
    kind("a", { levels: { "1": { choices: [choice("a")] } } }),
    kind("b", { levels: { "1": { choices: [choice("b")] } } }),
    option("a-kit"),
    option("b-kit"),
  ]);

  it("ignores a later class's level one, so multiclassing adds none", () => {
    const build = plainBuild({
      levels: [
        { class: "a", hp: "max", choices: { "a:eq": ["a-kit"] } },
        { class: "b", hp: "average", choices: { "b:eq": ["b-kit"] } },
      ],
    });
    const plan = startingPlan(collect(synthetic, build, undefined), build);
    expect(Object.values(plan.groups).map((g) => g.origin.element)).toEqual(["a-kit"]);
  });

  it("moves the equipment when the first level's class changes", () => {
    const aFirst = plainBuild({
      levels: [
        { class: "a", hp: "max", choices: { "a:eq": ["a-kit"] } },
        { class: "b", hp: "average", choices: { "b:eq": ["b-kit"] } },
      ],
    });
    const bFirst = { ...aFirst, levels: [aFirst.levels[1], aFirst.levels[0]] };
    const file = applyStarting(synthetic, aFirst, empty(), next);
    expect(ids(file.inventory)).toEqual(["item-of-a-kit"]);
    const swapped = applyStarting(synthetic, { ...bFirst, starting: file.build.starting }, file.inventory, next);
    expect(ids(swapped.inventory)).toEqual(["item-of-b-kit"]);
  });
});
