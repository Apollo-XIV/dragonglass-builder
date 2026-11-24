/**
 * The Spells page's sources: how stat sets group, what each chip filters to, and which slots
 * each source owns. The four characters are the cases the header exists for.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import {
  ALL_SOURCES,
  effectiveSelection,
  setStat,
  sourcesOfSpell,
  spellSources,
  spellsView,
  statSets,
  type SpellSource,
} from "../src/core/resolver/spell-sources";
import type { Element, SpellEntry } from "../src/core/types";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const spell = (n: string, spellLevel: number, tags: string[]): Element =>
  ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel, tags }) as Element;

const caster = (key: string, name: string, ability: string, progression: string, list: string): Element =>
  ({
    id: `test:class:${key}`, kind: "class", name, source: "test", key, hitDie: "d8",
    spellcasting: { ability, progression, type: "prepared", list },
    levels: { "1": {}, "2": {}, "3": {} },
  }) as Element;

const WIZARD = caster("wizard", "Wizard", "int", "full", "wizard-spell");
const CLERIC = caster("cleric", "Cleric", "wis", "full", "cleric-spell");
const WARLOCK = caster("warlock", "Warlock", "cha", "pact", "warlock-spell");

const ability = (a: string): Element =>
  ({ id: `test:casting-ability:${a}`, kind: "casting-ability", name: a, source: "test", ability: a }) as Element;

const INITIATE: Element = {
  id: "test:feat:magic-initiate", kind: "feat", name: "Magic Initiate", source: "test",
  choices: [
    { id: "ability", count: 1, from: { kind: "casting-ability" } },
    { id: "spell", count: 1, from: { kind: "spell", tags: ["wizard-spell"] } },
  ],
  innateSpells: [{ spell: { choice: "spell" }, ability: { choice: "ability" } }],
} as Element;

/** Raises the Wizard's save DC alone, so it matches nothing else on the sheet. */
const FOCUS: Element = {
  id: "test:item:focus", kind: "feat", name: "Focus", source: "test",
  modifiers: [{ target: "spellcasting.wizard.dc", op: "add", value: 1 }],
} as Element;

const content = testIndex([
  TEST_BOOK, WIZARD, CLERIC, WARLOCK, INITIATE, FOCUS,
  ability("int"), ability("wis"), ability("cha"),
  spell("shield", 1, ["wizard-spell"]), spell("sleep", 1, ["wizard-spell"]),
  spell("bless", 1, ["cleric-spell"]), spell("hex", 1, ["warlock-spell"]),
]);

const entry = (n: string, cls: string): SpellEntry => ({ id: `test:spell:${n}`, class: `test:class:${cls}`, prepared: true });
const initiate = (ab: string, pick = "sleep") => ({
  "ability": [`test:casting-ability:${ab}`],
  "spell": [`test:spell:${pick}`],
});

function character(
  levels: string[],
  spells: SpellEntry[],
  extra: Partial<Parameters<typeof build>[0]> = {},
) {
  const c = resolve({
    content,
    build: build({
      abilities: { method: "manual", base: scores({ int: 16, wis: 14, cha: 12 }) },
      levels: levels.map((cls) => ({ class: `test:class:${cls}`, hp: "average" as const, choices: {} })),
      ...extra,
    }),
    spells: { kind: "spells", schemaVersion: 1, spells },
  });
  return c.spellcasting!;
}

const wizardAlone = () => character(["wizard", "wizard", "wizard"], [entry("shield", "wizard")]);
const wizardAndInitiate = () =>
  character(["wizard", "wizard", "wizard"], [entry("shield", "wizard")], {
    background: INITIATE.id,
    choices: initiate("int"),
  });
const clericAndInitiate = () =>
  character(["cleric", "cleric", "cleric"], [entry("bless", "cleric")], {
    background: INITIATE.id,
    choices: initiate("int"),
  });
const warlockAndWizard = () =>
  character(["warlock", "warlock", "wizard", "wizard"], [entry("hex", "warlock"), entry("shield", "wizard")]);

const names = (view: ReturnType<typeof spellsView>) => view.sets.map((s) => `${s.label} · ${s.ability.toUpperCase()}`);

describe("a single source", () => {
  it("shows its one stat set and no chips", () => {
    const view = spellsView(wizardAlone(), ALL_SOURCES);
    expect(view.showChips).toBe(false);
    expect(names(view)).toEqual(["Wizard · INT"]);
    expect(view.sets[0]).toMatchObject({ dc: 8 + 2 + 3, attack: 2 + 3 });
  });

  it("owns the shared slots", () => {
    const view = spellsView(wizardAlone(), ALL_SOURCES);
    expect(view.slots.length).toBeGreaterThan(0);
    expect(view.noSlots).toBe(false);
  });
});

describe("identical stats", () => {
  it("merge into one set, but still count as two sources for the chips", () => {
    const view = spellsView(wizardAndInitiate(), ALL_SOURCES);
    expect(view.sources.map((s) => s.name)).toEqual(["Wizard", "Magic Initiate"]);
    expect(view.showChips).toBe(true);
    expect(names(view)).toEqual(["Wizard + Magic Initiate · INT"]);
  });

  it("show a single label once filtered to a merged member, with the same numbers", () => {
    const all = spellsView(wizardAndInitiate(), ALL_SOURCES);
    const view = spellsView(wizardAndInitiate(), "test:feat:magic-initiate");
    expect(names(view)).toEqual(["Magic Initiate · INT"]);
    expect(view.sets[0]).toMatchObject({ dc: all.sets[0]!.dc, attack: all.sets[0]!.attack });
  });
});

