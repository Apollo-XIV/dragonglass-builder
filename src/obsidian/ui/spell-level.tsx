/**
 * A spell level as a glyph: ◆ for a cantrip, I to IX for the levels, in the
 * embedded Dragonglass Numerals face. Roman numerals have no zero, which is why
 * a cantrip is a diamond rather than a numeral.
 *
 * The `numerals` setting swaps the levels for 1 to 9, for anyone who reads
 * roman numerals slowly or not at all. The cantrip keeps its diamond either way.
 * Screen readers are given "Cantrip" or "Level 4" instead of the glyph, since
 * "IV" read aloud is two letters.
 */

import { useContext, type ReactNode } from "react";
import { PluginContext } from "./context";

export type Numerals = "roman" | "arabic";

export const CANTRIP_GLYPH = "◆";

/** Only I, V and X, the three letters the embedded face carries, so this holds to 39. */
const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function spellLevelGlyph(level: number, numerals: Numerals = "roman"): string {
  if (level === 0) return CANTRIP_GLYPH;
  if (numerals === "arabic" || !Number.isInteger(level) || level < 0 || level > 39) return String(level);
  let rest = level;
  let out = "";
  for (const [value, letters] of ROMAN) {
    while (rest >= value) {
      out += letters;
      rest -= value;
    }
  }
  return out;
}

export function spellLevelName(level: number): string {
  return level === 0 ? "Cantrip" : `Level ${level}`;
}

export function useNumerals(): Numerals {
  return useContext(PluginContext)?.plugin.settings.layout.numerals ?? "roman";
}

/** `tooltip` opens Obsidian's hover label with the level's name, "Level 4" for the numeral IV. */
export function SpellLevel({ level, className, tooltip }: { level: number; className?: string; tooltip?: boolean }): ReactNode {
  const numerals = useNumerals();
  return (
    <span className={className ? `dg-spell-level ${className}` : "dg-spell-level"}>
      <span aria-hidden="true" aria-label={tooltip ? spellLevelName(level) : undefined}>
        {spellLevelGlyph(level, numerals)}
      </span>
      <span className="dg-sr-only">{spellLevelName(level)}</span>
    </span>
  );
}
