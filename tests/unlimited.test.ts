/**
 * A class table cell that reads "Unlimited" (2014 Rages at level 20): the resource it
 * feeds has no cap, never blocks spending, and is left alone by rests.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import { foldState } from "../src/core/state/fold";
import { describeUses } from "../src/core/state/recharge";
import type { Element, StateEvent, StateFile } from "../src/core/types";
import { build, TEST_BOOK, testIndex } from "./helpers";

const RAGE: Element = {
  id: "test:feature:rage", kind: "class-feature", name: "Rage", source: "test",
  resources: [{ id: "rages", name: "Rages", max: "@table(barbarian, rages)", recharge: [{ on: "long-rest", amount: "all" }] }],
  actions: [{ id: "rage", name: "Rage", activation: "bonus-action", cost: { rages: 1 } }],
} as Element;

const barbarian = (last: unknown): Element =>
  ({
    id: "test:class:barbarian", kind: "class", name: "Barbarian", source: "test", key: "barbarian", hitDie: "d12",
    levels: { "1": { grants: [RAGE.id] } },
    tables: { rages: [...Array.from({ length: 19 }, () => 3), last] },
  }) as Element;

const KEY = "test:feature:rage:rages";
const at = (level: number, last: unknown = "Unlimited", events: StateEvent[] = []) => {
  const state: StateFile | undefined = events.length
    ? { kind: "state", schemaVersion: 1, checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] }, events }
    : undefined;
  return resolve({
    content: testIndex([TEST_BOOK, barbarian(last), RAGE]),
    build: build({ levels: Array.from({ length: level }, () => ({ class: "test:class:barbarian", hp: "average" as const, choices: {} })) }),
    state,
  });
};
const rages = (c: ReturnType<typeof at>) => c.resources.find((r) => r.key === KEY)!;
const spend = (n: number): StateEvent => ({ t: "t", type: "spend", target: KEY, amount: n });

describe("an unlimited table cell", () => {
  it("makes the resource unlimited at that level, and only there", () => {
    expect(rages(at(20))).toMatchObject({ max: Infinity, unlimited: true, remaining: Infinity, spent: 0 });
    expect(rages(at(19))).toMatchObject({ max: 3, unlimited: false, remaining: 3 });
  });

  it("is read however the book spells it", () => {
    for (const cell of ["unlimited", "  Unlimited ", "UNLIMITED", "∞"])
      expect(rages(at(20, cell)).unlimited, cell).toBe(true);
  });

  it("is not mistaken for other text", () => {
    expect(rages(at(20, "lots")).unlimited).toBe(false);
  });

  it("never blocks spending: nothing is counted, and an action costing it stays available", () => {
    const c = at(20, "Unlimited", [spend(1), spend(1), spend(5)]);
    expect(rages(c)).toMatchObject({ unlimited: true, spent: 0, remaining: Infinity });
    expect(c.actions.find((a) => a.id === "rage")?.available).toBe(true);
  });

  it("is skipped by rests and keeps no tally in the log", () => {
    const rules = { maxHp: 10, hitDice: [], pools: [{ key: `resources.${KEY}`, max: Infinity, unlimited: true, recharge: [{ on: "long-rest" as const, amount: "all" as const }] }] };
    const state: StateFile = {
      kind: "state", schemaVersion: 1, checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] },
      events: [spend(2), { t: "t", type: "rest.long" }, spend(1)],
    };
    expect(foldState(state, rules).spent.resources ?? {}).toEqual({});
  });

  it("still behaves for a limited pool beside it", () => {
    const rules = { maxHp: 10, hitDice: [], pools: [{ key: `resources.${KEY}`, max: 3, recharge: [{ on: "long-rest" as const, amount: "all" as const }] }] };
    const state: StateFile = {
      kind: "state", schemaVersion: 1, checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] },
      events: [spend(5)],
    };
    expect(foldState(state, rules).spent.resources).toEqual({ [KEY]: 3 });
  });
});

describe("describeUses", () => {
  it("says ∞ for a pool with no cap", () => {
    expect(describeUses(Infinity, Infinity)).toBe("∞");
    expect(describeUses(2, 3)).toBe("2 of 3");
  });
});
