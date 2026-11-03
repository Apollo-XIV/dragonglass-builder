/**
 * The navigation rail (spec 4): a vertical icon strip on the thumb side that
 * scrolls to sections and shows where you are.
 *
 * Tapping an icon glides to its section. Dragging is a continuous scrub rather
 * than a series of jumps — each icon owns a slice of the rail, and the finger's
 * position inside that slice maps onto the scroll range of that section — with
 * detents at each section start so it still finds the edges.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components";
import { RAIL } from "./constants";
import { useNarrowSettings } from "./context";
import { useHaptics } from "./platform";
import { nearestStop, scrubTarget, scrubZone } from "./scroll";
import { useScrollController, useScrollState, type SectionSpec } from "./scroller";

export function Rail({ sections }: { sections: SectionSpec[] }): ReactNode {
  const settings = useNarrowSettings();
  const haptics = useHaptics();
  const controller = useScrollController();
  const { active, flash } = useScrollState();
  const railRef = useRef<HTMLDivElement>(null);

  const [awake, setAwake] = useState(false);
  const [label, setLabel] = useState<{ index: number; sticky: boolean } | undefined>();
  const gesture = useRef({
    pointer: -1,
    scrubbing: false,
    moved: false,
    startY: 0,
    index: 0,
    labelTimer: 0,
    detent: -1,
  });
  const wake = useWake(setAwake);

  // The rail is faded at rest but must still respond to the first touch, so the
  // fade is opacity only: no pointer-events games.
  useEffect(() => {
    const el = controller.element();
    if (!el) return;
    const onScroll = (): void => wake();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [controller, wake]);

  const endGesture = useCallback((): void => {
    const g = gesture.current;
    if (g.labelTimer) window.clearTimeout(g.labelTimer);
    g.labelTimer = 0;
    g.pointer = -1;
    g.scrubbing = false;
    g.detent = -1;
    controller.setScrubbing(false);
    setLabel(undefined);
  }, [controller]);

  const scrub = useCallback(
    (pointerY: number): void => {
      const rail = railRef.current;
      const el = controller.element();
      if (!rail || !el) return;
      const stops = controller.stops();
      const max = controller.maxScroll();
      const railTop = rail.getBoundingClientRect().top;
      let target = scrubTarget({
        pointerY,
        railTop,
        starts: stops.map((s) => s.start),
        maxScroll: max,
      });

      // Detents: close to a section start, the scrub snaps onto it and buzzes
      // once on the way in, so the common case of "take me to the top of Spells"
      // doesn't need a steady hand.
      const g = gesture.current;
      const near = nearestStop(stops, target, RAIL.detentRadius);
      if (near !== undefined) {
        target = stops[near].start;
        if (g.detent !== near) {
          g.detent = near;
          haptics.buzz(RAIL.detentHaptic);
        }
      } else g.detent = -1;

      controller.chaseTo(target);
      const zone = scrubZone(pointerY, railTop, sections.length);
      setLabel({ index: zone, sticky: true });
    },
    [controller, haptics, sections.length],
  );

  const labelIndex = label ? label.index : sections.findIndex((s) => s.id === flash);

  return (
    // The dock is what gets positioned and what fades; the pill inside it clips,
    // so the spotlight is masked by the pill's own rounded edge. The label bubble
    // has to live outside the pill for the same reason — inside, the clip would
    // eat it.
    <div
      className={awake ? "dg-rail-dock is-awake" : "dg-rail-dock"}
      data-side={settings.railSide}
      data-height={settings.railHeight}
      style={{
        opacity: awake ? 1 : RAIL.idleOpacity,
        [settings.railSide === "left" ? "left" : "right"]:
          settings.railSide === "left" ? `${RAIL.leftInset}px` : "6px",
      }}
    >
      <div
        className="dg-rail"
        ref={railRef}
        onPointerDown={(event) => {
          const g = gesture.current;
          g.pointer = event.pointerId;
          g.startY = event.clientY;
          g.moved = false;
          g.index = indexFromPointer(event.clientY, railRef.current, sections.length);
          wake();
          event.currentTarget.setPointerCapture(event.pointerId);
          // A still finger on the rail is asking what the icon is, not to scrub.
          g.labelTimer = window.setTimeout(() => {
            if (!g.scrubbing) setLabel({ index: g.index, sticky: true });
          }, RAIL.labelHold);
        }}
        onPointerMove={(event) => {
          const g = gesture.current;
          if (g.pointer !== event.pointerId) return;
          if (!g.scrubbing && Math.abs(event.clientY - g.startY) > 6) {
            g.scrubbing = true;
            controller.setScrubbing(true);
          }
          if (g.scrubbing) {
            wake();
            scrub(event.clientY);
          }
        }}
        onPointerUp={(event) => {
          const g = gesture.current;
          if (g.pointer !== event.pointerId) return;
          const wasScrubbing = g.scrubbing;
          const index = g.index;
          endGesture();
          if (!wasScrubbing) {
            controller.goTo(sections[index]?.id ?? sections[0].id);
            return;
          }
          // On release, settle onto a section start if one is close; otherwise the
          // scrub was being used as a scrollbar, so leave the position alone.
          const el = controller.element();
          if (!el) return;
          const stops = controller.stops();
          const near = nearestStop(stops, el.scrollTop, RAIL.settleDistance);
          if (near !== undefined) controller.glideToPosition(stops[near].start);
        }}
        onPointerCancel={endGesture}
        onContextMenu={(event) => event.preventDefault()}
      >
        {/* One spotlight slides to the active section rather than each button
         * painting itself, so the rail reads as a single object with a light on
         * it (spec 4.2: the icon for the section at the top is highlighted). */}
        <span
          className="dg-rail-spot"
          aria-hidden="true"
          style={{
            width: `${RAIL.iconWidth}px`,
            height: `${RAIL.iconHeight}px`,
            transform: `translateY(${active * RAIL.zoneHeight}px)`,
          }}
        />

        {sections.map((section, i) => (
          <button
            key={section.id}
            className={i === active ? "dg-rail-icon is-active" : "dg-rail-icon"}
            style={{ width: `${RAIL.iconWidth}px`, height: `${RAIL.iconHeight}px` }}
            aria-label={section.label}
            aria-current={i === active}
            // The gesture handlers live on the container so a drag that starts on
            // one icon keeps scrubbing across the others.
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") controller.goTo(section.id);
            }}
          >
            <Icon name={section.icon} />
            {section.attention ? (
              <span className="dg-rail-pip" style={{ width: RAIL.statusPip, height: RAIL.statusPip }} />
            ) : null}
          </button>
        ))}
      </div>

      {labelIndex >= 0 ? (
        <span
          className="dg-rail-label"
          data-side={settings.railSide}
          style={{
            top: `${labelIndex * RAIL.zoneHeight}px`,
            height: `${RAIL.iconHeight}px`,
          }}
        >
          {sections[labelIndex]?.label}
        </span>
      ) : null}
    </div>
  );
}

function indexFromPointer(pointerY: number, rail: HTMLElement | null, count: number): number {
  if (!rail) return 0;
  const top = rail.getBoundingClientRect().top;
  return scrubZone(pointerY, top, count);
}

/** Full opacity during touch or scroll, fading back after the idle delay. */
function useWake(setAwake: (awake: boolean) => void): () => void {
  const timer = useRef(0);
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);
  return useCallback(() => {
    setAwake(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAwake(false), RAIL.idleDelay);
  }, [setAwake]);
}
