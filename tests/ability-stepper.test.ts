import { describe, expect, it, vi } from "vitest";
import { createHoldGesture } from "../src/obsidian/ui/builder/hold-gesture";
import {
  bonusSources,
  bonusText,
  createWheelStepper,
  POINT_BUY_RULES as rules,
  pointsSpentOn,
  rulesFor,
  stepScore,
  type Peek,
} from "../src/obsidian/ui/builder/ability-stepper";

const at = (value: number, spent = 0) => ({ value, spent });

describe("point buy rules", () => {
  it("costs the cumulative table across the whole range", () => {
    const table = [0, 1, 2, 3, 4, 5, 7, 9];
    for (let score = 8; score <= 15; score++) {
      expect(rules.cost(8, score)).toBe(table[score - 8]);
    }
    expect(rules.cost(13, 14)).toBe(2);
    expect(rules.cost(15, 14)).toBe(-2);
    expect(pointsSpentOn(rules, [15, 15, 15, 8, 8, 8])).toBe(27);
  });

  it("goes straight to the next value on a plain step", () => {
    expect(stepScore(rules, at(10), 1, null)).toEqual({ peek: null, commit: 11 });
    expect(stepScore(rules, at(10), -1, null)).toEqual({ peek: null, commit: 9 });
  });

  it("peeks each step's cost without committing, then commits on a second peek", () => {
    for (let score = 8; score < 15; score++) {
      const peek = stepScore(rules, at(score), 1, null, "peek");
      expect(peek.commit).toBeUndefined();
      expect(peek.peek?.label).toBe(`+${rules.cost(score, score + 1)}`);
      expect(stepScore(rules, at(score), 1, peek.peek, "peek")).toEqual({ peek: null, commit: score + 1 });
      // A plain step on a peek commits it too.
      expect(stepScore(rules, at(score), 1, peek.peek)).toEqual({ peek: null, commit: score + 1 });
    }
    expect(stepScore(rules, at(14), -1, null, "peek").peek?.label).toBe("−2");
    expect(stepScore(rules, at(10), -1, null, "peek").peek?.label).toBe("−1");
  });

  it("drops a peek when the step goes the other way", () => {
    const peek = stepScore(rules, at(10), 1, null, "peek").peek;
    expect(stepScore(rules, at(10), -1, peek)).toEqual({ peek: null });
    expect(stepScore(rules, at(10), -1, peek, "peek")).toEqual({ peek: null });
  });

  it("stops at 15 and 8 and cannot confirm either", () => {
    const max = stepScore(rules, at(15), 1, null);
    expect(max.peek).toMatchObject({ label: "MAX", available: false });
    expect(stepScore(rules, at(15), 1, max.peek).commit).toBeUndefined();
    const min = stepScore(rules, at(8), -1, null);
    expect(min.peek).toMatchObject({ label: "MIN", available: false });
    expect(stepScore(rules, at(8), -1, min.peek).commit).toBeUndefined();
  });

  it("reads MAX when the step would exceed the budget, and will not confirm it", () => {
    // 26 spent: a 1-point step fits, a 2-point step does not.
    expect(stepScore(rules, at(10, 26), 1, null, "peek").peek?.label).toBe("+1");
    const over = stepScore(rules, at(13, 26), 1, null);
    expect(over.peek).toMatchObject({ label: "MAX", available: false });
    expect(stepScore(rules, at(13, 26), 1, over.peek).commit).toBeUndefined();
    // Lowering is always allowed.
    expect(stepScore(rules, at(13, 30), -1, null, "peek").peek?.label).toBe("−1");
  });

  it("an unavailable peek persists, whatever is pressed the same way", () => {
    const peek: Peek = { direction: 1, label: "MAX", available: false };
    expect(stepScore(rules, at(15), 1, peek).peek).toMatchObject({ label: "MAX" });
  });
});

describe("other methods", () => {
  it("step freely, committing at once, even when asked to peek", () => {
    expect(stepScore(rulesFor("manual"), at(10), 1, null, "peek")).toEqual({ peek: null, commit: 11 });
    expect(stepScore(rulesFor("manual"), at(10), 1, null)).toEqual({ peek: null, commit: 11 });
    expect(stepScore(rulesFor("manual"), at(30), 1, null).commit).toBeUndefined();
  });
});

describe("wheel stepper", () => {
  it("accumulates small deltas, steps once, then cools down", () => {
    const wheel = createWheelStepper(60, 200);
    expect(wheel(-20, 0)).toBe(0);
    expect(wheel(-20, 10)).toBe(0);
    expect(wheel(-30, 20)).toBe(1);
    expect(wheel(-100, 100)).toBe(0); // cooling down
    expect(wheel(100, 300)).toBe(-1);
  });

  it("forgets a push the other way", () => {
    const wheel = createWheelStepper(60, 0);
    expect(wheel(-50, 0)).toBe(0);
    expect(wheel(50, 1)).toBe(0);
    expect(wheel(20, 2)).toBe(-1);
  });
});

describe("bonus sources", () => {
  it("names what added to a score", () => {
    const row = (sourceName: string, value: number, applied = true) =>
      ({ source: sourceName, sourceName, op: "add", value, applied }) as const;
    const sources = bonusSources([
      { source: "base", sourceName: "Base", op: "base", value: 15, applied: true },
      row("Elf", 2),
      row("Soldier", -1),
      row("Lost", 3, false),
    ]);
    expect(bonusText(sources)).toBe("+2 from Elf, −1 from Soldier");
  });
});

describe("hold gesture", () => {
  it("taps on release, holds after the delay, and never both", () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const gesture = createHoldGesture<number>(
      (v) => events.push(`tap${v}`),
      (v) => events.push(`hold${v}`),
      (v) => events.push(`end${v}`),
      300,
    );
    gesture.press("a", 1);
    vi.advanceTimersByTime(100);
    gesture.release("a", 1);
    gesture.press("a", 1);
    vi.advanceTimersByTime(400);
    gesture.release("a", 1);
    gesture.press("b", 2);
    gesture.cancel();
    vi.advanceTimersByTime(400);
    gesture.press("c", 3);
    vi.advanceTimersByTime(400);
    gesture.cancel();
    expect(events).toEqual(["tap1", "hold1", "end1", "hold3", "end3"]);
    vi.useRealTimers();
  });
});
