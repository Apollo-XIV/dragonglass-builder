/**
 * A number that rolls. When `value` changes the old one scrolls out and the new one in; a
 * `peek` rolls the reel about halfway and holds there, showing its content in the slot where
 * the next value would arrive. Nothing here knows what the content means, so a slot machine
 * can use it as well as a point-buy tile.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

export interface ReelPeek {
  /** Changes whenever the content does, so the reel knows to redraw it. */
  id: string;
  content: ReactNode;
  /** 1 is a raise, which arrives from above as a wheel pushed up would; -1 arrives from below. */
  direction: 1 | -1;
}

/** Matches the transition in styles.css. */
const ROLL_MS = 240;
const HALFWAY = 0.5;

export function Reel({
  value,
  peek,
  className,
}: {
  value: number | string;
  peek?: ReelPeek;
  className?: string;
}): ReactNode {
  // `shown` fills the visible slot; `incoming` the slot the reel is rolling towards.
  const [shown, setShown] = useState<number | string>(value);
  const [incoming, setIncoming] = useState<{ content: ReactNode; direction: 1 | -1 }>({
    content: null,
    direction: 1,
  });
  const [progress, setProgress] = useState(0);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    if (value !== shown) {
      const direction = typeof value === "number" && typeof shown === "number" && value < shown ? -1 : 1;
      setIncoming({ content: value, direction });
      setAnimate(true);
      setProgress(1);
      // Once it has landed, the incoming value becomes the shown one without animating.
      const done = window.setTimeout(() => {
        setAnimate(false);
        setShown(value);
        setProgress(0);
      }, ROLL_MS);
      return () => window.clearTimeout(done);
    }
    setAnimate(true);
    if (peek) {
      setIncoming({ content: peek.content, direction: peek.direction });
      setProgress(HALFWAY);
    } else {
      setProgress(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, peek?.id, peek?.direction]);

  const style = {
    // The slot's offset: a raise (1) arrives from above, so the reel moves down.
    "--dir": -incoming.direction,
    "--p": progress,
  } as CSSProperties;
  return (
    <span
      className={`dg-reel${animate ? " is-animated" : ""}${className ? ` ${className}` : ""}`}
      style={style}
      data-from={incoming.direction > 0 ? "above" : "below"}
    >
      <span className="dg-reel-slot dg-reel-current">{shown}</span>
      <span className="dg-reel-slot dg-reel-incoming" aria-hidden="true">
        {incoming.content}
      </span>
    </span>
  );
}
