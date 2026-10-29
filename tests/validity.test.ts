/**
 * Derived validity (spec 7.8).
 *
 * The rules being tested are the two sentences the spec is built on: taking an
 * option away invalidates what depended on it, reversibly; putting a different
 * option in its place removes those picks for good. "A, none, A" restores
 * everything; "A, B, A" starts fresh.
 */

import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { indexFromDisk } from "../src/node/load-source";
import {
  commitChange,
  inactivePicks,
  previewChange,
  type BuildChange,
} from "../src/core/resolver/validity";
import type { BuildFile } from "../src/core/types";
import { CONTENT_ROOT } from "./helpers";

const content = indexFromDisk(join(CONTENT_ROOT, "srd"), join(CONTENT_ROOT, "core"));

/** A paladin who has taken an oath, and made a choice that hangs off it. */
const build: BuildFile = {
  kind: "build",
  schemaVersion: 1,
  name: "Ilsa",
  level: 3,
  species: "srd:species:dwarf",
  background: "srd:background:acolyte",
  abilities: { method: "point-buy", base: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } },
  levels: [
    { class: "srd:class:paladin", hp: "max", choices: { "srd:class:paladin:skills": ["srd:skill:athletics", "srd:skill:persuasion"] } },
    { class: "srd:class:paladin", hp: "average", choices: { "srd:paladin:fighting-style": ["srd:fighting-style:defense"] } },
    { class: "srd:class:paladin", hp: "average", choices: { "srd:paladin:sacred-oath": ["srd:subclass:oath-of-devotion"] } },
  ],
  choices: {
    "srd:species:dwarf:tool-proficiency": ["srd:tool:smiths-tools"],
    "srd:background:acolyte:languages": ["srd:language:elvish", "srd:language:celestial"],
  },
};

const clearSpecies: BuildChange = { type: "species", id: undefined };
const swapSpecies: BuildChange = { type: "species", id: "srd:species:elf" };

describe("a build with nothing wrong with it", () => {
  it("has no inactive picks", () => {
    expect(inactivePicks(content, build)).toEqual([]);
  });

  it("reports nothing for a change that costs nothing", () => {
    const report = previewChange(content, build, {
      type: "choice",
      choiceId: "srd:paladin:fighting-style",
      scope: "level",
      levelIndex: 1,
      chosen: ["srd:fighting-style:protection"],
    });
    expect(report).toEqual({ invalidated: [], removed: [] });
  });
});

describe("taking an option away", () => {
  it("invalidates what hung off it, and says what to put back", () => {
    const report = previewChange(content, build, clearSpecies);
    expect(report.removed).toEqual([]);
    expect(report.invalidated.map((p) => p.choiceId)).toEqual(["srd:species:dwarf:tool-proficiency"]);
    expect(report.invalidated[0].reason).toContain("Dwarf");
  });

  it("keeps the pick in the file, inert, so it can come back", () => {
    const { build: cleared } = commitChange(content, build, clearSpecies);
    expect(cleared.choices?.["srd:species:dwarf:tool-proficiency"]).toEqual(["srd:tool:smiths-tools"]);
    expect(inactivePicks(content, cleared).map((p) => p.choiceId)).toEqual([
      "srd:species:dwarf:tool-proficiency",
    ]);
  });

  it("restores everything when the same option goes back: A, none, A", () => {
    const { build: cleared } = commitChange(content, build, clearSpecies);
    const { build: restored } = commitChange(content, cleared, { type: "species", id: "srd:species:dwarf" });
    expect(inactivePicks(content, restored)).toEqual([]);
    expect(restored.choices?.["srd:species:dwarf:tool-proficiency"]).toEqual(["srd:tool:smiths-tools"]);
  });
});

describe("putting a different option in its place", () => {
  it("removes what cannot be valid under it, rather than invalidating", () => {
    const report = previewChange(content, build, swapSpecies);
    expect(report.invalidated).toEqual([]);
    expect(report.removed.map((p) => p.choiceId)).toEqual(["srd:species:dwarf:tool-proficiency"]);
  });

  it("forgets them on commit: A, B, A starts fresh", () => {
    const { build: elf } = commitChange(content, build, swapSpecies);
    expect(elf.choices?.["srd:species:dwarf:tool-proficiency"]).toBeUndefined();
    const { build: backToDwarf } = commitChange(content, elf, { type: "species", id: "srd:species:dwarf" });
    expect(backToDwarf.choices?.["srd:species:dwarf:tool-proficiency"]).toBeUndefined();
    // And the choice is open again, waiting to be answered.
    expect(inactivePicks(content, backToDwarf)).toEqual([]);
  });

  it("leaves picks that are still valid under the new option alone", () => {
    const { build: elf } = commitChange(content, build, swapSpecies);
    // The paladin's own choices have nothing to do with the species.
    expect(elf.levels[1].choices).toEqual({ "srd:paladin:fighting-style": ["srd:fighting-style:defense"] });
    expect(elf.choices?.["srd:background:acolyte:languages"]).toEqual([
      "srd:language:elvish",
      "srd:language:celestial",
    ]);
  });
});

describe("a level going away", () => {
  it("is a loss, not a replacement, so its dependants are invalidated", () => {
    // Removing the oath level takes the subclass with it.
    const report = previewChange(content, build, { type: "remove-level", index: 2 });
    expect(report.removed).toEqual([]);
  });

  it("keeps the level's own picks in the planned queue", () => {
    const { build: shorter } = commitChange(content, build, { type: "remove-level", index: 2 });
    expect(shorter.levels).toHaveLength(2);
    expect(shorter.planned?.[0]).toEqual({
      class: "srd:class:paladin",
      classLevel: 3,
      choices: { "srd:paladin:sacred-oath": ["srd:subclass:oath-of-devotion"] },
    });
  });

  it("restores them when the level is taken again", () => {
    const { build: shorter } = commitChange(content, build, { type: "remove-level", index: 2 });
    const { build: again } = commitChange(content, shorter, {
      type: "add-level",
      class: "srd:class:paladin",
      hp: "average",
    });
    expect(again.levels[2].choices).toEqual({ "srd:paladin:sacred-oath": ["srd:subclass:oath-of-devotion"] });
    expect(inactivePicks(content, again)).toEqual([]);
  });

  it("costs nothing to add a level", () => {
    expect(previewChange(content, build, { type: "add-level", class: "srd:class:paladin", hp: "average" })).toEqual({
      invalidated: [],
      removed: [],
    });
  });
});
