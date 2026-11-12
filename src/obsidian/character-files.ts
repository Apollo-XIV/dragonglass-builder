/**
 * Reading and writing a character's folder of `.5e` files.
 *
 * Every JSON file carries a `kind` and a `schemaVersion`. `details.5e` is markdown
 * and carries the same fields in its frontmatter. A file with no `kind` takes it
 * from the manifest that references it, and the manifest can override a file's kind.
 */

import { normalizePath } from "obsidian";
import type {
  BuildFile,
  CharacterFile,
  DetailsFrontmatter,
  FileKind,
  InventoryFile,
  SheetFile,
  SourcesFile,
  SpellsFile,
  StateFile,
} from "../core/types";
import { newCharacterId } from "../core/character-id";
import { emptyState } from "../core/state/fold";

export const SCHEMA_VERSION = 1;

export const DEFAULT_FILE_NAMES: Record<FileKind, string> = {
  sheet: "sheet.5e",
  build: "build.5e",
  state: "state.5e",
  details: "details.5e",
  spells: "spells.5e",
  inventory: "inventory.5e",
  sources: "sources.5e",
  layout: "layout.5e",
  gallery: "gallery.5e",
};

/**
 * The other half of a character. The sheet is for playing and the builder is
 * for changing, and those are the only two kinds that are two views of the same
 * thing — the rest are single files with one editor each.
 */
export function counterpartKind(kind: FileKind): FileKind | undefined {
  if (kind === "sheet") return "build";
  if (kind === "build") return "sheet";
  return undefined;
}

/** What the menu item for switching to `kind` should say. */
export function switchLabel(kind: FileKind): string {
  return kind === "build" ? "Edit character" : "Open sheet";
}

/** Section headers `details.5e` is expected to carry, in display order. */
export const DETAIL_SECTIONS = [
  "Backstory",
  "Personality Traits",
  "Ideals",
  "Bonds",
  "Flaws",
  "Appearance",
  "Notes",
] as const;

export interface DetailsDocument {
  frontmatter: DetailsFrontmatter;
  /** Section heading mapped to its markdown body, in file order. */
  sections: { heading: string; body: string }[];
  /** Anything before the first heading. */
  preamble: string;
  raw: string;
}

export interface CharacterPaths {
  folder: string;
  /** Data kind mapped to a vault path. Only kinds the manifest resolves appear. */
  byKind: Partial<Record<FileKind, string>>;
}

/** Resolves the manifest's file map, falling back to the default names. */
export function resolvePaths(folder: string, manifest?: SheetFile): CharacterPaths {
  const byKind: Partial<Record<FileKind, string>> = {};
  const kinds: FileKind[] = ["build", "state", "details", "spells", "inventory", "sources", "layout", "gallery"];
  for (const kind of kinds) {
    const named = manifest?.files?.[kind as Exclude<FileKind, "sheet">];
    byKind[kind] = normalizePath(`${folder}/${named ?? DEFAULT_FILE_NAMES[kind]}`);
  }
  byKind.sheet = normalizePath(`${folder}/${DEFAULT_FILE_NAMES.sheet}`);
  return { folder, byKind };
}

export function folderOf(filePath: string): string {
  const i = filePath.lastIndexOf("/");
  return i < 0 ? "" : filePath.slice(0, i);
}

export function fileName(filePath: string): string {
  const i = filePath.lastIndexOf("/");
  return i < 0 ? filePath : filePath.slice(i + 1);
}

/** Pretty-prints with a trailing newline, so the files are diff-friendly in git. */
export function serialiseJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export interface ParseResult<T> {
  data?: T;
  error?: string;
}

export function parseJsonFile<T extends CharacterFile>(
  text: string,
  expected: FileKind,
  /** Kind from the manifest, used when the file declares none. */
  fallbackKind?: FileKind,
): ParseResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return { error: "expected a JSON object" };
  const file = parsed as Record<string, unknown>;
  const kind = (typeof file.kind === "string" ? file.kind : undefined) ?? fallbackKind ?? expected;
  if (kind !== expected) return { error: `this file is a "${kind}" file, not "${expected}"` };
  return { data: { ...file, kind, schemaVersion: Number(file.schemaVersion) || SCHEMA_VERSION } as unknown as T };
}

