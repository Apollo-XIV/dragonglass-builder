import { join } from "node:path";
import { ContentIndex, type LoadedSource } from "../src/core/content";
import { indexFromDisk } from "../src/node/load-source";
import type { Ability, BuildFile, Element } from "../src/core/types";

export const CONTENT_ROOT = join(__dirname, "..", "content");

let cached: ContentIndex | undefined;

/** The real core + SRD content, as the plugin would load it. */
export function srdIndex(): ContentIndex {
  cached ??= indexFromDisk(join(CONTENT_ROOT, "srd"), join(CONTENT_ROOT, "core"));
  return cached;
}

/** A synthetic index: core kinds and stat paths from disk, plus inline test elements. */
export function testIndex(elements: Element[], extra: LoadedSource[] = []): ContentIndex {
  const core = indexFromDisk(join(CONTENT_ROOT, "core"));
  return ContentIndex.build([
    ...extra,
    { id: "test", name: "Test", elements },
    { id: "core", name: "Core", elements: core.all() },
  ]);
}

export const TEST_BOOK: Element = {
  id: "test",
  kind: "sourcebook",
  name: "Test Book",
  source: "test",
  abbreviation: "TEST",
};

export function scores(overrides: Partial<Record<Ability, number>> = {}): Record<Ability, number> {
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...overrides };
}

export function build(partial: Partial<BuildFile> = {}): BuildFile {
  return {
    kind: "build",
    schemaVersion: 1,
    level: partial.levels?.length ?? 1,
    abilities: { method: "manual", base: scores() },
    levels: [],
    ...partial,
  };
}
