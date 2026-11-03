/**
 * The HP calculator and the register it writes into. Both are pure, so the
 * colouring, the preview and the commit are all tested here rather than through
 * the panel.
 */

import { describe, expect, it } from "vitest";
import { applyHpCalc, formatDelta, parseHpCalc, snapshotOf, type HpSnapshot } from "../src/core/state/hp-calc";
import { hpRegister } from "../src/core/state/register";
import { foldState, type FoldRules } from "../src/core/state/fold";
import type { StateFile } from "../src/core/types";

const RULES: FoldRules = { pools: [], hitDice: [], maxHp: 42 };

function at(damage = 0, temp = 0, tempMaxEffects: { id: string; amount: number }[] = []): HpSnapshot {
  return { baseMax: 42, damage, temp, tempMaxEffects };
}

describe("parsing an HP entry", () => {
  it("reads damage, healing and a bare sign as one point", () => {
    expect(parseHpCalc("-7").tokens).toMatchObject([{ role: "damage", amount: 7 }]);
    expect(parseHpCalc("+3").tokens).toMatchObject([{ role: "heal", amount: 3 }]);
    expect(parseHpCalc("-").tokens).toMatchObject([{ role: "damage", amount: 1 }]);
    expect(parseHpCalc("+").tokens).toMatchObject([{ role: "heal", amount: 1 }]);
  });

  it("treats a bare number and an = the same way", () => {
    expect(parseHpCalc("35").tokens).toMatchObject([{ role: "set", amount: 35 }]);
    expect(parseHpCalc("=35").tokens).toMatchObject([{ role: "set", amount: 35 }]);
  });

  it("reads t as temp HP and m as temp max HP", () => {
    expect(parseHpCalc("+t4").tokens).toMatchObject([{ role: "temp", op: "+", amount: 4 }]);
    expect(parseHpCalc("=t4").tokens).toMatchObject([{ role: "temp", op: "=", amount: 4 }]);
    expect(parseHpCalc("-m4").tokens).toMatchObject([{ role: "tempMax", op: "-", amount: 4 }]);
  });

  it("chains tokens", () => {
    expect(parseHpCalc("+m5 +5").tokens.map((t) => t.role)).toEqual(["tempMax", "heal"]);
    expect(parseHpCalc("-9 +t5").tokens.map((t) => t.role)).toEqual(["damage", "temp"]);
  });

  it("refuses what it cannot read, and commits nothing", () => {
    expect(parseHpCalc("+t").error).toBeTruthy();
    expect(parseHpCalc("=").error).toBeTruthy();
    expect(parseHpCalc("fish").error).toBeTruthy();
  });
});

