/**
 * A number that rolls, as a wheel with the number line printed round it: every number sits at
 * a fixed place, and changing `value` only turns the wheel. Nothing remembers which way it
 * last turned, so a turn-around mid-roll is just the wheel changing its mind, and the CSS
 * transition carries on from wherever each number has got to. A `peek` turns the wheel about
 * halfway and holds there, showing its content in the slot where the next value would arrive.
 * Nothing here knows what the content means, so a slot machine can use it as well as a
 * point-buy tile. A `label` prints something other than the number at each place, which is how
 * a slot machine's strip repeats its range round an endless wheel.
 */

import { useRef, type CSSProperties, type ReactNode } from "react";

export interface ReelPeek {
  /** Changes whenever the content does, so the reel knows to redraw it. */
  id: string;
  content: ReactNode;
  /** 1 is a raise, which arrives from above as a wheel pushed up would; -1 arrives from below. */
  direction: 1 | -1;
}

type Direction = 1 | -1;

const HALFWAY = 0.5;
/** How many numbers either side of the value are kept in place, ready to roll in. */
const REACH = 2;

/** A slot's place on the wheel, as a distance from the visible slot: 1 is a whole slot above. */
function place(d: number): CSSProperties {
  const away = Math.min(1, Math.abs(d));
  return { "--d": d, "--a": away } as CSSProperties;
}

export function Reel({
  value,
  peek,
  className,
  label,
}: {
  value: number;
  peek?: ReelPeek;
  className?: string;
  label?: (n: number) => ReactNode;
}): ReactNode {
  // A peek that has been let go of still slides away with its content, not an empty slot.
  const kept = useRef<Partial<Record<Direction, ReactNode>>>({});
  if (peek) kept.current[peek.direction] = peek.content;

  // The wheel turns towards a peek's direction by half a slot.
  const pull = peek ? peek.direction * HALFWAY : 0;
  const slots: ReactNode[] = [];
  for (let offset = -REACH; offset <= REACH; offset++) {
    const n = value + offset;
    const d = offset - pull;
    slots.push(
      <span
        key={n}
        className={`dg-reel-slot${peek && offset === peek.direction ? " is-covered" : ""}`}
        style={{ ...place(d), "--o": Math.max(0, 1 - Math.abs(d) * 2) } as CSSProperties}
        aria-hidden={offset === 0 ? undefined : true}
      >
        {label ? label(n) : n}
      </span>,
    );
  }
  for (const direction of [1, -1] as const) {
    const content = kept.current[direction];
    if (content === undefined) continue;
    const d = direction - pull;
    slots.push(
      <span
        key={`peek${direction}`}
        className="dg-reel-slot dg-reel-incoming"
        data-from={direction > 0 ? "above" : "below"}
        // --dir is -1 when the peek arrives from above.
        style={{ ...place(d), "--dir": -direction, "--o": Math.min(1, (1 - Math.abs(d)) * 2) } as CSSProperties}
        aria-hidden="true"
      >
        {content}
      </span>,
    );
  }

  return <span className={`dg-reel${className ? ` ${className}` : ""}`}>{slots}</span>;
}
