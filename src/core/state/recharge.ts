/**
 * Recharge rules, resolved: what a rest gives back to a pool, and how to say so.
 *
 * Kept apart from the fold so the sheet's labels and the fold's arithmetic read the
 * same rules.
 */

import type { RechargeOn } from "../types";

/** A rule once its amount has been evaluated. */
export interface ResolvedRecharge {
  on: RechargeOn;
  amount: number | "all";
  /** The rule in the book's words, where the content gave them. */
  text?: string;
}

export type Rest = "short" | "long";

/**
 * A long rest includes everything a short rest does; dawn, dusk and midnight ride along
 * with it. `special` is applied by no rest: the pool is restored by hand.
 */
function triggersOn(on: RechargeOn, rest: Rest): boolean {
  if (rest === "short") return on === "short-rest";
  return on === "short-rest" || on === "long-rest" || on === "dawn" || on === "dusk" || on === "midnight";
}

/** How many uses this rest restores: the largest matching rule, 0 when none match. */
export function restoredOn(rules: readonly ResolvedRecharge[], rest: Rest, max: number): number {
  let best = 0;
  for (const rule of rules) {
    if (!triggersOn(rule.on, rest)) continue;
    best = Math.max(best, rule.amount === "all" ? max : rule.amount);
  }
  return best;
}

export function rechargesOnRest(rules: readonly ResolvedRecharge[]): boolean {
  return rules.some((r) => r.on === "short-rest" || r.on === "long-rest");
}

export function hasRecharge(rules: readonly ResolvedRecharge[], on: RechargeOn): boolean {
  return rules.some((r) => r.on === on);
}

/** "2 of 3", or "∞" for a pool with no cap. */
export function describeUses(remaining: number, max: number): string {
  return Number.isFinite(max) ? `${remaining} of ${max}` : "∞";
}

const words = (on: RechargeOn): string => on.replace("-", " ");

/** A special rule is described by its text; anything else by its trigger. */
const describeRule = (r: ResolvedRecharge): string => (r.on === "special" ? r.text ?? "special" : words(r.on));

/** "long rest", "3 on a long rest", "1 on a short rest, all on a long rest", "manual". */
export function describeRecharge(rules: readonly ResolvedRecharge[]): string {
  if (!rules.length) return "manual";
  if (rules.length === 1 && rules[0].amount === "all") return describeRule(rules[0]);
  return rules.map((r) => (r.on === "special" ? `${r.amount} ${describeRule(r)}` : `${r.amount} on a ${words(r.on)}`)).join(", ");
}
