#!/usr/bin/env node
/**
 * Exports a character folder as the plugin would, from disk.
 *
 *   npm run export -- vault/Characters/Ilsa content/srd > ilsa.json
 *   npm run export -- <character> <source>... [--pin id=ref]
 */

import { resolve as resolvePath } from "node:path";
import { validateExport } from "../core/export";
import { exportFromDisk } from "../node/export-character";

const args = process.argv.slice(2);
const pins: Record<string, string> = {};
const dirs: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--pin") {
    const [id, ref] = (args[++i] ?? "").split("=");
    if (id && ref) pins[id] = ref;
  } else dirs.push(args[i]);
}
const [characterDir, ...sourceDirs] = dirs;
if (!characterDir || !sourceDirs.length) {
  console.error("usage: export <character-folder> <source-folder>... [--pin source-id=ref]");
  process.exit(2);
}

async function main(): Promise<void> {
const doc = await exportFromDisk({
  characterDir: resolvePath(characterDir),
  sourceDirs: sourceDirs.map((d) => resolvePath(d)),
  coreDir: resolvePath(__dirname, "../../content/core"),
  exportedAt: new Date().toISOString(),
  pluginVersion: "cli",
  pins,
});
const result = validateExport(JSON.parse(JSON.stringify(doc)));
if (!result.ok) {
  for (const e of result.errors) console.error(`${e.path}: ${e.message}`);
  process.exit(1);
}
process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
