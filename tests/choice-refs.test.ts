/**
 * What a choice reference can do: reach a choice declared anywhere in its owning element,
 * apply to every pick of a multi-pick choice, and make picks learned.
 */

import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import { collect } from "../src/core/resolver/collect";
import type { Element } from "../src/core/types";
import { resolve } from "../src/core/resolver/resolve";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

describe("a subclass's first level entry", () => {
  const sub = {
    id: "test:subclass:path", kind: "subclass", name: "Path", source: "test", class: "test:class:hero",
    levels: { "3": { choices: [{ id: "path-skill", count: 1, from: { kind: "skill" } }] } },
  } as Element;
  const hero = {
    id: "test:class:hero", kind: "class", name: "Hero", source: "test", hitDie: "d8",
    levels: { "3": { choices: [{ id: "path", count: 1, from: { kind: "subclass" } }] } },
  } as Element;
  const content = testIndex([TEST_BOOK, hero, sub]);
  const levels = (n: number) => Array.from({ length: n }, () => ({ class: hero.id, hp: "average" as const }));

  it("declares its choice once, at the level the subclass is gained", () => {
    const c = collect(content, build({ levels: levels(3), choices: { path: [sub.id] } }));
    expect(c.choices.filter((x) => x.definition.id === "path-skill")).toHaveLength(1);
  });

  it("declares it once at later levels too", () => {
    const c = collect(content, build({ levels: levels(5), choices: { path: [sub.id] } }));
    expect(c.choices.filter((x) => x.definition.id === "path-skill")).toHaveLength(1);
  });
});

const ability = (a: string): Element =>
  ({ id: `test:casting-ability:${a}`, kind: "casting-ability", name: a, source: "test", ability: a }) as Element;
const cantrip = (n: string): Element =>
  ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel: 0 }) as Element;
const hero = { id: "test:class:hero", kind: "class", name: "Hero", source: "test", hitDie: "d8" } as Element;
const heroLevels = (n: number) => Array.from({ length: n }, () => ({ class: hero.id, hp: "average" as const }));
const abilityOf = (c: ReturnType<typeof collect>, spell: string) =>
  c.innate.find((i) => i.def.spell === `test:spell:${spell}`)?.def.ability;

describe("a choice reference reaches anywhere in the owning element", () => {
  // Declared once at the element; used by two level entries and the element's own parts.
  const lineage = {
    id: "test:species:lineage", kind: "species", name: "Lineage", source: "test", levelsBy: "character",
    choices: [{ id: "ability", count: 1, from: { kind: "casting-ability" } }],
    innateSpells: [{ spell: "test:spell:light", ability: { choice: "ability" } }],
    levels: {
      "3": { innateSpells: [{ spell: "test:spell:shield", ability: { choice: "ability" } }] },
      "5": { innateSpells: [{ spell: "test:spell:sleep", ability: { choice: "ability" } }] },
    },
  } as Element;
  // Declared in the first level entry; used by a later one and by the element's own parts.
  const staged = {
    id: "test:species:staged", kind: "species", name: "Staged", source: "test", levelsBy: "character",
    innateSpells: [{ spell: "test:spell:light", ability: { choice: "ability" } }],
    levels: {
      "1": { choices: [{ id: "ability", count: 1, from: { kind: "casting-ability" } }] },
      "3": { innateSpells: [{ spell: "test:spell:shield", ability: { choice: "ability" } }] },
    },
  } as Element;
  const content = testIndex([
    TEST_BOOK, hero, lineage, staged, ability("int"), ability("wis"),
    cantrip("light"), cantrip("shield"), cantrip("sleep"),
  ]);

  it("reads a choice declared on the element from its level entries", () => {
    const c = collect(content, build({ species: lineage.id, levels: heroLevels(5), choices: { ability: ["test:casting-ability:wis"] } }));
    expect(["light", "shield", "sleep"].map((s) => abilityOf(c, s))).toEqual(["wis", "wis", "wis"]);
  });

  it("reads a choice declared in one level entry from another, and from the element's parts", () => {
    const b = build({ species: staged.id, levels: heroLevels(3) });
    b.levels![0]!.choices = { ability: ["test:casting-ability:int"] };
    const c = collect(content, b);
    expect(abilityOf(c, "shield")).toBe("int");
    expect(abilityOf(c, "light")).toBe("int");
  });

  it("is inert until the declaring entry's level is taken", () => {
    const c = collect(content, build({ species: staged.id, levels: heroLevels(2) }));
    expect(abilityOf(c, "light")).toBeUndefined();
  });
});

