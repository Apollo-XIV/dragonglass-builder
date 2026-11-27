import { describe, expect, it } from "vitest";
import { clearFacet, facetState, facetValues, matchesFacets, matchesSearch, type Facet } from "../src/obsidian/ui/builder/facets";
import { cycleFilter } from "../src/obsidian/ui/builder/source-filter";
import { costText, ITEM_FACETS, type ItemRow } from "../src/obsidian/ui/builder/item-adapter";

interface Spell {
  name: string;
  level: string;
  schools: string[];
}
const spells: Spell[] = [
  { name: "Fire Bolt", level: "0", schools: ["evocation"] },
  { name: "Shield", level: "1", schools: ["abjuration"] },
  { name: "Hex", level: "1", schools: ["enchantment", "curse"] },
];
const spellFacets: Facet<Spell>[] = [
  { key: "level", label: "Level", values: (s) => [s.level] },
  { key: "school", label: "School", values: (s) => s.schools },
];
const names = (f: Record<string, "include" | "exclude">): string[] =>
  spells.filter((s) => matchesFacets(f, spellFacets, s)).map((s) => s.name);

describe("cycling a facet value", () => {
  it("goes off, include, exclude, off", () => {
    let f = cycleFilter({}, "level:1");
    expect(f).toEqual({ "level:1": "include" });
    f = cycleFilter(f, "level:1");
    expect(f).toEqual({ "level:1": "exclude" });
    expect(cycleFilter(f, "level:1")).toEqual({});
  });
});

describe("matchesFacets", () => {
  it("passes everything with no filter", () => expect(names({})).toHaveLength(3));

  it("treats includes within a facet as alternatives", () => {
    expect(names({ "level:0": "include", "level:1": "include" })).toHaveLength(3);
    expect(names({ "school:evocation": "include", "school:abjuration": "include" })).toEqual(["Fire Bolt", "Shield"]);
  });

  it("lets any exclude remove outright, even beside an include", () => {
    expect(names({ "level:1": "include", "school:curse": "exclude" })).toEqual(["Shield"]);
    expect(names({ "level:1": "exclude" })).toEqual(["Fire Bolt"]);
  });

  it("combines facets with AND", () => {
    expect(names({ "level:1": "include", "school:enchantment": "include" })).toEqual(["Hex"]);
    expect(names({ "level:0": "include", "school:abjuration": "include" })).toEqual([]);
  });

  it("an include hides a row with no value for that facet; an exclude does not", () => {
    const rows = [{ name: "a", level: "1", schools: [] }];
    expect(matchesFacets({ "school:curse": "include" }, spellFacets, rows[0])).toBe(false);
    expect(matchesFacets({ "school:curse": "exclude" }, spellFacets, rows[0])).toBe(true);
  });
});

describe("facet chips", () => {
  it("counts active values and notices a facet that only excludes", () => {
    expect(facetState({}, { key: "level" })).toEqual({ active: 0, onlyExcludes: false });
    expect(facetState({ "level:1": "exclude" }, { key: "level" })).toEqual({ active: 1, onlyExcludes: true });
    expect(facetState({ "level:1": "exclude", "level:0": "include" }, { key: "level" }).onlyExcludes).toBe(false);
  });

  it("lists a facet's values with counts, and clears one facet only", () => {
    expect(facetValues(spellFacets[0], spells)).toEqual([
      { value: "0", label: "0", count: 1 },
      { value: "1", label: "1", count: 2 },
    ]);
    expect(clearFacet({ "level:1": "include", "school:curse": "exclude" }, { key: "level" })).toEqual({
      "school:curse": "exclude",
    });
  });
});

describe("items", () => {
  const row = (over: Partial<ItemRow["element"]>, tags: string[] = []): ItemRow => ({
    id: "i",
    name: "Longsword",
    tags,
    element: { id: "i", kind: "item", name: "Longsword", source: "s", ...over } as ItemRow["element"],
    source: { id: "srd", label: "SRD", name: "SRD", ruleset: "2014" },
  });
  const rows = [
    row({ itemType: "weapon", weapon: { damage: "1d8", damageType: "slashing", category: "martial", properties: ["versatile"] } }),
    row({ itemType: "armor", armor: { base: 14, category: "medium" } }),
    row({ itemType: "wondrous", rarity: "rare", attunement: true }),
  ];

  it("reads each facet off an item", () => {
    const by = (key: string) => ITEM_FACETS.find((f) => f.key === key)!;
    expect(by("type").values(rows[0])).toEqual(["weapon"]);
    expect(by("category").values(rows[1])).toEqual(["medium"]);
    expect(by("property").values(rows[0])).toEqual(["versatile"]);
    expect(by("attunement").values(rows[2])).toEqual(["required"]);
    expect(by("ruleset").values(rows[0])).toEqual(["2014"]);
  });

  it("filters an item list and a spell list with the same code", () => {
    expect(rows.filter((r) => matchesFacets({ "type:weapon": "exclude" }, ITEM_FACETS, r))).toHaveLength(2);
    expect(rows.filter((r) => matchesFacets({ "attunement:required": "include" }, ITEM_FACETS, r))).toHaveLength(1);
  });

  it("reads costs as the biggest whole coin", () => {
    expect([costText(1500), costText(50), costText(5), costText(undefined)]).toEqual(["15 gp", "5 sp", "5 cp", ""]);
  });
});

describe("search", () => {
  it("matches every word against name and tags", () => {
    expect(matchesSearch("long axe", "Longsword", "martial-weapon")).toBe(false);
    expect(matchesSearch("long martial", "Longsword", "martial-weapon")).toBe(true);
    expect(matchesSearch("", "x")).toBe(true);
  });
});
