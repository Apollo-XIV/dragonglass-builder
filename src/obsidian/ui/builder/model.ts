/**
 * The builder's arithmetic, kept apart from any component: what the pickers list,
 * what upcoming levels hold, what a level of HP defaults to. Nothing here renders,
 * so it is tested without a view and both layouts read the same answers.
 */

import { factsOf } from "../../../core/content/facts";
import { unverifiedNotes } from "../../../core/content/provenance";
import { averageForDie } from "../../../core/resolver/spellslots";
import { describeRequirement } from "../../../core/content/requirements";
import type { PendingChoice } from "../../../core/resolver/resolved";
import type { ChoiceDef, Element, Grant, Requirement } from "../../../core/types";
import type { ContentIndex } from "../../../core/content";
import type { PickerOption } from "./picker";
import { inheritedFilter, type SourceFilter, type SourceRef } from "./source-filter";

export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/** How many planned levels show per class before "Show more" (spec 7.6). */
export const PLANNED_PAGE = 3;

export const BUILDER_ICONS: Record<string, string> = {
  origin: "sprout",
  levels: "layers",
  planned: "calendar-clock",
  spells: "sparkles",
  equipment: "backpack",
  details: "user",
  review: "check-check",
  browse: "book-open",
  sources: "library",
};

export function pointsSpent(base: Record<string, number>, abilities: readonly string[]): number {
  return abilities.reduce((n, a) => n + (POINT_BUY_COST[base[a]] ?? 0), 0);
}

/** What a new level of this class gets for hit points, from the plugin's default. */
export function defaultHpFor(
  index: ContentIndex,
  classId: string,
  setting: "max" | "roll" | "average" | string,
): "max" | "average" | number {
  const die = String((index.get(classId) as { hitDie?: string } | undefined)?.hitDie ?? "d8");
  if (setting === "max") return "max";
  if (setting === "roll") return averageForDie(die);
  return "average";
}

/** A class's multiclass prerequisite as a line of text, if it has one. */
export function multiclassNote(cls: Element): string[] | undefined {
  const requires = (cls as { multiclassRequires?: Requirement }).multiclassRequires;
  return requires ? [describeRequirement(requires)] : undefined;
}

/**
 * Everything a multiclass pick asks of the character: the new class's own
 * minimums, then those of each class they already have, which RAW also
 * requires them to meet.
 */
export function multiclassNotes(
  index: ContentIndex,
  taken: readonly string[],
  cls: Element,
): string[] | undefined {
  const notes = [...(multiclassNote(cls) ?? [])];
  for (const id of taken) {
    const held = index.get(id);
    const own = held ? multiclassNote(held) : undefined;
    if (held && own) notes.push(`${held.name}: ${own[0]}`);
  }
  return notes.length ? notes : undefined;
}

/** What the picker's source filter needs to know about the book an element came from. */
export function sourceRefOf(index: ContentIndex, sourceId: string): SourceRef | undefined {
  const book = index.sourcebook(sourceId);
  return book ? { id: book.id, label: book.abbreviation, name: book.name, ruleset: index.ruleset(sourceId) } : undefined;
}

/** The starting filter for options that belong to an element: its own book's ruleset. */
export function inheritedFilterOf(index: ContentIndex, elementId: string): SourceFilter {
  const element = index.get(elementId);
  return inheritedFilter(element ? sourceRefOf(index, element.source) : undefined);
}

export function optionsFor(
  choice: PendingChoice,
  nameOf: (id: string) => string | undefined = () => undefined,
  sourceOf: (sourceId: string) => SourceRef | undefined = () => undefined,
): PickerOption[] {
  return choice.options.map((option) => ({
    id: option.id,
    name: option.name,
    text: option.text,
    fluff: option.fluff,
    facts: factsOf(option.element, nameOf),
    tag: option.abbreviation,
    source: sourceOf(option.source),
    warnings: option.warnings,
    unverified: unverifiedNotes(option.element),
    allowed: option.allowed,
    heldBy: option.heldBy,
  }));
}

export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "earlier";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "a moment ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export interface LevelEntryShape {
  grants?: Grant[];
  choices?: ChoiceDef[];
  text?: string;
}

export interface StagedCard {
  owner: Element;
  level: number;
  entry: LevelEntryShape;
}

/**
 * What a character has still to gain from anything staged against character
 * level, above the level it has now.
 *
 * Owners are found by what they declare rather than by their kind, so a
 * background or a feat that stages itself is looked ahead to as readily as a
 * species. `count` is per owner, so one species with many entries cannot crowd
 * out another.
 */
export function upcomingStaged(
  elements: { element: Element }[],
  total: number,
  count: number,
): StagedCard[] {
  const owners = new Map<string, Element & { levels?: Record<string, LevelEntryShape> }>();
  for (const resolved of elements) {
    const element = resolved.element as Element & { levels?: Record<string, LevelEntryShape> };
    if (element.levelsBy === "character" && element.levels) owners.set(element.id, element);
  }

  const cards: StagedCard[] = [];
  for (const owner of owners.values()) {
    let found = 0;
    for (let level = total + 1; level <= 20 && found < count; level++) {
      const entry = owner.levels?.[String(level)];
      if (!entry) continue;
      cards.push({ owner, level, entry });
      found += 1;
    }
  }
  return cards;
}
