/**
 * The drag, as a state machine over the list (progression spec: conflict rule,
 * anticipation and handoff).
 *
 * Nothing here knows about React, the DOM or dnd-kit. The caller measures the
 * list, hands over where the pointer is in list coordinates, and gets back the
 * order the drag is currently proposing, the group being carried and what the
 * anchor is doing. That is what makes the thresholds testable, and what lets the
 * same logic sit under a mouse, a thumb and a keyboard.
 *
 * ## The model
 *
 * The dragged **group** is one class's levels: an **anchor** (the card under the
 * thumb, always the lowest level in the group) and a **tail** of higher levels
 * carried below it. Everything else is `rest`, in order, and the group sits in the
 * gap before `rest[at]`.
 *
 * ## Thresholds
 *
 * Every transition is recorded on a stack with the pointer position it fired at.
 * Reversing one means popping it when the pointer crosses back over that same
 * line, so a drag is exactly reversible, including handing the anchor back at the
 * line it was handed over at. A fresh transition is only looked for in the
 * direction the top of the stack was travelling, which is what stops the line to
 * hop over a card from competing with the line to undo hopping over it.
 *
 * The lines themselves: the anchor hops over the card below once its bottom edge
 * passes that card's middle, and over the card above once its top edge passes the
 * card's middle. The tail is ignored for the second and counted for the first
 * (the card below sits beyond the tail), which is the spec's "the tail floats and
 * never affects the drop position".
 */

export interface DragItem {
  key: string;
  /** Absent for the divider, which conflicts with nothing. */
  class?: string;
}

export interface Layout {
  /** Height of every item, spacing included, as measured with the cards collapsed. */
  heights: Record<string, number>;
  /** Class of every item that has one. */
  classOf: Record<string, string | undefined>;
  /**
   * The most a card takes up while it is part of the dragged group. Folded cards are
   * already that size; where cards do not fold, the group is still drawn from their
   * headers, so the gap it leaves is not the height of a whole card.
   */
  groupCard: number;
  /** A group taller than this shows its tail as one fanned stack. */
  collapseAt: number;
  /** What the fanned stack adds to the anchor's height. */
  fan: number;
}

interface Snapshot {
  rest: string[];
  at: number;
  anchor: string;
  tail: string[];
  grab: number;
}

interface Transition {
  /** The pointer position it fired at, which is also where it is undone. */
  line: number;
  dir: "down" | "up";
  kind: "hop" | "join" | "handoff";
  /** The card that moved, joined or became the anchor. */
  key: string;
  before: Snapshot;
}

export interface DragState extends Snapshot {
  stack: Transition[];
  /** Set while the anchor is held back from a lower level of its own class. */
  anticipating?: { target: string; progress: number };
  /** The card that most recently joined the tail or took over as anchor, for the cue. */
  recent?: { key: string; kind: "join" | "handoff"; serial: number };
  serial: number;
}

/** What a card takes up in the dragged group, which may be less than it does in the list. */
export function sizeInGroup(layout: Layout, key: string): number {
  return Math.min(layout.heights[key] ?? 0, layout.groupCard);
}

export function startDrag(order: string[], anchor: string, grab: number): DragState {
  const at = order.indexOf(anchor);
  return {
    rest: order.filter((key) => key !== anchor),
    at: Math.max(0, at),
    anchor,
    tail: [],
    grab,
    stack: [],
    serial: 0,
  };
}

/** The order the drag proposes: the group where the gap is. */
export function proposedOrder(state: DragState): string[] {
  return [...state.rest.slice(0, state.at), state.anchor, ...state.tail, ...state.rest.slice(state.at)];
}

export function groupOf(state: DragState): string[] {
  return [state.anchor, ...state.tail];
}

/** True when the group would be tall enough that its tail shows as a fanned stack. */
export function isCollapsed(state: DragState, layout: Layout): boolean {
  if (state.tail.length === 0) return false;
  const total = groupOf(state).reduce((sum, key) => sum + sizeInGroup(layout, key), 0);
  return total > layout.collapseAt;
}

/** The height the group leaves as its gap in the list, as it is displayed. */
export function groupHeight(state: DragState, layout: Layout): number {
  const anchor = sizeInGroup(layout, state.anchor);
  if (isCollapsed(state, layout)) return anchor + layout.fan;
  return groupOf(state).reduce((sum, key) => sum + sizeInGroup(layout, key), 0);
}

/** Where the gap starts, in list coordinates. */
export function gapTop(state: DragState, layout: Layout): number {
  let top = 0;
  for (let i = 0; i < state.at; i++) top += layout.heights[state.rest[i]] ?? 0;
  return top;
}

function snapshot(state: DragState): Snapshot {
  return { rest: state.rest, at: state.at, anchor: state.anchor, tail: state.tail, grab: state.grab };
}

function restore(state: DragState, from: Snapshot, stack: Transition[]): DragState {
  return { ...state, ...from, stack, anticipating: undefined };
}

const classOfKey = (layout: Layout, key: string | undefined): string | undefined =>
  key === undefined ? undefined : layout.classOf[key];

