/**
 * The narrow layout's arithmetic: which layout a pane gets, where a finger on
 * the rail points, and when a release should settle onto a section. All of it is
 * pure, which is the only reason the rail is testable at all.
 */

import { describe, expect, it } from "vitest";
import { decideLayout } from "../src/obsidian/ui/narrow/layout-mode";
import {
  activeStop,
  approach,
  crossedStop,
  nearestStop,
  railProgress,
  scrubTarget,
  scrubZone,
  tailSpace,
  type Stop,
} from "../src/obsidian/ui/narrow/scroll";
import { DEFAULT_SETTINGS, resolveAccent, resolveNarrow, type NarrowSettings } from "../src/obsidian/settings";
import { RAIL } from "../src/obsidian/ui/narrow/constants";

const auto: NarrowSettings = { ...DEFAULT_SETTINGS.narrow, desktopNeedsLandscape: false };

describe("choosing a layout", () => {
  it("gives a wide pane the desktop layout and a narrow one the narrow layout", () => {
    expect(decideLayout("narrow", { width: 1200, height: 800 }, auto)).toBe("desktop");
    expect(decideLayout("desktop", { width: 500, height: 800 }, auto)).toBe("narrow");
  });

  it("holds its ground inside the hysteresis band, so dragging a pane edge doesn't flicker", () => {
    // 900 is the nominal boundary; neither mode changes until 20px past it.
    expect(decideLayout("narrow", { width: 905, height: 800 }, auto)).toBe("narrow");
    expect(decideLayout("desktop", { width: 895, height: 800 }, auto)).toBe("desktop");
    expect(decideLayout("narrow", { width: 925, height: 800 }, auto)).toBe("desktop");
    expect(decideLayout("desktop", { width: 875, height: 800 }, auto)).toBe("narrow");
  });

  it("keeps a large tablet held vertically on the narrow layout", () => {
    const portrait = { width: 1024, height: 1366 };
    expect(decideLayout("desktop", portrait, { ...auto, desktopNeedsLandscape: true })).toBe("narrow");
    expect(decideLayout("narrow", { width: 1366, height: 1024 }, { ...auto, desktopNeedsLandscape: true })).toBe(
      "desktop",
    );
  });

  it("obeys a forced setting whatever the size", () => {
    expect(decideLayout("desktop", { width: 1600, height: 900 }, { ...auto, layout: "narrow" })).toBe("narrow");
    expect(decideLayout("narrow", { width: 320, height: 640 }, { ...auto, layout: "desktop" })).toBe("desktop");
  });

  it("keeps the current layout for a container that hasn't been laid out yet", () => {
    expect(decideLayout("narrow", { width: 0, height: 0 }, auto)).toBe("narrow");
    expect(decideLayout("desktop", { width: 0, height: 0 }, auto)).toBe("desktop");
  });
});

const stops: Stop[] = [
  { id: "overview", start: 0 },
  { id: "actions", start: 600 },
  { id: "spells", start: 1400 },
];

describe("locating the reader", () => {
  it("treats the last header at or above the top as the active section", () => {
    expect(activeStop(stops, 0)).toBe(0);
    expect(activeStop(stops, 590)).toBe(0);
    expect(activeStop(stops, 600)).toBe(1);
    expect(activeStop(stops, 5000)).toBe(2);
  });

  it("counts a header a pixel short of the top as arrived, since scroll offsets are fractional", () => {
    expect(activeStop(stops, 599)).toBe(1);
  });

  it("reports a continuous position, so the thumb moves within a section", () => {
    expect(railProgress(stops, 0, 2000)).toBe(0);
    expect(railProgress(stops, 300, 2000)).toBeCloseTo(0.5);
    expect(railProgress(stops, 1000, 2000)).toBeCloseTo(1.5);
  });

  it("finds a nearby stop only inside the grab distance", () => {
    expect(nearestStop(stops, 620, 100)).toBe(1);
    expect(nearestStop(stops, 620, 10)).toBeUndefined();
    // Ties go to the closer one, not the earlier one.
    expect(nearestStop(stops, 1399, 600)).toBe(2);
  });
});

describe("scroll ticks", () => {
  it("fires for a header crossed between two positions, however fast", () => {
    // A wheel tick or a fling covers more ground than any "near the top" window
    // would, so the test is a crossing, not a proximity.
    expect(crossedStop(stops, 0, 700)).toBe(1);
    expect(crossedStop(stops, 590, 610)).toBe(1);
  });

  it("fires when scrolling back up past a header too", () => {
    expect(crossedStop(stops, 700, 0)).toBe(1);
  });

  it("stays quiet in the middle of a section", () => {
    expect(crossedStop(stops, 620, 700)).toBeUndefined();
  });
});

