/**
 * A list its items can be dragged around in, by a handle on each.
 *
 * dnd-kit supplies what is hard to get right and not ours to decide: the sensors
 * (a mouse with a few pixels of slack, a finger with a hold), the keyboard, the
 * auto-scroll. Where things go is `machine.ts`'s business, not dnd-kit's
 * sortable, because the conflict rule needs a dragged *group* with an anchor that
 * can change under the thumb, and no sortable strategy has either.
 *
 * So dnd-kit is told there is nothing to collide with and only reports how far
 * the pointer has gone. Each frame turns that into a position in the list, steps
 * the machine, and draws what it says: the group's gap in the list, the group
 * itself floating over it, and the cue on a card about to be picked up. The
 * floating group is drawn in the list's own container rather than a portal, so
 * it keeps the theme's scoped styles and works in a popout window.
 */

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useHaptics } from "../../narrow/platform";
import { HexGrid } from "./handle";
import {
  anchorTop,
  sizeInGroup,
  groupHeight,
  groupOf,
  gapTop,
  isCollapsed,
  proposedOrder,
  startDrag,
  step,
  type DragState,
  type Layout,
} from "./machine";

export interface ReorderEntry {
  key: string;
  /** Absent for the divider, which conflicts with nothing. */
  class?: string;
  /** What assistive tech calls it. */
  label: string;
  /** For the fanned stack's chip: "Wizard", and the class level it stands for. */
  className?: string;
  classLevel?: number;
}

export interface ItemContext {
  /** The order as it stands right now: the drag's proposal while one is under way. */
  order: string[];
  dragging: boolean;
}

export interface ReorderListProps {
  entries: ReorderEntry[];
  /** The full item. Folded by the caller while `dragging`. */
  renderItem: (entry: ReorderEntry, ctx: ItemContext) => ReactNode;
  /** The compact item the floating group is made of. */
  renderGhost: (entry: ReorderEntry, ctx: ItemContext) => ReactNode;
  /** A drop that changed the order. */
  onReorder: (order: string[]) => void;
  /** A drag started or ended; the caller folds its cards and opens what it hides. */
  onActiveChange?: (active: boolean) => void;
  /** Items that cannot be picked up. */
  locked?: boolean;
  className?: string;
}

/** The share of the viewport a dragged group may take before its tail fans into a stack. */
const COLLAPSE_AT_VH = 0.45;
/** What a fanned stack adds beneath the anchor. */
const FAN_HEIGHT = 16;
/** What a card takes up inside the dragged group: a header and its spacing. */
const GROUP_CARD = 66;
/** The gap a wrapper keeps under its card, which the measured heights include. */
const SPACING = 12;

const SCROLLABLE = /(auto|scroll)/;

function scrollParent(el: HTMLElement | null): HTMLElement | undefined {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const view = node.ownerDocument.defaultView;
    if (view && SCROLLABLE.test(view.getComputedStyle(node).overflowY)) return node;
  }
  return undefined;
}

function pointerY(event: Event | null | undefined): number | undefined {
  if (!event) return undefined;
  const touch = (event as TouchEvent).touches?.[0] ?? (event as TouchEvent).changedTouches?.[0];
  if (touch) return touch.clientY;
  const y = (event as MouseEvent).clientY;
  return typeof y === "number" ? y : undefined;
}

/** Where the floating group is drawn: never past either end of the list, however far the thumb goes. */
function floatingTop(state: DragState, pointer: number, layout: Layout): number {
  const total = Object.values(layout.heights).reduce((sum, h) => sum + h, 0);
  return Math.min(Math.max(0, anchorTop(state, pointer, layout)), Math.max(0, total - sizeInGroup(layout, state.anchor)));
}

interface Live {
  state: DragState;
  layout: Layout;
}

