/**
 * An innate spell cast from another pool (schema-gaps spec, item 3): "spend 2 ki points to
 * cast Burning Hands" is a cost on the innate entry, resolved as an action's is.
 */
import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import { partsOf } from "../src/core/export/build";
import { resolve } from "../src/core/resolver/resolve";
import { useActionEvents } from "../src/core/state/use-action";
import type { Element, InnateSpellDef, StateEvent, StateFile } from "../src/core/types";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const spell = (n: string, spellLevel: number): Element => ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel }) as Element;

const KI: Element = {
  id: "test:feature:ki", kind: "class-feature", name: "Ki", source: "test",
  resources: [{ id: "ki-points", name: "Ki points", max: "@level(monk)", recharge: [{ on: "short-rest", amount: "all" }] }],
};

const discipline = (entry: Partial<InnateSpellDef>): Element => ({
  id: "test:feature:fire", kind: "class-feature", name: "Flames of the Phoenix", source: "test",
  innateSpells: [{ spell: "test:spell:burning-hands", ...entry }],
});

const MONK: Element = {
  id: "test:class:monk", kind: "class", name: "Monk", source: "test", key: "monk", hitDie: "d8",
  levels: { "1": { grants: ["test:feature:ki"] }, "2": {}, "3": { grants: ["test:feature:fire"] }, "4": {}, "5": {} },
} as Element;

const state = (events: StateEvent[] = []): StateFile => ({
  kind: "state", schemaVersion: 1, checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] }, events,
});

function monk(fire: Element, live: StateFile = state()) {
  const content = testIndex([TEST_BOOK, MONK, KI, fire, spell("burning-hands", 1)]);
  return resolve({
    content,
    build: build({
      abilities: { method: "manual", base: scores({ wis: 16 }) },
      levels: Array.from({ length: 5 }, () => ({ class: "test:class:monk", hp: "average", choices: {} })),
    }),
    state: live,
  });
}

describe("validating a cost on an innate spell", () => {
  it("accepts a cost on its own", () => {
    expect(validateElement(discipline({ cost: { "test:feature:ki:ki-points": 2 } })).diagnostics).toHaveLength(0);
    expect(validateElement(discipline({ cost: { "ki-points": { min: 2, max: 5 } } })).diagnostics).toHaveLength(0);
  });

  it("rejects a cost beside uses", () => {
    const r = validateElement(discipline({ cost: { "ki-points": 2 }, uses: 1 }));
    expect(r.usable).toBe(false);
    expect(r.diagnostics.map((d) => d.path)).toContain("innateSpells[0].cost");
  });

  it("checks the cost's shape as an action's", () => {
    expect(validateElement(discipline({ cost: { "ki-points": "two" } as never })).diagnostics[0].severity).toBe("error");
  });
});

describe("casting an innate spell from another pool", () => {
  const cast = (c = monk(discipline({ cost: { "test:feature:ki:ki-points": 2 } }))) => ({
    c,
    entry: c.spellcasting!.spells.find((s) => s.id === "test:spell:burning-hands")!.innate[0],
  });

  it("resolves the cost to the pool and makes no pool of its own", () => {
    const { c, entry } = cast();
    expect(entry.resolvedCost).toEqual([{ key: "test:feature:ki:ki-points", amount: 2, label: "Ki points" }]);
    expect(entry.resource).toBeUndefined();
    expect(entry.available).toBe(true);
    expect(c.resources.map((r) => r.key)).toEqual(["test:feature:ki:ki-points"]);
  });

  it("resolves a local key through the owning class's pools as an action's does", () => {
    const { entry } = cast(monk(discipline({ cost: { "ki-points": 2 } })));
    expect(entry.resolvedCost?.[0].key).toBe("test:feature:ki:ki-points");
  });

  it("spends the pool through the sheet's path", () => {
    const { c, entry } = cast();
    const events = useActionEvents({ name: "Burning Hands", resolvedCost: entry.resolvedCost, available: true });
    expect(events).toHaveLength(1);
    const after = monk(discipline({ cost: { "test:feature:ki:ki-points": 2 } }), state(events));
    expect(c.resources[0].remaining).toBe(5);
    expect(after.resources[0].remaining).toBe(3);
  });

  it("is unavailable when the pool cannot cover it", () => {
    const spent = state([{ t: "2026-01-01T00:00:00.000Z", type: "spend", target: "test:feature:ki:ki-points", amount: 4 } as StateEvent]);
    const { entry } = cast(monk(discipline({ cost: { "ki-points": 2 } }), spent));
    expect(entry.available).toBe(false);
    expect(entry.unavailableReason).toBe("Not enough Ki points");
  });

  it("a chosen amount carries the range the picker offers", () => {
    const { entry } = cast(monk(discipline({ cost: { "ki-points": { min: 2 } } })));
    expect(entry.resolvedCost?.[0]).toMatchObject({ amount: { min: 2, max: 5 }, remaining: 5 });
  });

  it("warns about a pool the character does not have", () => {
    const { c, entry } = cast(monk(discipline({ cost: { "sorcery-points": 2 } })));
    expect(entry.resolvedCost).toBeUndefined();
    expect(c.diagnostics.map((d) => d.code)).toContain("unresolved-reference");
  });

  it("is exported on the cast", () => {
    const { c } = cast();
    const feature = c.features["class-feature"].find((e) => e.id === "test:feature:fire")!;
    expect(partsOf(feature.element, c.actions)[0].kind).toBe("innate-spell");
  });
});
