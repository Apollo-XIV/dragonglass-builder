/**
 * The Export character command: the open character as one JSON file in a vault
 * folder. Everything that decides what the file says is in `core/export`; this
 * is the part that needs the vault (embeds, the sources' pins, the file itself).
 */

import { normalizePath, type App, type DataAdapter, type TFile } from "obsidian";
import { buildExport, splitDetails, toPlainText, validateExport, type ExportDocument } from "../core/export";
import type { CharacterStore } from "./character-store";
import type { SourceManager } from "./sources";

/** A failure with something readable to show, one line each. */
export class ExportError extends Error {
  constructor(
    message: string,
    readonly lines: string[] = [],
  ) {
    super(message);
  }
}

export interface ExportDeps {
  sources: Pick<SourceManager, "exportRef">;
  /** The plain text of what `![[target]]` embeds. */
  embed: (target: string) => Promise<string | undefined>;
  /** The avatar at a vault path as a data URL, or nothing if it cannot be had. */
  avatar?: (path: string) => Promise<string | undefined>;
  exportedAt: string;
  pluginVersion: string;
}

/** What to tell the player when the builder holds changes the export will not include. */
export function unsavedWarning(store: CharacterStore): string | undefined {
  return store.hasUnsavedEdits
    ? "The builder has unsaved changes. Exporting the saved version, without them."
    : undefined;
}

/**
 * Builds and validates the document from what is saved, not from what the builder
 * is holding. A character missing an id is refused, never given one.
 */
export async function exportDocument(store: CharacterStore, deps: ExportDeps): Promise<ExportDocument> {
  if (store.idProblems.length) throw new ExportError(store.idProblems[0], store.idProblems.slice(1));
  if (!store.savedData().build) throw new ExportError("This character has no build file to export");
  if (!store.index) throw new ExportError("The character's content has not loaded yet");

  const saved = store.savedData();
  const build = saved.build!;

  const details = await Promise.all(
    splitDetails(saved.details?.raw ?? "").map(async (s) => ({
      heading: s.heading,
      text: await toPlainText(s.body, { embed: deps.embed }),
    })),
  );

  const avatarPath = saved.details?.frontmatter.avatar;
  const avatar = avatarPath && deps.avatar ? await deps.avatar(avatarPath).catch(() => undefined) : undefined;

  let doc: ExportDocument;
  try {
    doc = await buildExport({
      characterId: saved.sheet!.id,
      content: store.index,
      build,
      spells: saved.spells,
      inventory: saved.inventory,
      details,
      avatar,
      exportedAt: deps.exportedAt,
      pluginVersion: deps.pluginVersion,
      sourceRef: (id) => deps.sources.exportRef(id),
    });
  } catch (e) {
    throw new ExportError(e instanceof Error ? e.message : String(e));
  }

  const checked = validateExport(JSON.parse(JSON.stringify(doc)));
  if (!checked.ok)
    throw new ExportError(
      "The export did not pass its own checks, so nothing was written",
      checked.errors.slice(0, 8).map((e) => `${e.path}: ${e.message}`),
    );
  return doc;
}

/**
 * Not `.json`: Obsidian shows no file with that extension, and claiming it would take
 * every other JSON file in the vault. The content is plain JSON all the same.
 */
export const EXPORT_EXTENSION = "5echar";

/** The text of an export, for a file and for the clipboard alike. */
export function exportText(doc: ExportDocument): string {
  return JSON.stringify(doc, null, 2) + "\n";
}

/** What the export file's view shows about it, or why it cannot. */
export type ExportSummary =
  | { ok: true; name: string; characterId: string; schemaVersion: string; exportedAt: string }
  | { ok: false; error: string };

export function summariseExport(text: string): ExportSummary {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not valid JSON." };
  }
  const d = doc as Partial<ExportDocument> | null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const name = str(d?.identity?.name);
  const characterId = str(d?.envelope?.characterId);
  if (!name || !characterId) return { ok: false, error: "This file is not a character export." };
  return {
    ok: true,
    name,
    characterId,
    schemaVersion: str(d?.envelope?.schemaVersion),
    exportedAt: str(d?.envelope?.exportedAt),
  };
}

/** A file name from a character's name: no path separators, nothing a filesystem refuses. */
export function exportFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return `${safe || "Character"}.${EXPORT_EXTENSION}`;
}

export async function writeExport(
  adapter: DataAdapter,
  folder: string,
  doc: ExportDocument,
): Promise<string> {
  const dir = normalizePath(folder || "Exports");
  let current = "";
  for (const part of dir.split("/").filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    if (!(await adapter.exists(current))) await adapter.mkdir(current);
  }
  const path = normalizePath(`${dir}/${exportFileName(doc.identity.name)}`);
  await adapter.write(path, exportText(doc));
  return path;
}

/**
 * Reads what an embed shows from the metadata cache: the whole note, or the part
 * under a heading or at a block. Anything that is not a note reads as nothing.
 */
export function embedReader(app: App, fromPath: string): (target: string) => Promise<string | undefined> {
  return async (target) => {
    const [linkpath, ...rest] = target.split(/(?=[#^])/);
    const file: TFile | null = app.metadataCache.getFirstLinkpathDest(linkpath.trim(), fromPath);
    if (!file || file.extension !== "md") return undefined;
    const text = await app.vault.cachedRead(file);
    const sub = rest.join("");
    if (!sub) return text;
    const cache = app.metadataCache.getFileCache(file);
    if (sub.startsWith("^")) {
      const block = cache?.blocks?.[sub.slice(1).toLowerCase()];
      return block ? text.slice(block.position.start.offset, block.position.end.offset) : undefined;
    }
    const heading = sub.slice(1).trim().toLowerCase();
    const headings = cache?.headings ?? [];
    const at = headings.findIndex((h) => h.heading.trim().toLowerCase() === heading);
    if (at < 0) return undefined;
    const next = headings.slice(at + 1).find((h) => h.level <= headings[at].level);
    return text.slice(headings[at].position.end.offset, next ? next.position.start.offset : undefined);
  };
}
