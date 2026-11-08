/**
 * Using an action: the events it records, and the amount a chosen-amount cost is paid.
 * Pure, so the sheet's picker and the tests agree about what "too much" means.
 */

import { fillSpent } from "../expr/evaluate";
import type { ResolvedAction, ResolvedCostLine } from "../resolver/resolved";
import type { StateEvent } from "../types";
import { event } from "./fold";

type ChosenLine = ResolvedCostLine & { amount: { min: number; max: number } };

/** The costs of an action whose amount the player chooses. */
export function chosenCosts(action: ResolvedAction): ChosenLine[] {
  return (action.resolvedCost ?? []).filter((c): c is ChosenLine => typeof c.amount !== "number");
}

/** What the picker offers first: the least, which is always payable if anything is. */
export function defaultAmounts(action: ResolvedAction): Record<string, number> {
  return Object.fromEntries(chosenCosts(action).map((c) => [c.key, c.amount.min]));
}

/** Why `amount` cannot be paid from this line, or undefined when it can. */
export function amountProblem(line: ChosenLine, amount: number): string | undefined {
  if (!Number.isInteger(amount)) return "Choose a whole number";
  if (amount < line.amount.min) return `At least ${line.amount.min}`;
  if (amount > line.amount.max)
    return line.remaining !== undefined && line.remaining === line.amount.max
      ? `Only ${line.remaining} left`
      : `At most ${line.amount.max}`;
  return undefined;
}

/** True when every chosen amount can be paid, and the action can be used at all. */
export function canUse(action: ResolvedAction, chosen: Record<string, number>): boolean {
  if (!action.available) return false;
  return chosenCosts(action).every((c) => amountProblem(c, chosen[c.key] ?? c.amount.min) === undefined);
}

/**
 * The events using the action records. A fixed cost spends its amount; a chosen one spends
 * what was chosen. Returns nothing when a chosen amount is out of range: the sheet never
 * gets to spend more than a pool has left by a stale picker.
 */
export function useActionEvents(action: ResolvedAction, chosen: Record<string, number> = {}): StateEvent[] {
  if (!canUse(action, chosen)) return [];
  const events: StateEvent[] = [];
  for (const cost of action.resolvedCost ?? []) {
    const amount = typeof cost.amount === "number" ? cost.amount : (chosen[cost.key] ?? cost.amount.min);
    events.push(event("spend", { target: cost.key, amount }));
  }
  if (action.applies) events.push(event("effect.start", { effect: action.applies, source: action.source }));
  return events;
}

/** The amount `@spent` stands for: the first chosen cost's. */
export function spentOf(action: ResolvedAction, chosen: Record<string, number>): number | undefined {
  const first = chosenCosts(action)[0];
  return first ? (chosen[first.key] ?? first.amount.min) : undefined;
}

/** `text` with `@spent` filled in, or with `X` standing for it while no amount is chosen. */
export function withSpent(text: string | undefined, spent: number | undefined): string | undefined {
  if (!text) return text;
  return spent === undefined ? text.replace(/@spent\b/g, "X") : fillSpent(text, spent);
}
