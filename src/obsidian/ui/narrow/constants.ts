/**
 * The tuned values from the mobile UX spec, section 10. They are collected here
 * rather than scattered through the components because every one of them is
 * [Proposed]: the first real-device session will move several, and moving them
 * should mean editing one line, not hunting through five files.
 *
 * Values a user is expected to want control over are settings instead
 * (`NarrowSettings`); these are the ones with no good reason to be in the UI.
 */

/** Layout switching (spec 1). */
export const LAYOUT = {
  /** Desktop layout at or above this container width. */
  desktopMinWidth: 900,
  /** Dead zone around the boundary, so dragging a pane edge doesn't flicker. */
  hysteresis: 40,
} as const;

/** Hold-to-read mechanics (spec 3.2). */
export const HOLD = {
  /** Pointer movement that cancels a hold. */
  cancelDistance: 10,
  /** The fill starts sweeping this long after the press, not immediately. */
  fillDelay: 120,
  /** Haptic when the hold registers. */
  haptic: 14,
  /** Scale applied to the target while held. */
  scale: 0.97,
  /** Bounds on the hold-time setting. */
  minMs: 300,
  maxMs: 600,
} as const;

/** Navigation rail geometry and motion (spec 4.1, 4.2). */
export const RAIL = {
  iconWidth: 40,
  iconHeight: 48,
  /**
   * The pill has no padding and the icons no gap, so the spotlight is flush with
   * its edges and the top and bottom icons' highlights are shaped by the pill's
   * own corner. That makes the scrub zone exactly one icon tall, and every offset
   * measured from the top of the rail a plain multiple of it.
   */
  get zoneHeight(): number {
    return RAIL.iconHeight;
  },
  /** Content padding reserved beside the rail, on top of the icon width. */
  contentClearance: 14,
  /** Inset from the screen edge when the rail is on the left, clear of the
   * Android back gesture and Obsidian's sidebar swipe. */
  leftInset: 14,
  idleOpacity: 0.4,
  /** Time after the last touch or scroll before the rail fades again. */
  idleDelay: 1600,
  /** Hold on an icon this long for its label bubble. */
  labelHold: 350,
  /** Scroll distance within which a scrub snaps to a section start. */
  detentRadius: 28,
  detentHaptic: 6,
  /** On release, glide to a section start this close; otherwise stay put. */
  settleDistance: 90,
  /** Per-frame fraction of the remaining distance, while scrubbing. */
  chaseFactor: 0.4,
  /** Per-frame fraction of the remaining distance, for a glide. */
  glideFactor: 0.2,
  statusPip: 10,
} as const;

/** Scroll ticks (spec 4.3). */
export const TICK = {
  haptic: 8,
  /** At most one tick this often. */
  rateLimit: 70,
} as const;

/** Sheets, toasts and tap targets (spec 3.3, 3.5, 10). */
export const UI = {
  stickyHeaderHeight: 38,
  rollBoxMinWidth: 56,
  rollBoxHeight: 38,
  rowMinHeight: 48,
  levelButtonHeight: 48,
  /** Hold sheets stop here so a top toast never overlaps one. */
  sheetMaxHeightPercent: 75,
  toastDuration: 3600,
  rollHaptic: 10,
  /** Clears Obsidian's floating bottom toolbar. */
  contentBottomPadding: 110,
  /** The "Hold to read" hint shows this many times, then stops teaching. */
  holdHintCount: 2,
} as const;
