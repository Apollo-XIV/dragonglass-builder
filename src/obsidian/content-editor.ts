/**
 * Writing elements back into a vault or local-path source, for homebrew made through
 * the sources panel rather than by hand in an editor. GitHub and URL sources are
 * fetched, so they stay read-only here — `SourceManager.writeFile` refuses them.
 *
 * An element's home file is whichever file it was loaded from (`originFile`), so an
 * edit never scatters a source's files. A brand-new element has no origin yet, so it
 * lands in `content/<kind>.json`, appended to that file's array (created empty if the
 * file doesn't exist yet).
 */

import type { Element, SourceRef } from "../core/types";
import type { SourceManager } from "./sources";
import { isWritableSource } from "./sources";

/** The file a new element of this kind lands in, absent an origin to keep. */
export function defaultFileFor(kind: string): string {
  const slug = kind.endsWith("s") ? kind : `${kind}s`;
  return `content/${slug}.json`;
}

function idOf(raw: unknown): string | undefined {
  return raw && typeof raw === "object" && typeof (raw as { id?: unknown }).id === "string"
    ? (raw as { id: string }).id
    : undefined;
}

async function readJsonFile(sources: SourceManager, ref: SourceRef, file: string): Promise<unknown> {
  if (!(await sources.fileExists(ref, file))) return undefined;
  const text = await sources.readFile(ref, file);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`"${file}" is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function writeJsonFile(sources: SourceManager, ref: SourceRef, file: string, data: unknown): Promise<void> {
  await sources.writeFile(ref, file, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Adds or replaces one element in a writable source. `previousId` covers the rare
 * case an edit changes an element's id — without it the edit would leave the old id
 * behind as a second, orphaned entry.
 */
export async function upsertElement(
  sources: SourceManager,
  ref: SourceRef,
  element: Element,
  options: { file?: string; previousId?: string } = {},
): Promise<{ file: string }> {
  if (!isWritableSource(ref)) throw new Error(`"${ref.id}" is read-only; only a vault folder or a local path source can be edited`);
  const file = options.file ?? defaultFileFor(element.kind);
  const matchId = options.previousId ?? element.id;
  const existing = await readJsonFile(sources, ref, file);

  if (existing === undefined) {
    await writeJsonFile(sources, ref, file, [element]);
  } else if (Array.isArray(existing)) {
    const index = existing.findIndex((raw) => idOf(raw) === matchId);
    const next = index === -1 ? [...existing, element] : existing.map((raw, i) => (i === index ? element : raw));
    await writeJsonFile(sources, ref, file, next);
  } else if (idOf(existing) === matchId) {
    await writeJsonFile(sources, ref, file, element);
  } else {
    throw new Error(`"${file}" holds a single element whose id doesn't match "${matchId}"`);
  }
  return { file };
}

/** Removes one element from a writable source's file by id. */
export async function removeElement(sources: SourceManager, ref: SourceRef, id: string, file: string): Promise<void> {
  if (!isWritableSource(ref)) throw new Error(`"${ref.id}" is read-only; only a vault folder or a local path source can be edited`);
  const existing = await readJsonFile(sources, ref, file);
  if (existing === undefined) return;
  if (Array.isArray(existing)) {
    await writeJsonFile(sources, ref, file, existing.filter((raw) => idOf(raw) !== id));
  } else if (idOf(existing) === id) {
    await writeJsonFile(sources, ref, file, []);
  }
}

export interface NewSourceInput {
  type: "vault" | "path";
  location: string;
  id: string;
  name?: string;
  description?: string;
}

/** Scaffolds `source.json` and an empty `content/` folder for a brand-new source. */
export async function createSource(sources: SourceManager, input: NewSourceInput): Promise<SourceRef> {
  await sources.createSource(
    { type: input.type, location: input.location, id: input.id, name: input.name, enabled: true },
    { id: input.id, name: input.name, description: input.description },
  );
  return { id: input.id, type: input.type, location: input.location, name: input.name, enabled: true };
}
