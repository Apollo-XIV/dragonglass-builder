/**
 * What is on a class's spell list. A list is a tag on each spell, extended by
 * `spellListAdditions` parts: explicit spells, or another class's whole list.
 */

import type { ContentIndex } from "../content";
import type { Element } from "../types";
import type { ResolvedSpellcastingClass } from "./resolved";

type ListOf = Pick<ResolvedSpellcastingClass, "list" | "listAdditions">;

/** Is this spell an option for the class, by its own list or by anything added to it? */
export function onClassList(cls: ListOf, spell: Element): boolean {
  const tags = spell.tags ?? [];
  return (
    tags.includes(cls.list) ||
    cls.listAdditions.spells.includes(spell.id) ||
    cls.listAdditions.lists.some((tag) => tags.includes(tag))
  );
}

/** Every spell the class may choose from. */
export function classSpellList(index: ContentIndex, cls: ListOf): Element[] {
  const found = new Map<string, Element>();
  for (const el of index.query({ kind: "spell", tags: [cls.list, ...cls.listAdditions.lists] })) found.set(el.id, el);
  for (const id of cls.listAdditions.spells) {
    const el = index.get(id);
    if (el?.kind === "spell") found.set(id, el);
  }
  return [...found.values()];
}
