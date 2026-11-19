/**
 * Version tags, for telling whether a pinned GitHub source has a newer release.
 * Only plain numeric tags (`0.1.2`, `v1.4`) are compared: a commit SHA or a branch
 * name has no order, so a source pinned to one is never offered an update.
 */

const VERSION = /^v?(\d+(?:\.\d+)*)$/;

function parts(tag: string): number[] | undefined {
  const match = VERSION.exec(tag.trim());
  return match ? match[1].split(".").map(Number) : undefined;
}

/** Whether `pin` is a plain version tag, the only kind with an order to compare. */
export function isVersionTag(pin: string | undefined): boolean {
  return !!pin && VERSION.test(pin.trim());
}

/** Negative when `a` is the older version, positive when newer, 0 when equal. */
function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** The highest tag in `tags` that is newer than `pin`, or undefined if `pin` is not a version or is current. */
export function newerTag(pin: string | undefined, tags: readonly string[]): string | undefined {
  const current = pin ? parts(pin) : undefined;
  if (!current) return undefined;
  let best: { tag: string; parts: number[] } | undefined;
  for (const tag of tags) {
    const p = parts(tag);
    if (!p || compare(p, current) <= 0) continue;
    if (!best || compare(p, best.parts) > 0) best = { tag, parts: p };
  }
  return best?.tag;
}
