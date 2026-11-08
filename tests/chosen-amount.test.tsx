/**
 * A cost the player chooses the amount of: Lay on Hands, Metamagic. The range resolves
 * against what the pool has left, `@spent` is the chosen amount in the action's own
 * expressions, and nothing spends more than there is.
 */

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { validateElement } from "../src/core/content/validate";
import { fillSpent } from "../src/core/expr/evaluate";
import { resolve } from "../src/core/resolver/resolve";
import { amountProblem, canUse, chosenCosts, spentOf, useActionEvents, withSpent } from "../src/core/state/use-action";
import type { Element, StateEvent, StateFile } from "../src/core/types";
import type { CharacterStore } from "../src/obsidian/character-store";
import { UseAction } from "../src/obsidian/ui/use-action";
import { build, TEST_BOOK, testIndex } from "./helpers";

const KEY = "test:feature:lay-on-hands:pool";

const feature = (cost: unknown, extra: Record<string, unknown> = {}): Element =>
  ({
    id: "test:feature:lay-on-hands", kind: "class-feature", name: "Lay on Hands", source: "test",
    resources: [{ id: "pool", name: "Hit Point pool", max: "@level(paladin) * 5", recharge: [{ on: "long-rest", amount: "all" }] }],
    actions: [{ id: "lay", name: "Lay on Hands", activation: "bonus-action", cost: { pool: cost }, heal: "@spent", ...extra }],
  }) as Element;

const paladin = { id: "test:class:paladin", kind: "class", name: "Paladin", source: "test", key: "paladin", hitDie: "d10", levels: { "1": { grants: ["test:feature:lay-on-hands"] } } } as Element;

const spend = (n: number): StateEvent => ({ t: "t", type: "spend", target: KEY, amount: n });
const at = (level: number, cost: unknown, spent = 0, extra: Record<string, unknown> = {}) => {
  const state: StateFile | undefined = spent
    ? { kind: "state", schemaVersion: 1, checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] }, events: [spend(spent)] }
    : undefined;
  const c = resolve({
    content: testIndex([TEST_BOOK, paladin, feature(cost, extra)]),
    build: build({ levels: Array.from({ length: level }, () => ({ class: "test:class:paladin", hp: "average" as const, choices: {} })) }),
    state,
  });
  return { c, action: c.actions.find((a) => a.id === "lay")! };
};

describe("a chosen-amount cost", () => {
  it("defaults its maximum to what the pool has left", () => {
    const { action } = at(5, { min: 1 });
    expect(action.resolvedCost).toEqual([{ key: KEY, amount: { min: 1, max: 25 }, label: "Hit Point pool", remaining: 25 }]);
  });

  it("follows the pool down as it is spent", () => {
    const { action } = at(5, { min: 1 }, 20);
    expect(action.resolvedCost?.[0]).toMatchObject({ amount: { min: 1, max: 5 }, remaining: 5 });
    expect(action.available).toBe(true);
  });

  it("caps the maximum with an expression, but never above what is left", () => {
    expect(at(5, { min: 1, max: "@level(paladin)" }).action.resolvedCost?.[0].amount).toEqual({ min: 1, max: 5 });
    expect(at(5, { min: 1, max: 9 }, 22).action.resolvedCost?.[0].amount).toEqual({ min: 1, max: 3 });
  });

  it("reads the minimum as an expression too", () => {
    expect(at(5, { min: "@prof", max: 9 }).action.resolvedCost?.[0].amount).toEqual({ min: 3, max: 9 });
  });

  it("is unavailable when the pool cannot cover the minimum", () => {
    const { action } = at(1, { min: 2 }, 4);
    expect(action.available).toBe(false);
    expect(action.unavailableReason).toBe("Not enough Hit Point pool");
  });

  it("leaves @spent in the heal for the sheet to fill, without a diagnostic", () => {
    const { c, action } = at(5, { min: 1 });
    expect(action.healResolved).toBe("@spent");
    expect(c.diagnostics.filter((d) => d.code === "expression-error")).toEqual([]);
  });

  it("substitutes everything else around @spent", () => {
    const { action } = at(5, { min: 1 }, 0, { heal: "@spent + @prof", damage: "@spent d6", duration: "@spent minutes" });
    expect(action.healResolved).toBe("@spent + 3");
    expect(withSpent(action.healResolved, 4)).toBe("4 + 3");
    expect(withSpent(action.durationResolved, 10)).toBe("10 minutes");
    expect(withSpent(action.damageResolved, undefined)).toBe("X d6");
  });

  it("warns when @spent is used and nothing is chosen", () => {
    const { c } = at(5, 1);
    expect(c.diagnostics.some((d) => d.code === "expression-error" && /@spent/.test(d.message))).toBe(true);
  });

  it("keeps the fixed-cost shape unchanged", () => {
    const { action } = at(5, 2, 0, { heal: undefined });
    expect(action.resolvedCost).toEqual([{ key: KEY, amount: 2, label: "Hit Point pool" }]);
    expect(chosenCosts(action)).toEqual([]);
  });
});