// ---------------------------------------------------------------------------
// details.5e: markdown with frontmatter
// ---------------------------------------------------------------------------

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * A deliberately small frontmatter reader. `details.5e` only carries scalars
 * (`kind`, `schemaVersion`, `avatar`), so a YAML dependency would be overkill, and
 * any other scalar key is kept in `extra` and written back rather than dropped.
 */
export function parseDetails(text: string): DetailsDocument {
  const match = text.match(FRONTMATTER);
  const frontmatter: Record<string, string> = {};
  if (match)
    for (const line of match[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!kv) continue;
      frontmatter[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
    }

  const extra: Record<string, string> = {};
  for (const [key, value] of Object.entries(frontmatter))
    if (!["kind", "schemaVersion", "avatar"].includes(key)) extra[key] = value;

  const body = match ? text.slice(match[0].length) : text;
  const sections: DetailsDocument["sections"] = [];
  let preamble = "";
  const lines = body.split(/\r?\n/);
  let current: { heading: string; body: string[] } | undefined;
  const pre: string[] = [];

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      if (current) sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
      current = { heading: heading[1].trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
    else pre.push(line);
  }
  if (current) sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
  preamble = pre.join("\n").trim();

  return {
    frontmatter: {
      kind: "details",
      schemaVersion: Number(frontmatter.schemaVersion) || SCHEMA_VERSION,
      avatar: frontmatter.avatar || undefined,
      extra: Object.keys(extra).length ? extra : undefined,
    },
    sections,
    preamble,
    raw: text,
  };
}

export function serialiseDetails(doc: DetailsDocument): string {
  const lines = ["---", "kind: details", `schemaVersion: ${doc.frontmatter.schemaVersion || SCHEMA_VERSION}`];
  if (doc.frontmatter.avatar) lines.push(`avatar: ${doc.frontmatter.avatar}`);
  for (const [key, value] of Object.entries(doc.frontmatter.extra ?? {})) lines.push(`${key}: ${value}`);
  lines.push("---", "");
  if (doc.preamble) lines.push(doc.preamble, "");
  for (const section of doc.sections) {
    lines.push(`## ${section.heading}`);
    if (section.body) lines.push(section.body);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** Replaces one section's body, adding the section if the file lacks it. */
export function setDetailSection(doc: DetailsDocument, heading: string, body: string): DetailsDocument {
  const sections = [...doc.sections];
  const i = sections.findIndex((s) => s.heading.toLowerCase() === heading.toLowerCase());
  if (i >= 0) sections[i] = { heading: sections[i].heading, body };
  else sections.push({ heading, body });
  return { ...doc, sections };
}

// ---------------------------------------------------------------------------
// Blank files for a new character
// ---------------------------------------------------------------------------

export function blankSheet(name: string): SheetFile {
  return { kind: "sheet", schemaVersion: SCHEMA_VERSION, id: newCharacterId(), name };
}

export function blankBuild(name: string): BuildFile {
  return {
    kind: "build",
    schemaVersion: SCHEMA_VERSION,
    name,
    level: 0,
    xp: 0,
    abilities: { method: "point-buy", base: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } },
    levels: [],
    choices: {},
  };
}

export function blankState(): StateFile {
  return emptyState();
}

export function blankSpells(): SpellsFile {
  return { kind: "spells", schemaVersion: SCHEMA_VERSION, spells: [] };
}

export function blankInventory(): InventoryFile {
  return {
    kind: "inventory",
    schemaVersion: SCHEMA_VERSION,
    items: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  };
}

export function blankSources(): SourcesFile {
  return { kind: "sources", schemaVersion: SCHEMA_VERSION, sources: [], disabled: [] };
}

export function blankDetails(name: string): string {
  return serialiseDetails({
    frontmatter: { kind: "details", schemaVersion: SCHEMA_VERSION },
    preamble: "",
    sections: DETAIL_SECTIONS.map((heading) => ({ heading, body: heading === "Backstory" ? `${name} has yet to tell their story.` : "" })),
    raw: "",
  });
}
