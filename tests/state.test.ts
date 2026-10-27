import { describe, expect, it } from "vitest";
import {
  appendEvent,
  currentHp,
  emptyState,
  foldState,
  takeCheckpoint,
  tempMaxHpTotal,
  undoLast,
  type FoldRules,
} from "../src/core/state/fold";
import type { StateEvent, StateFile } from "../src/core/types";

const rules: FoldRules = {
  maxHp: 20,
  hitDice: [{ die: "d10", max: 4 }, { die: "d8", max: 2 }],
  pools: [
    { key: "slots.1", max: 4, recharge: "long-rest" },
    { key: "slots.2", max: 2, recharge: "long-rest" },
    { key: "resources.srd:paladin:lay-on-hands", max: 10, recharge: "long-rest" },
    { key: "resources.srd:paladin:channel-divinity", max: 1, recharge: "short-rest" },
  ],
};

let clock = 0;
function ev(type: StateEvent["type"], extra: Record<string, unknown> = {}): StateEvent {
  clock += 1000;
  return { t: new Date(clock).toISOString(), type, ...extra } as StateEvent;
}

function stateWith(...events: StateEvent[]): StateFile {
  return { ...emptyState(), events };
}

describe("folding", () => {
  it("folds an empty state to a clean slate", () => {
    const live = foldState(undefined, rules);
    expect(live.damage).toBe(0);
    expect(live.tempHp).toBe(0);
    expect(currentHp(live, 20)).toBe(20);
  });

  it("accumulates damage and healing as inputs", () => {
    const live = foldState(stateWith(ev("damage", { amount: 7 }), ev("heal", { amount: 3 })), rules);
    expect(live.damage).toBe(4);
    expect(currentHp(live, 20)).toBe(16);
  });

  it("keeps current HP right when max HP changes, because damage is what is stored", () => {
    const live = foldState(stateWith(ev("damage", { amount: 7 })), rules);
    expect(currentHp(live, 20)).toBe(13);
    expect(currentHp(live, 28)).toBe(21);
  });

  it("never heals past full or takes HP below zero", () => {
    const live = foldState(stateWith(ev("heal", { amount: 5 }), ev("damage", { amount: 999 })), rules);
    expect(live.damage).toBe(40);
    expect(currentHp(live, 20)).toBe(0);
  });

  it("soaks damage with temp HP first", () => {
    const live = foldState(stateWith(ev("temp-hp", { amount: 5 }), ev("damage", { amount: 8 })), rules);
    expect(live.tempHp).toBe(0);
    expect(live.damage).toBe(3);
  });

  it("replaces a temp HP pool rather than stacking it", () => {
    const live = foldState(stateWith(ev("temp-hp", { amount: 5 }), ev("temp-hp", { amount: 3 })), rules);
    expect(live.tempHp).toBe(3);
  });

  it("tracks temp max HP as separate effects so expiry subtracts the right amount", () => {
    const live = foldState(
      stateWith(
        ev("temp-max-hp.add", { effect: { id: "aid", amount: 5, source: "Aid" } }),
        ev("temp-max-hp.add", { effect: { id: "false-life", amount: 3 } }),
        ev("temp-max-hp.remove", { id: "aid" }),
      ),
      rules,
    );
    expect(tempMaxHpTotal(live)).toBe(3);
    expect(live.tempMaxHp.map((e) => e.id)).toEqual(["false-life"]);
  });

  it("spends and regains pools, clamped to their max", () => {
    const live = foldState(
      stateWith(
        ev("spend", { target: "slots.1", amount: 1 }),
        ev("spend", { target: "slots.1", amount: 9 }),
        ev("spend", { target: "srd:paladin:lay-on-hands", amount: 5 }),
        ev("regain", { target: "srd:paladin:lay-on-hands", amount: 2 }),
      ),
      rules,
    );
    expect(live.spent.slots["1"]).toBe(4);
    expect(live.spent.resources["srd:paladin:lay-on-hands"]).toBe(3);
  });

  it("accepts bare and prefixed resource targets as one pool", () => {
    const live = foldState(
      stateWith(
        ev("spend", { target: "srd:paladin:lay-on-hands", amount: 2 }),
        ev("spend", { target: "resources.srd:paladin:lay-on-hands", amount: 3 }),
      ),
      rules,
    );
    expect(live.spent.resources["srd:paladin:lay-on-hands"]).toBe(5);
  });

  it("starts and ends effects without duplicates", () => {
    const live = foldState(
      stateWith(
        ev("effect.start", { effect: "raging" }),
        ev("effect.start", { effect: "raging" }),
        ev("effect.start", { effect: "sacred-weapon" }),
        ev("effect.end", { effect: "raging" }),
      ),
      rules,
    );
    expect(live.effects.map((e) => e.effect)).toEqual(["sacred-weapon"]);
  });

  it("tracks conditions, exhaustion, death saves, concentration and inspiration", () => {
    const live = foldState(
      stateWith(
        ev("condition.add", { condition: "prone" }),
        ev("condition.add", { condition: "frightened" }),
        ev("condition.remove", { condition: "prone" }),
        ev("exhaustion", { level: 2 }),
        ev("death-save", { result: "failure" }),
        ev("death-save", { result: "success" }),
        ev("concentration.start", { on: "srd:spell:bless" }),
        ev("inspiration", { value: true }),
      ),
      rules,
    );
    expect(live.conditions).toEqual(["frightened"]);
    expect(live.exhaustion).toBe(2);
    expect(live.deathSaves).toEqual({ successes: 1, failures: 1 });
    expect(live.concentration?.on).toBe("srd:spell:bless");
    expect(live.inspiration).toBe(true);
  });

  it("caps death saves at three", () => {
    const live = foldState(
      stateWith(ev("death-save", { result: "failure" }), ev("death-save", { result: "failure" }), ev("death-save", { result: "failure" }), ev("death-save", { result: "failure" })),
      rules,
    );
    expect(live.deathSaves.failures).toBe(3);
  });
});

