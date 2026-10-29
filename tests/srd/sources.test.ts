/**
 * Source-wide checks over the real content in `content/`: that every source
 * loads without complaint and that a bare character resolves.
 *
 * Nothing here is about one class. Per-class assertions live beside the class
 * they test — `tests/srd/<class>.test.ts` — so a conversion session writes one
 * new file rather than editing a shared one.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "../../src/core/resolver/resolve";
import { srdIndex } from "../helpers";

const content = srdIndex();

describe("the converted content loads cleanly", () => {
  it("has no errors from either source", () => {
    const errors = content.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });

  it("has no unresolved references or unknown kinds", () => {
    const bad = content.diagnostics.filter(
      (d) => d.code === "unresolved-reference" || d.code === "unknown-kind" || d.code === "missing-source",
    );
    expect(bad).toEqual([]);
  });

  it("declares its sourcebooks with attribution", () => {
    const srd = content.sourcebook("srd");
    expect(srd?.abbreviation).toBe("SRD");
    expect(srd?.license).toBe("CC-BY-4.0");
    expect(srd?.attribution).toContain("Wizards of the Coast");
  });

  it("exposes every kind the test slice uses", () => {
    for (const kind of ["species", "species-trait", "class", "class-feature", "subclass", "subclass-feature", "background", "spell", "item", "tool", "language", "skill", "fighting-style"])
      expect(content.kindDef(kind), kind).toBeDefined();
  });
});

describe("degradation", () => {
  it("resolves an empty build without throwing", () => {
    const blank = resolve({
      content,
      build: {
        kind: "build",
        schemaVersion: 1,
        level: 0,
        abilities: { method: "manual", base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } },
        levels: [],
      },
    });
    expect(blank.level).toBe(0);
    expect(blank.ac.value).toBe(10);
    expect(blank.hp.max.value).toBe(1);
  });
});
