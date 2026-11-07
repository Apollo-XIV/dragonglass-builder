/**
 * Spells a character has without choosing them from the class: granted ones (always
 * prepared, uncounted) and innate ones (cast without a slot, at will or on a pool of
 * their own).
 */

import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import { resolve } from "../src/core/resolver/resolve";
import type { Element, SpellEntry, StateFile } from "../src/core/types";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const spell = (n: string, spellLevel: number, tags = ["pact-spell"]): Element =>
  ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel, tags }) as Element;

const PACT: Element = {
  id: "test:class:pact", kind: "class", name: "Pactish", source: "test", key: "pact", hitDie: "d8",
  spellcasting: { ability: "cha", progression: "pact", type: "known", list: "pact-spell", known: 2 },
  levels: {
    "1": {
      grants: ["test:feature:patron"],
      // No ability given: the class's casting ability stands in.
      innateSpells: [{ spell: "test:spell:mage-armor", notes: "On yourself, without a slot." }],
    },
  },
} as Element;

/** Sanctuary is not on the pact list: patron spells rarely are. */
const PATRON: Element = {
  id: "test:feature:patron", kind: "class-feature", name: "Patron Spells", source: "test",
  grants: ["test:spell:sanctuary"],
} as Element;

const IMP: Element = {
  id: "test:species:imp", kind: "species", name: "Imp", source: "test",
  innateSpells: [
    { spell: "test:spell:light", ability: "int" },
    {
      spell: "test:spell:misty-step",
      ability: "cha",
      uses: 1,
      recharge: [{ on: "long-rest", amount: "all" }],
    },
  ],
} as Element;

const content = testIndex([
  TEST_BOOK, PACT, PATRON, IMP,
  spell("light", 0), spell("sleep", 1), spell("mage-armor", 1, ["wizard-spell"]), spell("misty-step", 2),
  spell("sanctuary", 1, ["cleric-spell"]),
]);

function character(spells: SpellEntry[] = [], over: { species?: string; state?: StateFile } = {}) {
  return resolve({
    content,
    build: build({
      abilities: { method: "manual", base: scores({ int: 14, cha: 16 }) },
      species: over.species,
      levels: [{ class: "test:class:pact", hp: "average", choices: {} }],
    }),
    spells: { kind: "spells", schemaVersion: 1, spells },
    state: over.state,
  });
}
const entry = (n: string): SpellEntry => ({ id: `test:spell:${n}` });
const find = (c: ReturnType<typeof character>, n: string) => c.spellcasting!.spells.find((s) => s.id === `test:spell:${n}`);
const codes = (c: ReturnType<typeof character>) => c.diagnostics.map((d) => d.code);

describe("a granted spell", () => {
  it("is always prepared, whatever list it is on", () => {
    const c = character();
    expect(find(c, "sanctuary")).toMatchObject({ alwaysPrepared: true, prepared: true, innateOnly: false });
    expect(codes(c)).not.toContain("spell-mismatch");
  });

  it("takes no room against the class's limits", () => {
    const c = character([entry("sleep"), entry("mage-armor")]);
    expect(c.spellcasting!.limits[0]!.known).toEqual({ cap: 2, used: 2 });
    expect(codes(c)).not.toContain("spells-over-limit");
  });

  it("still warns about a chosen spell that is off the list", () => {
    const off = testIndex([TEST_BOOK, PACT, PATRON, spell("sanctuary", 1, ["cleric-spell"]), spell("stray", 1, ["cleric-spell"]), spell("mage-armor", 1)]);
    const c = resolve({
      content: off,
      build: build({ levels: [{ class: "test:class:pact", hp: "average", choices: {} }] }),
      spells: { kind: "spells", schemaVersion: 1, spells: [{ ...entry("stray"), class: "test:class:pact" }] },
    });
    expect(codes(c)).toContain("spell-mismatch");
  });
});

