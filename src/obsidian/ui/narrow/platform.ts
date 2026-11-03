/**
 * The shell boundary (spec 8.7). The narrow UI needs a few things only the host
 * app can do — vibrate, set the view title, know whether it is on a phone — and
 * none of them should put an `obsidian` import in a component. They arrive
 * through this interface instead, which also keeps the UI renderable in tests.
 */

import { createContext, useContext } from "react";
import { NO_DRAFTS, type DraftStore } from "../builder/drafts";

export interface Haptics {
  /** Milliseconds. A no-op where the platform has no vibration API. */
  buzz(ms: number): void;
}

export interface Shell {
  haptics: Haptics;
  /** Where builder drafts are kept, outside the character's files (spec 7.9). */
  drafts: DraftStore;
  /** Updates the view's title, which carries the HUD (spec 2.2). */
  setTitle(text: string): void;
  /** Opens this character's sheet, which is where Finish goes (spec 7.10). */
  openSheet(): void;
  /** Lets the shell adjust the container the layout lives in: the narrow layout
   * owns its own scrolling, so the view's element must stop scrolling. */
  setLayout(mode: "narrow" | "desktop"): void;
}

/** `navigator.vibrate` is Android-only; everywhere else this does nothing. */
export function createHaptics(enabled: () => boolean): Haptics {
  const vibrate = typeof navigator !== "undefined" ? navigator.vibrate?.bind(navigator) : undefined;
  return {
    buzz(ms: number): void {
      // Every haptic in the UI has a visual counterpart, so dropping it silently
      // here costs nothing but the feel.
      if (!vibrate || !enabled()) return;
      try {
        vibrate(ms);
      } catch {
        // Some Android webviews throw if vibration is blocked by policy.
      }
    },
  };
}

export const NO_HAPTICS: Haptics = { buzz: () => {} };

export const ShellContext = createContext<Shell>({
  haptics: NO_HAPTICS,
  drafts: NO_DRAFTS,
  setTitle: () => {},
  setLayout: () => {},
  openSheet: () => {},
});

export function useShell(): Shell {
  return useContext(ShellContext);
}

export function useHaptics(): Haptics {
  return useContext(ShellContext).haptics;
}
