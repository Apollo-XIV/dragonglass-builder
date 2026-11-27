/**
 * A pool of six chips, for rolled scores and the standard array alike. The row draws chips
 * and reports what was done to them; what that means for the build is `ability-pools.ts`'s,
 * called by whoever holds the pool. A pool without a method (the standard array) has fixed
 * values: no typing, no rolling, no controls.
 *
 * A chip's number is a `Reel` printed with the method's range round and round, so a roll is
 * the wheel turning a few times over and stopping on the value already decided.
 */

import { useDraggable } from "@dnd-kit/core";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { Ability } from "../../../core/types";
import { Icon } from "../components";
import { Reel } from "../reel";
import { chipId, POOL_SIZE, type PoolView } from "./ability-pools";
import { prefersReducedMotion } from "./glide";
import { finishDraft, typeInto, type Typed, type ValueRange } from "./roll-methods";

/** The chip being worked on: picked up to assign, or open to type into. */
export interface PoolFocus {
  chip: string;
  mode: "arm" | "edit";
  /** What has been typed into the chip and not yet finished. */
  draft: string;
}

export interface PoolActions {
  /** A filled chip was tapped. */
  press: (chip: string) => void;
  /** An empty slot took focus, or a pool was tapped where there is no chip. */
  edit: (chip: string) => void;
  type: (chip: string, typed: Typed) => void;
  /** The chip being typed into lost focus. */
  leave: (chip: string) => void;
  /** Backspace with nothing typed: empties the chip, or steps back once it is empty. */
  erase: (chip: string) => void;
  move: (chip: string, by: -1 | 1) => void;
  rollOne: () => void;
  rollAll: () => void;
  addPool: () => void;
  removePool: () => void;
}

const SPIN_MS = 900;
/** In a batch, each reel runs this much longer than the one to its left, so they land in turn. */
const SPIN_STAGGER_MS = 220;
/** At least this many numbers go past, so even a reroll to the same value spins. */
const SPIN_STEPS = 12;

/** A chip's reel was set turning: `count` is new each time, `rank` its place in the batch. */
export interface Spin {
  count: number;
  rank: number;
}

function wrapper(range: ValueRange): (n: number) => number {
  const span = range.max - range.min + 1;
  return (n) => range.min + ((((n - range.min) % span) + span) % span);
}

/**
 * Where a chip's reel stands. Without a new `spin` it is just the value; with one the reel
 * turns on from where it was, a number at a time, slowing down, and stops on the value.
 */