describe("validating a reference to a choice declared elsewhere in the element", () => {
  const choice = (id: string) => ({ id, count: 1, from: { kind: "casting-ability" } });
  const ref = { spell: "srd:spell:light", ability: { choice: "ability" } };
  const check = (over: Record<string, unknown>) =>
    validateElement({ id: "x", kind: "species", name: "X", source: "srd", ...over }).diagnostics;

  it("accepts an element-level choice used in a level entry", () => {
    expect(check({ choices: [choice("ability")], levelsBy: "character", levels: { "3": { innateSpells: [ref] } } })).toEqual([]);
  });

  it("accepts a level entry's choice used by the element's own parts", () => {
    expect(check({ innateSpells: [ref], levelsBy: "character", levels: { "1": { choices: [choice("ability")] } } })).toEqual([]);
  });

  it("accepts a choice from one level entry used in another", () => {
    expect(
      check({ levelsBy: "character", levels: { "1": { choices: [choice("ability")] }, "3": { innateSpells: [ref] } } }),
    ).toEqual([]);
  });

  it("still warns about a choice the element never declares", () => {
    const d = check({ choices: [choice("other")], levelsBy: "character", levels: { "3": { innateSpells: [ref] } } });
    expect(d.map((x) => x.code)).toEqual(["unresolved-reference"]);
  });
});

describe("a reference to a choice with several picks", () => {
  const initiate = {
    id: "test:feat:initiate", kind: "feat", name: "Initiate", source: "test",
    choices: [
      { id: "ability", count: 1, from: { kind: "casting-ability" } },
      { id: "cantrips", count: 2, from: { kind: "spell" } },
      { id: "spell", count: 1, from: { kind: "spell" } },
    ],
    innateSpells: [
      { spell: { choice: "cantrips" }, ability: { choice: "ability" } },
      { spell: { choice: "spell" }, ability: { choice: "ability" }, uses: 1, recharge: [{ on: "long-rest", amount: "all" }] },
    ],
  } as Element;
  const content = testIndex([
    TEST_BOOK, initiate, ability("int"), ability("wis"), cantrip("light"), cantrip("shield"), cantrip("sleep"),
  ]);
  const picks = {
    ability: ["test:casting-ability:wis"],
    cantrips: ["test:spell:light", "test:spell:shield"],
    spell: ["test:spell:sleep"],
  };
  const make = (choices: Record<string, string[]>) => collect(content, build({ background: initiate.id, choices }));

  it("applies the part to each pick", () => {
    const c = make(picks);
    expect(c.innate.map((i) => i.def.spell).sort()).toEqual(["test:spell:light", "test:spell:shield", "test:spell:sleep"]);
    expect(c.innate.map((i) => i.def.ability)).toEqual(["wis", "wis", "wis"]);
  });

  it("gives each pick its own pool when it has uses", () => {
    const c = make({ ...picks, spell: ["test:spell:sleep", "test:spell:light"] });
    expect(c.resources.map((r) => r.def.id).sort()).toEqual(["innate-light", "innate-sleep"]);
  });

  it("applies to the picks made so far when only some are made", () => {
    const c = make({ ...picks, cantrips: ["test:spell:light"] });
    expect(c.innate.filter((i) => i.def.uses === undefined).map((i) => i.def.spell)).toEqual(["test:spell:light"]);
  });

  it("casts every pick in the resolved character", () => {
    const c = resolve({
      content,
      build: build({ background: initiate.id, choices: picks, abilities: { method: "manual", base: scores({ wis: 16 }) } }),
    });
    const light = c.spellcasting?.spells.find((s) => s.id === "test:spell:light");
    const shield = c.spellcasting?.spells.find((s) => s.id === "test:spell:shield");
    expect(light!.innate[0]).toMatchObject({ ability: "wis", dc: 13 });
    expect(shield!.innate[0]).toMatchObject({ ability: "wis", dc: 13 });
  });
});
