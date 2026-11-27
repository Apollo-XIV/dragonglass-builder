/**
 * Facet filtering for any list a picker shows: items now, spells next. A facet reads
 * its values off a row, and the state is the `key:value` record `source-filter.ts`
 * already uses, so `cycleFilter` and the include/exclude rules are one thing. Within a
 * facet includes are alternatives and any exclude removes outright; facets are ANDed.
 */

import type { SourceFilter } from "./source-filter";

export interface Facet<Row> {
  /** The prefix of this facet's filter keys: `type`, `rarity`. */
  key: string;
  label: string;
  /** What a row has for this facet. A row may carry several (a weapon's properties) or none. */
  values: (row: Row) => string[];
  /** How a value reads in the dropdown, when its raw form is an id or a tag. */
  format?: (value: string) => string;
  /** Values that read as a sentence ("true") are not worth a facet; list the order to show instead. */
  order?: string[];
}

export const facetKey = (facet: { key: string }, value: string): string => `${facet.key}:${value}`;

const entriesOf = (filter: SourceFilter, facet: { key: string }): [string, string][] => {
  const prefix = `${facet.key}:`;
  return Object.entries(filter)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, mode]) => [key.slice(prefix.length), mode]);
};

/** Whether a row gets past one facet. */
export function passesFacet<Row>(filter: SourceFilter, facet: Facet<Row>, row: Row): boolean {
  const entries = entriesOf(filter, facet);
  if (entries.length === 0) return true;
  const mine = new Set(facet.values(row));
  if (entries.some(([value, mode]) => mode === "exclude" && mine.has(value))) return false;
  const includes = entries.filter(([, mode]) => mode === "include");
  return includes.length === 0 || includes.some(([value]) => mine.has(value));
}

export function matchesFacets<Row>(filter: SourceFilter, facets: Facet<Row>[], row: Row): boolean {
  return facets.every((facet) => passesFacet(filter, facet, row));
}

/** The values a facet takes across some rows, each with how many rows carry it. */
export function facetValues<Row>(facet: Facet<Row>, rows: Row[]): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) for (const value of new Set(facet.values(row))) counts.set(value, (counts.get(value) ?? 0) + 1);
  const rank = (value: string): number => {
    const at = facet.order?.indexOf(value) ?? -1;
    return at < 0 ? Infinity : at;
  };
  return [...counts]
    .map(([value, count]) => ({ value, label: facet.format?.(value) ?? value, count }))
    .sort((a, b) => rank(a.value) - rank(b.value) || a.label.localeCompare(b.label));
}

/** How a facet's chip reads: how many of its values are active, and whether it only excludes. */
export function facetState(filter: SourceFilter, facet: { key: string }): { active: number; onlyExcludes: boolean } {
  const entries = entriesOf(filter, facet);
  return { active: entries.length, onlyExcludes: entries.length > 0 && entries.every(([, mode]) => mode === "exclude") };
}

/** Clears one facet's values and leaves the rest. */
export function clearFacet(filter: SourceFilter, facet: { key: string }): SourceFilter {
  const prefix = `${facet.key}:`;
  return Object.fromEntries(Object.entries(filter).filter(([key]) => !key.startsWith(prefix)));
}

/** Name and tags, case-insensitively, every word of the query somewhere. An empty query matches all. */
export function matchesSearch(query: string, ...haystacks: (string | undefined)[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = haystacks.join(" ").toLowerCase();
  return words.every((word) => text.includes(word));
}
