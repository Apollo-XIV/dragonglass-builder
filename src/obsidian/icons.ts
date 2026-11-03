/**
 * Game icons Lucide doesn't ship, in Lucide's own outline style: a 24-unit box,
 * `currentColor` strokes, 2 units wide, round caps. Registered once at load so
 * `setIcon` (and so the `Icon` component) finds them by name like any other.
 *
 * The paths are drawn in Lucide's 24-unit box, but `addIcon` wraps whatever it
 * is given in a `viewBox="0 0 100 100"` — so without the scale below, every one
 * of these renders at under a quarter size in the icon's top-left corner. The
 * stroke scales with the drawing, which is why its width stays at 2.
 */

import { addIcon } from "obsidian";

/** 24 units of drawing in the 100-unit box `addIcon` declares. */
const SCALE = 100 / 24;

const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

/** A d20 in plan: the outer hexagon, the upper face, and the spokes to its points. */
const D20 = `
  <g ${STROKE}>
    <path d="M12 2 21 7v10l-9 5-9-5V7z" />
    <path d="M12 7 17.5 10 12 13 6.5 10z" />
    <path d="M12 2v5M3 7l3.5 3M21 7l-3.5 3M6.5 10 12 22M17.5 10 12 22" />
  </g>
`;

/** A heart with a vertical hatch, for the hit point panel. */
const VIAL = `
  <g ${STROKE}>
    <path d="M8 3h8M9 3v6l-3.2 7.4A3 3 0 0 0 8.6 21h6.8a3 3 0 0 0 2.8-4.6L15 9V3" />
    <path d="M7.2 14h9.6" />
  </g>
`;

export function registerGameIcons(): void {
  addIcon("dg-d20", scaled(D20));
  addIcon("dg-vial", scaled(VIAL));
}

function scaled(svg: string): string {
  return `<g transform="scale(${SCALE})">${svg}</g>`;
}
