/**
 * A language, skill or tool the character already has is marked on the option that
 * would give it again, with where it is from, rather than left out.
 *
 * "Already has" means from the base build, anywhere but the picker in question: a
 * species that grants the element, one that states it inline, another picker's answer.
 * Not inventory, and not a modifier that only applies sometimes. What the picker has
 * itself chosen is not held against it, so a duplicate already in a file stays listed.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import type { Element, InventoryFile, ProficiencyLevel } from "../src/core/types";
import { build, testIndex, TEST_BOOK, withUids } from "./helpers";

const language = (name: string): Element => ({
  id: `test:language:${name.toLowerCase()}`,
  kind: "language",
  name,
  source: "test",
  tags: ["standard-language"],
  modifiers: [{ target: "languages", op: "include", value: [name] }],
});
const [common, dwarvish, elvish, giant] = ["Common", "Dwarvish", "Elvish", "Giant"].map(language);

const skill = (key: string, level: ProficiencyLevel = "proficient"): Element => ({
  id: `test:skill:${key}`,
  kind: "skill",
  name: key[0].toUpperCase() + key.slice(1),
  source: "test",
  ability: "dex",
  modifiers: [{ target: `skills.${key}`, op: "proficiency", value: level }],
});
const [stealth, arcana] = ["stealth", "arcana"].map((k) => skill(k));
/** Expertise as an option: what a Rogue picks. */
const stealthExpertise = skill("stealth", "expertise");
stealthExpertise.id = "test:expertise:stealth";
stealthExpertise.kind = "feature";
delete (stealthExpertise as { ability?: string }).ability;

const tool = (name: string): Element => ({
  id: `test:tool:${name}`,
  kind: "tool",
  name: name[0].toUpperCase() + name.slice(1),
  source: "test",
  modifiers: [{ target: "proficiencies.tool", op: "include", value: [`test:tool:${name}`] }],
});
const [lute, flute] = ["lute", "flute"].map(tool);

const choice = (id: string, kind: string, count = 1): NonNullable<Element["choices"]> => [{ id, count, from: { kind } }];

const species: Element = {
  id: "test:species:granting",
  kind: "species",
  name: "Granting",
  source: "test",
  grants: [common.id, stealth.id, lute.id],
  choices: [...choice("sp:language", "language"), ...choice("sp:skill", "skill"), ...choice("sp:tool", "tool")],
};

/** States its languages inline, as hand-written content may. */
const inline: Element = {
  id: "test:species:inline",
  kind: "species",
  name: "Inline",
  source: "test",
  modifiers: [{ target: "languages", op: "include", value: ["Common", "Dwarvish"] }],
  choices: choice("in:language", "language"),
};

const background: Element = {
  id: "test:background:sage",
  kind: "background",
  name: "Sage",
  source: "test",
  choices: [...choice("bg:language", "language"), ...choice("bg:skill", "skill")],
};

/** Gives a skill only while a condition holds. */
const conditional: Element = {
  id: "test:feature:sneaky",
  kind: "feature",
  name: "Sneaky",
  source: "test",
  grants: [],
  modifiers: [{ target: "skills.arcana", op: "proficiency", value: "proficient", when: { text: "in the dark" } }],
};
const withConditional: Element = { ...species, id: "test:species:conditional", grants: [conditional.id] };

const ring: Element = {
  id: "test:item:ring",
  kind: "item",
  name: "Ring of Tongues",
  source: "test",
  modifiers: [{ target: "languages", op: "include", value: ["Giant"] }],
};

const index = testIndex([
  TEST_BOOK, common, dwarvish, elvish, giant, stealth, arcana, stealthExpertise, lute, flute,
  species, inline, background, conditional, withConditional, ring,
]);

function held(
  speciesId: string,
  choiceId: string,
  extra: Partial<Parameters<typeof build>[0]> = {},
): Record<string, string | undefined> {
  const r = resolve({ content: index, build: build({ species: speciesId, ...extra }) });
  const options = r.pendingChoices.find((c) => c.id === choiceId)!.options;
  return Object.fromEntries(options.map((o) => [o.name, o.heldBy]));
}

