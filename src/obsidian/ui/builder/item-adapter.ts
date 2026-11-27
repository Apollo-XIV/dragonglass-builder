/**
 * What is specific to items in the facet picker: the row, and the facets an item has.
 * Spells will bring their own adapter and share everything else.
 */

import type { ContentIndex } from "../../../core/content";
import type { Element, ItemElement } from "../../../core/types";
import { rulesetKey, sourceKey, type SourceRef } from "./source-filter";
import { sourceRefOf } from "./model";
import type { Facet } from "./facets";

export interface ItemRow {
  id: string;
  name: string;
  element: ItemElement;
  tags: string[];
  /** The book it comes from, for the ruleset and source facets. */
  source?: SourceRef;
  tag?: string;
  weight?: number;
  /** Cost in copper. */
  value?: number;
}

export function itemRows(index: ContentIndex): ItemRow[] {
  return index.byKind("item").map((el: Element) => {
    const item = el as ItemElement;
    return {
      id: item.id,
      name: item.name,
      element: item,
      tags: item.tags ?? [],
      source: sourceRefOf(index, item.source),
      tag: index.abbreviation(item.source),
      weight: item.weight,
      value: item.value,
    };
  });
}

const titled = (value: string): string => value.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
const one = (value: string | undefined): string[] => (value ? [value] : []);

/** The facets an item list is filtered by. A facet no row has a value for simply has no chip. */
export const ITEM_FACETS: Facet<ItemRow>[] = [
  { key: "type", label: "Type", values: (r) => one(r.element.itemType), format: titled },
  { key: "category", label: "Category", values: (r) => one(r.element.weapon?.category ?? r.element.armor?.category), format: titled },
  { key: "damage", label: "Damage", values: (r) => one(r.element.weapon?.damageType), format: titled },
  { key: "property", label: "Properties", values: (r) => r.element.weapon?.properties ?? [], format: titled },
  {
    key: "rarity",
    label: "Rarity",
    values: (r) => one(r.element.rarity),
    format: titled,
    order: ["common", "uncommon", "rare", "very-rare", "legendary", "artifact"],
  },
  { key: "attunement", label: "Attunement", values: (r) => [r.element.attunement ? "required" : "none"], format: titled },
  { key: "ruleset", label: "Ruleset", values: (r) => one(r.source?.ruleset) },
  { key: "source", label: "Source", values: (r) => one(r.source?.id), format: (v) => v.toUpperCase() },
];

// The ruleset and source keys are the ones `source-filter.ts` writes.
export { rulesetKey, sourceKey };

/** The cost as a player reads it: the largest whole denomination. */
export function costText(copper: number | undefined): string {
  if (copper === undefined) return "";
  if (copper >= 100 && copper % 100 === 0) return `${copper / 100} gp`;
  if (copper >= 10 && copper % 10 === 0) return `${copper / 10} sp`;
  return `${copper} cp`;
}

export const weightText = (weight: number | undefined): string => (weight === undefined ? "" : `${weight} lb`);
