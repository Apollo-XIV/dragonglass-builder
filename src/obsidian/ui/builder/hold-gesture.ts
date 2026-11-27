/**
 * Tap or hold, for any input with a press and a release: a quick press is a tap and fires on
 * release; a press kept down becomes a hold and fires as soon as it is long enough, and
 * `onHoldEnd` fires when that hold stops, however it stops. Keys and on-screen buttons share
 * it, so "hold to peek" is one rule rather than one per input.
 */

export const HOLD_MS = 300;

export function createHoldGesture<T>(
  onTap: (value: T) => void,
  onHold: (value: T) => void,
  onHoldEnd: (value: T) => void,
  holdMs = HOLD_MS,
) {
  let current: { id: string; value: T; timer: ReturnType<typeof setTimeout>; held: boolean } | null = null;
  return {
    /** A press begins; `id` names the key or button, so only its own release counts. */
    press(id: string, value: T): void {
      if (current) return;
      const state = { id, value, held: false, timer: setTimeout(() => {
        state.held = true;
        onHold(value);
      }, holdMs) };
      current = state;
    },
    /** The press ends: a tap if it never became a hold. */
    release(id: string, value: T): void {
      if (current?.id !== id) return;
      clearTimeout(current.timer);
      const tapped = !current.held;
      current = null;
      if (tapped) onTap(value);
      else onHoldEnd(value);
    },
    /** The press is abandoned: no tap, and a hold that had begun ends. */
    cancel(): void {
      const was = current;
      if (was) clearTimeout(was.timer);
      current = null;
      if (was?.held) onHoldEnd(was.value);
    },
  };
}
