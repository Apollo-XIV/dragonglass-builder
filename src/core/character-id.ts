/** A character's id: made once, kept in its sheet.5e, and never derived from its folder. */

import type { InventoryFile, SheetFile } from "./types";

export function newCharacterId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * What is wrong with a character's ids, one readable line each; empty when it is
 * fine. The character id and every inventory entry's uid are required, and nothing
 * makes them up for a file that lacks them.
 */
export function idProblems(sheet: SheetFile | undefined, inventory: InventoryFile | undefined): string[] {
  const problems: string[] = [];
  if (!sheet?.id) problems.push("sheet.5e has no character id.");
  const seen = new Set<string>();
  let missing = 0;
  for (const entry of inventory?.items ?? []) {
    if (!entry.uid) missing += 1;
    else if (seen.has(entry.uid)) problems.push(`inventory.5e uses the id "${entry.uid}" twice.`);
    else seen.add(entry.uid);
  }
  if (missing) problems.push(`inventory.5e has ${missing} ${missing === 1 ? "entry" : "entries"} with no uid.`);
  if (problems.length) problems.push("Ids are not added to existing characters. Rebuild this character in the builder.");
  return problems;
}
