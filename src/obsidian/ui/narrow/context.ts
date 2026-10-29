/**
 * Narrow-layout settings, reachable from any component without an `obsidian`
 * import. The plugin shell puts the live settings in here; tests supply defaults.
 */

import { createContext, useContext } from "react";
import { DEFAULT_SETTINGS, type NarrowSettings } from "../../settings";

export const NarrowSettingsContext = createContext<NarrowSettings>(DEFAULT_SETTINGS.narrow);

export function useNarrowSettings(): NarrowSettings {
  return useContext(NarrowSettingsContext);
}
