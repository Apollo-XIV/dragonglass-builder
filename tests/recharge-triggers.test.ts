/**
 * Recharge triggers the data uses (schema-gaps spec, item 5): midnight rides with a long
 * rest; special is applied by no rest and described by its text.
 */
import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import { resolve } from "../src/core/resolver/resolve";
import { describeRecharge, restoredOn } from "../src/core/state/recharge";
import type { Element, StateEvent, StateFile } from "../src/core/types";
import { build, testIndex, TEST_BOOK } from "./helpers";

const item = (recharge: Element["resources"]): Element => ({
  id: "test:item:orb", kind: "class-feature", name: "Orb", source: "test",
  resources: [{ id: "charges", name: "Charges", max: 3, recharge: recharge as never }],
});
const CLASS: Element = { id: "test:class:fighter", kind: "class", name: "Fighter", source: "test", key: "fighter", hitDie: "d10", levels: { "1": { grants: ["test:item:orb"] } } } as Element;

const state = (events: StateEvent[]): StateFile => ({ kind: "state", schemaVersion: 1, checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] }, events });
const T = "2026-01-01T00:00:00.000Z";

function remaining(recharge: unknown[], rest?: "short" | "long") {
  const content = testIndex([TEST_BOOK, CLASS, item(recharge as never)]);
  const events: StateEvent[] = [{ t: T, type: "spend", target: "test:item:orb:charges", amount: 3 } as StateEvent];
  if (rest) events.push({ t: T, type: `rest.${rest}` } as StateEvent);
  return resolve({ content, build: build({ levels: [{ class: "test:class:fighter", hp: "average", choices: {} }] }), state: state(events) }).resources[0];
}

describe("midnight and special recharges", () => {
  it("a midnight pool is restored by a long rest and not a short one", () => {
    const rule = [{ on: "midnight", amount: "all" }];
    expect(remaining(rule, "short").remaining).toBe(0);
    expect(remaining(rule, "long").remaining).toBe(3);
    expect(restoredOn([{ on: "midnight", amount: "all" }], "long", 3)).toBe(3);
  });

  it("a special pool is restored by neither rest and carries its text", () => {
    const rule = [{ on: "special", amount: "all", text: "when you take a short rest in the Feywild" }];
    expect(remaining(rule, "short").remaining).toBe(0);
    expect(remaining(rule, "long").remaining).toBe(0);
    const r = remaining(rule);
    expect(r.recharge).toEqual([{ on: "special", amount: "all", text: "when you take a short rest in the Feywild" }]);
    expect(describeRecharge(r.recharge)).toBe("when you take a short rest in the Feywild");
    expect(describeRecharge([{ on: "special", amount: 1, text: "when you roll a 20" }, { on: "long-rest", amount: "all" }])).toBe("1 when you roll a 20, all on a long rest");
  });

  it("validates: special without text warns, midnight is accepted, text on any rule is kept", () => {
    expect(validateElement(item([{ on: "midnight", amount: "all" }] as never)).diagnostics).toHaveLength(0);
    const r = validateElement(item([{ on: "special", amount: "all" }] as never));
    expect(r.usable).toBe(true);
    expect(r.diagnostics.map((d) => d.path)).toEqual(["resources[0].recharge[0].text"]);
    expect(validateElement(item([{ on: "long-rest", amount: "all", text: "at dawn" }] as never)).diagnostics).toHaveLength(0);
    expect(remaining([{ on: "long-rest", amount: "all", text: "at dawn" }]).recharge[0].text).toBe("at dawn");
  });
});
