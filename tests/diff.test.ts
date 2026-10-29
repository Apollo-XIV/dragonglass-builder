/**
 * The change list a save shows before it writes (spec 7.9). It is read by a
 * player deciding whether to commit, so it is phrased in their terms.
 */

import { describe, expect, it } from "vitest";
import { diffBuilds } from "../src/core/resolver/diff";
import type { BuildFile } from "../src/core/types";

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
