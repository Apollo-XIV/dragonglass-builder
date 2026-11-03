/**
 * The desktop layout's interaction primitives (desktop spec, "Interaction on
 * desktop"). They map the narrow layout's touch language onto a mouse:
 *
 *   tap    -> click        roll, spend a use, toggle
 *   hold   -> right-click  the detail sheet, with advantage and uses
 *   (new)  -> hover        a quick breakdown of any computed number
 *
 * The behaviour behind all three is the narrow layout's: `useRollable` does the
 * rolling and opens the same sheet body, so a d20 explained on a phone and the
 * same d20 explained on a desktop say exactly the same thing.
 *
 * Nothing rollable carries an outline at rest. The hover state is the whole of
 * the affordance, and the target is the value, never the row around it.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Explanation } from "../../../core/resolver/explain";
import { Icon } from "../components";
import { useRollable } from "../narrow/targets";

/** How long the pointer rests before the breakdown appears. */
const HOVER_DELAY = 180;

/**
 * A hover card anchored to whatever it decorates. It goes through a portal, not
 * into the tree: the stat cluster and the boxes are all scroll containers of
 * their own, and a card inside one would be clipped by it.
 */
export function useHoverCard(content: () => ReactNode): { handlers: HoverHandlers; card: ReactNode } {
  const [rect, setRect] = useState<DOMRect | undefined>();
  const timer = useRef(0);

  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);

  const clear = (): void => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = 0;
    setRect(undefined);
  };

  const handlers: HoverHandlers = {
    onMouseEnter: (event) => {
      const target = event.currentTarget as HTMLElement;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setRect(target.getBoundingClientRect()), HOVER_DELAY);
    },
    onMouseLeave: clear,
    // A click has already said what the number does; the card would only be in
    // the way of the toast.
    onMouseDown: clear,
  };

  const card =
    rect && typeof document !== "undefined"
      ? createPortal(
          <div className="dg-d-hovercard" style={cardPosition(rect)} role="tooltip">
            {content()}
          </div>,
          document.body,
        )
      : null;

  return { handlers, card };
}

interface HoverHandlers {
  onMouseEnter: (event: { currentTarget: EventTarget | null }) => void;
  onMouseLeave: () => void;
  onMouseDown: () => void;
}

/** Below the target, nudged back inside the window when it would hang off an edge. */
function cardPosition(rect: DOMRect): CSSProperties {
  const width = 280;
  const margin = 8;
  const viewport = typeof window === "undefined" ? 1280 : window.innerWidth;
  const left = Math.min(Math.max(margin, rect.left), viewport - width - margin);
  const below = rect.bottom + 6;
  const flip = typeof window !== "undefined" && below + 160 > window.innerHeight && rect.top > 180;
  return flip
    ? { left, bottom: `${window.innerHeight - rect.top + 6}px`, width }
    : { left, top: `${below}px`, width };
}

/** The hover card's contents for a stat: the one-line formula, then its caveats. */
export function BreakdownCard({ explanation }: { explanation: Explanation }): ReactNode {
  return (
    <>
      <p className="dg-d-hovercard-formula">{explanation.formula}</p>
      {explanation.rows.length > 1 ? (
        <ul className="dg-d-hovercard-rows">
          {explanation.rows.map((row, i) => (
            <li key={`${row.label}-${i}`} className={row.applied ? undefined : "is-suppressed"}>
              <span>{row.label}</span>
              <span>{row.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {explanation.notes.map((note, i) => (
        <p key={i} className={`dg-d-hovercard-note is-${note.kind}`}>
          {note.kind === "advantage" || note.kind === "disadvantage" ? <Icon name="dice-d20" /> : null}
          {note.text}
        </p>
      ))}
      <p className="dg-d-hovercard-hint">Right-click for the full breakdown</p>
    </>
  );
}

/**
 * A rollable number. Click rolls, right-click opens the breakdown with advantage
 * and disadvantage, hover explains it in a line.
 */
export function RollTarget({
  explanation,
  children,
  label,
  className,
  title,
}: {
  explanation: () => Explanation;
  /** What the target shows; the caller formats it. */
  children: ReactNode;
  label: string;
  className?: string;
  /** Replaces the hover card's formula line, for a target with no arithmetic. */
  title?: string;
}): ReactNode {
  const { roll, explain } = useRollable(explanation);
  const { handlers, card } = useHoverCard(() => <BreakdownCard explanation={explanation()} />);

  return (
    <>
      <button
        type="button"
        className={["dg-d-target", className].filter(Boolean).join(" ")}
        title={title}
        onClick={() => roll()}
        onContextMenu={(event) => {
          event.preventDefault();
          explain();
        }}
        {...handlers}
      >
        {children}
        <HiddenLabel label={label} />
      </button>
      {card}
    </>
  );
}

/**
 * The accessible name, as text rather than an `aria-label`. Obsidian shows a
 * tooltip of its own for every element carrying an `aria-label`, and it would
 * open on top of the hover card that says considerably more.
 */
function HiddenLabel({ label }: { label: string }): ReactNode {
  return <span className="dg-sr-only">{label}</span>;
}

/**
 * A number that is read rather than rolled: AC, proficiency bonus, a passive
 * score. Hover explains it; right-click still opens the breakdown, because
 * "where does my AC come from" is the question it exists to answer.
 */
export function ReadTarget({
  explanation,
  children,
  label,
  className,
}: {
  explanation?: () => Explanation;
  children: ReactNode;
  label: string;
  className?: string;
}): ReactNode {
  const { explain } = useRollable(explanation ?? (() => emptyExplanation(label)));
  const { handlers, card } = useHoverCard(() =>
    explanation ? <BreakdownCard explanation={explanation()} /> : label,
  );

  if (!explanation) return <span className={className}>{children}</span>;

  return (
    <>
      <button
        type="button"
        className={["dg-d-target is-read", className].filter(Boolean).join(" ")}
        onClick={() => explain()}
        onContextMenu={(event) => {
          event.preventDefault();
          explain();
        }}
        {...handlers}
      >
        {children}
        <HiddenLabel label={label} />
      </button>
      {card}
    </>
  );
}

function emptyExplanation(label: string): Explanation {
  return { label, kind: "none", total: 0, rows: [], notes: [], formula: "", advantage: "none" };
}
