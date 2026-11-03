/**
 * The scroll container the narrow layout owns (spec 5): sticky section headers,
 * scroll ticks, and settling onto a nearby section when scrolling stops.
 *
 * The view's own element can't do this — sticky positioning needs the scroller to
 * be in our tree — so the narrow layout takes the scrolling over entirely.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "../components";
import { RAIL, TICK, UI } from "./constants";
import { useNarrowSettings } from "./context";
import { useHaptics } from "./platform";
import {
  activeStop,
  approach,
  crossedStop,
  glideLanding,
  nearestStop,
  railProgress,
  tailSpace,
  type Stop,
} from "./scroll";

export interface SectionSpec {
  id: string;
  label: string;
  /** Obsidian icon name for the rail and the sticky header. */
  icon: string;
  /** Short status text on the right of the sticky header. */
  status?: ReactNode;
  /** Amber pip on the rail icon: this section needs attention (spec 4.2). */
  attention?: boolean;
  body: ReactNode;
}

interface ScrollController {
  /** Glide or jump so this stop's header sits at the top. */
  goTo: (id: string, how?: "glide" | "jump") => void;
  /** Drive the scroll towards a position while scrubbing (spec 4.2 smoothing). */
  chaseTo: (position: number) => void;
  glideToPosition: (position: number) => void;
  stop: () => void;
  /** Suspends ticks and snapping while the rail is held. */
  setScrubbing: (scrubbing: boolean) => void;
  stops: () => Stop[];
  maxScroll: () => number;
  element: () => HTMLElement | null;
}

const ControllerContext = createContext<ScrollController | undefined>(undefined);

export function useScrollController(): ScrollController {
  const value = useContext(ControllerContext);
  if (!value) throw new Error("ScrollController is missing");
  return value;
}

/** What the rail needs to draw itself, kept in the scroller because it owns the scroll. */
export interface ScrollState {
  /** Index into the major (rail) sections. */
  active: number;
  /** Active index plus the fraction scrolled through that section. */
  progress: number;
  /** Section id whose label is flashing after a tick, if any. */
  flash?: string;
}

const StateContext = createContext<ScrollState>({ active: 0, progress: 0 });

export function useScrollState(): ScrollState {
  return useContext(StateContext);
}

/**
 * Registers a position the rail can be sent to without it becoming a place
 * scrolling stops: a builder level card (spec 7.3), which Review's "jump to this
 * choice" addresses by id. Scrolling past one is not an event — it neither ticks
 * nor snaps — because a card every hundred pixels made the whole builder buzz
 * and grab on a real phone.
 */
const RegisterContext = createContext<(id: string, el: HTMLElement | null) => void>(() => {});

export function useMinorStop(id: string): (el: HTMLElement | null) => void {
  const register = useContext(RegisterContext);
  return useCallback((el: HTMLElement | null) => register(id, el), [register, id]);
}

/** The raw registrar, for the bridge that hands it to the builder's shared sections. */
export function useStopRegistrar(): (id: string, el: HTMLElement | null) => void {
  return useContext(RegisterContext);
}