describe("rests", () => {
  it("restores only short-rest pools on a short rest", () => {
    const live = foldState(
      stateWith(
        ev("spend", { target: "slots.1", amount: 2 }),
        ev("spend", { target: "srd:paladin:channel-divinity", amount: 1 }),
        ev("rest.short"),
      ),
      rules,
    );
    expect(live.spent.slots["1"]).toBe(2);
    expect(live.spent.resources["srd:paladin:channel-divinity"]).toBeUndefined();
  });

  it("restores everything, clears damage and drops exhaustion on a long rest", () => {
    const live = foldState(
      stateWith(
        ev("damage", { amount: 9 }),
        ev("temp-hp", { amount: 4 }),
        ev("spend", { target: "slots.1", amount: 3 }),
        ev("spend", { target: "srd:paladin:lay-on-hands", amount: 7 }),
        ev("exhaustion", { level: 2 }),
        ev("rest.long"),
      ),
      rules,
    );
    expect(live.damage).toBe(0);
    expect(live.tempHp).toBe(0);
    expect(live.spent.slots["1"]).toBeUndefined();
    expect(live.spent.resources["srd:paladin:lay-on-hands"]).toBeUndefined();
    expect(live.exhaustion).toBe(1);
  });

  it("regains half the hit dice on a long rest, largest first", () => {
    const live = foldState(
      stateWith(
        ev("spend", { target: "hitDice.d10", amount: 4 }),
        ev("spend", { target: "hitDice.d8", amount: 2 }),
        ev("rest.long"),
      ),
      rules,
    );
    // Six hit dice total, so three come back, taken off the d10 pool first.
    expect(live.spent.hitDice["d10"]).toBe(1);
    expect(live.spent.hitDice["d8"]).toBe(2);
  });

  it("restores a partial pool with rechargeAmount", () => {
    const partial: FoldRules = {
      ...rules,
      pools: [{ key: "resources.arcane-recovery", max: 10, recharge: "long-rest", rechargeAmount: 3 }],
    };
    const live = foldState(
      stateWith(ev("spend", { target: "arcane-recovery", amount: 8 }), ev("rest.long")),
      partial,
    );
    expect(live.spent.resources["arcane-recovery"]).toBe(5);
  });
});

describe("the log", () => {
  it("appends and undoes", () => {
    let state = emptyState();
    state = appendEvent(state, ev("damage", { amount: 5 }));
    state = appendEvent(state, ev("damage", { amount: 3 }));
    expect(foldState(state, rules).damage).toBe(8);
    const { state: undone, undone: removed } = undoLast(state);
    expect(removed?.type).toBe("damage");
    expect(foldState(undone, rules).damage).toBe(5);
  });

  it("undoes nothing when the log is empty", () => {
    const { state, undone } = undoLast(emptyState());
    expect(undone).toBeUndefined();
    expect(state.events).toHaveLength(0);
  });

  it("checkpoints into an archive without changing the folded result", () => {
    const state = stateWith(ev("damage", { amount: 6 }), ev("spend", { target: "slots.1", amount: 1 }));
    const before = foldState(state, rules);
    const after = takeCheckpoint(state, rules, "2026-10-27T20:00:00Z");
    expect(after.events).toHaveLength(0);
    expect(after.archive?.[0].events).toHaveLength(2);
    const folded = foldState(after, rules);
    expect(folded.damage).toBe(before.damage);
    expect(folded.spent.slots["1"]).toBe(1);
  });

  it("folds the checkpoint plus later events together", () => {
    const checkpointed = takeCheckpoint(stateWith(ev("damage", { amount: 6 })), rules);
    const withMore = appendEvent(checkpointed, ev("damage", { amount: 2 }));
    expect(foldState(withMore, rules).damage).toBe(8);
  });

  it("ignores an event type it does not know, rather than failing", () => {
    const live = foldState(stateWith(ev("damage", { amount: 2 }), ev("teleport" as never, { to: "moon" })), rules);
    expect(live.damage).toBe(2);
  });

  it("never mutates its input", () => {
    const state = stateWith(ev("damage", { amount: 4 }));
    const copy = JSON.parse(JSON.stringify(state));
    foldState(state, rules);
    takeCheckpoint(state, rules);
    appendEvent(state, ev("heal", { amount: 1 }));
    expect(state).toEqual(copy);
  });
});
