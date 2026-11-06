/**
 * The Export character command: the open character as one JSON file in a vault
 * folder. Everything that decides what the file says is in `core/export`; this
 * is the part that needs the vault (embeds, the sources' pins, the file itself).
 */

import { normalizePath, type App, type DataAdapter, type TFile } from "obsidian";
import { buildExport, splitDetails, toPlainText, validateExport, type ExportDocument } from "../core/export";
import { hasMissingIds } from "../core/inventory";
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
  exportedAt: string;
  pluginVersion: string;
}

/** Builds and validates the document. Entries without ids are given them first. */
export async function exportDocument(store: CharacterStore, deps: ExportDeps): Promise<ExportDocument> {
  const build = store.data.build;
  if (!build) throw new ExportError("This character has no build file to export");
  if (!store.index) throw new ExportError("The character's content has not loaded yet");

  // Ids are given when an inventory is saved, so an old one gets them now, by
  // the player's own action, and the file and the export agree on them.
  if (hasMissingIds(store.data.inventory)) store.update("inventory", store.data.inventory!);

  const details = await Promise.all(
    splitDetails(store.data.details?.raw ?? "").map(async (s) => ({
      heading: s.heading,
      text: await toPlainText(s.body, { embed: deps.embed }),
    })),
  );

  let doc: ExportDocument;
  try {
    doc = await buildExport({
      characterId: store.ensureCharacterId(),
      content: store.index,
      build,
      spells: store.data.spells,
      inventory: store.data.inventory,
      details,
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

/** A file name from a character's name: no path separators, nothing a filesystem refuses. */
export function exportFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return `${safe || "Character"}.json`;
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
  await adapter.write(path, JSON.stringify(doc, null, 2) + "\n");
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
