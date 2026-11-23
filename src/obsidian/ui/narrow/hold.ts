/**
 * The interaction language's other half (spec 3.2): tapping interacts, holding
 * reads.
 *
 * Pointer events, so one code path covers touch, pen and mouse. The hold arms on
 * press, cancels if the finger drifts or anything scrolls, and fires a haptic
 * when it registers. A release after a registered hold is swallowed, so reading a
 * feature never also rolls its dice.
 *
 * The tap acts on the `click`, the press's last event, not on `pointerup`. A tap
 * that closes the sheet it sits in (a single-choice option) would otherwise take
 * the sheet away before the click, and the click would land on whatever was
 * under it.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { HOLD } from "./constants";
import { useNarrowSettings } from "./context";
import { useHaptics } from "./platform";

export interface HoldHandlers {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerCancel: (event: ReactPointerEvent) => void;
  onClick: (event: ReactMouseEvent) => void;
  onContextMenu: (event: { preventDefault: () => void }) => void;
  style: CSSProperties;
  className: string;
}

export interface HoldResult {
  /** Spread onto the target element. */
  handlers: HoldHandlers;
  /** True from the moment the hold registers until the pointer is released. */
  held: boolean;
}

export function useHold({
  onHold,
  onTap,
  disabled,
  className = "",
}: {
  onHold?: () => void;
  onTap?: () => void;
  disabled?: boolean;
  /** Base class; the hold state classes are appended. */
  className?: string;
}): HoldResult {
  const settings = useNarrowSettings();
  const haptics = useHaptics();
  const [pressed, setPressed] = useState(false);
  const [held, setHeld] = useState(false);

  // `swallow` carries a press that must not tap (a hold, a drag) from its release
  // to the click that follows it.
  const state = useRef({ timer: 0, origin: { x: 0, y: 0 }, registered: false, active: false, swallow: false });

  const cancel = useCallback((): void => {
    const s = state.current;
    if (s.timer) window.clearTimeout(s.timer);
    s.timer = 0;
    s.active = false;
    setPressed(false);
  }, []);

  // Any scroll under the finger means the gesture was a drag, not a hold. Scroll
  // doesn't bubble, so this listens in the capture phase to catch the scroll
  // container above us.
  useEffect(() => {
    if (!pressed) return;
    const onScroll = (): void => {
      state.current.swallow = true;
      state.current.registered = false;
      setHeld(false);
      cancel();
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [pressed, cancel]);

  /**
   * The release can land somewhere else entirely. A registered hold opens a
   * bottom sheet whose scrim is then under the cursor, and a mouse `pointerup`
   * goes to whatever is topmost — so the target would never hear about the
   * release and would stay lit. Touch pointers capture implicitly and heal
   * themselves; this is the backstop for the ones that don't.
   */
  useEffect(() => {
    if (!pressed) return;
    const release = (): void => {
      state.current.registered = false;
      setHeld(false);
      cancel();
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [pressed, cancel]);

  useEffect(() => cancel, [cancel]);

  const holdMs = clampHoldTime(settings.holdMs);

  const handlers: HoldHandlers = {
    onPointerDown: (event) => {
      state.current.swallow = false;
      if (disabled || !onHold) return;
      const target = event.currentTarget as HTMLElement;
      // A plain control inside the target (a row's Use button) owns its own press.
      // Capturing the pointer below would send its click to us instead.
      if (nestedControl(event.target, target)) return;
      // The innermost target under the finger wins: a roll box inside a feature
      // row shows its breakdown, not the row's text (spec 3.1.4).
      event.stopPropagation();
      // Keeps every later event for this pointer coming to us, so the move and
      // the release are ours even once a sheet has opened over the top.
      try {
        target.setPointerCapture?.(event.pointerId);
      } catch {
        // Capture is refused for a pointer that has already been released.
      }
      const s = state.current;
      s.origin = { x: event.clientX, y: event.clientY };
      s.registered = false;
      s.active = true;
      setHeld(false);
      setPressed(true);
      s.timer = window.setTimeout(() => {
        if (!s.active) return;
        s.registered = true;
        s.timer = 0;
        setHeld(true);
        haptics.buzz(HOLD.haptic);
        onHold();
      }, holdMs);
    },
    onPointerMove: (event) => {
      const s = state.current;
      if (!s.active) return;
      const dx = event.clientX - s.origin.x;
      const dy = event.clientY - s.origin.y;
      if (Math.hypot(dx, dy) > HOLD.cancelDistance) {
        s.swallow = true;
        cancel();
      }
    },
    onPointerUp: (event) => {
      const s = state.current;
      const registered = s.registered;
      s.registered = false;
      cancel();
      setHeld(false);
      // A hold that fired already did its job; releasing must not also act.
      if (registered) {
        s.swallow = true;
        event.preventDefault();
      }
    },
    onClick: (event) => {
      const s = state.current;
      const swallow = s.swallow;
      s.swallow = false;
      if (disabled) return;
      // A click from a nested control (a row's Use button) is that control's.
      if (nestedControl(event.target, event.currentTarget as HTMLElement)) return;
      // A keyboard click (`detail` 0) never had a press to swallow.
      if (swallow && event.detail !== 0) {
        event.preventDefault();
        return;
      }
      onTap?.();
    },
    onPointerCancel: () => {
      state.current.swallow = true;
      state.current.registered = false;
      setHeld(false);
      cancel();
    },
    // Suppresses the platform's own long-press menu, which would otherwise open
    // on top of the bottom sheet.
    onContextMenu: (event) => event.preventDefault(),
    style: pressed
      ? ({
          "--dg-hold-time": `${holdMs - HOLD.fillDelay}ms`,
          "--dg-hold-delay": `${HOLD.fillDelay}ms`,
          "--dg-hold-scale": String(HOLD.scale),
        } as CSSProperties)
      : {},
    className: [className, pressed ? "is-holding" : "", held ? "is-held" : ""].filter(Boolean).join(" "),
  };

  return { handlers, held };
}

const CONTROLS = "button, input, select, textarea, a[href], [role='button']";

/** True when the press began on an interactive element inside `host`, not on `host` itself. */
export function nestedControl(start: EventTarget | null, host: HTMLElement): boolean {
  const control = (start as Element | null)?.closest?.(CONTROLS);
  return !!control && control !== host && host.contains(control);
}

export function clampHoldTime(ms: number): number {
  return Math.min(Math.max(Number.isFinite(ms) ? ms : 450, HOLD.minMs), HOLD.maxMs);
}

/**
 * The teaching hint (spec 3.4): tapping something that only reads says "Hold to
 * read", but only the first couple of times. The count is per session, which is
 * long enough to teach and short enough not to need storing.
 */
export function createHintCounter(limit: number): { shouldShow: () => boolean } {
  let shown = 0;
  return {
    shouldShow: () => (shown++ < limit ? true : false),
  };
}
