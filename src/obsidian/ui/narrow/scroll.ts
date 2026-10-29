/**
 * The scrolling maths behind the rail and the snapping (spec 4.2, 4.3).
 *
 * All of it is pure and takes plain numbers, because the behaviour it describes —
 * which section you are in, where a finger halfway down the rail points, whether
 * a release should settle — is exactly the part worth having tests for.
 */

import { RAIL } from "./constants";

/** A scroll position a section (or a builder level card) starts at. */
export interface Stop {
  id: string;
  /** Scroll offset that puts this stop's header at the top of the viewport. */
  start: number;
  /** Minor stops tick and detent but get no rail icon (spec 4.3, 7.3). */
  minor?: boolean;
}

/**
 * The stop whose header is currently pinned: the last one at or above the top.
 *
 * The tolerance absorbs the pixel or two between a measured start (fractional,
 * from `getBoundingClientRect`) and a scroll position (rounded by the browser).
 * Without it, landing a hair short of a section's start reports the section
 * above, which is visible as the rail highlighting the wrong icon.
 */
export function activeStop(stops: Stop[], position: number, tolerance = 4): number {
  let active = 0;
  for (let i = 0; i < stops.length; i++) if (stops[i].start <= position + tolerance) active = i;
  return active;
}

/**
 * The stop crossed between two scroll positions, if any.
 *
 * Ticks use this rather than "is a header within a few pixels of the top",
 * because a fling or a wheel tick covers a hundred pixels at a time and jumps
 * clean over any window narrow enough to mean "at the top". Direction doesn't
 * matter: scrolling back up past a header is just as much an arrival.
 */
export function crossedStop(stops: Stop[], from: number, to: number): number | undefined {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const index = stops.findIndex((stop) => stop.start > low && stop.start <= high);
  return index === -1 ? undefined : index;
}

/**
 * How much empty space the end of the document needs for the last section's
 * header to be able to reach the top.
 *
 * Without it the final section — Details on the sheet, Review in the builder —
 * can never become the active one: there is nothing left to scroll, so its rail
 * icon has nowhere to go and the section can't be read at the top of the screen.
 * The document is short by exactly the viewport minus that section's own height.
 */
export function tailSpace(viewportHeight: number, lastSectionHeight: number, minimum: number): number {
  // A couple of pixels of slack, because the exact amount leaves the last
  // header a rounding error short of the top. Never more than a viewport:
  // that is the most scrolling the last section can possibly need, and it
  // bounds the damage if a height is measured mid-layout.
  const needed = viewportHeight - lastSectionHeight + 2;
  return Math.min(Math.max(minimum, needed), Math.max(minimum, viewportHeight));
}

/** Index of the stop nearest `position`, if one is within `radius`. */
export function nearestStop(stops: Stop[], position: number, radius: number): number | undefined {
  let best: number | undefined;
  let bestDistance = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const distance = Math.abs(stops[i].start - position);
    if (distance <= radius && distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Where a finger on the rail points. Each icon owns a zone of its own height plus
 * the gap; within zone *i* the finger maps linearly onto the scroll range from
 * section *i* to section *i+1*, and the last zone runs to the end of the
 * document. The mapping is continuous across the boundaries, so a slow drag
 * scrubs smoothly rather than stepping.
 */
export function scrubTarget({
  pointerY,
  railTop,
  starts,
  maxScroll,
  zoneHeight = RAIL.zoneHeight,
}: {
  pointerY: number;
  railTop: number;
  starts: number[];
  maxScroll: number;
  zoneHeight?: number;
}): number {
  const zones = starts.length;
  if (zones === 0) return 0;
  const raw = (pointerY - railTop) / zoneHeight;
  const clamped = Math.min(Math.max(raw, 0), zones);
  const index = Math.min(Math.floor(clamped), zones - 1);
  const t = clamped - index;
  const from = Math.min(starts[index], maxScroll);
  const to = index + 1 < zones ? Math.min(starts[index + 1], maxScroll) : maxScroll;
  return from + (to - from) * t;
}

/** Which rail zone a finger is over, for the label bubble while scrubbing. */
export function scrubZone(pointerY: number, railTop: number, zones: number, zoneHeight = RAIL.zoneHeight): number {
  if (zones === 0) return 0;
  const raw = Math.floor((pointerY - railTop) / zoneHeight);
  return Math.min(Math.max(raw, 0), zones - 1);
}

/**
 * Continuous position for the rail's thumb: the active icon's index plus how far
 * through its section you are, so the thumb moves while you scroll inside one
 * section rather than jumping icon to icon.
 */
export function railProgress(stops: Stop[], position: number, maxScroll: number): number {
  if (stops.length === 0) return 0;
  const index = activeStop(stops, position);
  const start = stops[index].start;
  const end = index + 1 < stops.length ? stops[index + 1].start : maxScroll;
  const span = end - start;
  const fraction = span > 0 ? Math.min(Math.max((position - start) / span, 0), 1) : 0;
  return index + fraction;
}

/**
 * Exponential ease-out: each frame covers a fixed fraction of what's left. It
 * reads as a glide of roughly 250 to 300ms at the spec's 20% without needing a
 * duration, which matters because the distance varies hugely.
 */
export function approach(current: number, target: number, factor: number): number {
  const next = current + (target - current) * factor;
  // Below a pixel the easing would crawl forever; land on the target instead.
  return Math.abs(target - next) < 0.5 ? target : next;
}
