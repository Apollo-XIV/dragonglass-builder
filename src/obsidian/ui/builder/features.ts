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
  /** Minus and plus fixed to the bottom of the screen, to step the selected ability score. */
  abilityStepButtons: boolean;
  /** The Notes block of file and resolver diagnostics. */
  diagnostics: boolean;
  /** The read-only class and subclass browser. */
  browse: boolean;
  /** Content sources and the content editor. */
  sources: boolean;
  /**
   * Every level card folds to its header while a level is being dragged, and opens
   * again after. Off where cards have no fold-outs yet; the reorder logic does not
   * care which, so putting it on a phone is this flag and nothing else.
   */
  foldOnDrag: boolean;
  /**
   * Picking in a multi-pick choice commits at once, rather than when Done is pressed. Only
   * pickers that replace a choice's answer (`PickerSpec.live`) are affected.
   */
  liveCommit: boolean;
  /** The planned half of the Progression list starts open, rather than behind its divider. */
  plannedOpen: boolean;
}

export const NO_FEATURES: BuilderFeatures = {
  levelHp: false,
  xpHint: false,
  enforceToggle: false,
  inlinePicker: false,
  pickerSearch: false,
  rowEditing: false,
  customItem: false,
  abilityStepButtons: false,
  diagnostics: false,
  browse: false,
  sources: false,
  foldOnDrag: false,
  liveCommit: false,
  plannedOpen: false,
};

export const FeaturesContext = createContext<BuilderFeatures>(NO_FEATURES);

export function useBuilderFeatures(): BuilderFeatures {
  return useContext(FeaturesContext);
}
