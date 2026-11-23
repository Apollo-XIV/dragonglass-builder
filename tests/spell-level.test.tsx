/**
 * Spell levels as glyphs: ◆ for a cantrip, roman numerals for the levels, and
 * the numbers setting for anyone who would rather not read them.
 */

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_SETTINGS, withDefaults } from "../src/obsidian/settings";
import { PluginContext } from "../src/obsidian/ui/context";
import { CANTRIP_GLYPH, SpellLevel, spellLevelGlyph } from "../src/obsidian/ui/spell-level";

describe("spellLevelGlyph", () => {
  it("writes I to IX", () => {
    const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => spellLevelGlyph(level));
    expect(levels).toEqual(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"]);
  });

  it("gives a cantrip the diamond, roman or not", () => {
    expect(spellLevelGlyph(0)).toBe(CANTRIP_GLYPH);
    expect(spellLevelGlyph(0, "arabic")).toBe(CANTRIP_GLYPH);
  });

  it("writes numbers when asked", () => {
    expect(spellLevelGlyph(4, "arabic")).toBe("4");
  });

  it("uses only the letters the embedded face carries", () => {
    for (let level = 1; level <= 39; level++) expect(spellLevelGlyph(level)).toMatch(/^[IVX]+$/);
    expect(spellLevelGlyph(40)).toBe("40");
  });
});

describe("SpellLevel", () => {
  const render = (numerals: "roman" | "arabic", level: number) =>
    renderToStaticMarkup(
      createElement(
        PluginContext.Provider,
        { value: { plugin: { settings: { ...DEFAULT_SETTINGS, layout: { ...DEFAULT_SETTINGS.layout, numerals } } } } as never },
        createElement(SpellLevel, { level }),
      ),
    );

  it("follows the setting, and names the level for a screen reader", () => {
    expect(render("roman", 4)).toContain('<span aria-hidden="true">IV</span><span class="dg-sr-only">Level 4</span>');
    expect(render("arabic", 4)).toContain('<span aria-hidden="true">4</span>');
    expect(render("roman", 0)).toContain('<span class="dg-sr-only">Cantrip</span>');
  });

  it("defaults to roman, including for settings saved before the option existed", () => {
    expect(renderToStaticMarkup(createElement(SpellLevel, { level: 9 }))).toContain(">IX<");
    const { numerals: _, ...older } = DEFAULT_SETTINGS.layout;
    expect(withDefaults({ layout: older as never }).layout.numerals).toBe("roman");
  });
});
