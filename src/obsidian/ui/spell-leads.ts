/**
 * What a spell row says with icons after its casting time and range: the
 * components, then concentration and ritual. Components are prose in the content
 * ("V, S, M (a bit of fleece)"), so this reads the letters and, in the material
 * part, whether a price is named; a spell it can't read gets no components icon
 * rather than a wrong one.
 */

import type { Lead } from "./range-lead";

const COMPONENT_ICONS: [letter: RegExp, icon: string][] = [
  [/^V\b/, "dg-verbal"],
  [/^S\b/, "dg-somatic"],
  [/^M\b/, "dg-material"],
];

/** "worth 100 gp", "each item worth at least 5 gp": a material with a price shows the coin too. */
const COSTLY = /\d[\d,]*\s?(?:cp|sp|ep|gp|pp)\b/;

export function componentsLead(components: string | undefined): Lead | undefined {
  if (!components) return undefined;
  // The material part's own commas live inside its brackets, so split outside them.
  const parts = components.split(/,\s*(?![^(]*\))/).map((part) => part.trim());
  const icons: string[] = [];
  const hints: Record<string, string> = {};
  for (const part of parts) {
    const match = COMPONENT_ICONS.find(([letter]) => letter.test(part));
    if (!match) return undefined;
    icons.push(match[1]);
    // "M (a bit of fleece)": hovering the mark names the material instead of repeating "material".
    const material = match[1] === "dg-material" ? part.match(/^M\s*\((.*)\)$/s)?.[1] : undefined;
    if (material) hints[match[1]] = `Material: ${material}`;
    if (match[1] === "dg-material" && COSTLY.test(part)) icons.push("dg-material-cost");
  }
  return icons.length ? { icon: icons, label: components, hints } : undefined;
}

export function spellFlagLeads(spell: { concentration?: boolean; ritual?: boolean }): Lead[] {
  const leads: (Lead | undefined)[] = [
    spell.concentration ? { icon: "dg-concentration", label: "Concentration" } : undefined,
    spell.ritual ? { icon: "dg-ritual", label: "Ritual" } : undefined,
  ];
  return leads.filter((l): l is Lead => !!l);
}
