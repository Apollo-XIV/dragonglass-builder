/**
 * A number flying from where it was to where it lands: a chip into a tile's cutout. Drawn as a
 * copy on the document's body, since every box on the way is a scroll container that would
 * clip it, and gone once it lands. `done` runs then, or at once when motion is not wanted.
 */

export function prefersReducedMotion(win: Window | null | undefined = globalThis.window): boolean {
  return !!win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export const GLIDE_MS = 280;

export type Box = Pick<DOMRect, "left" | "top" | "width" | "height">;

export function glide(from: Box, to: Element, text: string, done: () => void): void {
  const doc = to.ownerDocument;
  const ghost = doc.createElement("div");
  if (prefersReducedMotion(doc.defaultView) || typeof ghost.animate !== "function" || !from.height) {
    done();
    return;
  }
  const target = to.getBoundingClientRect();
  ghost.className = "dg-chip-ghost";
  ghost.textContent = text;
  Object.assign(ghost.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
  });
  doc.body.appendChild(ghost);
  const dx = target.left + target.width / 2 - (from.left + from.width / 2);
  const dy = target.top + target.height / 2 - (from.top + from.height / 2);
  // The number grows from the chip's size to the tile's.
  const size = (el: Element): number => parseFloat(doc.defaultView?.getComputedStyle(el).fontSize ?? "") || 0;
  const scale = Math.min(3, Math.max(0.5, size(to) / (size(ghost) || size(to)) || 1));
  const animation = ghost.animate(
    [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }],
    { duration: GLIDE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" },
  );
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    ghost.remove();
    done();
  };
  animation.onfinish = finish;
  animation.oncancel = finish;
}
