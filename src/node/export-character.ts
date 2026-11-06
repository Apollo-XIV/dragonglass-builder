/**
 * Exports a character folder from disk. A character missing its id or an
 * inventory uid is refused.
 * For the export CLI and the golden tests; the
 * plugin builds the same document from its own store.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ContentIndex } from "../core/content";
import { idProblems } from "../core/character-id";
import { buildExport, contentHash, splitDetails, toPlainText, type ExportDocument } from "../core/export";
import type { BuildFile, InventoryFile, SheetFile, SpellsFile } from "../core/types";
import { loadSourceFromDisk, readSourceBundle } from "./load-source";

export interface ExportFromDiskOptions {
  characterDir: string;
  /** Source folders, highest priority first. The core definitions are added below them. */
  sourceDirs: string[];
  coreDir: string;
  exportedAt: string;
  pluginVersion: string;
  /** Source id to a git pin, for sources that have one. Others are hashed. */
  pins?: Record<string, string>;
  /** Note text by name, for resolving `![[embeds]]` in details. */
  notes?: Record<string, string>;
}

export async function exportFromDisk(opts: ExportFromDiskOptions): Promise<ExportDocument> {
  const read = <T>(name: string): T | undefined => {
    const p = join(opts.characterDir, name);
    return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : undefined;
  };
  const sheet = read<SheetFile>("sheet.5e");
  const inventory = read<InventoryFile>("inventory.5e");
  const problems = idProblems(sheet, inventory);
  if (problems.length) throw new Error(`${opts.characterDir}: ${problems.join(" ")}`);
  const build = read<BuildFile>("build.5e");
  if (!build) throw new Error(`No build.5e in ${opts.characterDir}`);

  const roots = [...opts.sourceDirs, opts.coreDir];
  const content = ContentIndex.build(roots.map(loadSourceFromDisk));
  const bundles = new Map(roots.map((d) => [readSourceBundle(d).manifest.id, d]));

  const detailsPath = join(opts.characterDir, "details.5e");
  const details = existsSync(detailsPath)
    ? await Promise.all(
        splitDetails(readFileSync(detailsPath, "utf8")).map(async (s) => ({
          heading: s.heading,
          text: await toPlainText(s.body, { embed: (t) => opts.notes?.[t.split(/[#^]/)[0].trim()] }),
        })),
      )
    : [];

  return buildExport({
    characterId: sheet!.id,
    content,
    build,
    spells: read<SpellsFile>("spells.5e"),
    inventory,
    details,
    exportedAt: opts.exportedAt,
    pluginVersion: opts.pluginVersion,
    sourceRef: async (id) => {
      const pin = opts.pins?.[id];
      if (pin) return { ref: pin, refType: "git" };
      const dir = bundles.get(id);
      return dir ? { ref: await contentHash(readSourceBundle(dir).files), refType: "hash" } : undefined;
    },
  });
}
