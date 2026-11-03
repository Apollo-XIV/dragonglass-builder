/**
 * Spell limits, driven only by the `spellcasting` block. The classes here are
 * synthetic and generic: a limit has to come from the data, never from a class's name.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import type { Element, SpellEntry } from "../src/core/types";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const spell = (n: string, spellLevel: number): Element =>
  ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel, tags: ["book-spell", "pact-spell"] }) as Element;

const SPELLS = [spell("light", 0), spell("mage-hand", 0), spell("bless", 1), spell("sleep", 1), spell("fireball", 3), spell("wish", 9)];

/** Six spells at 1st level and two per level after, like a spellbook. */
const BOOK: Element = {
  id: "test:class:book", kind: "class", name: "Bookish", source: "test", key: "book", hitDie: "d6",
  spellcasting: {
    ability: "int", progression: "full", type: "spellbook", list: "book-spell",
    cantrips: "@table(book, cantrips)", prepared: "@level(book) + @abilities.int.mod", spellbook: "@table(book, size)",
    extra: [{ level: 2, choose: 1, spellLevels: [3] }],
  },
  tables: { cantrips: [3, 3, 3], size: [6, 8, 10] },
  levels: { "1": {}, "2": {}, "3": {} },
} as Element;

const PACT: Element = {
  id: "test:class:pact", kind: "class", name: "Pactish", source: "test", key: "pact", hitDie: "d8",
  spellcasting: { ability: "cha", progression: "pact", type: "known", list: "pact-spell", known: "@table(pact, known)" },
  tables: { known: [2, 3, 4, 5, 6] },
  levels: { "1": {}, "2": {}, "3": {}, "4": {}, "5": {} },
} as Element;

const content = testIndex([TEST_BOOK, BOOK, PACT, ...SPELLS]);
const abilities = { method: "manual" as const, base: scores({ int: 14, cha: 14 }) };

function character(cls: string, level: number, spells: SpellEntry[]) {
  return resolve({
    content,
    build: build({
      abilities,
      level,
      levels: Array.from({ length: level }, () => ({ class: cls, hp: "average" as const, choices: {} })),
    }),
    spells: { kind: "spells", schemaVersion: 1, spells },
  });
}
const entry = (n: string, more: Partial<SpellEntry> = {}): SpellEntry => ({ id: `test:spell:${n}`, ...more });

describe("what a class states", () => {
  it("resolves the caps from the class's own expressions", () => {
    const [l] = character("test:class:book", 2, []).spellcasting!.limits;
    expect(l!.cantrips.cap).toBe(3);
    expect(l!.spellbook.cap).toBe(8);
    expect(l!.prepared.cap).toBe(4); // level 2 + INT mod 2
  });

  it("leaves a cap the class does not state absent, not zero", () => {
    const [l] = character("test:class:book", 1, []).spellcasting!.limits;
    expect(l!.known.cap).toBeUndefined();
  });

  it("unlocks extra picks as the class level reaches them", () => {
    expect(character("test:class:book", 1, []).spellcasting!.limits[0]!.extraPicks).toEqual([]);
    expect(character("test:class:book", 2, []).spellcasting!.limits[0]!.extraPicks).toHaveLength(1);
  });
});

describe("the highest spell level", () => {
  it("follows the slots a full caster holds", () => {
    expect(character("test:class:book", 1, []).spellcasting!.limits[0]!.maxSpellLevel).toBe(1);
    expect(character("test:class:book", 3, []).spellcasting!.limits[0]!.maxSpellLevel).toBe(2);
  });

  it("follows the pact slot level for a pact caster", () => {
    expect(character("test:class:pact", 1, []).spellcasting!.limits[0]!.maxSpellLevel).toBe(1);
    expect(character("test:class:pact", 5, []).spellcasting!.limits[0]!.maxSpellLevel).toBe(3);
  });
});

describe("counting", () => {
  it("counts cantrips and leveled spells apart", () => {
    const [l] = character("test:class:book", 1, [entry("light"), entry("bless"), entry("sleep")]).spellcasting!.limits;
    expect(l!.cantrips.used).toBe(1);
    expect(l!.spellbook.used).toBe(2);
  });

  it("never counts an extra spell against any limit", () => {
    const c = character("test:class:book", 1, [entry("bless"), entry("sleep", { extra: true })]);
    const [l] = c.spellcasting!.limits;
    expect(l!.spellbook.used).toBe(1);
    expect(l!.extras).toBe(1);
  });

  it("does not count a prepared spell that was granted", () => {
    const [l] = character("test:class:book", 1, [entry("bless", { alwaysPrepared: true })]).spellcasting!.limits;
    expect(l!.prepared.used).toBe(0);
    expect(l!.spellbook.used).toBe(0);
  });
});

describe("diagnostics", () => {
  const codes = (c: ReturnType<typeof character>) => c.diagnostics.map((d) => d.code);

  it("warns when a known caster holds more than it knows", () => {
    const c = character("test:class:pact", 1, [entry("bless"), entry("sleep"), entry("fireball")]);
    expect(codes(c)).toContain("spells-over-limit");
  });

  it("is quiet at the limit", () => {
    const c = character("test:class:pact", 1, [entry("bless"), entry("sleep")]);
    expect(codes(c)).not.toContain("spells-over-limit");
  });

  it("warns about a spell above the highest castable level", () => {
    const c = character("test:class:book", 1, [entry("fireball")]);
    expect(codes(c)).toContain("spell-level-too-high");
  });

  it("does not call an extra spell from another list a mismatch", () => {
    const off: Element = { ...spell("off-list", 1), tags: [] } as Element;
    const withOff = testIndex([TEST_BOOK, BOOK, PACT, ...SPELLS, off]);
    const run = (extra: boolean) =>
      resolve({
        content: withOff,
        build: build({ abilities, level: 1, levels: [{ class: "test:class:book", hp: "average", choices: {} }] }),
        spells: { kind: "spells", schemaVersion: 1, spells: [entry("off-list", { class: "test:class:book", extra })] },
      }).diagnostics.map((d) => d.code);
    expect(run(false)).toContain("spell-mismatch");
    expect(run(true)).not.toContain("spell-mismatch");
  });

  it("lets an extra spell be higher, as Mystic Arcanum is", () => {
    const c = character("test:class:pact", 1, [entry("wish", { extra: true })]);
    expect(codes(c)).not.toContain("spell-level-too-high");
  });
});
