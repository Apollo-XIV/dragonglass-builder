/**
 * What a layout turns on beyond the builder every layout has.
 *
 * Each flag is a component or an option written once. A layout that wants one
 * sets it; nothing else about the section changes. The narrow layout sets none of
 * them today, so putting one on a phone is a line in `NarrowRoot` and a CSS job.
 * Both shells name every key (tests/builder-features.test.ts), so a new flag
 * cannot be added to one and forgotten in the other.
 */

import { createContext, useContext } from "react";

export interface BuilderFeatures {
  /** Per-level hit points: maximum, average or rolled. */
  levelHp: boolean;
  /** "Enough XP for level N" on the details section. */
  xpHint: boolean;
  /** The enforce-prerequisites switch. */
  enforceToggle: boolean;
  /**
   * A choice's options open under its row, like a drop-down, and are read in the
   * layout's reading pane, rather than in a sheet of their own.
   */
  inlinePicker: boolean;
  /** A search box and filter chips in the picker. */
  pickerSearch: boolean;
  /** Remove a spell or an item from its row. */
  rowEditing: boolean;
  /** Create an item that is in no source. */
  customItem: boolean;
  /** Typed ability scores, with the method's rules beside them. */
  abilityInputs: boolean;
  /** The Notes block of file and resolver diagnostics. */
  diagnostics: boolean;
  /** The read-only class and subclass browser. */
  browse: boolean;
  /** Content sources and the content editor. */
  sources: boolean;
}

export const NO_FEATURES: BuilderFeatures = {
  levelHp: false,
  xpHint: false,
  enforceToggle: false,
  inlinePicker: false,
  pickerSearch: false,
  rowEditing: false,
  customItem: false,
  abilityInputs: false,
  diagnostics: false,
  browse: false,
  sources: false,
};

export const FeaturesContext = createContext<BuilderFeatures>(NO_FEATURES);

export function useBuilderFeatures(): BuilderFeatures {
  return useContext(FeaturesContext);
}
