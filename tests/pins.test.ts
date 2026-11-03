/** Which resources take the sheet's two pinned slots, and in what order. */

import { describe, expect, it } from "vitest";
import { choosePins } from "../src/core/resolver/pins";
import type { ResolvedCharacter, ResolvedResource } from "../src/core/resolver/resolved";

function resource(over: Partial<ResolvedResource>): ResolvedResource {
  return {
    key: "x",
    id: "x",
    name: "X",
    max: 1,
    spent: 0,
    remaining: 1,
    recharge: "long-rest",
    source: "src",
    sourceName: "Source",
    ...over,
  };
}

function character(resources: ResolvedResource[], spellcasting?: ResolvedCharacter["spellcasting"]): ResolvedCharacter {
  return { resources, spellcasting } as ResolvedCharacter;
}

describe("choosing pinned resources", () => {
  const rage = resource({ key: "rage", id: "rages", name: "Rage", max: 3, remaining: 2 });
  const shortRest = resource({ key: "cd", id: "cd", name: "Channel Divinity", recharge: "short-rest" });
  const points = resource({ key: "loh", id: "loh", name: "Lay on Hands", max: 25, remaining: 25 });

  it("takes the two highest-weighted resources when nothing is pinned", () => {
    const slots = choosePins(character([points, rage, shortRest]));
    expect(slots.map((s) => s.name)).toEqual(["Channel Divinity", "Rage"]);
    expect(slots.every((s) => s.reason === "weighted")).toBe(true);
  });

  it("lets content say otherwise with a pin weight", () => {
    const slots = choosePins(character([{ ...points, pin: 9 }, rage, shortRest]));
    expect(slots[0].name).toBe("Lay on Hands");
  });

  it("puts the character's own pins before the plugin's, and both before weight", () => {
    const slots = choosePins(character([points, rage, shortRest]), {
      character: ["loh"],
      plugin: ["rage"],
    });
    expect(slots.map((s) => s.name)).toEqual(["Lay on Hands", "Rage"]);
    expect(slots.map((s) => s.reason)).toEqual(["pinned", "pinned"]);
  });

  it("accepts a pin written as a pool target as well as an id", () => {
    const slots = choosePins(character([points, rage]), { plugin: ["resources.rage"] });
    expect(slots[0].name).toBe("Rage");
  });

  it("falls back to spell slots for a caster with nothing else to show", () => {
    const casting = {
      classes: [],
      slots: [
        { level: 1, max: 4, spent: 1, remaining: 3 },
        { level: 2, max: 2, spent: 0, remaining: 2 },
      ],
      spells: [],
      orphaned: [],
    } as unknown as ResolvedCharacter["spellcasting"];
    const slots = choosePins(character([], casting));
    expect(slots.map((s) => s.name)).toEqual(["Level 2 slots"]);
    expect(slots[0].reason).toBe("fallback");
  });

  it("leaves a slot quietly empty when there is nothing to put in it", () => {
    expect(choosePins(character([]))).toEqual([]);
  });

  it("never pins the same pool twice", () => {
    const slots = choosePins(character([rage]), { character: ["rage"], plugin: ["resources.rage"] });
    expect(slots).toHaveLength(1);
  });
});
