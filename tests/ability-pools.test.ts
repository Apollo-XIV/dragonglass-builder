import { describe, expect, it } from "vitest";
import type { BuildAbilities } from "../src/core/types";
import {
  addPool,
  assign,
  chipId,
  chipOf,
  isInvalidBase,
  moveInvalid,
  removePool,
  resetAbility,
  resetPool,
  rollSlots,
  setValue,
  switchMethod,
  unassign,
  usedChips,
} from "../src/obsidian/ui/builder/ability-pools";
import { canStart, isFinished, rollMethod, ROLL_METHODS, typeInto } from "../src/obsidian/ui/builder/roll-methods";

const range = { min: 3, max: 18 };

describe("typing a roll", () => {
  it("rejects digits no value in range starts with", () => {
    expect(canStart(range, "0")).toBe(false);
    expect(canStart(range, "2")).toBe(false);
    expect(canStart(range, "19")).toBe(false);
    expect(canStart(range, "1")).toBe(true);
  });

  it("waits after a leading 1 and finishes 3 to 9 at once", () => {
    expect(isFinished(range, "1")).toBe(false);
    for (const d of ["3", "4", "5", "6", "7", "8", "9"]) expect(isFinished(range, d), d).toBe(true);
    expect(typeInto(range, "", "1")).toEqual({ commits: [], draft: "1" });
    expect(typeInto(range, "1", "4")).toEqual({ commits: [14], draft: "" });
    expect(typeInto(range, "1", "9")).toEqual({ commits: [], draft: "1" });
    expect(typeInto(range, "", "0")).toEqual({ commits: [], draft: "" });
    expect(typeInto(range, "", "2")).toEqual({ commits: [], draft: "" });
  });

  it("derives the rule from the range alone", () => {
    const d20 = { min: 1, max: 20 };
    expect(typeInto(d20, "", "2")).toEqual({ commits: [], draft: "2" });
    expect(typeInto(d20, "2", "0")).toEqual({ commits: [20], draft: "" });
    expect(typeInto(d20, "2", "1")).toEqual({ commits: [], draft: "2" });
    const high = { min: 8, max: 18 };
    expect(typeInto(high, "", "3")).toEqual({ commits: [], draft: "" });
    expect(typeInto(high, "", "8")).toEqual({ commits: [8], draft: "" });
  });

  it("advances on a space or a comma, and fills slots from a pasted list", () => {
    expect(typeInto({ min: 1, max: 20 }, "1", " ")).toEqual({ commits: [1], draft: "" });
    expect(typeInto(range, "", "15 14 13 12 10 8")).toEqual({ commits: [15, 14, 13, 12, 10, 8], draft: "" });
    expect(typeInto(range, "", "15,14, 9,1")).toEqual({ commits: [15, 14, 9], draft: "1" });
  });

  it("rolls within each method's range", () => {
    for (const method of ROLL_METHODS)
      for (const r of [0, 0.5, 0.9999]) {
        const n = method.roll(() => r);
        expect(n).toBeGreaterThanOrEqual(method.min);
        expect(n).toBeLessThanOrEqual(method.max);
      }
    // 6, 6, 6, 1: the 1 is dropped.
    const rolls = [0.99, 0.99, 0.99, 0];
    expect(rollMethod("4d6-drop-lowest").roll(() => rolls.shift()!)).toBe(18);
  });
});

const rolled = (values: (number | null)[], extra: Partial<BuildAbilities> = {}): BuildAbilities => ({
  method: "rolled",
  base: {},
  pools: [{ id: "p1", method: "4d6-drop-lowest", values }],
  ...extra,
});

