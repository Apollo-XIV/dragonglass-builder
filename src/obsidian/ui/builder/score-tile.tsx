/**
 * One ability score you can step. The tile knows a value, a bonus and a label, and reports
 * steps; what a step costs or where it stops is the caller's, so every method of assigning
 * scores can use it. Wheel and keys are adapters here: each turns its event into `onStep`.
 */

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../components";
import { Reel } from "../reel";
import { createWheelStepper, type Direction, type StepIntent } from "./ability-stepper";
import { createHoldGesture } from "./hold-gesture";

export interface TilePeek {
  id: string;
  label: string;
  direction: Direction;
  available: boolean;
}

export interface ScoreTileProps {
  label: string;
  value: number;
  total: number;
  modifier: number;
  /** What the abilities gained or lost on top of the base, and why: "+2 from Elf". */
  bonus: number;
  bonusText: string;
  selected: boolean;
  peek: TilePeek | undefined;
  onSelect: () => void;
  onDeselect: () => void;
  onStep: (direction: Direction, intent: StepIntent) => void;
  /** A held peek was let go of. */
  onPeekEnd: () => void;
}

const KEY_DIRECTION: Record<string, Direction> = { ArrowUp: 1, ArrowDown: -1 };

export function signed(n: number): string {
  return `${n < 0 ? "−" : "+"}${Math.abs(n)}`;
}

export function ScoreTile(props: ScoreTileProps): ReactNode {
  const { label, value, total, modifier, bonus, bonusText, selected, peek } = props;
  const ref = useRef<HTMLDivElement>(null);
  const nameId = useId();
  const onStep = useRef(props.onStep);
  onStep.current = props.onStep;
  // A peek made with shift held lasts only as long as shift does.
  const shiftPeek = useRef(false);
  const onPeekEnd = useRef(props.onPeekEnd);
  onPeekEnd.current = props.onPeekEnd;

  // The wheel steps only a tile that is selected and under the pointer, and leaves the
  // page alone otherwise. React's own wheel listener is passive, so this one is native.
  useEffect(() => {
    const el = ref.current;
    if (!el || !selected) return;
    const wheel = createWheelStepper();
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      // Browsers turn a shift-wheel into a sideways one.
      const delta = e.shiftKey ? e.deltaY || e.deltaX : e.deltaY;
      const direction = wheel(delta * unit, e.timeStamp);
      if (direction) {
        if (e.shiftKey) shiftPeek.current = true;
        onStep.current(direction, e.shiftKey ? "peek" : "step");
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [selected]);

  // A key tapped steps; a key held, or pressed with shift, peeks.
  const keys = useRef<ReturnType<typeof createHoldGesture<Direction>> | null>(null);
  keys.current ??= createHoldGesture<Direction>(
    (d) => onStep.current(d, "step"),
    (d) => onStep.current(d, "peek"),
    () => onPeekEnd.current(),
  );
  useEffect(() => () => keys.current?.cancel(), []);

  const onKeyDown = (e: KeyboardEvent): void => {
    const direction = KEY_DIRECTION[e.key];
    if (!direction) return;
    e.preventDefault();
    // A held key repeats; holding is not another press.
    if (e.repeat) return;
    if (e.shiftKey) {
      shiftPeek.current = true;
      props.onStep(direction, "peek");
    } else keys.current?.press(e.key, direction);
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "Shift" && shiftPeek.current) {
      shiftPeek.current = false;
      props.onPeekEnd();
    }
    const direction = KEY_DIRECTION[e.key];
    if (direction) keys.current?.release(e.key, direction);
  };

  return (
    <div
      ref={ref}
      className={`dg-score-tile${selected ? " is-selected" : ""}`}
      tabIndex={0}
      role="spinbutton"
      aria-labelledby={nameId}
      aria-valuenow={value}
      aria-valuetext={`${value}, total ${total}`}
      onFocus={props.onSelect}
      onBlur={() => {
        keys.current?.cancel();
        shiftPeek.current = false;
        props.onDeselect();
      }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <span id={nameId} className="dg-score-tile-header">
        {label} {total}({signed(modifier)})
      </span>
      <span className="dg-score-tile-body">
        <span className="dg-score-tile-flank is-left">{bonus ? signed(bonus) : null}</span>
        <Reel
          className="dg-score-tile-value"
          value={value}
          peek={
            peek
              ? {
                  id: peek.id,
                  direction: peek.direction,
                  content: (
                    <span className={peek.available ? "dg-reel-peek" : "dg-reel-peek is-blocked"}>
                      {peek.label}
                    </span>
                  ),
                }
              : undefined
          }
        />
        <span className="dg-score-tile-flank is-right">
          {bonus ? (
            <span className="dg-score-tile-indicator" title={bonusText}>
              <Icon name={bonus > 0 ? "trending-up" : "trending-down"} />
              <span className="dg-sr-only">{bonusText}</span>
            </span>
          ) : null}
        </span>
      </span>
    </div>
  );
}