describe("spending a chosen amount", () => {
  it("records the chosen amount", () => {
    const { action } = at(5, { min: 1 });
    expect(useActionEvents(action, { [KEY]: 7 })).toMatchObject([{ type: "spend", target: KEY, amount: 7 }]);
    expect(spentOf(action, { [KEY]: 7 })).toBe(7);
  });

  it("spends the minimum when none is chosen", () => {
    expect(useActionEvents(at(5, { min: 2 }).action)).toMatchObject([{ amount: 2 }]);
  });

  it("refuses an amount above what is left, below the minimum, or not whole", () => {
    const { action } = at(5, { min: 2 }, 20);
    const line = chosenCosts(action)[0];
    expect(amountProblem(line, 6)).toBe("Only 5 left");
    expect(amountProblem(line, 1)).toBe("At least 2");
    expect(amountProblem(line, 2.5)).toBe("Choose a whole number");
    expect(amountProblem(line, 5)).toBeUndefined();
    expect(useActionEvents(action, { [KEY]: 6 })).toEqual([]);
    expect(canUse(action, { [KEY]: 6 })).toBe(false);
  });

  it("names the cap rather than the pool when the cap is what binds", () => {
    const line = chosenCosts(at(5, { min: 1, max: 4 }).action)[0];
    expect(amountProblem(line, 5)).toBe("At most 4");
  });

  it("fills @spent through the same arithmetic as any expression", () => {
    expect(fillSpent("2 * @spent + 1", 3)).toBe("2 * 3 + 1");
  });
});

describe("validating a chosen-amount cost", () => {
  const action = (cost: unknown, extra: Record<string, unknown> = {}) =>
    validateElement({ id: "a", kind: "feat", name: "A", source: "srd", actions: [{ id: "x", activation: "action", cost, ...extra }] });

  it("accepts a bare minimum, a range and expressions", () => {
    for (const cost of [{ r: { min: 1 } }, { r: { min: 1, max: 9 } }, { r: { min: "@prof", max: "@level" } }])
      expect(action(cost).diagnostics, JSON.stringify(cost)).toEqual([]);
  });

  it("rejects a range without a minimum, or a bad expression", () => {
    expect(action({ r: { max: 3 } }).usable).toBe(false);
    expect(action({ r: { min: 1, max: [] } }).usable).toBe(false);
    expect(action({ r: { min: "1 +" } }).diagnostics.map((d) => d.code)).toContain("expression-error");
  });

  it("warns on @spent without a chosen amount", () => {
    expect(action({ r: 1 }, { heal: "@spent" }).diagnostics.map((d) => d.code)).toContain("expression-error");
    expect(action({ r: { min: 1 } }, { heal: "@spent" }).diagnostics).toEqual([]);
  });
});

describe("the picker", () => {
  const html = (cost: unknown, spent = 0) =>
    renderToStaticMarkup(createElement(UseAction, { action: at(5, cost, spent).action, store: {} as CharacterStore, startOpen: true }));

  it("shows the pool that is left and what the amount would heal", () => {
    const out = html({ min: 1 }, 20);
    expect(out).toContain("5 left");
    expect(out).toContain("Heals 1");
    expect(out).toContain("Spend");
  });

  it("is a plain button for a fixed cost", () => {
    const out = renderToStaticMarkup(createElement(UseAction, { action: at(5, 1, 0, { heal: undefined }).action, store: {} as CharacterStore, startOpen: true }));
    expect(out).not.toContain("dg-use-picker");
    expect(out).toContain(">Use<");
  });
});
