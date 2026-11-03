import { describe, expect, it } from "vitest";
import { factsOf } from "../src/core/content/facts";
import type { Element } from "../src/core/types";

const spell = (extra: Record<string, unknown>): Element =>
  ({ id: "t:spell:x", kind: "spell", name: "X", source: "t", spellLevel: 2, ...extra }) as Element;

describe("factsOf", () => {
  it("lists a spell's reference data in reading order", () => {
    const facts = factsOf(
      spell({ school: "evocation", castingTime: "1 action", range: "90 feet", components: "V, S", duration: "Instantaneous" }),
    );
    expect(facts.map((f) => [f.label, f.value])).toEqual([
      ["Level", "2nd level evocation"],
      ["Casting time", "1 action"],
      ["Range", "90 feet"],
      ["Components", "V, S"],
      ["Duration", "Instantaneous"],
    ]);
  });

  it("names cantrips, ritual and concentration once", () => {
    const facts = factsOf(spell({ spellLevel: 0, school: "divination", ritual: true, castingTime: "1 minute", duration: "1 hour", concentration: true }));
    expect(facts[0]?.value).toBe("Divination cantrip");
    expect(facts[1]?.value).toBe("1 minute (ritual)");
    expect(facts[2]?.value).toBe("Concentration, 1 hour");
  });

  it("has nothing for other kinds", () => {
    expect(factsOf({ id: "a", kind: "feat", name: "A", source: "t" } as Element)).toEqual([]);
  });
});

describe("factsOf items", () => {
  const item = (extra: Record<string, unknown>): Element =>
    ({ id: "t:item:x", kind: "item", name: "X", source: "t", ...extra }) as Element;

  it("describes a weapon", () => {
    const facts = factsOf(
      item({ weapon: { damage: "1d4", damageType: "bludgeoning", category: "simple-melee", properties: ["light"] }, weight: 2, value: 10 }),
    );
    expect(facts.map((f) => [f.label, f.value])).toEqual([
      ["Damage", "1d4 bludgeoning"],
      ["Category", "Simple melee"],
      ["Properties", "Light"],
      ["Cost", "1 sp"],
      ["Weight", "2 lb"],
    ]);
  });

  it("describes armour and prices in the largest even coin", () => {
    const facts = factsOf(item({ armor: { base: 11, category: "light", stealthDisadvantage: true }, value: 500 }));
    expect(facts.map((f) => f.value)).toEqual(["11 + Dex", "Light", "Disadvantage", "5 gp"]);
  });
});
