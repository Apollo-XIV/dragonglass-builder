import { describe, expect, it } from "vitest";
import { spaceTables } from "../src/core/markdown";

describe("spaceTables", () => {
  it("puts a blank line between a paragraph line and the table under it", () => {
    expect(spaceTables("**Psionic Spells**\n| Level | Spells |\n| --- | --- |\n| 3 | Arms |")).toBe(
      "**Psionic Spells**\n\n| Level | Spells |\n| --- | --- |\n| 3 | Arms |",
    );
  });

  it("leaves a table that already has its blank line, and plain text, alone", () => {
    const spaced = "Intro.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter.";
    expect(spaceTables(spaced)).toBe(spaced);
    expect(spaceTables("no tables | here")).toBe("no tables | here");
  });

  it("does not split a table's own rows", () => {
    const t = "| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |";
    expect(spaceTables(t)).toBe(t);
  });
});
