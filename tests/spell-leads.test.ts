import { describe, expect, it } from "vitest";
import { iconHint } from "../src/obsidian/ui/range-lead";
import { componentsLead, spellFlagLeads } from "../src/obsidian/ui/spell-leads";

describe("componentsLead", () => {
  it("draws a mark for each component, in the order written", () => {
    expect(componentsLead("V, S")?.icon).toEqual(["dg-verbal", "dg-somatic"]);
    expect(componentsLead("S")?.icon).toEqual(["dg-somatic"]);
    expect(componentsLead("V, M (a pinch of salt)")?.icon).toEqual(["dg-verbal", "dg-material"]);
  });

  it("adds the coin when the material names a price, commas inside the brackets and all", () => {
    expect(componentsLead("V, S, M (diamond dust worth 100 gp, which the spell consumes)")?.icon).toEqual([
      "dg-verbal",
      "dg-somatic",
      "dg-material",
      "dg-material-cost",
    ]);
    expect(componentsLead("V, S, M (a ruby worth 1,500 gp)")?.icon).toContain("dg-material-cost");
  });

  it("names the material for the hover, and leaves the other marks to their own wording", () => {
    const lead = componentsLead("V, S, M (diamond dust worth 100 gp, which the spell consumes)")!;
    expect(iconHint("dg-material", lead)).toBe("Material: diamond dust worth 100 gp, which the spell consumes");
    expect(iconHint("dg-verbal", lead)).toBe("Verbal component");
    expect(iconHint("dg-material", componentsLead("V, M")!)).toBe("Material component");
  });

  it("keeps the whole text as the label", () => {
    expect(componentsLead("V, S, M (a bit of fleece)")?.label).toBe("V, S, M (a bit of fleece)");
  });

  it("gives nothing for text it cannot read", () => {
    expect(componentsLead(undefined)).toBeUndefined();
    expect(componentsLead("see description")).toBeUndefined();
  });
});

describe("spellFlagLeads", () => {
  it("names concentration, then ritual, where they apply", () => {
    expect(spellFlagLeads({ concentration: true, ritual: true }).map((l) => l.icon)).toEqual(["dg-concentration", "dg-ritual"]);
    expect(spellFlagLeads({})).toEqual([]);
  });
});
