import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import { resolve } from "../src/core/resolver/resolve";
import { foldState, type FoldRules } from "../src/core/state/fold";
import { describeRecharge, restoredOn } from "../src/core/state/recharge";
import type { Element, StateEvent, StateFile } from "../src/core/types";
import { build, testIndex, TEST_BOOK } from "./helpers";

/** 2024 Rage: one use back on a short rest, all of them on a long rest. */
const RAGE: Element = {
  id: "test:feature:rage",
  kind: "class-feature",
  name: "Rage",
  source: "test",
  resources: [
    {
      id: "rages",
      name: "Rages",
      max: 4,
      recharge: [
        { on: "short-rest", amount: 1 },
        { on: "long-rest", amount: "all" },
      ],
    },
    // The amount is an expression, read at the character's level.
    { id: "recovery", name: "Recovery", max: 10, recharge: [{ on: "long-rest", amount: "@level" }] },
  ],
};
const CLASS: Element = {
  id: "test:class:barbarian",
  kind: "class",
  name: "Barbarian",
  source: "test",
  hitDie: "d12",
  key: "barbarian",
  levels: { "1": { grants: ["test:feature:rage"] } },
};

const content = testIndex([TEST_BOOK, CLASS, RAGE]);
const character = build({ levels: [{ class: "test:class:barbarian", hp: "average" }, { class: "test:class:barbarian", hp: "average" }, { class: "test:class:barbarian", hp: "average" }] });

function stateWith(...events: StateEvent[]): StateFile {
  return { kind: "state", schemaVersion: 1, checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] }, events };
}
const spend = (target: string, amount: number): StateEvent => ({ t: "t", type: "spend", target, amount });

describe("recharge rules", () => {
  it("resolves each rule, evaluating expression amounts", () => {
    const r = resolve({ content, build: character });
    expect(r.resources.find((x) => x.id === "rages")?.recharge).toEqual([
      { on: "short-rest", amount: 1 },
      { on: "long-rest", amount: "all" },
    ]);
    expect(r.resources.find((x) => x.id === "recovery")?.recharge).toEqual([{ on: "long-rest", amount: 3 }]);
  });

  it("gives one use back on a short rest and all of them on a long rest", () => {
    const key = "test:feature:rage:rages";
    const short = resolve({ content, build: character, state: stateWith(spend(key, 4), { t: "t", type: "rest.short" }) });
    expect(short.resources.find((x) => x.key === key)?.remaining).toBe(1);
    const long = resolve({ content, build: character, state: stateWith(spend(key, 4), { t: "t", type: "rest.long" }) });
    expect(long.resources.find((x) => x.key === key)?.remaining).toBe(4);
  });

  it("applies the largest matching rule, not their sum", () => {
    const rules = [
      { on: "short-rest" as const, amount: 3 },
      { on: "long-rest" as const, amount: 2 },
    ];
    expect(restoredOn(rules, "short", 9)).toBe(3);
    expect(restoredOn(rules, "long", 9)).toBe(3);
  });

  it("restores nothing for a pool with no rule for the rest, and for an empty list", () => {
    expect(restoredOn([{ on: "dawn", amount: "all" }], "short", 5)).toBe(0);
    expect(restoredOn([], "long", 5)).toBe(0);
    const rules: FoldRules = { maxHp: 1, hitDice: [], pools: [{ key: "resources.charm", max: 3, recharge: [] }] };
    const live = foldState(stateWith(spend("charm", 2), { t: "t", type: "rest.long" }), rules);
    expect(live.spent.resources["charm"]).toBe(2);
  });

  it("describes the rules for the sheet", () => {
    expect(describeRecharge([{ on: "long-rest", amount: "all" }])).toBe("long rest");
    expect(describeRecharge([{ on: "short-rest", amount: 1 }, { on: "long-rest", amount: "all" }])).toBe(
      "1 on a short rest, all on a long rest",
    );
    expect(describeRecharge([])).toBe("manual");
  });
});

describe("validating recharge", () => {
  const resource = (recharge: unknown) =>
    validateElement({ id: "a", kind: "feat", name: "A", source: "srd", resources: [{ id: "r", name: "R", max: 1, recharge }] });

  it("accepts a list, including an empty one", () => {
    expect(resource([{ on: "short-rest", amount: 1 }, { on: "long-rest", amount: "all" }]).diagnostics).toHaveLength(0);
    expect(resource([]).diagnostics).toHaveLength(0);
  });

  it("refuses the old single word, and a rule with no amount", () => {
    expect(resource("long-rest").usable).toBe(false);
    expect(resource([{ on: "long-rest" }]).usable).toBe(false);
  });

  it("warns on an unknown trigger and a bad amount expression, and keeps the element", () => {
    const r = resource([{ on: "full-moon", amount: "all" }, { on: "dawn", amount: "1 +" }]);
    expect(r.usable).toBe(true);
    expect(r.diagnostics.map((d) => d.path)).toEqual(expect.arrayContaining([expect.stringContaining("recharge[0].on"), expect.stringContaining("recharge[1].amount")]));
  });
});