function useSpin(value: number | null, spin: Spin | undefined, range: ValueRange | undefined): number | null {
  const [position, setPosition] = useState(value);
  const at = useRef(value);
  at.current = position;
  const seen = useRef(spin?.count);

  useEffect(() => {
    if (spin?.count === seen.current || !range || value === null || prefersReducedMotion()) {
      seen.current = spin?.count;
      setPosition(value);
      return;
    }
    seen.current = spin?.count;
    const span = range.max - range.min + 1;
    const start = at.current ?? range.min;
    const steps = SPIN_STEPS + ((((value - start - SPIN_STEPS) % span) + span) % span);
    // Each step waits a little longer than the last, up to about three times the first. The
    // last gap stays close to the one before it: the reel's own transition does the settling,
    // and a long pause before the final step reads as a nudge one past where it stopped.
    const gaps = Array.from({ length: steps }, (_, i) => 1 + 2.5 * ((i + 1) / steps) ** 2);
    const scale = (SPIN_MS + SPIN_STAGGER_MS * (spin?.rank ?? 0)) / gaps.reduce((a, b) => a + b, 0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    gaps.forEach((gap, i) => {
      t += gap * scale;
      timers.push(setTimeout(() => setPosition(start + i + 1), t));
    });
    return () => timers.forEach(clearTimeout);
    // `range` is a method's, which doesn't change under a chip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, spin?.count]);

  return position;
}

export function PoolRow({
  pool,
  number,
  used,
  focus,
  spins,
  actions,
}: {
  pool: PoolView;
  /** The pool's place in the list, shown on its edge when there is more than one. */
  number?: number;
  used: ReadonlyMap<string, Ability>;
  focus: PoolFocus | null;
  spins: Readonly<Record<string, Spin>>;
  actions: PoolActions;
}): ReactNode {
  const editing = focus?.mode === "edit" && focus.chip.startsWith(`${pool.id}:`) ? focus : null;

  return (
    <div className={`dg-pool${editing ? " is-editing" : ""}`} data-pool={pool.id}>
      {number !== undefined ? (
        <span className="dg-pool-number" aria-hidden="true">
          {number}
        </span>
      ) : null}
      <div
        className="dg-pool-chips"
        onClick={(e) => {
          // A tap on the pool itself, between chips, opens its first empty slot.
          if (e.target !== e.currentTarget || !pool.method) return;
          const empty = pool.values.findIndex((v) => v === null);
          actions.edit(chipId(pool.id, empty < 0 ? 0 : empty));
        }}
      >
        {Array.from({ length: POOL_SIZE }, (_, slot) => {
          const chip = chipId(pool.id, slot);
          return (
            <PoolChip
              key={chip}
              chip={chip}
              value={pool.values[slot] ?? null}
              range={pool.method}
              usedBy={used.get(chip)}
              armed={focus?.mode === "arm" && focus.chip === chip}
              draft={editing?.chip === chip ? editing.draft : undefined}
              spin={spins[chip]}
              actions={actions}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Roll one, Roll all, Add pool, Remove pool: for the pool being typed into. They float under
 * the last pool rather than the one in use, so they never cover another pool's chips.
 */
export function PoolControls({
  dragging,
  only,
  actions,
}: {
  dragging: boolean;
  /** The last pool left, which is reset rather than removed. */
  only: boolean;
  actions: PoolActions;
}): ReactNode {
  const keep = (e: { preventDefault: () => void }): void => e.preventDefault();
  const control = (label: string, icon: string, run: () => void): ReactNode => (
    <button
      className="dg-pool-control dg-pool-control-button"
      // The chip being typed into keeps focus, so Roll one knows which it is.
      onMouseDown={keep}
      onPointerDown={keep}
      onClick={run}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
  return (
    <div className={`dg-pool-controls${dragging ? " is-faded" : ""}`}>
      {control("Roll one", "dice-5", actions.rollOne)}
      {control("Roll all", "dices", actions.rollAll)}
      {control("Add pool", "plus", actions.addPool)}
      {control(only ? "Reset pool" : "Remove pool", only ? "rotate-ccw" : "trash-2", actions.removePool)}
    </div>
  );
}

function PoolChip({
  chip,
  value,
  range,
  usedBy,
  armed,
  draft,
  spin,
  actions,
}: {
  chip: string;
  value: number | null;
  /** The method's range; absent when the value is fixed. */
  range: ValueRange | undefined;
  usedBy: Ability | undefined;
  armed: boolean;
  /** Set while the chip is open to typing. */
  draft: string | undefined;
  spin: Spin | undefined;
  actions: PoolActions;
}): ReactNode {
  const editing = draft !== undefined;
  const typable = range !== undefined && (editing || value === null);
  const position = useSpin(value, spin, range);
  const input = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const drag = useDraggable({ id: `chip:${chip}`, data: { chip }, disabled: value === null || editing });

  useLayoutEffect(() => {
    if (editing && input.current && input.current.ownerDocument.activeElement !== input.current) input.current.focus();
  }, [editing]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (!range) return;
    if (e.key === "Backspace" && !draft) {
      e.preventDefault();
      actions.erase(chip);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const n = finishDraft(range, draft ?? "");
      if (n !== undefined) actions.type(chip, { commits: [n], draft: "" });
    } else if (e.key === "Escape") {
      input.current?.blur();
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !draft) {
      e.preventDefault();
      actions.move(chip, e.key === "ArrowLeft" ? -1 : 1);
    }
  };

  const label = range ? wrapper(range) : undefined;
  const classes = [
    "dg-pool-chip",
    value === null ? "is-empty" : "",
    usedBy ? "is-used" : "",
    armed ? "is-armed" : "",
    editing ? "is-editing" : "",
    draft ? "has-draft" : "",
    drag.isDragging ? "is-lifted" : "",
  ].filter(Boolean);

  return (
    <div
      ref={drag.setNodeRef}
      className={classes.join(" ")}
      data-chip={chip}
      role={typable ? undefined : "button"}
      tabIndex={typable ? undefined : 0}
      aria-pressed={typable ? undefined : armed}
      {...(typable ? {} : drag.listeners)}
      onClick={() => {
        if (!typable) actions.press(chip);
      }}
      onKeyDown={(e) => {
        if (typable || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        actions.press(chip);
      }}
    >
      {/* Keyed by the roll, so a reduced-motion reroll fades in afresh rather than spinning. */}
      <span key={spin?.count ?? 0} className="dg-pool-chip-value" aria-hidden="true">
        {position === null ? null : <Reel value={position} label={label} />}
      </span>
      {typable ? (
        <input
          ref={input}
          className="dg-pool-chip-input"
          inputMode="numeric"
          enterKeyHint="next"
          autoComplete="off"
          aria-labelledby={nameId}
          value={draft ?? ""}
          onFocus={() => {
            if (!editing) actions.edit(chip);
          }}
          onBlur={() => actions.leave(chip)}
          onChange={(e) => {
            const text = e.target.value;
            const before = draft ?? "";
            actions.type(
              chip,
              text.startsWith(before) ? typeInto(range!, before, text.slice(before.length)) : typeInto(range!, "", text),
            );
          }}
          onPaste={(e) => {
            e.preventDefault();
            actions.type(chip, typeInto(range!, draft ?? "", e.clipboardData.getData("text")));
          }}
          onKeyDown={onKeyDown}
        />
      ) : null}
      <span id={nameId} className="dg-sr-only">
        {value ?? "Empty"}
        {usedBy ? `, used by ${usedBy.toUpperCase()}` : ""}
      </span>
    </div>
  );
}

/** The chip under the pointer while one is dragged. */
export function ChipGhost({ value }: { value: number }): ReactNode {
  return <div className="dg-pool-chip is-dragged">{value}</div>;
}
