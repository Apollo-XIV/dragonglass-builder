import { describe, expect, it } from "vitest";
import { applyHpCalc, parseHpCalc } from "../src/core/state/hp-calc";
import {
  CONDITION_RULES,
  concentrationDc,
  EXHAUSTION_LEVELS,
  MAX_EXHAUSTION,
  nextExhaustion,
} from "../src/core/state/conditions";

describe("exhaustion", () => {
  it("adds a level per tap and wraps to none after the last", () => {
    expect([0, 1, 5].map(nextExhaustion)).toEqual([1, 2, 6]);
    expect(nextExhaustion(MAX_EXHAUSTION)).toBe(0);
  });
  it("describes every level", () => {
    expect(EXHAUSTION_LEVELS).toHaveLength(MAX_EXHAUSTION);
  });
});

describe("concentrationDc", () => {
  it("is 10 until half the damage passes it", () => {
    expect([1, 19, 20, 21, 30, 45].map(concentrationDc)).toEqual([10, 10, 10, 10, 15, 22]);
  });
});

describe("condition rules", () => {
  it("covers every condition the menu offers", () => {
    expect(Object.keys(CONDITION_RULES)).toHaveLength(14);
  });
});

describe("damage taken from an HP entry", () => {
  const snapshot = { baseMax: 30, damage: 0, temp: 5, tempMaxEffects: [] };
  const taken = (text: string, snap = snapshot): number => applyHpCalc(parseHpCalc(text).tokens, snap).taken;

  it("counts damage that temp HP soaked", () => expect(taken("-4")).toBe(4));
  it("adds a chain together", () => expect(taken("-4 -6")).toBe(10));
  it("counts setting HP lower, not higher", () => {
    expect(taken("=20")).toBe(10);
    expect(taken("=30")).toBe(0);
  });
  it("ignores healing and temp HP", () => expect(taken("+5 +t3", { ...snapshot, damage: 10 })).toBe(0));
});

describe("2024 exhaustion", () => {
  it("scales by level and ends in death", async () => {
    const { exhaustionLevels2024 } = await import("../src/core/state/conditions");
    const levels = exhaustionLevels2024();
    expect(levels[0]).toBe("D20 Tests −2, speed −5 ft");
    expect(levels[4]).toBe("D20 Tests −10, speed −25 ft");
    expect(levels[5]).toBe("Death");
  });
});
