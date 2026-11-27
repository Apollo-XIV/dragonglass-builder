/**
 * One ability score tile. The frame is shared: a header with the total and modifier, the
 * bonus either side, and a slot in the middle for the base, which is a reel (point buy), a
 * plain number (pools), or a dashed cutout where a number has yet to go.
 *
 * `ScoreTile` is the one you can step. It knows a value, a bonus and a label, and reports
 * steps; what a step costs or where it stops is the caller's, so every method of assigning
 * scores can use it. Wheel and keys are adapters here: each turns its event into `onStep`.
 */

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
  /** When given, tapping the selected tile again types a value in; it is reported already clamped. */
  onEdit?: (value: number) => void;
  /** Present when the value is outside min and max, which a score carried over from manual can be. */
  onReset?: () => void;
  min?: number;
  max?: number;
}

const KEY_DIRECTION: Record<string, Direction> = { ArrowUp: 1, ArrowDown: -1 };

export function signed(n: number): string {
  return `${n < 0 ? "−" : "+"}${Math.abs(n)}`;
}

export interface ScoreTileFrameProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  /** Absent while the base is: there is nothing to total yet. */
  total: number | undefined;
  modifier: number;
  bonus: number;
  bonusText: string;
  /** The id the header carries, for whatever the tile is labelled by. */
  headerId?: string;
  /** Set when the base is impossible for the method: the tile is outlined red with a cross that calls this. */
  onReset?: () => void;
  /** The base: a `Reel`, a `TileNumber` or a `TileCutout`. */
  children: ReactNode;
}

export const ScoreTileFrame = forwardRef<HTMLDivElement, ScoreTileFrameProps>(function ScoreTileFrame(
  { label, total, modifier, bonus, bonusText, headerId, onReset, children, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`dg-score-tile${onReset ? " is-invalid" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {onReset ? (
        <button
          type="button"
          className="dg-score-tile-reset dg-score-tile-reset-button"
          title="Not a valid score for this method. Reset it"
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Icon name="rotate-ccw" />
          <span className="dg-sr-only">Reset to a valid score</span>
        </button>
      ) : null}
      <span id={headerId} className="dg-score-tile-header">
        {total === undefined ? `${label} —` : `${label} ${total}(${signed(modifier)})`}
      </span>
      <span className="dg-score-tile-body">
        <span className="dg-score-tile-flank is-left">{bonus ? signed(bonus) : null}</span>
        {children}
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
});

/** A base that stays put: a pool's chip, assigned. */
export function TileNumber({ value, className }: { value: number; className?: string }): ReactNode {
  return (
    <span className={`dg-score-tile-value dg-score-tile-number${className ? ` ${className}` : ""}`} data-centre="">
      {value}
    </span>
  );
}

/** Where a chip will sit. `pulse` while one is picked up, so the targets are obvious. */
export function TileCutout({ pulse, className }: { pulse: boolean; className?: string }): ReactNode {
  return (
    <span
      className={`dg-score-tile-value dg-score-tile-cutout${pulse ? " is-pulsing" : ""}${className ? ` ${className}` : ""}`}
      data-centre=""
    >
      <span className="dg-sr-only">Empty</span>
    </span>
  );
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
  const { onEdit, min = 1, max = 30 } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  // Focus selects on the press, so whether the tile already was is read before it lands.
  const wasSelected = useRef(false);

  const finishEdit = (commit: boolean): void => {
    const typed = Number(draft);
    setDraft(null);
    if (!commit || !draft?.trim() || !Number.isFinite(typed)) return;
    const next = Math.min(max, Math.max(min, Math.round(typed)));
    if (next !== value) onEdit?.(next);
  };

  // The wheel steps only a tile that is selected and under the pointer, and leaves the
  // page alone otherwise. React's own wheel listener is passive, so this one is native.
  useEffect(() => {
    const el = ref.current;
    if (!el || !selected || editing) return;
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
  }, [selected, editing]);

  // A key tapped steps; a key held, or pressed with shift, peeks.
  const keys = useRef<ReturnType<typeof createHoldGesture<Direction>> | null>(null);
  keys.current ??= createHoldGesture<Direction>(
    (d) => onStep.current(d, "step"),
    (d) => onStep.current(d, "peek"),
    () => onPeekEnd.current(),
  );
  useEffect(() => () => keys.current?.cancel(), []);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (editing) return;
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
    if (editing) return;
    if (e.key === "Shift" && shiftPeek.current) {
      shiftPeek.current = false;
      props.onPeekEnd();
    }
    const direction = KEY_DIRECTION[e.key];
    if (direction) keys.current?.release(e.key, direction);
  };

  return (
    <ScoreTileFrame
      ref={ref}
      label={label}
      total={total}
      modifier={modifier}
      bonus={bonus}
      bonusText={bonusText}
      headerId={nameId}
      onReset={props.onReset}
      className={selected ? "is-selected" : undefined}
      tabIndex={0}
      role="spinbutton"
      aria-labelledby={nameId}
      aria-valuenow={value}
      aria-valuetext={`${value}, total ${total}`}
      onPointerDownCapture={() => {
        wasSelected.current = selected;
      }}
      onClick={() => {
        if (onEdit && wasSelected.current && selected && !editing) setDraft(String(value));
        wasSelected.current = false;
      }}
      onFocus={props.onSelect}
      onBlur={(e) => {
        // Focus moving to the field inside is not leaving the tile.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (editing) finishEdit(true);
        keys.current?.cancel();
        shiftPeek.current = false;
        props.onDeselect();
      }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      {editing ? (
        <input
          className="dg-score-tile-value dg-score-tile-input"
          type="text"
          inputMode="numeric"
          autoFocus
          value={draft}
          aria-label={`${label} base score, ${min} to ${max}`}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              finishEdit(true);
              ref.current?.focus();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              finishEdit(false);
              ref.current?.focus();
            }
          }}
        />
      ) : (
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
      )}
    </ScoreTileFrame>
  );
}