describe("assigning chips", () => {
  it("assigns a chip and marks it used, one chip at a time even for equal values", () => {
    let a = rolled([14, 14, 12, null, null, null]);
    a = assign(a, "p1:0", "str");
    expect(a.base.str).toBe(14);
    expect([...usedChips(a).keys()]).toEqual(["p1:0"]);
    a = assign(a, "p1:1", "dex");
    expect([...usedChips(a).entries()]).toEqual([
      ["p1:0", "str"],
      ["p1:1", "dex"],
    ]);
  });

  it("returns the tile's old chip to the pool when another is dropped on it", () => {
    let a = assign(rolled([15, 10, null, null, null, null]), "p1:0", "str");
    a = assign(a, "p1:1", "str");
    expect(a.base.str).toBe(10);
    expect(usedChips(a).has("p1:0")).toBe(false);
  });

  it("swaps two tiles when an assigned chip is dropped on another assigned tile", () => {
    let a = rolled([15, 10, null, null, null, null]);
    a = assign(assign(a, "p1:0", "str"), "p1:1", "dex");
    a = assign(a, "p1:0", "dex");
    expect(a.base).toEqual({ str: 10, dex: 15 });
    expect(a.assigned).toEqual({ str: "p1:1", dex: "p1:0" });
  });

  it("moves a chip to an empty tile and empties the one it left", () => {
    let a = assign(rolled([15, null, null, null, null, null]), "p1:0", "str");
    a = assign(a, "p1:0", "con");
    expect(a.base).toEqual({ con: 15 });
  });

  it("empties a tile on unassign", () => {
    const a = unassign(assign(rolled([15, null, null, null, null, null]), "p1:0", "str"), "str");
    expect(a.base.str).toBeUndefined();
    expect(usedChips(a).size).toBe(0);
  });

  it("keeps an assignment through a reroll, updating the score in place", () => {
    let a = assign(rolled([15, null, null, null, null, null]), "p1:0", "str");
    a = setValue(a, "p1:0", 9);
    expect(a.base.str).toBe(9);
    expect(chipOf(a, "str")).toBe("p1:0");
    a = rollSlots(a, "p1", [0], () => 0);
    expect(a.base.str).toBe(3);
  });
});

describe("pools", () => {
  it("adds a pool with the method of the ones before it", () => {
    const { abilities, pool } = addPool(
      { method: "rolled", base: {}, pools: [{ id: "p1", method: "3d6", values: [] }] },
      "4d6-drop-lowest",
    );
    expect(pool).toBe("p2");
    expect(abilities.pools![1]).toEqual({ id: "p2", method: "3d6", values: [null, null, null, null, null, null] });
  });

  it("removes a pool and wipes the scores its chips gave, and resets the last one", () => {
    let a = addPool(rolled([15, null, null, null, null, null]), "3d6").abilities;
    a = setValue(a, chipId("p2", 0), 12);
    a = assign(assign(a, "p1:0", "str"), "p2:0", "dex");
    a = removePool(a, "p2");
    expect(a.pools!.map((p) => p.id)).toEqual(["p1"]);
    expect(a.base).toEqual({ str: 15 });
    a = removePool(a, "p1");
    expect(a.pools).toHaveLength(1);
    expect(a.pools![0]!.values.every((v) => v === null)).toBe(true);
    expect(a.base).toEqual({});
    expect(resetPool(a, "p1").pools).toEqual(a.pools);
  });
});

