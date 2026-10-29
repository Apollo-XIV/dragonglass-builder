/**
 * The explain and dice layers. Both are small, and both are read out loud to the
 * player in a bottom sheet, so the wording is part of what's being tested.
 */

import { describe, expect, it } from "vitest";
import { explainParts, explainStat, formulaFor } from "../src/core/resolver/explain";
import { describeRoll, rollNotation } from "../src/core/dice";
import type { NumericStat } from "../src/core/resolver/resolved";

const stat: NumericStat = {
  path: "skills.athletics",
  value: 6,
  base: 3,
  advantage: "none",
  proficiency: "proficient",
  breakdown: [
    { source: "rules", sourceName: "STR modifier", op: "base", value: 3, applied: true },
    { source: "rules", sourceName: "Proficiency bonus", op: "add", value: 3, applied: true },
    { source: "srd:item:chain-mail", sourceName: "Chain Mail", op: "add", value: 2, applied: false, suppressedBy: "Shield" },
  ],
  annotations: [
    {
      when: { text: "against being charmed" },
      op: "advantage",
      source: "srd:species:dwarf",
      sourceName: "Fey Ancestry",
    },
  ],
};

describe("explaining a stat", () => {
  const explanation = explainStat(stat, { label: "Athletics", kind: "d20" });

  it("keeps the resolver's order and signs the additions", () => {
    expect(explanation.rows.map((r) => [r.label, r.value])).toEqual([
      ["STR modifier", "3"],
      ["Proficiency bonus", "+3"],
      ["Chain Mail", "+2"],
    ]);
  });

  it("keeps a suppressed contribution in the list but out of the sum", () => {
    expect(explanation.rows[2].applied).toBe(false);
    expect(explanation.rows[2].suppressedBy).toBe("Shield");
    expect(explanation.formula).toBe("6 = 3 str modifier + 3 proficiency bonus");
  });

  it("separates conditional notes from the arithmetic", () => {
    expect(explanation.notes).toEqual([
      { kind: "advantage", text: "Advantage against being charmed", source: "Fey Ancestry" },
    ]);
  });

  it("offers the d20 notation the roll buttons need", () => {
    expect(explanation.notation).toBe("1d20 +6");
  });
});

describe("explaining a number assembled by hand", () => {
  it("reads like the sourcebook's own arithmetic", () => {
    const dc = explainParts({
      label: "Spell save DC",
      parts: [
        { label: "Base DC", amount: 8 },
        { label: "Proficiency bonus", amount: 2 },
        { label: "Intelligence modifier", amount: 3 },
      ],
    });
    expect(dc.total).toBe(13);
    expect(dc.formula).toBe("13 = 8 base dc + 2 proficiency bonus + 3 intelligence modifier");
  });

  it("falls back to the total when there is nothing to break down", () => {
    expect(formulaFor(7, [])).toBe("7");
  });
});

describe("rolling", () => {
  /** A fixed sequence, so a test can say which faces came up. */
  const sequence = (...rolls: number[]): (() => number) => {
    let i = 0;
    return () => (rolls[i++ % rolls.length] - 1) / 20;
  };

  it("adds the dice and the flat modifier", () => {
    const result = rollNotation("1d20 + 5", sequence(17));
    expect(result.dice).toEqual([{ sides: 20, value: 17 }]);
    expect(result.modifier).toBe(5);
    expect(result.total).toBe(22);
    expect(result.natural).toBe(17);
  });

  it("rolls two d20 under advantage and drops the lower", () => {
    const result = rollNotation("1d20 + 3", sequence(8, 15), { advantage: true });
    expect(result.dice.map((d) => [d.value, Boolean(d.dropped)])).toEqual([
      [8, true],
      [15, false],
    ]);
    expect(result.total).toBe(18);
  });

  it("drops the higher under disadvantage", () => {
    const result = rollNotation("1d20", sequence(8, 15), { disadvantage: true });
    expect(result.total).toBe(8);
  });

  it("doubles the dice on a critical but not the modifier", () => {
    const result = rollNotation("2d6 + 4", () => 0.99, { critical: true });
    expect(result.dice).toHaveLength(4);
    expect(result.total).toBe(4 * 6 + 4);
  });

  it("leaves advantage alone where there is no single d20 to pair", () => {
    const result = rollNotation("2d6 + 2", () => 0.5, { advantage: true });
    expect(result.dice).toHaveLength(2);
  });

  it("describes the dice for the toast, showing a dropped die in brackets", () => {
    const result = rollNotation("1d20 + 5", sequence(3, 19), { advantage: true });
    expect(describeRoll(result)).toBe("(3) 19 + 5");
  });

  it("treats unrollable text as a flat zero rather than throwing", () => {
    expect(rollNotation("special", () => 0.5).total).toBe(0);
  });
});