describe("an innate spell", () => {
  it("is listed, but neither prepared, picked nor counted", () => {
    const c = character([], { species: "test:species:imp" });
    expect(find(c, "light")).toMatchObject({ innateOnly: true, prepared: false, alwaysPrepared: false });
    expect(c.spellcasting!.limits[0]).toMatchObject({ known: { used: 0 }, cantrips: { used: 0 } });
    expect(codes(c)).not.toContain("spell-mismatch");
    expect(codes(c)).not.toContain("spell-level-too-high");
  });

  it("is cast at will when it has no uses, with a DC from its own ability", () => {
    const [innate] = find(character([], { species: "test:species:imp" }), "light")!.innate;
    expect(innate).toMatchObject({ source: "test:species:imp", ability: "int", dc: 12, attack: 4 });
    expect(innate!.resource).toBeUndefined();
  });

  it("falls back to the class's ability when the part gives none", () => {
    const c = character();
    const [innate] = find(c, "mage-armor")!.innate;
    expect(codes(c)).not.toContain("spell-mismatch"); // off the pact list, and granted by the class itself
    expect(innate).toMatchObject({ source: "test:class:pact", ability: "cha", dc: 13, notes: "On yourself, without a slot." });
  });

  it("owns a pool when it has uses, recharged by the same rules as any resource", () => {
    const key = "test:species:imp:innate-misty-step";
    const fresh = character([], { species: "test:species:imp" });
    expect(find(fresh, "misty-step")!.innate[0]!.resource).toBe(key);
    expect(fresh.resources.find((r) => r.key === key)).toMatchObject({
      name: "misty-step", max: 1, remaining: 1, recharge: [{ on: "long-rest", amount: "all" }],
    });

    const state = (...events: StateFile["events"]): StateFile => ({
      kind: "state", schemaVersion: 1, checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] }, events,
    });
    const spent = character([], { species: "test:species:imp", state: state({ t: "t", type: "spend", target: key, amount: 1 }) });
    expect(spent.resources.find((r) => r.key === key)?.remaining).toBe(0);
    const rested = character([], {
      species: "test:species:imp",
      state: state({ t: "t", type: "spend", target: key, amount: 1 }, { t: "t", type: "rest.long" }),
    });
    expect(rested.resources.find((r) => r.key === key)?.remaining).toBe(1);
  });

  it("is an ordinary pick as well when the spellbook holds it", () => {
    const imp = testIndex([TEST_BOOK, PACT, PATRON, spell("sleep", 1), spell("mage-armor", 1), spell("light", 0), spell("misty-step", 2), spell("sanctuary", 1, ["cleric-spell"]),
      { ...IMP, innateSpells: [{ spell: "test:spell:sleep", ability: "cha" }] } as Element]);
    const c = resolve({
      content: imp,
      build: build({ species: "test:species:imp", levels: [{ class: "test:class:pact", hp: "average", choices: {} }] }),
      spells: { kind: "spells", schemaVersion: 1, spells: [entry("sleep")] },
    });
    const sleep = c.spellcasting!.spells.find((s) => s.id === "test:spell:sleep")!;
    expect(sleep.innateOnly).toBe(false);
    expect(sleep.innate).toHaveLength(1);
    expect(c.spellcasting!.limits[0]!.known.used).toBe(1);
  });

  it("reports a spell that does not exist, and keeps going", () => {
    const bad = testIndex([TEST_BOOK, { ...IMP, innateSpells: [{ spell: "test:spell:nope" }] } as Element]);
    const c = resolve({ content: bad, build: build({ species: "test:species:imp" }) });
    expect(c.diagnostics.map((d) => d.code)).toContain("unresolved-reference");
  });
});

describe("validating innateSpells", () => {
  const check = (innateSpells: unknown) =>
    validateElement({ id: "a", kind: "feat", name: "A", source: "srd", innateSpells });

  it("accepts at-will and limited casts", () => {
    expect(check([{ spell: "srd:spell:light" }, { spell: "srd:spell:misty-step", uses: "@prof", recharge: [{ on: "long-rest", amount: "all" }] }]).diagnostics).toEqual([]);
  });

  it("refuses an entry with no spell", () => {
    expect(check([{ uses: 1 }]).usable).toBe(false);
    expect(check({}).usable).toBe(false);
  });

  it("warns on an unknown ability and a recharge with nothing to recharge", () => {
    const r = check([{ spell: "srd:spell:light", ability: "luck", recharge: [{ on: "dawn", amount: "all" }] }]);
    expect(r.usable).toBe(true);
    expect(r.diagnostics.map((d) => d.path)).toEqual(expect.arrayContaining(["innateSpells[0].ability", "innateSpells[0].recharge"]));
  });

  it("is read inside a level entry too", () => {
    const r = validateElement({ id: "c", kind: "class", name: "C", source: "srd", hitDie: "d8", levels: { "1": { innateSpells: [{ uses: 1 }] } } });
    expect(r.usable).toBe(false);
  });
});
