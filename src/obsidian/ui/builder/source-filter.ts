/**
 * Narrowing a picker by ruleset and sourcebook. Pure, so the rules are testable
 * without a view and the same state can later be seeded from somewhere else (the
 * character, the plugin settings) rather than only from clicks.
 *
 * A filter is one of two facets, each value in one of two modes. Within a facet,
 * includes are alternatives (2014 *or* 2024) and any exclude removes outright; the
 * facets are then ANDed, like every other filter in the builder.
 */

export type FilterMode = "include" | "exclude";

/** `ruleset:2024` or `source:srd` → how it is applied. Absent means no opinion. */
export type SourceFilter = Record<string, FilterMode>;

export interface SourceRef {
  /** Sourcebook id. */
  id: string;
  /** Abbreviation: SRD, PHB. */
  label: string;
  name: string;
  ruleset?: string;
}

export interface FilterFacet {
  key: string;
  label: string;
  title?: string;
}

export const rulesetKey = (ruleset: string): string => `ruleset:${ruleset}`;
export const sourceKey = (id: string): string => `source:${id}`;

/** Off, then include, then exclude, then off again. */
export function cycleFilter(filter: SourceFilter, key: string): SourceFilter {
  const { [key]: current, ...rest } = filter;
  if (current === undefined) return { ...rest, [key]: "include" };
  if (current === "include") return { ...rest, [key]: "exclude" };
  return rest;
}

/**
 * What a picker starts with when its options belong to something already chosen: the
 * parent's own ruleset, so a 2024 species' languages are 2024 until the player says
 * otherwise. Nothing when the parent's book names no ruleset.
 */
export function inheritedFilter(parent: SourceRef | undefined): SourceFilter {
  return parent?.ruleset ? { [rulesetKey(parent.ruleset)]: "include" } : {};
}

/**
 * A starting filter keeps only what the options can be filtered by. One for a ruleset
 * none of them has would hide everything behind a chip that is not there to clear.
 */
export function usableFilter(filter: SourceFilter, facets: ReturnType<typeof facetsOf>): SourceFilter {
  const keys = new Set([...facets.rulesets, ...facets.sources].map((f) => f.key));
  return Object.fromEntries(Object.entries(filter).filter(([key]) => keys.has(key)));
}

/** The rulesets and sourcebooks among some options, each once, in a stable order. */
export function facetsOf(refs: (SourceRef | undefined)[]): {
  rulesets: FilterFacet[];
  sources: FilterFacet[];
} {
  const sources = new Map<string, SourceRef>();
  for (const ref of refs) if (ref && !sources.has(ref.id)) sources.set(ref.id, ref);
  const rulesets = [...new Set([...sources.values()].map((s) => s.ruleset).filter((r): r is string => !!r))].sort();
  return {
    rulesets: rulesets.map((r) => ({ key: rulesetKey(r), label: r })),
    sources: [...sources.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((s) => ({ key: sourceKey(s.id), label: s.label, title: s.name })),
  };
}

function passes(filter: SourceFilter, prefix: string, value: string | undefined, lenient = false): boolean {
  // A book that names no ruleset takes no side: a ruleset filter can't say anything about it.
  if (lenient && value === undefined) return true;
  const entries = Object.entries(filter).filter(([key]) => key.startsWith(prefix));
  if (entries.length === 0) return true;
  const mine = value === undefined ? undefined : filter[`${prefix}${value}`];
  if (mine === "exclude") return false;
  const includes = entries.some(([, mode]) => mode === "include");
  return includes ? mine === "include" : true;
}

export function matchesFilter(filter: SourceFilter, ref: SourceRef | undefined): boolean {
  return passes(filter, "ruleset:", ref?.ruleset, ref !== undefined) && passes(filter, "source:", ref?.id);
}

export const activeCount = (filter: SourceFilter): number => Object.keys(filter).length;