export function NarrowScroller({
  sections,
  banner,
  children,
}: {
  sections: SectionSpec[];
  /** Scrolls away with the content, above the first section. */
  banner?: ReactNode;
  /** The rail, rendered as a sibling of the scroll content. */
  children?: ReactNode;
}): ReactNode {
  const settings = useNarrowSettings();
  const haptics = useHaptics();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionEls = useRef(new Map<string, HTMLElement>());
  const minorEls = useRef(new Map<string, HTMLElement>());
  const [state, setState] = useState<ScrollState>({ active: 0, progress: 0 });
  const [tail, setTail] = useState<number>(UI.contentBottomPadding);

  const motion = useRef({
    frame: 0,
    target: 0,
    mode: "idle" as "idle" | "glide" | "chase",
    scrubbing: false,
    lastTick: 0,
    lastStop: -1,
    lastPosition: 0,
    /** True while a wheel or trackpad is driving, rather than a finger. */
    wheeling: false,
    /**
     * The section a tap asked for. Until the scroll gets there, this is what
     * the rail highlights: deriving the active icon from the scroll position
     * alone means the highlight lags the whole animation, and then lands on
     * the section above whenever the final position is a rounding error short
     * of the target.
     */
    intent: undefined as number | undefined,
    flashTimer: 0,
    snapTimer: 0,
  });

  const registerMinor = useCallback((id: string, el: HTMLElement | null): void => {
    if (el) minorEls.current.set(id, el);
    else minorEls.current.delete(id);
  }, []);

  /**
   * Stop positions, measured on demand. They move whenever content changes — a
   * level added, a filter chip narrowing a list — so caching them is a bug
   * waiting to happen; reading `offsetTop` for a handful of elements is cheap.
   */
  const readStops = useCallback((): Stop[] => {
    const container = scrollRef.current;
    if (!container) return [];
    const base = container.getBoundingClientRect().top - container.scrollTop;
    const stops: Stop[] = [];
    for (const section of sections) {
      const el = sectionEls.current.get(section.id);
      if (el) stops.push({ id: section.id, start: Math.max(0, el.getBoundingClientRect().top - base) });
    }
    for (const [id, el] of minorEls.current)
      stops.push({ id, start: Math.max(0, el.getBoundingClientRect().top - base), minor: true });
    return stops.sort((a, b) => a.start - b.start);
  }, [sections]);

  const majorStops = useCallback((): Stop[] => readStops().filter((s) => !s.minor), [readStops]);

  const maxScroll = useCallback((): number => {
    const el = scrollRef.current;
    return el ? Math.max(0, el.scrollHeight - el.clientHeight) : 0;
  }, []);

  const stopMotion = useCallback((): void => {
    if (motion.current.frame) cancelAnimationFrame(motion.current.frame);
    motion.current.frame = 0;
    motion.current.mode = "idle";
    motion.current.intent = undefined;
  }, []);

  /** One rAF loop serves both the glide and the scrub chase; only the factor differs. */
  const run = useCallback(
    (mode: "glide" | "chase", target: number): void => {
      const container = scrollRef.current;
      if (!container) return;
      const m = motion.current;
      m.target = Math.min(Math.max(target, 0), maxScroll());
      m.mode = mode;
      if (m.frame) return;
      const step = (): void => {
        const el = scrollRef.current;
        if (!el || m.mode === "idle") {
          m.frame = 0;
          return;
        }
        const factor = m.mode === "chase" ? RAIL.chaseFactor : RAIL.glideFactor;
        // Re-clamped every frame, not just when the motion starts: content can
        // shrink under a running glide — adding a level consumes the Planned
        // queue below it — and a target past the end of a shorter document is
        // one the element can never reach.
        const target = Math.min(m.target, maxScroll());
        const from = el.scrollTop;
        const next = approach(from, target, factor);
        el.scrollTop = next;

        // Arrival is read back off the element, not assumed from what we asked
        // for. `scrollTop` is quantised to a whole pixel while a measured target
        // is fractional, so once the remaining distance is small enough that the
        // step rounds away, the element stops moving and every later frame
        // computes the same step: the loop spins forever and pins the scroll
        // against the reader. A frame that moved nothing is the end of the
        // motion, and it lands on the nearest pixel it can hold.
        const stalled = el.scrollTop === from;
        if (next === target || stalled) {
          if (m.mode === "glide") {
            if (stalled) el.scrollTop = glideLanding(target, maxScroll());
            m.frame = 0;
            m.mode = "idle";
            m.intent = undefined;
            return;
          }
          // A chase keeps running while the finger is down, even once it has
          // arrived, so the next pointermove is picked up without restarting.
          if (!m.scrubbing) {
            m.frame = 0;
            m.mode = "idle";
            return;
          }
        }
        m.frame = requestAnimationFrame(step);
      };
      m.frame = requestAnimationFrame(step);
    },
    [maxScroll],
  );

  const controller = useMemo<ScrollController>(
    () => ({
      goTo: (id, how) => {
        const all = readStops();
        const stop = all.find((s) => s.id === id);
        if (!stop) return;
        const container = scrollRef.current;
        if (!container) return;

        // The highlight moves now, not when the scrolling stops. A tap is an
        // answer to "where am I going", and the rail should say so at once.
        const index = all.filter((s) => !s.minor).findIndex((s) => s.id === id);
        if (index >= 0) {
          motion.current.intent = index;
          setState((previous) => (previous.active === index ? previous : { ...previous, active: index }));
        }

        if ((how ?? settings.railTap) === "jump") {
          stopMotion();
          motion.current.intent = undefined;
          container.scrollTop = stop.start;
        } else run("glide", stop.start);
      },
      chaseTo: (position) => run("chase", position),
      glideToPosition: (position) => run("glide", position),
      stop: stopMotion,
      setScrubbing: (scrubbing) => {
        motion.current.scrubbing = scrubbing;
        if (scrubbing) stopMotion();
      },
      stops: majorStops,
      maxScroll,
      element: () => scrollRef.current,
    }),
    [readStops, majorStops, maxScroll, run, stopMotion, settings.railTap],
  );

  // Scroll handling: the active icon, the thumb, the ticks and the snap all hang
  // off this one listener.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const flash = (id: string): void => {
      const m = motion.current;
      if (m.flashTimer) window.clearTimeout(m.flashTimer);
      setState((prev) => ({ ...prev, flash: id }));
      m.flashTimer = window.setTimeout(
        () => setState((prev) => (prev.flash === id ? { ...prev, flash: undefined } : prev)),
        TICK.labelFlash,
      );
    };

    const onScroll = (): void => {
      const m = motion.current;
      const position = container.scrollTop;
      const major = majorStops();
      const index = m.intent ?? activeStop(major, position);
      setState((prev) => {
        const progress = railProgress(major, position, maxScroll());
        return prev.active === index && Math.abs(prev.progress - progress) < 0.01
          ? prev
          : { ...prev, active: index, progress };
      });

      // Ticks fire when a header passes the top under ordinary scrolling.
      // Programmatic scrolls and rail scrubs have their own feedback, so they
      // must not also tick.
      const previous = m.lastPosition;
      m.lastPosition = position;
      if (!settings.scrollTicks || m.mode !== "idle" || m.scrubbing) return;

      const arrived = crossedStop(major, previous, position);
      if (arrived === undefined) return;
      const now = Date.now();
      if (arrived === m.lastStop || now - m.lastTick < TICK.rateLimit) return;
      m.lastStop = arrived;
      m.lastTick = now;
      haptics.buzz(TICK.haptic);
      flash(major[arrived].id);
    };

    /**
     * Settling onto a nearby section is for a finger that has let go of a fling.
     * A wheel or trackpad ends a scroll on every single tick, and the grab
     * distance is far larger than a tick, so snapping there would drag the view
     * back to where it started each time and the wheel would appear dead.
     */
    const settle = (): void => {
      const m = motion.current;
      if (!settings.snap || m.scrubbing || m.wheeling || m.mode !== "idle") return;
      const grab = (container.clientHeight * settings.snapGrabPercent) / 100;
      // Sections only. Level cards are addressable but not stopping points, so a
      // release settles onto the section it is in rather than the nearest card.
      const stops = majorStops();
      const index = nearestStop(stops, container.scrollTop, grab);
      if (index === undefined) return;
      const target = stops[index].start;
      if (Math.abs(target - container.scrollTop) > 1) run("glide", target);
    };
    const onScrollEnd = (): void => settle();
    const onScrollFallback = (): void => {
      const m = motion.current;
      if (m.snapTimer) window.clearTimeout(m.snapTimer);
      m.snapTimer = window.setTimeout(settle, 140);
    };

    // Scrolling by hand overrules a glide. Leaving it running means two things
    // driving `scrollTop` in the same frame, and the hand loses every time:
    // the view hauls itself back to where the glide was going.
    const takeOver = (): void => {
      // Scrolling by hand answers "where am I" for yourself.
      motion.current.intent = undefined;
      if (motion.current.mode === "glide") stopMotion();
    };

    const onWheel = (): void => {
      motion.current.wheeling = true;
      takeOver();
    };
    // A finger (or a pen) going down hands control back to the fling rules.
    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType !== "mouse") motion.current.wheeling = false;
      takeOver();
    };

    const supportsScrollEnd = "onscrollend" in window;
    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("scroll", onScroll, { passive: true });
    if (supportsScrollEnd) container.addEventListener("scrollend", onScrollEnd);
    else container.addEventListener("scroll", onScrollFallback, { passive: true });
    onScroll();

    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("scroll", onScroll);
      if (supportsScrollEnd) container.removeEventListener("scrollend", onScrollEnd);
      else container.removeEventListener("scroll", onScrollFallback);
      const m = motion.current;
      if (m.flashTimer) window.clearTimeout(m.flashTimer);
      if (m.snapTimer) window.clearTimeout(m.snapTimer);
    };
  }, [
    majorStops,
    maxScroll,
    run,
    stopMotion,
    haptics,
    settings.scrollTicks,
    settings.snap,
    settings.snapGrabPercent,
  ]);

  /**
   * Space after the last section, so its header can actually reach the top.
   * See `tailSpace`; it is remeasured whenever the viewport or the content
   * changes, because a filter chip narrowing a list changes the answer.
   */
  useEffect(() => {
    const container = scrollRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = (): void => {
      const last = sections[sections.length - 1];
      const el = last ? sectionEls.current.get(last.id) : undefined;
      const needed = tailSpace(container.clientHeight, el?.offsetHeight ?? 0, UI.contentBottomPadding);
      // The spacer is a sibling of the sections, so growing it never changes the
      // measurement that produced it.
      setTail((previous) => (Math.abs(previous - needed) < 1 ? previous : needed));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => stopMotion, [stopMotion]);

  const railPad = `${RAIL.iconWidth + RAIL.contentClearance}px`;

  return (
    <ControllerContext.Provider value={controller}>
      <StateContext.Provider value={state}>
        <RegisterContext.Provider value={registerMinor}>
          <div className="dg-narrow" data-rail-side={settings.railSide}>
            <div className="dg-narrow-scroll" ref={scrollRef}>
              <div
                className="dg-narrow-content"
                ref={contentRef}
                style={{ [settings.railSide === "right" ? "paddingRight" : "paddingLeft"]: railPad }}
              >
                {banner}
                {sections.map((section) => (
                  <section
                    key={section.id}
                    className="dg-narrow-section"
                    data-section={section.id}
                    ref={(el) => {
                      if (el) sectionEls.current.set(section.id, el);
                      else sectionEls.current.delete(section.id);
                    }}
                  >
                    <StickyHeader section={section} railSide={settings.railSide} />
                    {section.body}
                  </section>
                ))}
                <div className="dg-narrow-tail" style={{ height: `${tail}px` }} aria-hidden="true" />
              </div>
            </div>
            {children}
          </div>
        </RegisterContext.Provider>
      </StateContext.Provider>
    </ControllerContext.Provider>
  );
}

/**
 * The section's own heading, positioned sticky. At rest it costs no extra space,
 * and the next section's header pushes it out rather than stacking on top of it —
 * which is why only this one element is ever sticky.
 */
function StickyHeader({ section, railSide }: { section: SectionSpec; railSide: "left" | "right" }): ReactNode {
  // The strip runs the full width, under the rail, so it reads as a divider
  // rather than a card that stops short.
  const bleed = `-${RAIL.iconWidth + RAIL.contentClearance}px`;
  return (
    <header
      className="dg-sticky-head"
      style={{
        height: `${UI.stickyHeaderHeight}px`,
        [railSide === "right" ? "marginRight" : "marginLeft"]: bleed,
        [railSide === "right" ? "paddingRight" : "paddingLeft"]: `${RAIL.iconWidth + RAIL.contentClearance}px`,
      }}
    >
      <h3>
        <Icon name={section.icon} />
        {section.label}
      </h3>
      {section.status ? <span className="dg-sticky-status">{section.status}</span> : null}
    </header>
  );
}
