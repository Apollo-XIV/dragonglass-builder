/**
 * Weapon mastery picks: a choice whose options stand for weapons without being them.
 * The property text is written once, on the property, and read through the pick.
 */

import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import { resolve } from "../src/core/resolver/resolve";
import type { Element } from "../src/core/types";
import { build, TEST_BOOK, testIndex } from "./helpers";

const property = (key: string, text: string): Element =>
  ({ id: `test:mastery-property:${key}`, kind: "mastery-property", name: key[0]!.toUpperCase() + key.slice(1), source: "test", key, text }) as Element;

const pick = (weapon: string, name: string, key: string, tags: string[]): Element =>
  ({
    id: `test:mastery:${weapon}`, kind: "weapon-mastery", name, source: "test",
    weapon: `test:item:${weapon}`, mastery: `test:mastery-property:${key}`, tags: [...tags, `mastery:${key}`],
  }) as Element;

/** The real item carries a modifier, so collecting it would show up in the AC. */
const longsword: Element = {
  id: "test:item:longsword", kind: "item", name: "Longsword", source: "test", tags: ["weapon", "martial-weapon", "melee-weapon"],
  modifiers: [{ target: "ac", op: "add", value: 5 }],
} as Element;

const FIGHTER: Element = {
  id: "test:class:fighter", kind: "class", name: "Fighter", source: "test", key: "fighter", hitDie: "d10",
  levels: {
    "1": {
      choices: [
        {
          id: "test:fighter:masteries", name: "Weapon Mastery", count: 2,
          from: { kind: "weapon-mastery", tags: ["simple-weapon", "martial-weapon"], allTags: ["melee-weapon"] },
        },
      ],
    },
  },
} as Element;

const ELEMENTS = [
  TEST_BOOK, FIGHTER, longsword,
  property("sap", "If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll."),
  property("nick", "When you make the extra attack of the Light property, you can make it as part of the Attack action."),
  property("slow", "You can reduce the target's Speed by 10 feet."),
  pick("longsword", "Longsword", "sap", ["martial-weapon", "melee-weapon"]),
  pick("dagger", "Dagger", "nick", ["simple-weapon", "melee-weapon", "finesse", "light"]),
  pick("longbow", "Longbow", "slow", ["martial-weapon", "ranged-weapon"]),
];

const content = testIndex(ELEMENTS);
const character = (picks: string[]) =>
  resolve({
    content,
    build: build({
      levels: [{ class: "test:class:fighter", hp: "average", choices: picks.length ? { "test:fighter:masteries": picks } : {} }],
    }),
  });

describe("offering weapon masteries", () => {
  it("filters the pool by the weapon's own tags, as for any choice", () => {
    const choice = character([]).pendingChoices.find((c) => c.id === "test:fighter:masteries")!;
    expect(choice.options.map((o) => o.name).sort()).toEqual(["Dagger", "Longsword"]);
  });

  it("shows each option the text of its property", () => {
    const choice = character([]).pendingChoices.find((c) => c.id === "test:fighter:masteries")!;
    expect(choice.options.find((o) => o.name === "Dagger")!.text).toMatch(/^\*\*Nick\.\*\* When you make the extra attack/);
  });
});

describe("choosing weapon masteries", () => {
  const picked = character(["test:mastery:longsword", "test:mastery:dagger"]);

  it("lists the picks on the features tab with their property's text", () => {
    const masteries = picked.features["weapon-mastery"]!;
    expect(masteries.map((m) => m.name)).toEqual(["Longsword", "Dagger"]);
    expect(masteries[0]!.text).toMatch(/^\*\*Sap\.\*\* If you hit a creature/);
    expect(content.kindDef("weapon-mastery")?.tab).toBe("features");
  });

  it("never adds an item: the inventory is empty and the weapon's parts are not collected", () => {
    expect(picked.inventory).toEqual([]);
    expect(picked.elements.some((e) => e.kind === "item")).toBe(false);
    // The longsword item is worth +5 AC if it were collected.
    expect(picked.ac.value).toBe(character([]).ac.value);
  });

  it("keeps an own text over the property's", () => {
    const own = testIndex([...ELEMENTS, { ...pick("rapier", "Rapier", "nick", ["melee-weapon"]), text: "House rule." } as Element]);
    expect(own.get("test:mastery:rapier")?.text).toBe("House rule.");
    const r = resolve({
      content: own,
      build: build({ levels: [{ class: "test:class:fighter", hp: "average", choices: { "test:fighter:masteries": ["test:mastery:rapier"] } }] }),
    });
    expect(r.features["weapon-mastery"]![0]!.text).toBe("House rule.");
  });
});

describe("checking a pick", () => {
  const diagnosticsFor = (extra: Element) =>
    testIndex([...ELEMENTS, extra]).diagnostics.filter((d) => d.subject === extra.id);

  it("is quiet for a well-formed pick", () => {
    expect(testIndex(ELEMENTS).diagnostics.filter((d) => d.subject?.startsWith("test:mastery:"))).toEqual([]);
  });

  it("reports a property that is not loaded", () => {
    const d = diagnosticsFor({ ...pick("axe", "Axe", "cleave", []), tags: ["mastery:cleave"] } as Element);
    expect(d.map((x) => x.code)).toEqual(["unresolved-reference"]);
  });

  it("reports a mastery that is not a property", () => {
    const d = diagnosticsFor({ ...pick("axe", "Axe", "sap", []), mastery: "test:item:longsword" } as Element);
    expect(d[0]!.message).toMatch(/not a mastery-property/);
  });

  it("reports a pick missing its property's tag", () => {
    const d = diagnosticsFor({ ...pick("axe", "Axe", "sap", []), tags: ["melee-weapon"] } as Element);
    expect(d[0]!.message).toMatch(/mastery:sap/);
  });

  it("validates the shape of each kind", () => {
    const base = { id: "a", name: "A", source: "srd" };
    expect(validateElement({ ...base, kind: "weapon-mastery" }).diagnostics.map((d) => d.path)).toEqual(["mastery"]);
    expect(validateElement({ ...base, kind: "mastery-property" }).diagnostics.map((d) => d.path)).toEqual(["key", "text"]);
    expect(validateElement({ ...base, kind: "weapon-mastery", mastery: "x" }).usable).toBe(true);
  });
});
