/**
 * Filesystem source loading, for the validation CLI and the unit tests.
 * The plugin never imports this — it reads sources through Obsidian's APIs.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { bundleToLoadedSource, parseManifest, type SourceBundle, type SourceFile } from "../core/content/source-bundle";
import { ContentIndex, type LoadedSource } from "../core/content";

export function listJsonFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".json")) out.push(full);
    }
  };
  walk(root);
  return out;
}

export function readSourceBundle(root: string): SourceBundle {
  const manifestPath = join(root, "source.json");
  const { manifest } = parseManifest(
    existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "{}",
    root.split(sep).filter(Boolean).pop() ?? root,
  );
  const contentRoot = join(root, "content");
  const files: SourceFile[] = listJsonFiles(contentRoot).map((path) => ({
    path: relative(root, path),
    text: readFileSync(path, "utf8"),
  }));
  return { manifest, files };
}

export function loadSourceFromDisk(root: string): LoadedSource {
  const bundle = readSourceBundle(root);
  const loaded = bundleToLoadedSource(bundle);
  const manifestPath = join(root, "source.json");
  if (existsSync(manifestPath)) {
    const { diagnostics } = parseManifest(readFileSync(manifestPath, "utf8"), loaded.id);
    loaded.diagnostics = [...(loaded.diagnostics ?? []), ...diagnostics];
  }
  return loaded;
}

/** Builds an index from source directories, highest priority first. */
export function indexFromDisk(...roots: string[]): ContentIndex {
  return ContentIndex.build(roots.map(loadSourceFromDisk));
}
