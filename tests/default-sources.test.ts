import { describe, expect, it } from "vitest";
import { DEFAULT_SOURCES, withDefaults } from "../src/obsidian/settings";

describe("default sources", () => {
  it("seeds both SRD repos, pinned, when nothing has been saved", () => {
    const { sources } = withDefaults(null);
    expect(sources.map((s) => s.id)).toEqual(["srd", "srd24"]);
    for (const ref of sources) {
      expect(ref.type).toBe("github");
      expect(ref.pin).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it("respects a saved list, including an empty one", () => {
    expect(withDefaults({ sources: [] }).sources).toEqual([]);
  });

  it("hands out copies, so editing a pin never changes the defaults", () => {
    withDefaults(null).sources[0]!.pin = "edited";
    expect(DEFAULT_SOURCES[0]!.pin).not.toBe("edited");
  });
});
