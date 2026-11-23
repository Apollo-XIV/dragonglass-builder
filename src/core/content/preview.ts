import type { Element } from "../types";
import { grantId } from "../resolver/collect";

/** A feature an element grants, with whatever that feature grants in turn. */
export interface PreviewFeature {
  id: string;
  name: string;
  text?: string;
  children: PreviewFeature[];
  /** Spells this feature grants, by name. */
  spells: string[];
}

/** What one level of a class or subclass brings, or all an element without levels does. */
export interface PreviewLevel {
  /** Absent for an element without levels: a species, a background. */
  level?: number;
  features: PreviewFeature[];
  /** Spells granted at this level, by name. */
  spells: string[];
  /** The choices this level asks for, by name, read after "Choose". */
  choices: string[];
}

/**
 * What picking a class or subclass gives, level by level, read before it is taken, or what
 * an origin grants outright as one level-less row (`grantsPreview`).
 * `intro` is the description to show when the element has no text of its own.
 */
export interface ElementPreview {
  intro?: string;
  levels: PreviewLevel[];
}

const textOf = (element: Element): string | undefined =>
  typeof element.text === "string" && element.text.trim() ? element.text : undefined;

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A granted feature with what it grants in turn; nothing for a spell, or one already being read. */
function featureOf(id: string, seen: Set<string>, get: (id: string) => Element | undefined): PreviewFeature | undefined {
  const found = get(id);
  if (!found || found.kind === "spell" || seen.has(id)) return undefined;
  const inner = new Set(seen).add(id);
  const out: PreviewFeature = { id, name: found.name, text: textOf(found), children: [], spells: [] };
  for (const child of (found.grants ?? []).map(grantId)) {
    if (get(child)?.kind === "spell") out.spells.push(get(child)!.name);
    else {
      const nested = featureOf(child, inner, get);
      if (nested) out.children.push(nested);
    }
  }
  return out;
}

/**
 * An origin read as the one row of what it grants and asks: a species' traits, a
 * background's feature. A 5etools species holds its rules only in the traits it grants —
 * a 2024 one has no text at all — so without this its reading is its setting prose and
 * nothing it does.
 */
export function grantsPreview(element: Element, get: (id: string) => Element | undefined): ElementPreview | undefined {
  const row: PreviewLevel = { features: [], spells: [], choices: [] };
  for (const id of (element.grants ?? []).map(grantId)) {
    const granted = get(id);
    if (granted?.kind === "spell") row.spells.push(granted.name);
    else {
      const read = featureOf(id, new Set([element.id]), get);
      if (read) row.features.push(read);
    }
  }
  row.choices = (element.choices ?? []).map((c) => c.name ?? (c.count === 1 ? "one option" : `${c.count} options`));
  if (!row.features.length && !row.spells.length && !row.choices.length) return undefined;
  return { intro: textOf(element), levels: [row] };
}

/**
 * The levels an element with `levels` brings, each granted feature with its text.
 *
 * A source converted from 5etools often gives a subclass no text and grants, at its
 * first level, a feature of the same name that holds the description and grants the
 * real features in turn. Read that way the preview opens on a feature that is only a
 * wrapper, so a namesake is unwrapped: its text becomes the intro and its children
 * take its place. Only when the owner has no text of its own, since then the namesake
 * is the only place the description is.
 */
export function previewOf(element: Element | undefined, get: (id: string) => Element | undefined): ElementPreview | undefined {
  if (!element?.levels) return undefined;
  let intro = textOf(element);
  const unwrap = intro === undefined;

  const feature = (id: string, seen: Set<string>) => featureOf(id, seen, get);

  const levels: PreviewLevel[] = [];
  const keys = Object.keys(element.levels)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  for (const [i, level] of keys.entries()) {
    const entry = element.levels[String(level)]!;
    const row: PreviewLevel = { level, features: [], spells: [], choices: [] };
    for (const id of (entry.grants ?? []).map(grantId)) {
      const granted = get(id);
      if (granted?.kind === "spell") {
        row.spells.push(granted.name);
        continue;
      }
      const read = feature(id, new Set([element.id]));
      if (!read) continue;
      if (unwrap && i === 0 && same(read.name, element.name)) {
        intro ??= read.text;
        row.features.push(...read.children);
        row.spells.push(...read.spells);
      } else row.features.push(read);
    }
    // Choices on the element itself are asked when it is taken: its first level.
    const choices = [...(i === 0 ? element.choices ?? [] : []), ...(entry.choices ?? [])];
    row.choices = choices.map((c) => c.name ?? (c.count === 1 ? "one option" : `${c.count} options`));
    if (row.features.length || row.spells.length || row.choices.length) levels.push(row);
  }
  return { intro, levels };
}
