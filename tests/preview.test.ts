import { describe, expect, it } from "vitest";
import { grantsPreview, previewOf } from "../src/core/content/preview";
import type { Element } from "../src/core/types";

const el = (id: string, kind: string, name: string, extra: Record<string, unknown> = {}): Element =>
  ({ id, kind, name, source: "t", ...extra }) as Element;

const elements = [
  el("t:spell:bless", "spell", "Bless", { spellLevel: 1 }),
  el("t:devotion:oath-of-devotion", "subclass-feature", "Oath of Devotion", {
    text: "Loftiest ideals.",
    grants: ["t:devotion:tenets", "t:devotion:channel-divinity"],
  }),
  el("t:devotion:tenets", "subclass-feature", "Tenets of Devotion", { text: "Honesty." }),
  el("t:devotion:channel-divinity", "subclass-feature", "Channel Divinity", {
    text: "Channel energy.",
    grants: ["t:devotion:sacred-weapon"],
  }),
  el("t:devotion:sacred-weapon", "subclass-feature", "Sacred Weapon", { text: "Imbue a weapon." }),
  el("t:devotion:aura", "subclass-feature", "Aura of Devotion", { text: "Can't be charmed." }),
];
const byId = new Map(elements.map((e) => [e.id, e]));
const get = (id: string): Element | undefined => byId.get(id);

const devotion = (extra: Record<string, unknown> = {}): Element =>
  el("t:subclass:oath-of-devotion", "subclass", "Oath of Devotion", {
    levels: {
      "3": { grants: ["t:devotion:oath-of-devotion", "t:spell:bless"] },
      "7": { grants: ["t:devotion:aura"], choices: [{ id: "c", name: "Fighting Style", count: 1, from: {} }] },
    },
    ...extra,
  });

describe("previewOf", () => {
  it("lists each level's features with their text, spells and choices apart", () => {
    const preview = previewOf(devotion(), get)!;
    expect(preview.levels.map((l) => l.level)).toEqual([3, 7]);
    expect(preview.levels[0]!.spells).toEqual(["Bless"]);
    expect(preview.levels[1]!.features.map((f) => [f.name, f.text])).toEqual([["Aura of Devotion", "Can't be charmed."]]);
    expect(preview.levels[1]!.choices).toEqual(["Fighting Style"]);
  });

  it("unwraps a namesake feature when the subclass has no text of its own", () => {
    const preview = previewOf(devotion(), get)!;
    expect(preview.intro).toBe("Loftiest ideals.");
    expect(preview.levels[0]!.features.map((f) => f.name)).toEqual(["Tenets of Devotion", "Channel Divinity"]);
    // A feature's own grants nest under it.
    expect(preview.levels[0]!.features[1]!.children.map((f) => f.name)).toEqual(["Sacred Weapon"]);
  });

  it("leaves the namesake alone when the subclass has its own text", () => {
    const preview = previewOf(devotion({ text: "Its own." }), get)!;
    expect(preview.intro).toBe("Its own.");
    expect(preview.levels[0]!.features.map((f) => f.name)).toEqual(["Oath of Devotion"]);
  });

  it("is nothing for an element without levels", () => {
    expect(previewOf(byId.get("t:devotion:aura"), get)).toBeUndefined();
  });

  it("stops at a feature that grants itself", () => {
    const loop = el("t:x:loop", "feature", "Loop", { grants: ["t:x:loop"] });
    const cls = el("t:class:x", "class", "X", { text: "X.", levels: { "1": { grants: ["t:x:loop"] } } });
    const preview = previewOf(cls, (id) => (id === loop.id ? loop : undefined))!;
    expect(preview.levels[0]!.features[0]!.children).toEqual([]);
  });
});

describe("grantsPreview", () => {
  // A 2024 species from 5etools: no text, every rule in a granted trait.
  const traits = [
    el("t:aasimar:darkvision", "species-trait", "Darkvision", { text: "See in the dark." }),
    el("t:aasimar:healing-hands", "species-trait", "Healing Hands", { text: "Heal by touch." }),
    el("t:spell:light", "spell", "Light", { spellLevel: 0 }),
  ];
  const lookup = new Map(traits.map((e) => [e.id, e]));
  const read = (id: string): Element | undefined => lookup.get(id);
  const aasimar = (extra: Record<string, unknown> = {}): Element =>
    el("t:species:aasimar", "species", "Aasimar", {
      text: "",
      grants: ["t:spell:light", "t:aasimar:darkvision", "t:aasimar:healing-hands"],
      choices: [{ id: "c", name: "Language", count: 2, from: {} }],
      ...extra,
    });

  it("reads what a species grants as one row with no level", () => {
    const preview = grantsPreview(aasimar(), read)!;
    expect(preview.intro).toBeUndefined();
    expect(preview.levels).toHaveLength(1);
    const [row] = preview.levels;
    expect(row!.level).toBeUndefined();
    expect(row!.features.map((f) => [f.name, f.text])).toEqual([
      ["Darkvision", "See in the dark."],
      ["Healing Hands", "Heal by touch."],
    ]);
    expect(row!.spells).toEqual(["Light"]);
    expect(row!.choices).toEqual(["Language"]);
  });

  it("keeps the species' own text as the intro", () => {
    expect(grantsPreview(aasimar({ text: "**Age.** Long-lived." }), read)!.intro).toBe("**Age.** Long-lived.");
  });

  it("is nothing for an element that grants and asks nothing", () => {
    expect(grantsPreview(el("t:feat:x", "feat", "X", { text: "Does a thing." }), read)).toBeUndefined();
  });
});
