import type { LayoutFile, NarrowPrefs, SourceRef } from "../core/types";

export type CacheTier = "none" | "smart" | "all";

export interface LayoutSettings {
  /** CSS colour, or empty to use the theme's accent. */
  accent: string;
  /** Tighter spacing, for small screens and dense sheets. */
  compact: boolean;
  /** Show the contribution breakdown in stat tooltips. */
  showBreakdowns: boolean;
  /** Hide builder controls on the sheet, for play at the table. */
  playMode: boolean;
  /** Hide the marker on parts that nobody has reviewed. The parts behave the same either way. */
  hideUnverifiedMarkers: boolean;
  /**
   * Resources every character pins to the stat cluster, most wanted first. A
   * character's own `layout.5e` pins come first; content weights come last.
   */
  pins: string[];
}

/** The rail sections a layout can offer, in the spec's default order (4.4). */
export const SHEET_RAIL_ORDER = [
  "overview",
  "actions",
  "spells",
  "inventory",
  "features",
  "proficiencies",
  "details",
] as const;

export const BUILDER_RAIL_ORDER = [
  "origin",
  "levels",
  "spells",
  "equipment",
  "details",
  "review",
] as const;

/**
 * The narrow (phone, vertical tablet, side pane) layout. The shape lives in
 * core, because `layout.5e` carries the same fields per character; these are
 * the plugin-wide values every character falls back to.
 */
export type NarrowSettings = NarrowPrefs;

/**
 * Resolves the preferences for one character: the character's own `layout.5e`
 * first, then the plugin's settings (spec: Styling). An override of `undefined`
 * is not an override — a character that says nothing about the rail follows the
 * plugin, which is what makes a plugin-wide change take effect everywhere.
 */
export function resolveNarrow(settings: NarrowSettings, layout?: LayoutFile): NarrowSettings {
  if (!layout?.narrow) return settings;
  const resolved = { ...settings };
  for (const [key, value] of Object.entries(layout.narrow))
    if (value !== undefined) Object.assign(resolved, { [key]: value });
  return resolved;
}

/** The pinned-resource layers for one character, most specific first. */
export function resolvePins(
  settings: DragonglassSettings,
  layout?: LayoutFile,
): { character?: string[]; plugin?: string[] } {
  return { character: layout?.pins, plugin: settings.layout.pins };
}

/** The accent colour for a character: its own, then the plugin's, then the theme's. */
export function resolveAccent(settings: DragonglassSettings, layout?: LayoutFile): string {
  return layout?.accent?.trim() || settings.layout.accent.trim() || "";
}

export interface DragonglassSettings {
  /** Vault-wide sources, highest priority first. */
  sources: SourceRef[];
  caching: CacheTier;
  /** Hide options whose prerequisites aren't met, instead of warning on them. */
  enforceRequirements: boolean;
  /** Where "New character" creates folders. */
  charactersFolder: string;
  /** Vault folder the Export character command writes to. */
  exportFolder: string;
  /** Default hit point method for new levels. */
  defaultHp: "max" | "average" | "roll";
  layout: LayoutSettings;
  narrow: NarrowSettings;
  /** Milliseconds to wait before writing after a state change. */
  writeDebounceMs: number;
}

/**
 * The sources a fresh install starts with: the two converted SRDs. Pinned to a commit,
 * so a push to either repo never changes a character's content underneath it. Moving to
 * a newer conversion is a pin edit in settings. They are only seeded when no settings
 * have been saved, so removing them sticks.
 */
export const DEFAULT_SOURCES: readonly SourceRef[] = [
  {
    id: "srd",
    type: "github",
    location: "Apollo-XIV/dragonglass-source-5e-srd-5.1",
    pin: "32a754c4809d579909ab7a68efead6793c4f9d9a",
    name: "System Reference Document 5.1",
  },
  {
    id: "srd24",
    type: "github",
    location: "Apollo-XIV/dragonglass-source-5e-srd-5.2",
    pin: "5b98d41797954ed41369983247e869ffbeb65e71",
    name: "System Reference Document 5.2",
  },
];