describe("the same ability with a different figure", () => {
  it("stays two sets", () => {
    const view = spellsView(
      character(["wizard", "wizard", "wizard"], [entry("shield", "wizard")], {
        background: INITIATE.id,
        species: FOCUS.id,
        choices: initiate("int"),
      }),
      ALL_SOURCES,
    );
    expect(names(view)).toEqual(["Wizard · INT", "Magic Initiate · INT"]);
    expect(view.sets[0]!.dc).toBe(view.sets[1]!.dc + 1);
  });
});

describe("a different ability", () => {
  it("is a separate set, one per source", () => {
    const view = spellsView(clericAndInitiate(), ALL_SOURCES);
    expect(names(view)).toEqual(["Cleric · WIS", "Magic Initiate · INT"]);
    expect(view.sets.map((s) => s.dc)).toEqual([8 + 2 + 2, 8 + 2 + 3]);
  });
});

describe("filtering by source", () => {
  it("lists only the spells the source casts", () => {
    const view = spellsView(clericAndInitiate(), "test:feat:magic-initiate");
    expect(view.spells.map((s) => s.name)).toEqual(["sleep"]);
    expect(spellsView(clericAndInitiate(), "test:class:cleric").spells.map((s) => s.name)).toEqual(["bless"]);
  });

  it("attributes a spell to every source that grants it", () => {
    const casting = character(["wizard", "wizard", "wizard"], [entry("sleep", "wizard")], {
      background: INITIATE.id,
      choices: initiate("int", "sleep"),
    });
    const sleep = casting.spells.find((s) => s.name === "sleep")!;
    expect(sourcesOfSpell(sleep, spellSources(casting)).sort()).toEqual(["test:class:wizard", "test:feat:magic-initiate"]);
  });
});

describe("slot ownership", () => {
  it("keeps the shared pool and drops pact slots when filtered to the Wizard", () => {
    const view = spellsView(warlockAndWizard(), "test:class:wizard");
    expect(view.slots.length).toBeGreaterThan(0);
    expect(view.pact).toBeUndefined();
  });

  it("keeps pact slots and drops the shared pool when filtered to the Warlock", () => {
    const view = spellsView(warlockAndWizard(), "test:class:warlock");
    expect(view.slots).toEqual([]);
    expect(view.pact).toBeDefined();
  });

  it("shows both under All", () => {
    const view = spellsView(warlockAndWizard(), ALL_SOURCES);
    expect(view.slots.length).toBeGreaterThan(0);
    expect(view.pact).toBeDefined();
  });

  it("gives a feat none, so the row collapses", () => {
    const view = spellsView(clericAndInitiate(), "test:feat:magic-initiate");
    expect(view.slots).toEqual([]);
    expect(view.pact).toBeUndefined();
    expect(view.noSlots).toBe(true);
  });

  it("keeps a shared pool when any enabled source contributes to it", () => {
    const view = spellsView(clericAndInitiate(), ALL_SOURCES);
    expect(view.noSlots).toBe(false);
  });
});

describe("the selection", () => {
  const sources = (): SpellSource[] => spellSources(clericAndInitiate());

  it("falls back to All when the selected source is gone", () => {
    expect(effectiveSelection("test:class:warlock", sources())).toBe(ALL_SOURCES);
    expect(spellsView(clericAndInitiate(), "test:class:warlock").selected).toBe(ALL_SOURCES);
  });

  it("is All with a single source, whatever was selected", () => {
    expect(effectiveSelection("test:class:wizard", spellSources(wizardAlone()))).toBe(ALL_SOURCES);
  });

  it("survives a merged set splitting and re-merging, since it is keyed by source", () => {
    const merged = wizardAndInitiate();
    const split = character(["wizard", "wizard", "wizard"], [entry("shield", "wizard")], {
      background: INITIATE.id,
      species: FOCUS.id,
      choices: initiate("int"),
    });
    const id = "test:feat:magic-initiate";
    expect(spellsView(merged, id).selected).toBe(id);
    expect(spellsView(split, id).selected).toBe(id);
    expect(names(spellsView(split, id))).toEqual(["Magic Initiate · INT"]);
  });
});

describe("grouping", () => {
  const src = (id: string, ability: "int" | "wis", dc: number, attack: number): SpellSource => ({
    id, name: id, ability, dc, attack, slots: "none",
  });

  it("needs all three of ability, DC and attack to match", () => {
    expect(statSets([src("a", "int", 13, 5), src("b", "int", 13, 5)])).toHaveLength(1);
    expect(statSets([src("a", "int", 13, 5), src("b", "int", 14, 5)])).toHaveLength(2);
    expect(statSets([src("a", "int", 13, 5), src("b", "int", 13, 6)])).toHaveLength(2);
    expect(statSets([src("a", "int", 13, 5), src("b", "wis", 13, 5)])).toHaveLength(2);
  });

  it("explains an innate source's numbers from the proficiency bonus", () => {
    const [set] = statSets(spellSources(clericAndInitiate()).filter((s) => s.id.includes("feat")));
    expect(setStat(set!, "dc", 2).breakdown.map((r) => r.value)).toEqual([8, 3, 2]);
    expect(setStat(set!, "attack", 2).breakdown.map((r) => r.value)).toEqual([2, 3]);
  });
});