describe("space at the end of the document", () => {
  it("is the scrolling the document is short by, plus slack for rounding", () => {
    // A 300px final section in an 800px viewport is 500px short of being able
    // to sit at the top; the extra two pixels keep a fractional measurement
    // from leaving it just out of reach.
    expect(tailSpace(800, 300, 110)).toBe(502);
  });

  it("never drops below the padding that clears the floating toolbar", () => {
    expect(tailSpace(800, 900, 110)).toBe(110);
  });

  it("never needs more than one viewport, however the content was measured", () => {
    // A height measured mid-layout can be nonsense; the tail still cannot
    // sensibly exceed a screen.
    expect(tailSpace(800, -5000, 110)).toBe(800);
  });
});

describe("scrubbing the rail", () => {
  const starts = stops.map((s) => s.start);
  const railTop = 100;
  const maxScroll = 2000;
  const at = (pointerY: number): number => scrubTarget({ pointerY, railTop, starts, maxScroll });

  it("maps each icon's zone onto that section's scroll range", () => {
    expect(at(railTop)).toBe(0);
    expect(at(railTop + RAIL.zoneHeight)).toBe(600);
    expect(at(railTop + RAIL.zoneHeight * 2)).toBe(1400);
  });

  it("runs the last zone to the end of the document", () => {
    expect(at(railTop + RAIL.zoneHeight * 3)).toBe(maxScroll);
  });

  it("is continuous across a zone boundary", () => {
    const before = at(railTop + RAIL.zoneHeight - 0.01);
    const after = at(railTop + RAIL.zoneHeight + 0.01);
    expect(Math.abs(after - before)).toBeLessThan(20);
  });

  it("clamps a finger dragged past either end of the rail", () => {
    expect(at(railTop - 500)).toBe(0);
    expect(at(railTop + 5000)).toBe(maxScroll);
  });

  it("reports which zone the finger is in, for the label bubble", () => {
    expect(scrubZone(railTop + 5, railTop, 3)).toBe(0);
    expect(scrubZone(railTop + RAIL.zoneHeight + 5, railTop, 3)).toBe(1);
    expect(scrubZone(railTop + RAIL.zoneHeight * 9, railTop, 3)).toBe(2);
  });
});

describe("the glide", () => {
  it("covers a fixed fraction of the remaining distance and lands exactly", () => {
    expect(approach(0, 100, 0.2)).toBeCloseTo(20);
    expect(approach(99.8, 100, 0.2)).toBe(100);
  });
});

describe("layout.5e, the per-character layer", () => {
  /**
   * The design spec's order: a character's own layout.5e, then the plugin's
   * settings, then the defaults. The point of the last two is that a
   * plugin-wide change still reaches every character that hasn't said
   * otherwise.
   */
  const plugin = DEFAULT_SETTINGS.narrow;

  it("follows the plugin when the character has no layout file", () => {
    expect(resolveNarrow(plugin, undefined)).toBe(plugin);
    expect(resolveNarrow(plugin, { kind: "layout", schemaVersion: 1 })).toBe(plugin);
  });

  it("lets a character move its own rail without touching anyone else's", () => {
    const resolved = resolveNarrow(plugin, {
      kind: "layout",
      schemaVersion: 1,
      narrow: { railSide: "left", railHeight: "low" },
    });
    expect(resolved.railSide).toBe("left");
    expect(resolved.railHeight).toBe("low");
    // Everything it didn't mention still follows the plugin.
    expect(resolved.holdMs).toBe(plugin.holdMs);
    expect(plugin.railSide).toBe("right");
  });

  it("lets a character reorder its rail", () => {
    const resolved = resolveNarrow(plugin, {
      kind: "layout",
      schemaVersion: 1,
      narrow: { sheetSections: ["spells", "overview"] },
    });
    expect(resolved.sheetSections).toEqual(["spells", "overview"]);
    expect(resolved.builderSections).toEqual(plugin.builderSections);
  });

  it("treats an explicit undefined as saying nothing", () => {
    const resolved = resolveNarrow(plugin, {
      kind: "layout",
      schemaVersion: 1,
      narrow: { railSide: undefined },
    });
    expect(resolved.railSide).toBe(plugin.railSide);
  });

  it("resolves the accent the same way", () => {
    const settings = { ...DEFAULT_SETTINGS, layout: { ...DEFAULT_SETTINGS.layout, accent: "#336699" } };
    expect(resolveAccent(settings, undefined)).toBe("#336699");
    expect(resolveAccent(settings, { kind: "layout", schemaVersion: 1, accent: "#ff0000" })).toBe("#ff0000");
    expect(resolveAccent(DEFAULT_SETTINGS, undefined)).toBe("");
  });
});
