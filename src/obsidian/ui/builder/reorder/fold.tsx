/**
 * What a card shows while a drag is under way, kept apart from what it was left
 * showing.
 *
 * A drag folds every card to its header so the list is short enough to see the
 * drop target in. Nothing is saved to put back afterwards: a card's own expanded
 * state is untouched, and `useCardShown` is just that state with the drag's
 * override laid over it, so when the drag ends the override stops and the card is
 * as it was. It knows nothing about how a card folds, which is what lets a layout
 * with fold-outs adopt it without the reorder logic changing.
 */

import { createContext, useContext } from "react";
import { useBuilderFeatures } from "../features";

export const DragFoldContext = createContext(false);

/** True while a drag is folding the cards, and this layout opts into that. */
export function useFoldedByDrag(): boolean {
  const dragging = useContext(DragFoldContext);
  return useBuilderFeatures().foldOnDrag && dragging;
}

/** Whether a card's body shows: its own state, unless a drag has folded it. */
export function useCardShown(open = true): boolean {
  return open && !useFoldedByDrag();
}
