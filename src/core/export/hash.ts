import type { SourceFile } from "../content/source-bundle";

/**
 * A hash of a source's files, for the `ref` of a source that has no pin. Path and
 * text both count, in path order, so renaming a file changes it and the order the
 * loader happened to read them in does not.
 */
export async function contentHash(files: SourceFile[]): Promise<string> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    parts.push(enc.encode(f.path), new Uint8Array([0]), enc.encode(f.text), new Uint8Array([0]));
  }
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", all));
  return `sha256:${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
