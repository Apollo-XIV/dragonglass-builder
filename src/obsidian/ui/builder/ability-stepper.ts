/**
 * Stepping a starting ability score, kept apart from any input. Wheel, keys and the on-screen
 * buttons only turn their events into `stepScore` calls; what a step costs, when it needs
 * confirming and where it stops is decided here. A method supplies `ScoreRules`, never UI.
 */

import type { Contribution } from "../../../core/resolver/resolved";
import type { BuildFile } from "../../../core/types";

type Method = BuildFile["abilities"]["method"];

/** -1 lowers a score, 1 raises it. */
export type Direction = 1 | -1;

export interface ScoreRules {
  min: number;
  max: number;
  /** What it costs to move a score from one value to another; negative when it refunds. */
  cost: (from: number, to: number) => number;
  /** Total points available, for methods that spend from a pool. */
  budget?: number;
  /** A step's cost can be previewed, by a peek. Without it a peek is just a step. */
  peek: boolean;
}

export const POINT_BUY_COSTS: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

export const POINT_BUY_RULES: ScoreRules = {
  min: 8,
  max: 15,
  cost: (from, to) => (POINT_BUY_COSTS[to] ?? 0) - (POINT_BUY_COSTS[from] ?? 0),
  budget: POINT_BUY_BUDGET,
  peek: true,
};

/** The other methods are not built yet: they step freely and commit at once. */
const FREE_RULES: ScoreRules = { min: 1, max: 30, cost: () => 0, peek: false };

export function rulesFor(method: Method): ScoreRules {
  return method === "point-buy" ? POINT_BUY_RULES : FREE_RULES;
}

/** Points spent across a set of scores, each counted from the bottom of the range. */
export function pointsSpentOn(rules: ScoreRules, scores: readonly number[]): number {
  return scores.reduce((n, s) => n + rules.cost(rules.min, s), 0);
}

/**
 * How a step was asked for. A plain step goes straight to the next value; a peek shows what
 * it would cost first, and the same peek asked for again commits it.
 */
export type StepIntent = "step" | "peek";

/** What a step has shown without doing. */
export interface Peek {
  direction: Direction;
  /** "+2", "−1", "MAX" or "MIN". */
  label: string;
  /** False when the step is not available, so nothing can confirm it. */
  available: boolean;
}

export interface StepResult {
  /** The peek to show afterwards; null for none. */
  peek: Peek | null;
  /** Set when the step commits: the score's new value. */
  commit?: number;
}

export function costLabel(cost: number): string {
  return `${cost < 0 ? "−" : "+"}${Math.abs(cost)}`;
}

/**
 * One step in a direction. A step the other way drops a peek that is showing. A step that
 * cannot be taken shows MAX or MIN, whatever the intent, and cannot be confirmed.
 */
export function stepScore(
  rules: ScoreRules,
  state: { value: number; spent: number },
  direction: Direction,
  peek: Peek | null,
  intent: StepIntent = "step",
): StepResult {
  if (peek && peek.direction !== direction) return { peek: null };
  const next = state.value + direction;
  const cost = next >= rules.min && next <= rules.max ? rules.cost(state.value, next) : 0;
  if (next < rules.min) return { peek: { direction, label: "MIN", available: false } };
  if (next > rules.max) return { peek: { direction, label: "MAX", available: false } };
  if (direction > 0 && rules.budget !== undefined && state.spent + cost > rules.budget)
    return { peek: { direction, label: "MAX", available: false } };
  if (intent === "step" || !rules.peek || peek?.available) return { peek: null, commit: next };
  return { peek: { direction, label: costLabel(cost), available: true } };
}

/**
 * Turns wheel deltas into steps. A trackpad flick sends dozens of small events, so deltas
 * accumulate to a threshold, and a step then opens a short cooldown. Wheel up raises.
 */
export function createWheelStepper(threshold = 60, cooldownMs = 180) {
  let sum = 0;
  let readyAt = 0;
  return (deltaY: number, now: number): Direction | 0 => {
    if (now < readyAt || deltaY === 0) return 0;
    // Pushing the other way starts again rather than first unwinding the old push.
    if (sum !== 0 && Math.sign(sum) !== Math.sign(deltaY)) sum = 0;
    sum += deltaY;
    if (Math.abs(sum) < threshold) return 0;
    const direction: Direction = sum < 0 ? 1 : -1;
    sum = 0;
    readyAt = now + cooldownMs;
    return direction;
  };
}

/** Where a total's difference from its base came from: "+2 from Elf". */
export function bonusSources(breakdown: readonly Contribution[]): { name: string; value: number }[] {
  return breakdown
    .filter((c) => c.applied && c.op === "add" && typeof c.value === "number" && c.value !== 0)
    .map((c) => ({ name: c.sourceName, value: c.value as number }));
}

export function bonusText(sources: readonly { name: string; value: number }[]): string {
  return sources.map((s) => `${costLabel(s.value)} from ${s.name}`).join(", ");
}
