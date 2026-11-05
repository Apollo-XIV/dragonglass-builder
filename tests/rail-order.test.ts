import { describe, expect, it } from "vitest";
import { railOrder, SHEET_RAIL_ORDER, withDefaults } from "../src/obsidian/settings";

describe("the stored sheet section order", () => {
  it("is the default when nothing is stored", () => {
    expect(railOrder(undefined)).toEqual([...SHEET_RAIL_ORDER]);
  });

  it("drops a section that no longer exists", () => {
    expect(railOrder(["overview", "skills", "details"])).not.toContain("skills");
  });

  it("puts a section it predates after the one it follows by default", () => {
    // The shape an older version stored: no proficiencies, details last.
    const order = railOrder(["overview", "actions", "spells", "inventory", "features", "skills", "details"]);
    expect(order.indexOf("proficiencies")).toBeGreaterThan(order.indexOf("features"));
    expect(order.indexOf("proficiencies")).toBeLessThan(order.indexOf("details"));
  });

  it("keeps the order the player stored for what it knows", () => {
    expect(railOrder(["details", "overview"])).toEqual(["details", "overview", ...SHEET_RAIL_ORDER.filter((id) => id !== "details" && id !== "overview")]);
  });

  it("reaches the narrow settings through withDefaults", () => {
    const settings = withDefaults({ narrow: { sheetSections: ["overview", "skills", "details"] } } as never);
    expect(settings.narrow.sheetSections).not.toContain("skills");
    expect(settings.narrow.sheetSections.indexOf("proficiencies")).toBeLessThan(settings.narrow.sheetSections.indexOf("details"));
  });
});