describe("applying an HP entry", () => {
  it("takes damage out of temp HP first and logs the split", () => {
    const outcome = applyHpCalc(parseHpCalc("-7").tokens, at(0, 4), "t");
    expect(outcome.deltas).toEqual([
      { role: "temp", amount: -4 },
      { role: "damage", amount: -3 },
    ]);
    expect(outcome.temp).toBe(0);
    expect(outcome.current).toBe(39);
    expect(outcome.deltas.map(formatDelta)).toEqual(["-t4", "-3"]);
  });

  it("caps healing at the effective maximum", () => {
    const outcome = applyHpCalc(parseHpCalc("+100").tokens, at(5), "t");
    expect(outcome.current).toBe(42);
    expect(outcome.deltas).toEqual([{ role: "heal", amount: 5 }]);
  });

  it("heals back up from 0, not from however far damage ran past the max", () => {
    // -99 tracks past the effective max for the massive-damage rule, but
    // healing afterwards must start from 0 HP, the way D&D actually works.
    const hit = applyHpCalc(parseHpCalc("-99").tokens, at(0), "t");
    expect(hit.current).toBe(0);

    const healed = applyHpCalc(parseHpCalc("+30").tokens, at(hit.damage), "t2");
    expect(healed.current).toBe(30);
  });

  it("sets current HP without eating temp HP on the way", () => {
    const outcome = applyHpCalc(parseHpCalc("=35").tokens, at(0, 4), "t");
    expect(outcome.current).toBe(35);
    expect(outcome.temp).toBe(4);
    expect(outcome.events).toMatchObject([{ type: "hp.set", damage: 7 }]);
  });

  it("adds to the temp pool on + and replaces it on =", () => {
    expect(applyHpCalc(parseHpCalc("+t4").tokens, at(0, 3), "t").temp).toBe(7);
    expect(applyHpCalc(parseHpCalc("=t4").tokens, at(0, 3), "t").temp).toBe(4);
    expect(applyHpCalc(parseHpCalc("-t4").tokens, at(0, 3), "t").temp).toBe(0);
  });

  it("moves the ceiling with temp max HP, and caps current HP under it", () => {
    const up = applyHpCalc(parseHpCalc("+m5").tokens, at(0), "t");
    expect(up.tempMax).toBe(5);
    expect(up.effectiveMax).toBe(47);
    // Raising the ceiling raises current with it, the way Aid does: current HP
    // is the effective max less the damage taken, and no damage was taken.
    expect(up.current).toBe(47);

    const down = applyHpCalc(parseHpCalc("-m10").tokens, at(0), "t");
    expect(down.effectiveMax).toBe(32);
    expect(down.current).toBe(32);
  });

  it("commits a chain as one timestamp", () => {
    const outcome = applyHpCalc(parseHpCalc("+m5 +5").tokens, at(8), "one-commit");
    expect(new Set(outcome.events.map((e) => e.t))).toEqual(new Set(["one-commit"]));
    expect(outcome.deltas.map((d) => d.role)).toEqual(["tempMax", "heal"]);
  });

  it("agrees with the fold it writes into", () => {
    const outcome = applyHpCalc(parseHpCalc("-9 +t5").tokens, at(0, 2), "t");
    const state: StateFile = {
      kind: "state",
      schemaVersion: 1,
      checkpoint: { damage: 0, tempHp: 2, tempMaxHp: [], spent: {}, effects: [] },
      events: outcome.events,
    };
    const live = foldState(state, RULES);
    expect(live.damage).toBe(outcome.damage);
    expect(live.tempHp).toBe(outcome.temp);
  });

  it("reports the standing numbers for a snapshot", () => {
    expect(snapshotOf(at(10, 0, [{ id: "a", amount: 5 }]))).toEqual({
      current: 37,
      effectiveMax: 47,
      tempMax: 5,
    });
  });
});

describe("the register", () => {
  const state: StateFile = {
    kind: "state",
    schemaVersion: 1,
    checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] },
    events: [
      { t: "1", type: "damage", amount: 12 },
      { t: "2", type: "heal", amount: 4 },
      { t: "3", type: "temp-hp", amount: 5 },
      // One commit, two deltas: the temp pool soaks the first five.
      { t: "4", type: "damage", amount: 9 },
      // Not an HP event; it belongs in the Log tab.
      { t: "5", type: "spend", target: "slots.1", amount: 1 },
      { t: "6", type: "rest.long" },
    ],
  };

  const rows = hpRegister(state, RULES, 42);

  it("gives one row per commit, with the running balance", () => {
    expect(rows.map((r) => r.current)).toEqual([30, 34, 34, 30, 42]);
  });

  it("carries every delta of a chained commit on one row", () => {
    expect(rows[2].deltas.map(formatDelta)).toEqual(["+t5"]);
    expect(rows[3].deltas.map(formatDelta)).toEqual(["-t5", "-4"]);
  });

  it("leaves out what does not touch the hit points", () => {
    expect(rows).toHaveLength(5);
  });

  it("names a rest rather than printing it as arithmetic", () => {
    expect(rows[4].label).toBe("Long rest");
  });

  it("records death saves", () => {
    const dying: StateFile = {
      ...state,
      events: [
        { t: "1", type: "damage", amount: 99 },
        { t: "2", type: "death-save", result: "failure" },
      ],
    };
    const log = hpRegister(dying, RULES, 42);
    expect(log[log.length - 1].label).toBe("Death save failed");
  });
});
