/**
 * One number the player types or rolls, with the dice it comes from: the single-slot field
 * the ability pool's chips are made of, on its own. It shares the chips' reel and spin
 * (`useSpin`, `Reel`) so a roll is the same wheel turning and stopping on the value already
 * decided.
 *
 * Unlike a chip it does not refuse a number the dice cannot roll: a table may hand out more,
 * so the value is taken and the field says it is outside the range.
 */

import { useState, type ReactNode } from "react";
import { diceRange, rollNotation } from "../../../core/dice";
import { Icon } from "../components";
import { Reel } from "../reel";
import { useSpin, wrapper, type Spin } from "./ability-pool";

export function RolledField({
  dice,
  value,
  onChange,
  label,
  outcome,
}: {
  dice: string;
  /** The number now; undefined until one is typed or rolled. */
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  label: string;
  /** What the number comes to, shown beside the field: "= 120 gp". */
  outcome?: (value: number) => string;
}): ReactNode {
  const range = diceRange(dice);
  const inRange = value === undefined || (value >= range.min && value <= range.max);
  const [spin, setSpin] = useState<Spin | undefined>();
  const position = useSpin(value ?? null, spin, inRange ? range : undefined);

  const roll = (): void => {
    setSpin({ count: (spin?.count ?? 0) + 1, rank: 0 });
    onChange(rollNotation(dice).total);
  };

  return (
    <div className="dg-rolled">
      <span className="dg-rolled-label">{label}</span>
      <span className="dg-rolled-value" aria-hidden="true">
        {position === null || !inRange ? null : <Reel value={position} label={wrapper(range)} />}
      </span>
      <input
        className="dg-rolled-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${label}: ${dice}`}
        placeholder={`${dice}`}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => {
          const text = e.currentTarget.value.replace(/\D/g, "");
          onChange(text === "" ? undefined : Number(text));
        }}
      />
      <button className="dg-rolled-roll" onClick={roll}>
        <Icon name="dices" />
        <span className="dg-sr-only">Roll {dice}</span>
      </button>
      {value !== undefined && outcome ? <span className="dg-muted">{outcome(value)}</span> : null}
      {inRange ? null : (
        <span className="dg-warn" role="status">
          {dice} rolls {range.min}–{range.max}; {value} is outside that.
        </span>
      )}
    </div>
  );
}
