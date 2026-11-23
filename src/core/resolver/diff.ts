/**
 * What a save would change (spec 7.9).
 *
 * Deliberately shallow: it reads two build files and says what is different in
 * the words the builder uses, so the player can see "Fighting Style: Defence →
 * Protection" before committing. It is not a merge tool and makes no attempt to
 * explain consequences — the change report in `validity.ts` does that.
 */

import type { BuildFile, InventoryEntry, InventoryFile, SpellEntry, SpellsFile } from "../types";
import { ABILITIES } from "../types";
import { classLevels } from "./levels";

export interface BuildDiff {
  lines: string[];
  count: number;
}

/** `nameOf` turns element ids into names; pass the identity if you have no index. */
export function diffBuilds(base: BuildFile, next: BuildFile, nameOf: (id: string) => string = (id) => id): BuildDiff {
  const lines: string[] = [];
  const names = (ids: string[]): string => (ids.length ? ids.map(nameOf).join(", ") : "nothing");

  if ((base.name ?? "") !== (next.name ?? "")) lines.push(`Name: ${base.name || "unnamed"} → ${next.name || "unnamed"}`);
  if ((base.xp ?? 0) !== (next.xp ?? 0)) lines.push(`XP: ${base.xp ?? 0} → ${next.xp ?? 0}`);
  if (base.species !== next.species)
    lines.push(`Species: ${base.species ? nameOf(base.species) : "none"} → ${next.species ? nameOf(next.species) : "none"}`);
  if (base.background !== next.background)
    lines.push(
      `Background: ${base.background ? nameOf(base.background) : "none"} → ${next.background ? nameOf(next.background) : "none"}`,
    );

  if (base.abilities.method !== next.abilities.method)
    lines.push(`Ability method: ${base.abilities.method} → ${next.abilities.method}`);
  for (const ability of ABILITIES) {
    const from = base.abilities.base[ability];
    const to = next.abilities.base[ability];
    if (from !== to) lines.push(`${ability.toUpperCase()}: ${from} → ${to}`);
  }

  // Levels are reported by class, because that is how a player thinks about
  // them: "Paladin 5 → Paladin 6", not "entry 6 appeared".
  const before = classLevels(base);
  const after = classLevels(next);
  for (const classId of new Set([...before.keys(), ...after.keys()])) {
    const from = before.get(classId) ?? 0;
    const to = after.get(classId) ?? 0;
    if (from !== to) lines.push(`${nameOf(classId)}: level ${from} → ${to}`);
  }

  for (const [choiceId, from, to] of choicePairs(base, next)) {
    if (sameAnswer(from, to)) continue;
    lines.push(`${nameOf(choiceId)}: ${names(from)} → ${names(to)}`);
  }

  const plannedBefore = (base.planned ?? []).length;
  const plannedAfter = (next.planned ?? []).length;
  if (plannedBefore !== plannedAfter) lines.push(`Planned levels: ${plannedBefore} → ${plannedAfter}`);

  return { lines, count: lines.length };
}

/** Every choice id either side mentions, with both answers. */
function choicePairs(base: BuildFile, next: BuildFile): [string, string[], string[]][] {
  const read = (build: BuildFile): Map<string, string[]> => {
    const all = new Map<string, string[]>();
    for (const [id, chosen] of Object.entries(build.choices ?? {})) all.set(id, chosen);
    for (const level of build.levels ?? [])
      for (const [id, chosen] of Object.entries(level.choices ?? {})) all.set(id, chosen);
    return all;
  };
  const from = read(base);
  const to = read(next);
  return [...new Set([...from.keys(), ...to.keys()])].map((id) => [id, from.get(id) ?? [], to.get(id) ?? []]);
}

function sameAnswer(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Spells added to or taken from the list, and preparation changes. A spell is
 * keyed by its class as well as its id, so a multiclass character's two copies
 * of the same spell are two entries.
 */
export function diffSpells(
  base: SpellsFile | undefined,
  next: SpellsFile | undefined,
  nameOf: (id: string) => string = (id) => id,
): BuildDiff {
  const lines: string[] = [];
  const key = (spell: SpellEntry): string => `${spell.class ?? ""}|${spell.id}`;
  const before = new Map((base?.spells ?? []).map((spell) => [key(spell), spell]));
  const after = new Map((next?.spells ?? []).map((spell) => [key(spell), spell]));

  for (const [k, spell] of after) {
    const old = before.get(k);
    if (!old) lines.push(`Spell added: ${nameOf(spell.id)}`);
    else if (!!old.prepared !== !!spell.prepared)
      lines.push(`${nameOf(spell.id)}: ${old.prepared ? "prepared" : "not prepared"} → ${spell.prepared ? "prepared" : "not prepared"}`);
    else if (JSON.stringify(old) !== JSON.stringify(spell)) lines.push(`Spell changed: ${nameOf(spell.id)}`);
  }
  for (const [k, spell] of before) if (!after.has(k)) lines.push(`Spell removed: ${nameOf(spell.id)}`);

  return { lines, count: lines.length };
}

/** Items added, removed or changed, keyed by each entry's own uid, and coin. */
export function diffInventory(
  base: InventoryFile | undefined,
  next: InventoryFile | undefined,
  nameOf: (id: string) => string = (id) => id,
): BuildDiff {
  const lines: string[] = [];
  const name = (entry: InventoryEntry): string => entry.item?.name ?? (entry.id ? nameOf(entry.id) : "custom item");
  const before = new Map((base?.items ?? []).map((entry) => [entry.uid, entry]));
  const after = new Map((next?.items ?? []).map((entry) => [entry.uid, entry]));

  for (const [uid, entry] of after) {
    const old = before.get(uid);
    if (!old) lines.push(`Item added: ${name(entry)}${(entry.quantity ?? 1) > 1 ? ` ×${entry.quantity}` : ""}`);
    else if ((old.quantity ?? 1) !== (entry.quantity ?? 1)) lines.push(`${name(entry)}: ${old.quantity ?? 1} → ${entry.quantity ?? 1}`);
    else if (JSON.stringify(old) !== JSON.stringify(entry)) lines.push(`Item changed: ${name(entry)}`);
  }
  for (const [uid, entry] of before) if (!after.has(uid)) lines.push(`Item removed: ${name(entry)}`);

  for (const coin of ["cp", "sp", "ep", "gp", "pp"] as const) {
    const from = base?.currency?.[coin] ?? 0;
    const to = next?.currency?.[coin] ?? 0;
    if (from !== to) lines.push(`${coin.toUpperCase()}: ${from} → ${to}`);
  }

  return { lines, count: lines.length };
}
