/**
 * The hit point calculator's syntax (desktop spec, "Calc syntax").
 *
 * One line of text becomes a list of tokens, and a list of tokens becomes both a
 * preview of the resulting numbers and the events that get it there. It lives in
 * core because it is arithmetic over the live state, not a presentation decision:
 * the colouring, the dimmed readout and the vial's ghosts are all read off what
 * this returns.
 *
 * Nothing here writes. `applyHpCalc` is pure, so the same call answers both "what
 * would this do" while typing and "do it" on Enter.
 */

import type { StateEvent, TempMaxHpEffect } from "../types";
import { nowIso } from "./fold";

/** What a token is about, which is also what colour it takes. */
export type HpRole = "damage" | "heal" | "set" | "temp" | "tempMax";

export interface HpToken {
  /** The source text, so the input can colour exactly what was typed. */
  text: string;
  role: HpRole;
  op: "+" | "-" | "=";
  /** Always positive; `op` carries the direction. */
  amount: number;
  /** Where in the input the token starts, for per-token colouring. */
  at: number;
}

export interface HpParse {
  tokens: HpToken[];
  /** A short hint, shown inline. Set means nothing commits. */
  error?: string;
}

/**
 * `=` or a bare number sets, `t` is temp HP, `m` is temp max HP, and a bare sign
 * is one point. Everything else is a mistake worth saying out loud.
 */
const TOKEN = /([+\-=]?)([tm]?)(\d*)/giy;

export function parseHpCalc(input: string): HpParse {
  const tokens: HpToken[] = [];
  let i = 0;
  const text = input.trim();
  if (!text) return { tokens: [] };

  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i += 1;
      continue;
    }
    TOKEN.lastIndex = i;
    const match = TOKEN.exec(text);
    if (!match || match[0] === "") return { tokens, error: `"${text[i]}" isn't part of an HP entry` };
    const [whole, sign, letter, digits] = match;
    const lower = letter.toLowerCase();

    if (!sign && !digits) return { tokens, error: `"${whole}" needs a number` };
    if (lower && !digits) return { tokens, error: `"${whole}" needs a number` };
    if (sign === "=" && !digits) return { tokens, error: '"=" needs a number' };

    const amount = digits ? Number(digits) : 1;
    const role: HpRole =
      lower === "t"
        ? "temp"
        : lower === "m"
          ? "tempMax"
          : // A bare number and "=35" mean the same thing: assert the current total.
            !sign || sign === "="
            ? "set"
            : sign === "+"
              ? "heal"
              : "damage";
    const op = role === "set" ? "=" : (sign as "+" | "-" | "=") || "=";
    tokens.push({ text: whole, role, op, amount, at: i });
    i += whole.length;
  }

  return { tokens };
}

/** Everything the calculator needs to know about where the character stands. */
export interface HpSnapshot {
  /** `hp.max.value`: the resolved maximum, before any temporary change to it. */
  baseMax: number;
  damage: number;
  temp: number;
  /** The temp max HP effects currently in force, so `=m` can clear them. */
  tempMaxEffects: { id: string; amount: number }[];
}

/** One line of the register: what moved, and by how much. */
export interface HpDelta {
  role: HpRole;
  /** Signed: -7 for damage, +3 for healing. */
  amount: number;
}

export interface HpOutcome {
  /** The state the entry would leave behind. */
  damage: number;
  temp: number;
  tempMax: number;
  current: number;
  effectiveMax: number;
  deltas: HpDelta[];
  events: StateEvent[];
}

export function snapshotOf(snapshot: HpSnapshot): { current: number; effectiveMax: number; tempMax: number } {
  const tempMax = snapshot.tempMaxEffects.reduce((n, e) => n + e.amount, 0);
  const effectiveMax = Math.max(0, snapshot.baseMax + tempMax);
  return { current: Math.max(0, effectiveMax - snapshot.damage), effectiveMax, tempMax };
}

/**
 * Applies a parsed entry. The whole chain commits as one timestamp, which is what
 * makes `-9 +t5` a single register row carrying both deltas.
 */
