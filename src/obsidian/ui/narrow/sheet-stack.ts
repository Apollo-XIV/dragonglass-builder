/**
 * The bottom sheets' stack, as plain functions so the rules are testable
 * without React. A layer at index `n` is `depth` n.
 */

export interface Layer<T> {
  id: number;
  spec: T;
}

export interface StackChange<T> {
  next: Layer<T>[];
  /** Layers that went away, top first, so their `onClose` runs in that order. */
  removed: Layer<T>[];
}

/**
 * Opens `layer` from `depth`: on top of the sheet at that depth, in place of
 * anything that was above it. From the page (depth -1) that is the whole stack.
 */
export function pushLayer<T>(stack: Layer<T>[], depth: number, layer: Layer<T>): StackChange<T> {
  const keep = Math.max(0, Math.min(depth + 1, stack.length));
  return { next: [...stack.slice(0, keep), layer], removed: stack.slice(keep).reverse() };
}

/** Closes the layer `id` and whatever is on top of it. An id no longer open is a no-op. */
export function closeLayer<T>(stack: Layer<T>[], id: number): StackChange<T> {
  const at = stack.findIndex((layer) => layer.id === id);
  if (at < 0) return { next: stack, removed: [] };
  return { next: stack.slice(0, at), removed: stack.slice(at).reverse() };
}
