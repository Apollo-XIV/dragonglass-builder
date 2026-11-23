/**
 * Every icon the plugin names by what it stands for rather than by what it
 * looks like: `dg-concentration`, not `hourglass`. Registered once at load so
 * `setIcon` (and so the `Icon` component) finds them by name like any other,
 * and so swapping a picture is a change here, not a hunt through the views.
 *
 * Three sources, all drawn in Lucide's 24-unit outline style:
 * - **Game icons** Lucide has no equivalent for (the d20, the vial).
 * - **Lucide icons newer than Obsidian's bundle**, vendored from lucide-static
 *   1.78.0 (ISC). Obsidian 1.14.5 ships without them.
 * - **Aliases** of the Lucide icons Obsidian does ship, copied out of
 *   `getIcon` at load. The spell icon roles come from the Dragonglass spell
 *   icon spec; a role's name is its content id where it has one, so
 *   `dg-damage-${damageType}` and `dg-school-${school}` need no lookup table.
 *
 * The paths are drawn in Lucide's 24-unit box, but `addIcon` wraps whatever it
 * is given in a `viewBox="0 0 100 100"` — so without the scale below, every one
 * of these renders at under a quarter size in the icon's top-left corner. No
 * stroke width is set: the group inherits Obsidian's `--icon-stroke` and the
 * scale carries it into the 24-unit box, so these weigh the same as the Lucide
 * icons beside them at every icon size.
 */

import { addIcon, getIcon } from "obsidian";

/** 24 units of drawing in the 100-unit box `addIcon` declares. */
const SCALE = 100 / 24;

const STROKE = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

/** A d20 in plan: the outer hexagon, the upper face, and the spokes to its points. */
const D20 = `
  <path d="M12 2 21 7v10l-9 5-9-5V7z" />
  <path d="M12 7 17.5 10 12 13 6.5 10z" />
  <path d="M12 2v5M3 7l3.5 3M21 7l-3.5 3M6.5 10 12 22M17.5 10 12 22" />
`;

/** A flask with a fill line, for the hit point panel. */
const VIAL = `
  <path d="M8 3h8M9 3v6l-3.2 7.4A3 3 0 0 0 8.6 21h6.8a3 3 0 0 0 2.8-4.6L15 9V3" />
  <path d="M7.2 14h9.6" />
`;

/** Lucide `book-bookmark`. */
const BOOK_BOOKMARK = `
  <path d="M10 2v7.751a.25.25 0 00.407.195l2.28-1.834a.5.5 0 01.627 0l2.28 1.834A.25.25 0 0016 9.751V2" />
  <path d="M4 19.5v-15A2.5 2.5 0 016.5 2H19a1 1 0 011 1v18a1 1 0 01-1 1H6.5a1 1 0 010-5H20" />
`;

/** Lucide `letter-v`. */
const LETTER_V = `<path d="m6 4 5.765 15.835a.25.25 0 00.47 0L18 4" />`;

/** Lucide `letter-s`. */
const LETTER_S = `<path d="M17 4h-7a4 4 0 000 8h4a4 4 0 010 8H6" />`;

/** Lucide `letter-m`. */
const LETTER_M = `<path d="M4 20V4.253a.25.25 0 01.454-.144l6.727 9.467a1 1 0 001.63 0l6.735-9.468a.25.25 0 01.454.145V20" />`;

/** Lucide `line-dot-left-horizontal`. */
const LINE_DOT_LEFT = `
  <path d="M9 12h12" />
  <circle cx="6" cy="12" r="3" />
`;

/** Lucide `tombstone`. */
const TOMBSTONE = `
  <path d="M11 10h2" />
  <path d="M19 21V10a7 7 0 00-14 0v11" />
  <path d="M2 21h20" />
  <path d="M9 14h6" />
`;

/** Icons drawn here, by name. */
const DRAWN: Record<string, string> = {
  "dg-d20": D20,
  "dg-vial": VIAL,

  "dg-ritual": BOOK_BOOKMARK,
  "dg-verbal": LETTER_V,
  "dg-somatic": LETTER_S,
  // A costly material component shows this and `dg-material-cost` together.
  "dg-material": LETTER_M,
  "dg-area-line": LINE_DOT_LEFT,
  "dg-school-necromancy": TOMBSTONE,
};

/** Icons that are a Lucide icon Obsidian ships, by name. */
const ALIASES: Record<string, string> = {
  "dg-concentration": "hourglass",
  "dg-material-cost": "coins",
  "dg-action": "play",
  "dg-bonus-action": "fast-forward",
  "dg-reaction": "undo-2",

  "dg-range-self": "person-standing",
  "dg-range-touch": "hand",
  // Shown with the distance after it.
  "dg-range": "crosshair",

  "dg-damage-fire": "flame",
  "dg-damage-cold": "snowflake",
  "dg-damage-acid": "test-tube-diagonal",
  "dg-damage-poison": "bubbles",
  "dg-damage-necrotic": "skull",
  "dg-damage-radiant": "sun",
  "dg-damage-lightning": "zap",
  "dg-damage-thunder": "waves-horizontal",
  "dg-damage-force": "orbit",
  "dg-damage-psychic": "brain",
  "dg-damage-slashing": "sword",
  "dg-damage-piercing": "bow-arrow",
  "dg-damage-bludgeoning": "gavel",

  "dg-area-cube": "square-dashed",
  "dg-area-sphere": "circle-dashed",
  "dg-area-cylinder": "cylinder",
  "dg-area-emanation": "circle-dot-dashed",

  "dg-school-abjuration": "shield",
  "dg-school-conjuration": "rotate-3d",
  "dg-school-divination": "scan-eye",
  "dg-school-enchantment": "hand-heart",
  "dg-school-evocation": "wand-sparkles",
  "dg-school-illusion": "venetian-mask",
  "dg-school-transmutation": "refresh-cw",
};

/** Aliases drawn turned, so no view has to remember to turn them. */
const ROTATED: Record<string, { from: string; degrees: number }> = {
  // The spec turns the cone to point right, the way the line does.
  "dg-area-cone": { from: "triangle-dashed", degrees: -90 },
};

export function registerGameIcons(): void {
  for (const [name, svg] of Object.entries(DRAWN)) addIcon(name, scaled(svg));
  for (const [name, from] of Object.entries(ALIASES)) alias(name, from);
  for (const [name, { from, degrees }] of Object.entries(ROTATED)) alias(name, from, degrees);
}

function alias(name: string, from: string, degrees = 0): void {
  const source = getIcon(from);
  if (!source) {
    console.warn(`dragonglass: no Lucide icon "${from}" to register as "${name}"`);
    return;
  }
  const body = degrees ? `<g transform="rotate(${degrees} 12 12)">${source.innerHTML}</g>` : source.innerHTML;
  addIcon(name, scaled(body));
}

function scaled(svg: string): string {
  return `<g transform="scale(${SCALE})" ${STROKE}>${svg}</g>`;
}
