/**
 * The Use button of an action. A fixed cost is spent on the click; an action with a
 * chosen-amount cost opens a small picker first, which shows what the pool has left and
 * will not spend more than that. Both layouts use it.
 */

import { useState, type ReactNode } from "react";
import type { ResolvedAction } from "../../core/resolver/resolved";
import {
  amountProblem,
  canUse,
  chosenCosts,
  defaultAmounts,
  spentOf,
  useActionEvents,
  withSpent,
} from "../../core/state/use-action";
import type { CharacterStore } from "../character-store";
import { useToast } from "./narrow/toast";

export function UseAction({
  action,
  store,
  className = "dg-n-chip is-action",
  label = "Use",
  startOpen = false,
}: {
  action: ResolvedAction;
  store: CharacterStore;
  className?: string;
  label?: string;
  /** Opens the picker at once; for tests and screenshots. */
  startOpen?: boolean;
}): ReactNode {
  const toast = useToast();
  const lines = chosenCosts(action);
  const [open, setOpen] = useState(startOpen && lines.length > 0);
  const [chosen, setChosen] = useState<Record<string, number>>(() => defaultAmounts(action));

  const spend = (amounts: Record<string, number>): void => {
    const events = useActionEvents(action, amounts);
    if (!events.length) return;
    store.appendEvents(...events);
    const spent = spentOf(action, amounts);
    toast.show({
      label: action.name,
      detail: [spent !== undefined ? `Spent ${spent}` : action.applies ? "Applied" : "Used", withSpent(action.healResolved, spent) && `heals ${withSpent(action.healResolved, spent)}`]
        .filter(Boolean)
        .join(" · "),
    });
    setOpen(false);
  };

  if (!open)
    return (
      <button
        className={className}
        disabled={!action.available}
        onClick={() => (lines.length ? (setChosen(defaultAmounts(action)), setOpen(true)) : spend({}))}
      >
        {label}
      </button>
    );

  const spent = spentOf(action, chosen);
  return (
    <div className="dg-use-picker" role="group" aria-label={`Spend for ${action.name}`}>
      {lines.map((line) => {
        const value = chosen[line.key] ?? line.amount.min;
        const problem = amountProblem(line, value);
        const set = (n: number): void => setChosen({ ...chosen, [line.key]: n });
        return (
          <div key={line.key} className="dg-use-row">
            <span className="dg-use-label">{line.label}</span>
            <button className="dg-n-chip" onClick={() => set(Math.max(line.amount.min, value - 1))} disabled={value <= line.amount.min}>
              <span className="dg-sr-only">One fewer</span>
              <span aria-hidden="true">−</span>
            </button>
            <input
              className="dg-use-input"
              type="number"
              inputMode="numeric"
              min={line.amount.min}
              max={line.amount.max}
              value={value}
              onChange={(e) => set(Math.trunc(Number(e.target.value)))}
              aria-label={`Amount of ${line.label}`}
            />
            <button className="dg-n-chip" onClick={() => set(Math.min(line.amount.max, value + 1))} disabled={value >= line.amount.max}>
              <span className="dg-sr-only">One more</span>
              <span aria-hidden="true">+</span>
            </button>
            <span className="dg-use-left">
              {line.remaining !== undefined ? `${line.remaining} left` : `${line.amount.min}–${line.amount.max}`}
            </span>
            {problem ? <span className="dg-use-problem" role="alert">{problem}</span> : null}
          </div>
        );
      })}
      {action.healResolved ? <div className="dg-use-preview">Heals {withSpent(action.healResolved, spent)}</div> : null}
      {action.damageResolved && /@spent\b/.test(action.damageResolved) ? (
        <div className="dg-use-preview">Damage {withSpent(action.damageResolved, spent)}</div>
      ) : null}
      <div className="dg-use-actions">
        <button className="dg-n-chip is-action" disabled={!canUse(action, chosen)} onClick={() => spend(chosen)}>
          Spend
        </button>
        <button className="dg-n-chip" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
