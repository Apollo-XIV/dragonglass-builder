import type { SourceRef } from "../core/types";

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
}

export interface DragonglassSettings {
  /** Vault-wide sources, highest priority first. */
  sources: SourceRef[];
  caching: CacheTier;
  /** Hide options whose prerequisites aren't met, instead of warning on them. */
  enforceRequirements: boolean;
  /** Where "New character" creates folders. */
  charactersFolder: string;
  /** Default hit point method for new levels. */
  defaultHp: "max" | "average" | "roll";
  layout: LayoutSettings;
  /** Milliseconds to wait before writing after a state change. */
  writeDebounceMs: number;
}

export const DEFAULT_SETTINGS: DragonglassSettings = {
  sources: [],
  caching: "smart",
  enforceRequirements: false,
  charactersFolder: "Characters",
  defaultHp: "average",
  layout: {
    accent: "",
    compact: false,
    showBreakdowns: true,
    playMode: false,
  },
  writeDebounceMs: 400,
};

/** Fills in anything a settings file written by an older version is missing. */
export function withDefaults(stored: Partial<DragonglassSettings> | null | undefined): DragonglassSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    layout: { ...DEFAULT_SETTINGS.layout, ...(stored?.layout ?? {}) },
    sources: stored?.sources ?? [],
  };
}

export function describeSource(ref: SourceRef): string {
  switch (ref.type) {
    case "github":
      return `GitHub ${ref.location}${ref.pin ? `@${ref.pin}` : " (unpinned)"}`;
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
