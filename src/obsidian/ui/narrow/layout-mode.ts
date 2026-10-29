/**
 * Which layout a view gets (spec 1).
 *
 * The decision is made from the view container's own size, not the window's, so a
 * narrow pane on a desktop gets the narrow layout and a character opened in the
 * sidebar behaves like a phone. The decision function is pure and takes the
 * previous mode, because the hysteresis makes the answer depend on it.
 */

import { useEffect, useRef, useState } from "react";
import type { NarrowSettings } from "../../settings";
import { LAYOUT } from "./constants";

export type LayoutMode = "narrow" | "desktop";

export interface ViewSize {
  width: number;
  height: number;
}

/**
 * The boundary is split in two by the hysteresis, so dragging a pane edge across
 * 900px doesn't flicker: you must pass 920px to become wide and fall below 880px
 * to become narrow again.
 */
export function decideLayout(previous: LayoutMode, size: ViewSize, settings: NarrowSettings): LayoutMode {
  if (settings.layout !== "auto") return settings.layout;
  // A zero-sized container is a view that hasn't been laid out yet. Keep what we
  // have rather than thrashing to narrow and back on the first frame.
  if (size.width <= 0) return previous;

  // A vertical tablet is about 1024px wide, which would otherwise pass the width
  // test; the orientation check is what keeps it on the narrow layout.
  if (settings.desktopNeedsLandscape && size.height > 0 && size.width < size.height) return "narrow";

  const margin = LAYOUT.hysteresis / 2;
  if (previous === "desktop") return size.width < LAYOUT.desktopMinWidth - margin ? "narrow" : "desktop";
  return size.width >= LAYOUT.desktopMinWidth + margin ? "desktop" : "narrow";
}

/**
 * The element whose size decides the layout: the view's own container, not the
 * element the layout renders into.
 *
 * This matters more than it looks. In the desktop layout our own element is as
 * tall as its content — several thousand pixels on a long sheet — so the
 * landscape test sees width < height and switches to narrow; the narrow layout
 * then gives that element the viewport's height, width > height becomes true
 * again, and the two layouts flip back and forth forever. Measuring the frame,
 * whose size neither layout changes, is what makes the decision stable.
 */
function frameFor(el: HTMLElement): HTMLElement {
  return (el.closest(".dragonglass") as HTMLElement | null) ?? el;
}

/**
 * Watches the view container and reports which layout it should use.
 *
 * Resizes are ignored while a text input has focus: the on-screen keyboard
 * shrinks the container height, and re-laying out the view under someone's
 * fingers while they type is worse than being briefly wrong about the mode.
 */
export function useLayoutMode(
  ref: { current: HTMLElement | null },
  settings: NarrowSettings,
  initial: LayoutMode = "desktop",
): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(initial);
  // Read inside the observer rather than closing over it, so a settings change
  // doesn't need to tear the observer down.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const mounted = ref.current;
    if (!mounted) return;
    const el = frameFor(mounted);

    const pending = { size: undefined as ViewSize | undefined };

    const apply = (size: ViewSize): void => {
      if (isTyping(el)) {
        pending.size = size;
        return;
      }
      setMode((previous) => decideLayout(previous, size, settingsRef.current));
    };

    // `clientWidth`/`clientHeight` rather than the entry's `contentRect`: the
    // view's element carries padding of its own, and the narrow layout is
    // positioned over it, so the padding box is the space the layout actually
    // gets. Measuring the content box would shift the 900px boundary by however
    // much padding the theme happens to use.
    const observer = new ResizeObserver(() => apply({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    apply({ width: el.clientWidth, height: el.clientHeight });

    // Whatever resize arrived while the keyboard was up is applied once it goes
    // away, so the view still settles into the right mode.
    const onFocusOut = (): void => {
      const size = pending.size ?? { width: el.clientWidth, height: el.clientHeight };
      pending.size = undefined;
      if (!isTyping(el)) setMode((previous) => decideLayout(previous, size, settingsRef.current));
    };
    el.addEventListener("focusout", onFocusOut);

    return () => {
      observer.disconnect();
      el.removeEventListener("focusout", onFocusOut);
    };
  }, [ref]);

  // A forced setting applies immediately, without waiting for a resize.
  useEffect(() => {
    if (settings.layout !== "auto") setMode(settings.layout);
  }, [settings.layout]);

  return mode;
}

function isTyping(within: HTMLElement): boolean {
  const active = within.ownerDocument.activeElement;
  if (!active || !within.contains(active)) return false;
  const tag = active.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (active as HTMLElement).isContentEditable === true;
}
