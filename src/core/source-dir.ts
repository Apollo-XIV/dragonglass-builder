/**
 * A source can live in a folder of its location (`SourceRef.dir`). Pure, so the plugin's
 * loaders, the node loader and the tests all join and judge it the same way.
 */

export interface NormalizedDir {
  /** Cleaned up, or absent when there was nothing to say (or it was rejected). */
  dir?: string;
  /** Why it was rejected; when set, nothing should be read. */
  error?: string;
}

/**
 * Backslashes to `/`, no leading or trailing `/`, empty becomes absent. Rejected when it
 * is absolute (a drive letter, or a leading `/` or `\`) or has a `.` or `..` segment.
 */
export function normalizeDir(raw: string | undefined): NormalizedDir {
  if (raw === undefined) return {};
  const slashed = raw.trim().replace(/\\/g, "/");
  if (/^\/|^[A-Za-z]:/.test(slashed)) return { error: `"${raw}" is absolute; a folder in the source's location is relative` };
  const segments = slashed.split("/").filter(Boolean);
  if (segments.some((s) => s === "." || s === ".."))
    return { error: `"${raw}" has a "." or ".." segment; a folder in the source's location cannot leave it` };
  return segments.length ? { dir: segments.join("/") } : {};
}

/** The folder a source's own files are relative to, as a `/`-separated path. Throws on a rejected `dir`. */
export function joinRoot(location: string, dir: string | undefined): string {
  const { dir: clean, error } = normalizeDir(dir);
  if (error) throw new Error(error);
  return clean ? `${location.replace(/[\\/]+$/, "")}/${clean}` : location;
}