export function applyHpCalc(tokens: HpToken[], snapshot: HpSnapshot, at = nowIso()): HpOutcome {
  let damage = snapshot.damage;
  let temp = snapshot.temp;
  let effects = snapshot.tempMaxEffects.map((e) => ({ ...e }));
  const deltas: HpDelta[] = [];
  const events: StateEvent[] = [];
  let serial = 0;

  const totals = (): { tempMax: number; effectiveMax: number; current: number } => {
    const tempMax = effects.reduce((n, e) => n + e.amount, 0);
    const effectiveMax = Math.max(0, snapshot.baseMax + tempMax);
    return { tempMax, effectiveMax, current: Math.max(0, effectiveMax - damage) };
  };

  for (const token of tokens) {
    switch (token.role) {
      case "damage": {
        // Temp HP absorbs first, which is why the log keeps the hit rather than
        // the result, and why the row reads as a split.
        const soaked = Math.min(temp, token.amount);
        const through = token.amount - soaked;
        temp -= soaked;
        damage = Math.min(damage + through, snapshot.baseMax * 2 || Infinity);
        if (soaked) deltas.push({ role: "temp", amount: -soaked });
        if (through) deltas.push({ role: "damage", amount: -through });
        events.push({ t: at, type: "damage", amount: token.amount });
        break;
      }
      case "heal": {
        // Healing always starts from 0, never from however far damage ran past
        // the effective max while tracking the massive-damage instant-death rule.
        const { effectiveMax, current } = totals();
        const target = Math.min(current + token.amount, effectiveMax);
        const healed = target - current;
        damage = effectiveMax - target;
        deltas.push({ role: "heal", amount: healed });
        events.push({ t: at, type: "heal", amount: token.amount });
        break;
      }
      case "set": {
        const { effectiveMax, current } = totals();
        const target = Math.min(token.amount, effectiveMax);
        damage = effectiveMax - target;
        deltas.push({ role: "set", amount: target - current });
        events.push({ t: at, type: "hp.set", damage, note: String(target) });
        break;
      }
      case "temp": {
        const next = Math.max(0, token.op === "=" ? token.amount : token.op === "+" ? temp + token.amount : temp - token.amount);
        deltas.push({ role: "temp", amount: next - temp });
        temp = next;
        events.push({ t: at, type: "temp-hp", amount: next });
        break;
      }
      case "tempMax": {
        const before = effects.reduce((n, e) => n + e.amount, 0);
        if (token.op === "=") {
          for (const effect of effects) events.push({ t: at, type: "temp-max-hp.remove", id: effect.id });
          effects = [];
        }
        const amount = token.op === "-" ? -token.amount : token.op === "+" ? token.amount : token.amount;
        if (amount !== 0) {
          const effect: TempMaxHpEffect = { id: `manual:${at}:${serial++}`, amount, source: "Entered by hand" };
          effects.push(effect);
          events.push({ t: at, type: "temp-max-hp.add", effect });
        }
        const after = effects.reduce((n, e) => n + e.amount, 0);
        deltas.push({ role: "tempMax", amount: after - before });
        // Lowering the ceiling can leave current HP above it; the resolver caps
        // current at the effective max, so the damage counter follows it down.
        const { effectiveMax } = totals();
        if (damage > effectiveMax) damage = effectiveMax;
        break;
      }
    }
  }

  const { tempMax, effectiveMax, current } = totals();
  return { damage, temp, tempMax, current, effectiveMax, deltas, events };
}

/** "-t4 -3", the way the register prints a row's deltas. */
export function formatDelta(delta: HpDelta): string {
  const sign = delta.amount >= 0 ? "+" : "-";
  const magnitude = Math.abs(delta.amount);
  switch (delta.role) {
    case "temp":
      return `${sign}t${magnitude}`;
    case "tempMax":
      return `${sign}m${magnitude}`;
    case "set":
      return delta.amount === 0 ? "=" : `${sign}${magnitude}`;
    default:
      return `${sign}${magnitude}`;
  }
}