export const DEFAULT_SETTINGS: DragonglassSettings = {
  sources: DEFAULT_SOURCES.map((ref) => ({ ...ref })),
  caching: "smart",
  enforceRequirements: false,
  charactersFolder: "Characters",
  exportFolder: "Exports",
  defaultHp: "average",
  layout: {
    accent: "",
    compact: false,
    showBreakdowns: true,
    playMode: false,
    hideUnverifiedMarkers: false,
    pins: [],
  },
  narrow: {
    layout: "auto",
    desktopNeedsLandscape: true,
    railSide: "right",
    railHeight: "middle",
    railTap: "glide",
    scrollTicks: true,
    holdMs: 450,
    haptics: true,
    infoButtons: false,
    holdHint: true,
    sheetSections: [...SHEET_RAIL_ORDER],
    builderSections: [...BUILDER_RAIL_ORDER],
  },
  writeDebounceMs: 400,
};

/**
 * A stored section order from an older version: sections it no longer has are
 * dropped, and any it predates go in at their default place, after the section
 * they follow by default. Without this a stored list replaces the default
 * outright, so a section added since would always land at the bottom.
 */
export function railOrder(stored: readonly string[] | undefined): string[] {
  if (!stored) return [...SHEET_RAIL_ORDER];
  const known = new Set<string>(SHEET_RAIL_ORDER);
  const order = stored.filter((id, i) => known.has(id) && stored.indexOf(id) === i);
  SHEET_RAIL_ORDER.forEach((id, i) => {
    if (order.includes(id)) return;
    const before = i > 0 ? order.indexOf(SHEET_RAIL_ORDER[i - 1]) + 1 : 0;
    order.splice(before, 0, id);
  });
  return order;
}

/** Fills in anything a settings file written by an older version is missing. */
export function withDefaults(stored: Partial<DragonglassSettings> | null | undefined): DragonglassSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    layout: { ...DEFAULT_SETTINGS.layout, ...(stored?.layout ?? {}) },
    narrow: {
      ...DEFAULT_SETTINGS.narrow,
      ...(stored?.narrow ?? {}),
      sheetSections: railOrder(stored?.narrow?.sheetSections),
    },
    sources: stored?.sources ?? DEFAULT_SETTINGS.sources.map((ref) => ({ ...ref })),
  };
}

export function describeSource(ref: SourceRef): string {
  switch (ref.type) {
    case "github":
      return `GitHub${ref.auth ? " (private)" : ""} ${ref.location}${ref.pin ? `@${ref.pin}` : " (unpinned)"}`;
    case "vault":
      return `Vault folder ${ref.location}`;
    case "path":
      return `Local path ${ref.location}`;
    case "url":
      return ref.location;
  }
}

/**
 * Parses what a user is likely to paste into the "add source" field: a GitHub URL,
 * an owner/repo pair, or a path.
 */
export function parseSourceInput(input: string): Omit<SourceRef, "id"> | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const githubUrl = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+))?\/?$/,
  );
  if (githubUrl)
    return { type: "github", location: `${githubUrl[1]}/${githubUrl[2]}`, pin: githubUrl[3], enabled: true };

  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed) && !trimmed.includes(".json"))
    return { type: "github", location: trimmed, enabled: true };

  if (/^https?:\/\//.test(trimmed)) return { type: "url", location: trimmed, enabled: true };

  // An absolute path is outside the vault (desktop only); anything else is vault-relative.
  const absolute = trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\");
  return { type: absolute ? "path" : "vault", location: trimmed, enabled: true };
}

/** A stable id for a newly added source, derived from its location. */
export function suggestSourceId(ref: Omit<SourceRef, "id">): string {
  const tail = ref.location.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "source";
  return tail.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "source";
}
