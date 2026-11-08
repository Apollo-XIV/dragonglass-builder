/**
 * Part provenance: where a part came from and whether anyone has checked it. Only used
 * to tell the reader; nothing here is consulted when resolving a character.
 */

import type { Element, PartProvenance } from "../types";

/** A part is unverified until its review says "reviewed". Absent provenance says nothing. */
export function isUnverified(p: PartProvenance | undefined): p is PartProvenance {
  return !!p && typeof p === "object" && typeof p.review === "string" && p.review !== "reviewed";
}

/** The tooltip for an unverified part: what it came from, and that nobody has checked it. */
export function describeProvenance(p: PartProvenance): string {
  const source = typeof p.source === "string" ? p.source : "";
  if (source.startsWith("pack:")) return "From Foundry's dnd5e data, not yet reviewed";
  switch (source) {
    case "prose":
      return "Read from the feature's text, not yet reviewed";
    case "hand":
      return "Written by hand, not yet reviewed";
    case "approved-match":
      return "Matched to a class table by hand, not yet reviewed";
    default:
      return source ? `From ${source}, not yet reviewed` : "Not yet reviewed";
  }
}

const PART_LISTS = ["modifiers", "resources", "actions", "effects", "innateSpells", "spellListAdditions", "choices"] as const;

/** The distinct tooltips for every unverified part an element carries, on itself or in its level entries. */
export function unverifiedNotes(el: Element): string[] {
  const notes = new Set<string>();
  const scan = (owner: Record<string, unknown>): void => {
    for (const list of PART_LISTS) {
      const parts = owner[list];
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        const p = (part as { provenance?: PartProvenance } | null)?.provenance;
        if (isUnverified(p)) notes.add(describeProvenance(p));
      }
    }
  };
  scan(el);
  const levels = el.levels;
  if (levels && typeof levels === "object")
    for (const entry of Object.values(levels)) if (entry && typeof entry === "object") scan(entry as Record<string, unknown>);
  return [...notes];
}

/** The tooltip for one part, or nothing when it is reviewed or says nothing. */
export function noteFor(p: PartProvenance | undefined): string[] {
  return isUnverified(p) ? [describeProvenance(p)] : [];
}