export function ReorderList(props: ReorderListProps): ReactNode {
  const { entries, onReorder, onActiveChange } = props;
  const haptics = useHaptics();
  const listRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [activeKey, setActiveKey] = useState<string | undefined>();
  const [, setTick] = useState(0);
  // The cards of the group just dropped, for the moment they take to settle.
  const [settling, setSettling] = useState<ReadonlySet<string>>(new Set());
  const settleTimer = useRef(0);
  const live = useRef<Live | undefined>(undefined);
  // Where the pointer is, read from the pointer itself. dnd-kit's own delta folds in how far
  // the page has scrolled since the drag began, which is right for it and wrong for this.
  const gesture = useRef({ startY: 0, deltaY: 0, pointerY: 0, keyboard: false });
  const anchoring = useRef<{ key: string; top: number } | undefined>(undefined);
  const lifted = useRef<string | undefined>(undefined);
  const settled = useRef(0);

  const sensors = useSensors(
    // A few pixels, so that a plain click on the handle does not fold and unfold the list.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // A hold, with enough slack that a finger's own wobble does not cancel it.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const labels = useMemo(() => new Map(entries.map((entry) => [entry.key, entry.label])), [entries]);
  const byKey = useMemo(() => new Map(entries.map((entry) => [entry.key, entry])), [entries]);

  const element = (key: string): HTMLElement | null =>
    listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) ?? null;

  // Space added above the list while a drag is under way, when folding the cards
  // above the held one moved it further than the scroll could follow. Positions the
  // machine works in start below it.
  const padding = useCallback((): number => parseFloat(listRef.current?.style.paddingTop || "0") || 0, []);

  const pointerLocal = useCallback((): number => {
    const list = listRef.current;
    if (!list) return 0;
    const g = gesture.current;
    const y = g.keyboard ? g.startY + g.deltaY : g.pointerY;
    return y - list.getBoundingClientRect().top - padding();
  }, [padding]);

  // Collapsing the cards above the held one moves it; so does opening what was
  // hidden. Measure where it was and where it is, and scroll by the difference.
  const keepInPlace = useCallback((key: string) => {
    const el = element(key);
    if (el) anchoring.current = { key, top: el.getBoundingClientRect().top };
  }, []);
  useLayoutEffect(() => {
    const held = anchoring.current;
    const list = listRef.current;
    if (!held || !list) return;
    anchoring.current = undefined;
    // A drag that ended gives back the space it borrowed before measuring.
    if (!activeKey) list.style.paddingTop = "";
    const el = element(held.key);
    if (!el) return;
    const scroller = scrollParent(list);
    if (scroller) scroller.scrollTop += el.getBoundingClientRect().top - held.top;
    // Folding shortens what is above the card, and a scroll already at the top
    // cannot follow it. The card stays under the thumb by making up the difference.
    const short = held.top - el.getBoundingClientRect().top;
    if (activeKey && short > 0.5) list.style.paddingTop = `${Math.round(short)}px`;
  }, [activeKey]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // Tells whatever scrolls the list to leave it alone while it is held: the narrow
  // layout's scroll ticks would otherwise fire every time the drag auto-scrolls to
  // an edge. Released a moment after the drop so the scroll that follows does not
  // tick against the dropped card either.
  useEffect(() => {
    const scroller = scrollParent(listRef.current);
    if (!scroller || !activeKey) return;
    scroller.dataset.dgReordering = "1";
    return () => {
      window.setTimeout(() => delete scroller.dataset.dgReordering, 400);
    };
  }, [activeKey]);

  // Once the folded list has rendered: measure it, and start the machine.
  useLayoutEffect(() => {
    if (!activeKey || live.current) return;
    const list = listRef.current;
    if (!list) return;

    const heights: Record<string, number> = {};
    const classOf: Record<string, string | undefined> = {};
    for (const entry of entries) {
      heights[entry.key] = element(entry.key)?.offsetHeight ?? 0;
      classOf[entry.key] = entry.class;
    }
    const view = list.ownerDocument.defaultView;
    const layout: Layout = {
      heights,
      classOf,
      groupCard: GROUP_CARD,
      collapseAt: (view?.innerHeight ?? 800) * COLLAPSE_AT_VH,
      fan: FAN_HEIGHT,
    };

    const order = entries.map((entry) => entry.key);
    const anchorEl = element(activeKey);
    const height = Math.min(heights[activeKey] ?? 0, GROUP_CARD);
    // Where the thumb is in the card, from where both are now: scroll anchoring
    // keeps the card under the thumb, but not always to the pixel.
    const origin = padding();
    const slotTop = (anchorEl?.offsetTop ?? 0) - origin;
    if (gesture.current.keyboard) gesture.current.startY = list.getBoundingClientRect().top + origin + slotTop + height / 2;
    const grab = Math.min(Math.max(pointerLocal() - slotTop, 6), Math.max(6, height - SPACING - 6));
    live.current = { state: startDrag(order, activeKey, grab), layout };
    setTick((n) => n + 1);
  }, [activeKey, entries, pointerLocal, padding]);

  useEffect(() => {
    if (!activeKey) return;
    const doc = listRef.current?.ownerDocument;
    if (!doc) return;
    const track = (event: PointerEvent): void => {
      gesture.current.pointerY = event.clientY;
    };
    doc.addEventListener("pointermove", track, { capture: true });
    return () => doc.removeEventListener("pointermove", track, { capture: true });
  }, [activeKey]);

  // The loop: pointer → list position → machine → what is drawn.
  useEffect(() => {
    if (!activeKey) return;
    const view = listRef.current?.ownerDocument.defaultView ?? window;
    let frame = 0;
    let signature = "";

    const run = (): void => {
      frame = view.requestAnimationFrame(run);
      const current = live.current;
      if (!current) return;
      const pointer = pointerLocal();
      const state = step(current.state, pointer, current.layout);
      current.state = state;

      const sig = [
        proposedOrder(state).join(","),
        groupOf(state).join(","),
        isCollapsed(state, current.layout),
        state.recent?.serial,
        state.anticipating ? "a" : "f",
      ].join("|");
      if (sig !== signature) {
        if (signature && state.recent?.kind === "handoff" && state.recent.serial !== settled.current) haptics.buzz(12);
        settled.current = state.recent?.serial ?? 0;
        signature = sig;
        setTick((n) => n + 1);
      }

      // The parts that move every frame are written straight to the DOM.
      const top = floatingTop(state, pointer, current.layout);
      const slot = gapTop(state, current.layout);
      const floating = overlayRef.current;
      if (floating) floating.style.transform = `translate3d(0, ${Math.round(top + padding())}px, 0)`;
      const target = state.anticipating?.target;
      if (lifted.current && lifted.current !== target) element(lifted.current)?.style.removeProperty("--lift");
      if (target) element(target)?.style.setProperty("--lift", String(state.anticipating?.progress ?? 0));
      lifted.current = target;
      if (floating) floating.dataset.slot = String(Math.round(slot));
    };
    frame = view.requestAnimationFrame(run);
    return () => {
      view.cancelAnimationFrame(frame);
      if (lifted.current) element(lifted.current)?.style.removeProperty("--lift");
      lifted.current = undefined;
    };
  }, [activeKey, pointerLocal, haptics, padding]);

  const finish = useCallback(
    (commit: boolean) => {
      const current = live.current;
      const key = activeKey;
      live.current = undefined;
      if (key) keepInPlace(key);
      setActiveKey(undefined);
      onActiveChange?.(false);
      if (current) {
        setSettling(new Set(groupOf(current.state)));
        window.clearTimeout(settleTimer.current);
        settleTimer.current = window.setTimeout(() => setSettling(new Set()), 450);
      }
      if (!commit || !current) return;
      const order = proposedOrder(current.state);
      if (order.join("\n") !== entries.map((entry) => entry.key).join("\n")) onReorder(order);
    },
    [activeKey, entries, keepInPlace, onActiveChange, onReorder],
  );

  const onDragStart = (event: DragStartEvent): void => {
    const key = String(event.active.id);
    const initial = event.active.rect.current.initial;
    const startY = pointerY(event.activatorEvent);
    const from = startY ?? (initial?.top ?? 0) + (initial?.height ?? 0) / 2;
    gesture.current = { startY: from, deltaY: 0, pointerY: from, keyboard: startY === undefined };
    keepInPlace(key);
    live.current = undefined;
    setActiveKey(key);
    onActiveChange?.(true);
  };
  const onDragMove = (event: DragMoveEvent): void => {
    gesture.current.deltaY = event.delta.y;
  };

  const state = live.current?.state;
  const layout = live.current?.layout;
  const order = state ? proposedOrder(state) : entries.map((entry) => entry.key);
  const group = state ? new Set(groupOf(state)) : new Set<string>();
  const ctx: ItemContext = { order, dragging: Boolean(activeKey) };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={() => []}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={() => finish(true)}
      onDragCancel={() => finish(false)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Press space to pick up this level, the arrow keys to move it, space to drop it, and escape to cancel.",
        },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${labels.get(String(active.id)) ?? "level"}.`,
          onDragMove: () => undefined,
          onDragOver: () => undefined,
          onDragEnd: ({ active }) => `Dropped ${labels.get(String(active.id)) ?? "level"}.`,
          onDragCancel: ({ active }) => `Put ${labels.get(String(active.id)) ?? "level"} back.`,
        },
      }}
    >
      <div
        ref={listRef}
        className={["dg-reorder-list", activeKey ? "is-dragging" : "", props.className ?? ""].join(" ").trim()}
      >
        {order.map((key) => {
          const entry = byKey.get(key);
          if (!entry) return null;
          // The tail rides in the floating group, not in the list.
          if (state && group.has(key) && key !== state.anchor) return null;
          const isGap = state?.anchor === key;
          return (
            <Item
              key={key}
              entry={entry}
              locked={props.locked}
              settling={settling.has(key)}
              gap={isGap && state && layout ? groupHeight(state, layout) : undefined}
            >
              {isGap ? null : props.renderItem(entry, ctx)}
            </Item>
          );
        })}

        {state && layout ? (
          <Floating
            ref={overlayRef}
            state={state}
            layout={layout}
            byKey={byKey}
            render={(entry) => props.renderGhost(entry, ctx)}
            initialTop={floatingTop(state, pointerLocal(), layout) + padding()}
          />
        ) : null}
      </div>
    </DndContext>
  );
}

function Item({
  entry,
  gap,
  locked,
  settling,
  children,
}: {
  entry: ReorderEntry;
  /** Just dropped: it comes down from where it was held. */
  settling?: boolean;
  /** Set while this item is the dragged group's place in the list: the height it leaves. */
  gap?: number;
  locked?: boolean;
  children: ReactNode;
}): ReactNode {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes } = useDraggable({
    id: entry.key,
    disabled: locked,
  });
  const style: CSSProperties | undefined = gap === undefined ? undefined : { height: gap };

  return (
    <div
      ref={setNodeRef}
      data-key={entry.key}
      className={[
        "dg-reorder-item",
        gap === undefined ? "" : "is-gap",
        entry.class ? "" : "is-divider",
        settling ? "is-settling" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {/* Never unmounted mid-drag: a touch keeps sending its events to the element it
          began on, and an element that has left the page stops them reaching anyone. */}
      <div
        ref={setActivatorNodeRef}
        className="dg-drag-handle"
        {...attributes}
        {...(locked ? {} : listeners)}
        // The handle sits at the left edge, where Obsidian listens for the swipe that
        // opens its sidebar. The hold has to win that, so the touch stops here.
        onTouchStart={(event) => {
          event.stopPropagation();
          (listeners as Record<string, (e: unknown) => void> | undefined)?.onTouchStart?.(event);
        }}
      >
        <HexGrid />
        <span className="dg-sr-only">Reorder {entry.label}</span>
      </div>
      <div className="dg-reorder-body">{children}</div>
    </div>
  );
}


const Floating = forwardRef<
  HTMLDivElement,
  {
    state: DragState;
    layout: Layout;
    byKey: Map<string, ReorderEntry>;
    render: (entry: ReorderEntry) => ReactNode;
    initialTop: number;
  }
>(function Floating({ state, layout, byKey, render, initialTop }, ref) {
  const members = groupOf(state);
  const collapsed = isCollapsed(state, layout);
  const anchorEntry = byKey.get(state.anchor);
  const heightOf = (key: string): number => Math.max(0, sizeInGroup(layout, key) - SPACING);

  // The cue on a card that has just joined, or just taken over: it comes in lifted.
  const recent = state.recent;
  const settling = recent?.kind === "handoff";

  let offset = 0;
  const placed = members.map((key, i) => {
    const top = i === 0 ? 0 : collapsed ? Math.min(i, 2) * (FAN_HEIGHT / 2) : offset;
    if (i === 0 || !collapsed) offset += heightOf(key) + SPACING;
    return { key, top, i };
  });
  const tail = members.slice(1);
  const first = byKey.get(members[0]);
  const last = byKey.get(members[members.length - 1]);

  return (
    <div
      ref={ref}
      className={["dg-reorder-floating", settling ? "is-settling" : ""].join(" ").trim()}
      style={{ transform: `translate3d(0, ${Math.round(initialTop)}px, 0)` }}
      aria-hidden="true"
    >
      {placed
        .slice()
        .reverse()
        .map(({ key, top, i }) => {
          const entry = byKey.get(key);
          if (!entry) return null;
          return (
            <div
              key={key}
              className={[
                "dg-reorder-ghost",
                "is-held",
                i > 0 ? "is-tail" : "is-anchor",
                collapsed && i > 0 ? "is-fanned" : "",
                recent?.key === key ? "is-new" : "",
              ]
                .join(" ")
                .trim()}
              style={{
                top,
                height: heightOf(key),
                zIndex: members.length - i,
                ...(collapsed && i > 0 ? { transform: `scale(${1 - Math.min(i, 2) * 0.02})` } : {}),
              }}
            >
              {i === 0 || !collapsed ? render(entry) : null}
            </div>
          );
        })}
      {collapsed && tail.length ? (
        <span className="dg-reorder-chip" style={{ top: heightOf(state.anchor) - 2 }}>
          +{tail.length} levels
          {anchorEntry?.className && first?.classLevel !== undefined && last?.classLevel !== undefined
            ? ` · ${anchorEntry.className} ${first.classLevel}–${last.classLevel}`
            : ""}
        </span>
      ) : null}
    </div>
  );
});
