/**
 * The HP register: the event log read as a till roll.
 *
 * Each row is one commit — a running balance on the left, the deltas it applied
 * on the right — which is why a chained entry like `-9 +t5` has to arrive as one
 * row carrying two deltas. Commits share a timestamp, so consecutive events with
 * the same `t` are one row.
 *
 * Only what moves the hit points earns a row: spending a spell slot belongs in
 * the Log tab, not here. Rests and death saves do appear, because both are part
 * of the same story the register tells.
 */

import type { StateEvent, StateFile } from "../types";
import { applyEvent, emptyCheckpoint, type FoldRules, type LiveState } from "./fold";
import type { HpDelta } from "./hp-calc";

export interface RegisterRow {
  /** Timestamp of the commit. */
  t: string;
  /** Running balance after this row. */
  current: number;
  temp: number;
  tempMax: number;
  /** Effective max at this point, so a row knows the ceiling it was under. */
  max: number;
  deltas: HpDelta[];
  /** For rows that aren't arithmetic: "Short rest", "Death save failed". */
  label?: string;
}

const HP_EVENTS = new Set<StateEvent["type"]>([
  "damage",
  "heal",
  "hp.set",
  "temp-hp",
  "temp-max-hp.add",
  "temp-max-hp.remove",
  "death-save",
  "rest.short",
  "rest.long",
]);

function label(events: StateEvent[]): string | undefined {
  for (const ev of events) {
    if (ev.type === "rest.short") return "Short rest";
    if (ev.type === "rest.long") return "Long rest";
    if (ev.type === "death-save")
      return ev.result === "reset" ? "Death saves reset" : `Death save ${ev.result === "success" ? "passed" : "failed"}`;
  }
  return undefined;
}

/**
 * Replays the log into rows, oldest first. `baseMax` is the resolved maximum
 * before any temporary change, the same number `hp.max.value` reports.
 */
export function hpRegister(state: StateFile | undefined, rules: FoldRules, baseMax: number): RegisterRow[] {
  const live = cloneForReplay(state);
  const rows: RegisterRow[] = [];
  let previous = balance(live, baseMax);

  for (const group of groupByCommit(state?.events ?? [])) {
    for (const ev of group) applyEvent(live, ev, rules);
    if (!group.some((ev) => HP_EVENTS.has(ev.type))) continue;

    const now = balance(live, baseMax);
    const deltas: HpDelta[] = [];
    // Temp HP first, because a hit that soaks through it reads "-t4 -3".
    if (now.temp !== previous.temp) deltas.push({ role: "temp", amount: now.temp - previous.temp });
    if (now.current !== previous.current)
      deltas.push({
        role: group.some((ev) => ev.type === "hp.set")
          ? "set"
          : now.current > previous.current
            ? "heal"
            : "damage",
        amount: now.current - previous.current,
      });
    if (now.tempMax !== previous.tempMax) deltas.push({ role: "tempMax", amount: now.tempMax - previous.tempMax });

    const text = label(group);
    if (deltas.length || text) rows.push({ t: group[group.length - 1].t, ...now, deltas, label: text });
    previous = now;
  }

  return rows;
}

function groupByCommit(events: StateEvent[]): StateEvent[][] {
  const groups: StateEvent[][] = [];
  for (const ev of events) {
    const last = groups[groups.length - 1];
    if (last && last[0].t === ev.t) last.push(ev);
    else groups.push([ev]);
  }
  return groups;
}

function balance(live: LiveState, baseMax: number): { current: number; temp: number; tempMax: number; max: number } {
  const tempMax = live.tempMaxHp.reduce((n, e) => n + e.amount, 0);
  const max = Math.max(0, baseMax + tempMax);
  return { current: Math.max(0, max - live.damage), temp: live.tempHp, tempMax, max };
}

function cloneForReplay(state: StateFile | undefined): LiveState {
  const cp = state?.checkpoint ?? emptyCheckpoint();
  return {
    damage: cp.damage ?? 0,
    tempHp: cp.tempHp ?? 0,
    tempMaxHp: (cp.tempMaxHp ?? []).map((e) => ({ ...e })),
    spent: {
      slots: { ...(cp.spent?.slots ?? {}) },
      hitDice: { ...(cp.spent?.hitDice ?? {}) },
      resources: { ...(cp.spent?.resources ?? {}) },
    },
    effects: (cp.effects ?? []).map((e) => ({ ...e })),
    conditions: [...(cp.conditions ?? [])],
    exhaustion: cp.exhaustion ?? 0,
    deathSaves: { ...(cp.deathSaves ?? { successes: 0, failures: 0 }) },
    concentration: cp.concentration ? { ...cp.concentration } : null,
    inspiration: cp.inspiration ?? false,
  };
}