describe("languages already held", () => {
  it("marks a language another element grants, and names where it is from", () => {
    expect(held(species.id, "sp:language")).toEqual({
      Common: "Granting", Dwarvish: undefined, Elvish: undefined, Giant: undefined,
    });
  });

  it("marks a language a modifier names, with no element behind it", () => {
    expect(held(inline.id, "in:language")).toMatchObject({
      Common: "Inline", Dwarvish: "Inline", Elvish: undefined,
    });
  });

  it("matches a language name without regard to case", () => {
    const lower: Element = { ...inline, id: "test:species:lower", modifiers: [{ target: "languages", op: "include", value: ["common"] }] };
    const r = resolve({ content: testIndex([TEST_BOOK, common, dwarvish, lower]), build: build({ species: lower.id }) });
    const options = r.pendingChoices.find((c) => c.id === "in:language")!.options;
    expect(options.find((o) => o.name === "Common")?.heldBy).toBe("Inline");
  });

  it("marks what another picker was answered with, naming what offered it", () => {
    const marks = held(species.id, "bg:language", {
      background: background.id,
      choices: { "sp:language": [elvish.id] },
    });
    expect(marks.Elvish).toBe("Granting");
    expect(marks.Dwarvish).toBeUndefined();
  });

  it("does not hold a picker's own answer against it", () => {
    const marks = held(species.id, "sp:language", { choices: { "sp:language": [elvish.id] } });
    expect(marks.Elvish).toBeUndefined();
  });

  it("keeps a duplicate listed and valid", () => {
    const r = resolve({ content: index, build: build({ species: species.id, choices: { "sp:language": [common.id] } }) });
    const c = r.pendingChoices.find((p) => p.id === "sp:language")!;
    expect(c.invalid).toEqual([]);
    expect(c.options.find((o) => o.name === "Common")!.heldBy).toBe("Granting");
  });
});

describe("skills and tools already held", () => {
  it("marks a skill proficiency the character has", () => {
    expect(held(species.id, "sp:skill")).toMatchObject({ Stealth: "Granting", Arcana: undefined });
  });

  it("marks a tool the character has, and only that tool", () => {
    expect(held(species.id, "sp:tool")).toEqual({ Lute: "Granting", Flute: undefined });
  });

  it("marks a skill that another picker took", () => {
    const marks = held(species.id, "bg:skill", { background: background.id, choices: { "sp:skill": [arcana.id] } });
    expect(marks.Arcana).toBe("Granting");
  });

  it("lets expertise in a skill cover the proficiency", () => {
    const expert: Element = { ...species, id: "test:species:expert", grants: [stealthExpertise.id] };
    const idx = testIndex([TEST_BOOK, stealth, arcana, stealthExpertise, expert]);
    const r = resolve({ content: idx, build: build({ species: expert.id }) });
    const options = r.pendingChoices.find((c) => c.id === "sp:skill")!.options;
    expect(options.find((o) => o.name === "Stealth")!.heldBy).toBe("Granting");
  });

  it("offers expertise in a skill held only as proficiency", () => {
    const picker: Element = {
      ...species,
      id: "test:species:picker",
      choices: [{ id: "sp:expertise", count: 1, from: { ids: [stealthExpertise.id] } }],
    };
    const idx = testIndex([TEST_BOOK, stealth, stealthExpertise, picker]);
    const r = resolve({ content: idx, build: build({ species: picker.id }) });
    expect(r.pendingChoices.find((c) => c.id === "sp:expertise")!.options[0].heldBy).toBeUndefined();
  });
});

describe("what does not count as held", () => {
  it("ignores a modifier that only applies sometimes", () => {
    const marks = held(withConditional.id, "sp:skill");
    expect(marks.Arcana).toBeUndefined();
  });

  it("ignores inventory", () => {
    const inventory: InventoryFile = {
      kind: "inventory",
      schemaVersion: 1,
      items: withUids([{ id: ring.id, equipped: true }]),
      currency: {},
    };
    const r = resolve({ content: index, build: build({ species: inline.id }), inventory });
    // The ring does give the language: it is held in play, just not by the build.
    expect([...(r.sets.languages?.values ?? [])]).toContain("Giant");
    const giant = r.pendingChoices.find((c) => c.id === "in:language")!.options.find((o) => o.name === "Giant")!;
    expect(giant.heldBy).toBeUndefined();
  });
});
