import { describe, expect, it } from "vitest";
import { rangeLead } from "../src/obsidian/ui/range-lead";

describe("rangeLead", () => {
  it("gives Self and Touch an icon and no distance", () => {
    expect(rangeLead("Self")).toEqual({ icon: "dg-range-self", label: "Self", hint: "Range: Self" });
    expect(rangeLead("Touch")).toEqual({ icon: "dg-range-touch", label: "Touch", hint: "Range: Touch" });
  });

  it("shortens a distance and keeps a weapon's normal/long pair", () => {
    expect(rangeLead("60 feet")).toMatchObject({ icon: "dg-range", text: "60 ft" });
    expect(rangeLead("20/60 ft.")).toMatchObject({ icon: "dg-range", text: "20/60 ft" });
    expect(rangeLead("1 mile")).toMatchObject({ icon: "dg-range", text: "1 mi" });
  });

  it("gives a self area its shape's icon", () => {
    expect(rangeLead("Self (15-foot cone)")).toMatchObject({ icon: "dg-area-cone", text: "15 ft" });
    expect(rangeLead("Self (100-foot line)")).toMatchObject({ icon: "dg-area-line", text: "100 ft" });
    expect(rangeLead("Self (15-foot cube)")).toMatchObject({ icon: "dg-area-cube", text: "15 ft" });
    expect(rangeLead("Self (15-foot radius)")).toMatchObject({ icon: "dg-area-emanation", text: "15 ft" });
    expect(rangeLead("Self (10-foot-radius sphere)")).toMatchObject({ icon: "dg-area-sphere", text: "10 ft" });
    expect(rangeLead("Self (10-foot-radius hemisphere)")).toMatchObject({ icon: "dg-area-sphere", text: "10 ft" });
    expect(rangeLead("Self (5-mile radius)")).toMatchObject({ icon: "dg-area-emanation", text: "5 mi" });
  });

  it("leaves what it does not recognise to be written out", () => {
    for (const range of ["Sight", "Unlimited", "Special", "Melee", "Self (a 10-foot wall)", undefined]) {
      expect(rangeLead(range)).toBeUndefined();
    }
  });
});

describe("iconHint", () => {
  it("says what a lone icon means, and which mark in a group", async () => {
    const { iconHint } = await import("../src/obsidian/ui/range-lead");
    const range = rangeLead("60 feet")!;
    expect(iconHint("dg-range", range)).toBe("Range: 60 feet");
    expect(iconHint("dg-verbal", { icon: ["dg-verbal", "dg-somatic"], label: "V, S" })).toBe("Verbal component");
    expect(iconHint("dg-concentration", { icon: "dg-concentration", label: "Concentration" })).toBe("Concentration");
  });
});
