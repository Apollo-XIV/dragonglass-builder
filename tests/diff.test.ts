/**
 * The change list a save shows before it writes (spec 7.9). It is read by a
 * player deciding whether to commit, so it is phrased in their terms.
 */

import { describe, expect, it } from "vitest";
import { diffBuilds, diffInventory, diffSpells } from "../src/core/resolver/diff";
import type { BuildFile, InventoryFile, SpellsFile } from "../src/core/types";

const base: BuildFile = {
  kind: "build",
  schemaVersion: 1,
  name: "Ilsa",
  level: 2,
  species: "dwarf",
  background: "acolyte",
  abilities: { method: "point-buy", base: { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 13 } },
  levels: [
    { class: "paladin", hp: "max", choices: {} },
    { class: "paladin", hp: "average", choices: { "style": ["defense"] } },
  ],
  choices: { tools: ["smiths"] },
};

const names: Record<string, string> = {
  dwarf: "Dwarf",
  elf: "Elf",
  paladin: "Paladin",
  style: "Fighting Style",
  defense: "Defence",
  protection: "Protection",
};
const nameOf = (id: string): string => names[id] ?? id;

describe("diffing two builds", () => {
  it("says nothing about a build that hasn't changed", () => {
    expect(diffBuilds(base, base, nameOf)).toEqual({ lines: [], count: 0 });
  });

  it("names both sides of a changed choice", () => {
    const next = { ...base, levels: base.levels.map((l, i) => (i === 1 ? { ...l, choices: { style: ["protection"] } } : l)) };
    expect(diffBuilds(base, next, nameOf).lines).toEqual(["Fighting Style: Defence → Protection"]);
  });

  it("reports levels by class, the way a player counts them", () => {
    const next = { ...base, levels: [...base.levels, { class: "paladin", hp: "average" as const, choices: {} }] };
    expect(diffBuilds(base, next, nameOf).lines).toEqual(["Paladin: level 2 → 3"]);
  });

  it("reports a cleared choice as going to nothing", () => {
    const next = { ...base, choices: {} };
    expect(diffBuilds(base, next, nameOf).lines).toEqual(["tools: smiths → nothing"]);
  });

  it("counts several changes together", () => {
    const next: BuildFile = {
      ...base,
      species: "elf",
      name: "Ilse",
      abilities: { ...base.abilities, base: { ...base.abilities.base, str: 16 } },
    };
    const diff = diffBuilds(base, next, nameOf);
    expect(diff.count).toBe(3);
    expect(diff.lines).toContain("Species: Dwarf → Elf");
    expect(diff.lines).toContain("STR: 15 → 16");
  });
});

describe("diffing spells and inventory", () => {
  // A builder session holds these as well as the build, so changing only them
  // must still be something to save.
  const spells: SpellsFile = {
    kind: "spells",
    schemaVersion: 1,
    spells: [
      { id: "bless", class: "paladin", prepared: true },
      { id: "shield-of-faith", class: "paladin" },
    ],
  };
  const spellNames: Record<string, string> = { bless: "Bless", "shield-of-faith": "Shield of Faith", "cure-wounds": "Cure Wounds" };
  const spellName = (id: string): string => spellNames[id] ?? id;

  it("says nothing about an unchanged list", () => {
    expect(diffSpells(spells, spells, spellName).count).toBe(0);
  });

  it("names spells added and removed", () => {
    const next = { ...spells, spells: [spells.spells[0]!, { id: "cure-wounds", class: "paladin" }] };
    expect(diffSpells(spells, next, spellName).lines).toEqual(["Spell added: Cure Wounds", "Spell removed: Shield of Faith"]);
  });

  it("counts a spell list appearing where there was none", () => {
    expect(diffSpells(undefined, spells, spellName).count).toBe(2);
  });

  it("reports a change of preparation", () => {
    const next = { ...spells, spells: [{ ...spells.spells[0]!, prepared: false }, spells.spells[1]!] };
    expect(diffSpells(spells, next, spellName).lines).toEqual(["Bless: prepared → not prepared"]);
  });

  it("names items added, removed and recounted, and coin", () => {
    const base: InventoryFile = {
      kind: "inventory",
      schemaVersion: 1,
      items: [
        { uid: "a", id: "rope", quantity: 1 },
        { uid: "b", id: "torch", quantity: 5 },
      ],
      currency: { gp: 10 },
    };
    const next: InventoryFile = {
      ...base,
      items: [{ uid: "a", id: "rope", quantity: 2 }, { uid: "c", item: { name: "Lucky Coin" } }],
      currency: { gp: 15 },
    };
    expect(diffInventory(base, next, (id) => id).lines).toEqual([
      "rope: 1 → 2",
      "Item added: Lucky Coin",
      "Item removed: torch",
      "GP: 10 → 15",
    ]);
  });
});
