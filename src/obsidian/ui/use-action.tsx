/**
 * The Use button of an action. A fixed cost is spent on the click; an action with a
 * chosen-amount cost opens a small picker first, which shows what the pool has left and
 * will not spend more than that. Both layouts use it.
 *
 * Holding it (right-clicking, with a mouse) opens the resource menu for the pool it
 * spends, so a use can be put back or a pool set by hand right where it was spent.
 * An action that costs several pools opens the first.
 */

import { useState, type ReactNode } from "react";
import { poolOf } from "../../core/resolver/pins";
import { readingText } from "../../core/resolver/resolved";
import { describeRecharge } from "../../core/state/recharge";
import {
  type Spender,
  amountProblem,
  canUse,
  chosenCosts,
  defaultAmounts,
  spentOf,
  useActionEvents,
  withSpent,
} from "../../core/state/use-action";
import type { CharacterStore } from "../character-store";
import { useHold } from "./narrow/hold";
import { usePoolControls, useResourceMenu } from "./narrow/targets";
import { useToast } from "./narrow/toast";

export function UseAction({
  action,
  store,
  className = "dg-n-chip is-action",
  label = "Use",
  startOpen = false,
}: {
  action: Spender;
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

  const use = (): void => {
    if (!action.available) {
      toast.show({ label: action.name, detail: action.unavailableReason ?? "Can't be used now" });
      return;
    }
    if (lines.length) {
      setChosen(defaultAmounts(action));
      setOpen(true);
    } else spend({});
  };
  const menu = usePoolMenu(store, action.resolvedCost?.[0]?.key);
  const { handlers } = useHold({ onTap: use, onHold: menu, className });

  if (!open)
    return (
      <button
        type="button"
        {...handlers}
        style={handlers.style}
        // Not `disabled`: a disabled button hears no pointer, and an action that can't
        // be paid for is exactly when the player wants the menu to put a use back.
        aria-disabled={!action.available || undefined}
        aria-haspopup={menu ? "dialog" : undefined}
        onContextMenu={(e) => {
          e.preventDefault();
          if (e.button === 2) menu?.();
        }}
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

/**
 * The resource menu for the pool a cost names, read from the store on every render
 * of the sheet so it follows the spending. Undefined for an action with no cost.
 */
function usePoolMenu(store: CharacterStore, key: string | undefined): (() => void) | undefined {
  const pool = key && store.resolved ? poolOf(store.resolved, key) : undefined;
  const target = pool?.target ?? key ?? "";
  const read = (): { remaining: number; max: number } => {
    const live = store.resolved ? poolOf(store.resolved, target) : undefined;
    return { remaining: live?.remaining ?? pool?.remaining ?? 0, max: live?.max ?? pool?.max ?? 0 };
  };
  const { spend, set } = usePoolControls(store, target, () => read().remaining);
  const { open } = useResourceMenu({
    name: pool?.name ?? "",
    subtitle: pool?.resource ? `${describeRecharge(pool.resource.recharge)} · ${pool.resource.sourceName}` : undefined,
    text: pool?.resource ? readingText(pool.resource) : undefined,
    read,
    onSpend: spend,
    onSet: set,
  });
  return pool ? open : undefined;
}
