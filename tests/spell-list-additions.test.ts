/**
 * Adding to a class's spell list: options only, never grants. Domain-style expanded lists
 * (explicit spells) and Magical Secrets (another class's whole list).
 */

import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import { classSpellList, onClassList } from "../src/core/resolver/spell-list";
import { resolve } from "../src/core/resolver/resolve";
import type { Element, SpellEntry, SpellListAddition } from "../src/core/types";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const spell = (n: string, spellLevel: number, tags: string[]): Element =>
  ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel, tags }) as Element;

const cleric: Element = {
  id: "test:class:cleric", kind: "class", name: "Clericish", source: "test", key: "cleric", hitDie: "d8",
  spellcasting: { ability: "wis", progression: "full", type: "prepared", list: "cleric-spell", prepared: 4 },
} as Element;

const bardWith = (levels: Element["levels"], extra: Partial<Element> = {}): Element =>
  ({
    id: "test:class:bard", kind: "class", name: "Bardish", source: "test", key: "bard", hitDie: "d8",
    spellcasting: { ability: "cha", progression: "full", type: "known", list: "bard-spell", known: 4 },
    levels, ...extra,
  }) as Element;

const spells = [
  spell("vicious-mockery", 0, ["bard-spell"]),
  spell("burning-hands", 1, ["wizard-spell"]),
  spell("cure-wounds", 1, ["cleric-spell"]),
  spell("sanctuary", 1, ["cleric-spell"]),
];

function character(levels: Element["levels"], entries: SpellEntry[] = [], extra: Partial<Element> = {}) {
  return resolve({
    content: testIndex([TEST_BOOK, cleric, bardWith(levels, extra), ...spells]),
    build: build({ abilities: { method: "manual", base: scores({ cha: 16 }) }, levels: [{ class: "test:class:bard", hp: "average", choices: {} }] }),
    spells: { kind: "spells", schemaVersion: 1, spells: entries },
  });
}
const bard = (c: ReturnType<typeof character>) => c.spellcasting!.classes[0]!;
const lvl1 = (...spellListAdditions: SpellListAddition[]): Element["levels"] => ({ "1": { spellListAdditions } });

describe("a spell list addition", () => {
  it("adds named spells and whole class lists to the class that owns the part", () => {
    const c = character(lvl1({ spells: ["test:spell:burning-hands"], fromClasses: ["test:class:cleric"] }));
    expect(bard(c).listAdditions).toEqual({ spells: ["test:spell:burning-hands"], lists: ["cleric-spell"] });
  });

  it("grants nothing", () => {
    const c = character(lvl1({ spells: ["test:spell:burning-hands"], fromClasses: ["test:class:cleric"] }));
    expect(c.spellcasting!.spells).toEqual([]);
  });

  it("makes a pick from the added list a normal pick, not a mismatch", () => {
    const entries = [{ id: "test:spell:burning-hands", class: "test:class:bard" }, { id: "test:spell:cure-wounds", class: "test:class:bard" }];
    const without = character(undefined, entries);
    expect(without.diagnostics.filter((d) => d.code === "spell-mismatch")).toHaveLength(2);
    const extended = character(lvl1({ spells: ["test:spell:burning-hands"], fromClasses: ["test:class:cleric"] }), entries);
    expect(extended.diagnostics.map((d) => d.code)).not.toContain("spell-mismatch");
    expect(extended.spellcasting!.limits[0]!.known.used).toBe(2);
  });

  it("lists the class's own spells and the added ones as its options", () => {
    const c = character(lvl1({ spells: ["test:spell:burning-hands"], fromClasses: ["test:class:cleric"] }));
    const index = testIndex([TEST_BOOK, cleric, bardWith({}), ...spells]);
    expect(classSpellList(index, bard(c)).map((s) => s.name).sort()).toEqual(["burning-hands", "cure-wounds", "sanctuary", "vicious-mockery"]);
    expect(onClassList(bard(c), spells[1]!)).toBe(true);
  });

  it("waits for its level", () => {
    const c = character({ "2": { spellListAdditions: [{ fromClasses: ["test:class:cleric"] }] } });
    expect(bard(c).listAdditions).toEqual({ spells: [], lists: [] });
  });

  it("works from a feature the class grants, naming the class itself", () => {
    const feature = {
      id: "test:feature:secrets", kind: "class-feature", name: "Secrets", source: "test",
      spellListAdditions: [{ class: "test:class:bard", fromClasses: ["test:class:cleric"] }],
    } as Element;
    const c = resolve({
      content: testIndex([TEST_BOOK, cleric, bardWith({ "1": { grants: [feature.id] } }), feature, ...spells]),
      build: build({ levels: [{ class: "test:class:bard", hp: "average", choices: {} }] }),
    });
    expect(bard(c).listAdditions.lists).toEqual(["cleric-spell"]);
  });

  it("reports a spell or class that does not exist, and carries on", () => {
    const c = character(lvl1({ spells: ["test:spell:nope"], fromClasses: ["test:class:nope"] }));
    expect(c.diagnostics.filter((d) => d.code === "unresolved-reference")).toHaveLength(2);
  });

  it("says so when nothing says which class", () => {
    const species = { id: "test:species:odd", kind: "species", name: "Odd", source: "test", spellListAdditions: [{ spells: ["test:spell:sanctuary"] }] } as Element;
    const c = resolve({
      content: testIndex([TEST_BOOK, cleric, bardWith({}), species, ...spells]),
      build: build({ species: species.id, levels: [{ class: "test:class:bard", hp: "average", choices: {} }] }),
    });
    expect(c.diagnostics.map((d) => d.code)).toContain("unknown-part");
  });
});

describe("validating spellListAdditions", () => {
  const check = (spellListAdditions: unknown) => validateElement({ id: "a", kind: "feature", name: "A", source: "srd", spellListAdditions });

  it("accepts spells, class lists, and an explicit class", () => {
    expect(check([{ class: "srd:class:bard", spells: ["srd:spell:a"], fromClasses: ["srd:class:wizard"] }]).diagnostics).toEqual([]);
  });

  it("refuses ids that are not a list of strings", () => {
    expect(check([{ spells: "srd:spell:a" }]).usable).toBe(false);
    expect(check({}).usable).toBe(false);
  });

  it("warns about an addition that adds nothing", () => {
    expect(check([{}]).diagnostics.map((d) => d.code)).toEqual(["invalid-element"]);
  });

  it("is read inside a level entry", () => {
    const r = validateElement({ id: "c", kind: "class", name: "C", source: "srd", hitDie: "d8", levels: { "1": { spellListAdditions: [{ spells: 3 }] } } });
    expect(r.usable).toBe(false);
  });
});