/** How many level cards are above the gap: the divider may not sit above the first. */
function levelsAbove(state: DragState, layout: Layout): number {
  let n = 0;
  for (let i = 0; i < state.at; i++) if (classOfKey(layout, state.rest[i]) !== undefined) n += 1;
  return n;
}

/**
 * Brings the state up to date with the pointer. `pointer` is in list coordinates:
 * pixels from the top of the list, scroll and all.
 */
export function step(input: DragState, pointer: number, layout: Layout): DragState {
  let state = input;

  for (let guard = 0; guard < 400; guard++) {
    const top = state.stack[state.stack.length - 1];

    // Undo first: the line a transition fired at is the line it is undone at.
    if (top && ((top.dir === "down" && pointer <= top.line) || (top.dir === "up" && pointer >= top.line))) {
      state = restore(state, top.before, state.stack.slice(0, -1));
      continue;
    }

    const next = fresh(state, pointer, layout, top?.dir);
    if (!next) break;
    state = next;
  }

  return { ...state, anticipating: anticipate(state, pointer, layout, state.stack[state.stack.length - 1]?.dir) };
}

function fresh(state: DragState, pointer: number, layout: Layout, travelling: "down" | "up" | undefined): DragState | undefined {
  const anchorClass = classOfKey(layout, state.anchor);
  const top = gapTop(state, layout);
  const anchorHeight = sizeInGroup(layout, state.anchor);
  const gap = groupHeight(state, layout);

  if (travelling !== "up") {
    const below = state.rest[state.at];
    if (below !== undefined) {
      const line = top + gap + (layout.heights[below] ?? 0) / 2 - anchorHeight + state.grab;
      if (pointer > line) {
        const sameClass = anchorClass !== undefined && classOfKey(layout, below) === anchorClass;
        if (sameClass) {
          const rest = state.rest.filter((_, i) => i !== state.at);
          return {
            ...state,
            rest,
            tail: [...state.tail, below],
            stack: [...state.stack, { line, dir: "down", kind: "join", key: below, before: snapshot(state) }],
            recent: { key: below, kind: "join", serial: state.serial + 1 },
            serial: state.serial + 1,
          };
        }
        // The first level may not be pushed below the divider: there is always one active.
        const isDivider = classOfKey(layout, below) === undefined;
        if (isDivider && anchorClass !== undefined && levelsAbove(state, layout) === 0) return undefined;
        return {
          ...state,
          at: state.at + 1,
          stack: [...state.stack, { line, dir: "down", kind: "hop", key: below, before: snapshot(state) }],
          serial: state.serial + 1,
        };
      }
    }
  }

  if (travelling !== "down" && state.at > 0) {
    const above = state.rest[state.at - 1];
    const aboveHeight = layout.heights[above] ?? 0;
    const sameClass = anchorClass !== undefined && classOfKey(layout, above) === anchorClass;
    if (sameClass) {
      // Held back from a lower level of its own class until the thumb reaches it.
      const line = top - aboveHeight / 2;
      if (pointer < line) {
        const rest = state.rest.filter((_, i) => i !== state.at - 1);
        const grab = aboveHeight / 2;
        return {
          ...state,
          rest,
          at: state.at - 1,
          anchor: above,
          tail: [state.anchor, ...state.tail],
          grab,
          stack: [...state.stack, { line, dir: "up", kind: "handoff", key: above, before: snapshot(state) }],
          recent: { key: above, kind: "handoff", serial: state.serial + 1 },
          serial: state.serial + 1,
        };
      }
      return undefined;
    }
    // The divider cannot rise above the first level.
    if (anchorClass === undefined && state.at < 2) return undefined;
    const line = top - aboveHeight / 2 + state.grab;
    if (pointer < line) {
      return {
        ...state,
        at: state.at - 1,
        stack: [...state.stack, { line, dir: "up", kind: "hop", key: above, before: snapshot(state) }],
        serial: state.serial + 1,
      };
    }
  }
  return undefined;
}

function anticipate(
  state: DragState,
  pointer: number,
  layout: Layout,
  travelling: "down" | "up" | undefined,
): DragState["anticipating"] {
  if (travelling === "down" || state.at === 0) return undefined;
  const anchorClass = classOfKey(layout, state.anchor);
  const above = state.rest[state.at - 1];
  if (anchorClass === undefined || classOfKey(layout, above) !== anchorClass) return undefined;

  const top = gapTop(state, layout);
  const start = top + state.grab;
  if (pointer >= start) return undefined;
  const reach = (layout.heights[above] ?? 0) / 2 + state.grab;
  return { target: above, progress: Math.min(1, Math.max(0, (start - pointer) / reach)) };
}

/**
 * Where the anchor is drawn, in list coordinates. Free, it is under the pointer;
 * held back from a lower level it stays in its slot, and the lift shows instead.
 */
export function anchorTop(state: DragState, pointer: number, layout: Layout): number {
  const slot = gapTop(state, layout);
  if (state.anticipating) return slot;
  return pointer - state.grab;
}