describe("switching method", () => {
  const scores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

  it("turns scores into pre-assigned chips of a new pool, in ability order", () => {
    const a = switchMethod({ method: "manual", base: { ...scores, str: 11, dex: 13 } }, "rolled", "4d6-drop-lowest");
    expect(a.pools).toEqual([{ id: "p1", method: "4d6-drop-lowest", values: [11, 13, 13, 12, 10, 8] }]);
    expect(a.assigned).toEqual({ str: "p1:0", dex: "p1:1", con: "p1:2", int: "p1:3", wis: "p1:4", cha: "p1:5" });
  });

  it("starts an empty pool when there are no scores to bring", () => {
    const a = switchMethod({ method: "standard-array", base: {} }, "rolled", "3d6");
    expect(a.pools).toEqual([{ id: "p1", method: "3d6", values: [null, null, null, null, null, null] }]);
  });

  it("gives each score back its own chip after a trip away, never another of the same value", () => {
    // 13 and 11 rolled in that order, then assigned the other way round.
    let a = rolled([13, 11, 12, 9, 18, 8]);
    for (const [chip, ability] of [["p1:1", "str"], ["p1:0", "dex"], ["p1:2", "con"], ["p1:3", "int"], ["p1:4", "wis"], ["p1:5", "cha"]] as const)
      a = assign(a, chip, ability);
    const back = switchMethod(switchMethod(a, "manual", "3d6"), "rolled", "3d6");
    expect(back.pools).toEqual(a.pools);
    expect(back.assigned).toEqual(a.assigned);
  });

  it("puts only the scores changed while away into a new pool", () => {
    let a = rolled([18, 3, 15, 14, 13, 12]);
    a = assign(a, "p1:0", "str");
    const away = switchMethod(a, "manual", "3d6");
    expect(away.base.dex).toBe(8);
    const back = switchMethod({ ...away, base: { ...away.base, str: 18, dex: 14 } }, "rolled", "3d6");
    expect(chipOf(back, "str")).toBe("p1:0");
    // DEX's 14 is not taken from p1:3: it never came from there.
    expect(back.pools![1]!.values).toEqual([14, 8, 8, 8, 8, null]);
    expect(chipOf(back, "dex")).toBe("p2:0");
  });

  it("assigns the standard array's chips where the scores match, and keeps the rest", () => {
    const a = switchMethod({ method: "manual", base: { ...scores, str: 17 } }, "standard-array", "3d6");
    expect(a.base.str).toBe(17);
    expect(chipOf(a, "str")).toBeUndefined();
    expect(chipOf(a, "dex")).toBe("standard:1");
    expect(usedChips(a).size).toBe(5);
    expect(a.pools).toBeUndefined();
  });

  it("starts empty abilities at 8 when leaving a pool method", () => {
    const a = switchMethod(assign(rolled([15]), "p1:0", "str"), "manual", "3d6");
    expect(a.base).toEqual({ str: 15, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
  });

  it("wipes when going directly between two non-manual methods", () => {
    const fromRolled = switchMethod(assign(rolled([15]), "p1:0", "str"), "point-buy", "3d6");
    expect(fromRolled.base).toEqual({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
    const toRolled = switchMethod({ method: "point-buy", base: { ...scores } }, "rolled", "3d6");
    expect(toRolled.pools).toEqual([{ id: "p1", method: "3d6", values: [null, null, null, null, null, null] }]);
    expect(toRolled.base).toEqual({});
    const toArray = switchMethod({ method: "point-buy", base: { ...scores } }, "standard-array", "3d6");
    expect(toArray.base).toEqual({});
  });
});

describe("an impossible score carried over from manual", () => {
  const scores = { str: 2, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

  it("is flagged in rolled, and resetting empties the tile and its chip", () => {
    const a = switchMethod({ method: "manual", base: scores }, "rolled", "4d6-drop-lowest");
    expect(isInvalidBase(a, "str")).toBe(true);
    expect(isInvalidBase(a, "dex")).toBe(false);
    const reset = resetAbility(a, "str");
    expect(reset.base.str).toBeUndefined();
    expect(reset.pools?.[0]?.values[0]).toBeNull();
    expect(isInvalidBase(reset, "str")).toBe(false);
  });

  it("is flagged in the standard array when no chip holds the value", () => {
    const a = switchMethod({ method: "manual", base: { ...scores, str: 16 } }, "standard-array", "3d6");
    expect(isInvalidBase(a, "str")).toBe(true);
    expect(resetAbility(a, "str").base.str).toBeUndefined();
  });

  it("leaves the slot of an unrollable score empty when going to rolled", () => {
    const a = switchMethod({ method: "manual", base: { ...scores, dex: 1 } }, "rolled", "4d6-drop-lowest");
    expect(a.pools?.[0]?.values).toEqual([null, null, 13, 12, 10, 8]);
    expect(a.base.dex).toBe(1);
    expect(isInvalidBase(a, "dex")).toBe(true);
  });

  it("blanks the source when a valid score is dropped on an invalid one", () => {
    const a = switchMethod({ method: "manual", base: { ...scores, str: 1 } }, "rolled", "4d6-drop-lowest");
    const b = assign(a, "p1:1", "str");
    expect(b.base.str).toBe(14);
    expect(b.base.dex).toBeUndefined();
    expect(chipOf(b, "dex")).toBeUndefined();
  });

  it("moves the valid score to an invalid tile and blanks the destination", () => {
    const a = switchMethod({ method: "manual", base: { ...scores, str: 1 } }, "rolled", "4d6-drop-lowest");
    const b = moveInvalid(a, "str", "dex");
    expect(b.base.str).toBe(14);
    expect(b.base.dex).toBeUndefined();
    expect(moveInvalid(a, "str", "str")).toBe(a);
  });
});
