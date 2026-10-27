/**
 * Folding the live-state event log.
 *
 * `state.5e` stores inputs, not totals: damage taken rather than current HP, so a
 * level-up or a CON change keeps current HP correct. Folding replays the events
 * after the latest checkpoint to produce the current state.
 *
 * Rest rules come in from the resolver (`FoldRules`) rather than being hardcoded
 * here, because which pools recharge when is content, not plumbing.
 */

import type { Checkpoint, Recharge, StateEvent, StateFile } from "../types";

/** A spendable pool, addressed by its canonical key. */
export interface PoolRule {
  key: string;
  max: number;
  recharge: Recharge;
  /** How much a recharge restores. Defaults to everything. */
  rechargeAmount?: number;
}

export interface HitDiceRule {
  die: string;
  max: number;
}

export interface FoldRules {
  pools: PoolRule[];
  hitDice: HitDiceRule[];
  /** Used to clamp damage so it can't run away below -maxHp. */
  maxHp: number;
}

export const EMPTY_RULES: FoldRules = { pools: [], hitDice: [], maxHp: 0 };

/** The folded result. Same shape as a checkpoint, so a checkpoint is just a fold. */
export type LiveState = Required<
  Pick<
    Checkpoint,
    | "damage"
    | "tempHp"
    | "tempMaxHp"
    | "effects"
    | "conditions"
    | "exhaustion"
    | "deathSaves"
    | "inspiration"
  >
> & {
  spent: { slots: Record<string, number>; hitDice: Record<string, number>; resources: Record<string, number> };
  concentration: { on: string; since?: string } | null;
  /** Timestamp of the last folded event, for display. */
  lastEvent?: string;
};

export function emptyCheckpoint(): Checkpoint {
  return {
    damage: 0,
    tempHp: 0,
    tempMaxHp: [],
    spent: { slots: {}, hitDice: {}, resources: {} },
    effects: [],
    conditions: [],
    exhaustion: 0,
    deathSaves: { successes: 0, failures: 0 },
    concentration: null,
    inspiration: false,
  };
}

export function emptyState(): StateFile {
  return { kind: "state", schemaVersion: 1, checkpoint: emptyCheckpoint(), events: [] };
}

/** Pool keys: "slots.3", "pact", "hitDice.d10", or a resource key. */
export type PoolBucket = "slots" | "hitDice" | "resources";

export function bucketOf(target: string): { bucket: PoolBucket; key: string } {
  if (target.startsWith("slots.")) return { bucket: "slots", key: target.slice("slots.".length) };
  if (target.startsWith("hitDice.")) return { bucket: "hitDice", key: target.slice("hitDice.".length) };
  if (target.startsWith("resources.")) return { bucket: "resources", key: target.slice("resources.".length) };
  if (target === "pact") return { bucket: "slots", key: "pact" };
  return { bucket: "resources", key: target };
}

/** Canonical form, so "srd:paladin:lay-on-hands" and "resources.srd:..." are one key. */
export function canonicalPoolKey(target: string): string {
  const { bucket, key } = bucketOf(target);
  return bucket === "resources" ? `resources.${key}` : `${bucket}.${key}`;
}

function cloneLive(cp: Checkpoint): LiveState {
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

function spendInto(live: LiveState, target: string, amount: number, rules: FoldRules): void {
  const { bucket, key } = bucketOf(target);
  const map = live.spent[bucket];
  const next = (map[key] ?? 0) + amount;
  const cap = poolCap(bucket, key, rules);
  map[key] = clamp(next, 0, cap);
  if (map[key] === 0) delete map[key];
}

function poolCap(bucket: PoolBucket, key: string, rules: FoldRules): number {
  if (bucket === "hitDice") return rules.hitDice.find((h) => h.die === key)?.max ?? Infinity;
  const canonical = bucket === "resources" ? `resources.${key}` : `${bucket}.${key}`;
  return rules.pools.find((p) => p.key === canonical)?.max ?? Infinity;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Pools that come back on this kind of rest. Dawn and dusk ride along with a long rest. */
function rechargesOn(recharge: Recharge, rest: "short" | "long"): boolean {
  if (rest === "short") return recharge === "short-rest";
  return recharge === "short-rest" || recharge === "long-rest" || recharge === "dawn" || recharge === "dusk";
}

function applyRest(live: LiveState, rest: "short" | "long", rules: FoldRules): void {
  for (const pool of rules.pools) {
    if (!rechargesOn(pool.recharge, rest)) continue;
    const { bucket, key } = bucketOf(pool.key);
    const map = live.spent[bucket];
    const spent = map[key] ?? 0;
    if (!spent) continue;
    const restored = pool.rechargeAmount ?? pool.max;
    const next = Math.max(0, spent - restored);
    if (next) map[key] = next;
    else delete map[key];
  }

  if (rest === "long") {
    live.damage = 0;
    live.tempHp = 0;
    live.exhaustion = Math.max(0, live.exhaustion - 1);
    live.deathSaves = { successes: 0, failures: 0 };
    regainHitDice(live, rules);
  }
}

/**
 * A long rest regains half your total hit dice, minimum one. Which dice is the
 * player's call; the default spends the restoration on the largest dice first,
 * and an explicit `regain hitDice.dX` event overrides it.
 */
function regainHitDice(live: LiveState, rules: FoldRules): void {
  const total = rules.hitDice.reduce((n, h) => n + h.max, 0);
  if (!total) return;
  let budget = Math.max(1, Math.floor(total / 2));
  const bySize = [...rules.hitDice].sort((a, b) => dieSize(b.die) - dieSize(a.die));
  for (const pool of bySize) {
    if (budget <= 0) break;
    const spent = live.spent.hitDice[pool.die] ?? 0;
    if (!spent) continue;
    const give = Math.min(spent, budget);
    budget -= give;
    const next = spent - give;
    if (next) live.spent.hitDice[pool.die] = next;
    else delete live.spent.hitDice[pool.die];
  }
}

function dieSize(die: string): number {
  return Number(die.replace(/^d/i, "")) || 0;
}

/** Replays the events after the checkpoint. Pure: never mutates its inputs. */
export function foldState(state: StateFile | undefined, rules: FoldRules = EMPTY_RULES): LiveState {
  const live = cloneLive(state?.checkpoint ?? emptyCheckpoint());
  for (const ev of state?.events ?? []) {
    applyEvent(live, ev, rules);
    live.lastEvent = ev.t;
  }
  return live;
}

export function applyEvent(live: LiveState, ev: StateEvent, rules: FoldRules): void {
  switch (ev.type) {
    case "damage": {
      // Temp HP soaks damage first, which is why the log stores the hit, not the result.
      let remaining = Math.max(0, ev.amount);
      const soaked = Math.min(live.tempHp, remaining);
      live.tempHp -= soaked;
      remaining -= soaked;
      // Damage past 0 HP is capped at max HP again, the instant-death threshold.
      const cap = rules.maxHp ? rules.maxHp * 2 : Infinity;
      live.damage = clamp(live.damage + remaining, 0, cap);
      break;
    }
    case "heal": {
      const before = live.damage;
      live.damage = Math.max(0, live.damage - Math.max(0, ev.amount));
      // Any healing from 0 HP stops the dying clock.
      if (before >= (rules.maxHp || Infinity) && live.damage < before)
        live.deathSaves = { successes: 0, failures: 0 };
      break;
    }
    case "temp-hp":
      // A new grant replaces the old pool rather than stacking.
      live.tempHp = Math.max(0, ev.amount);
      break;
    case "temp-max-hp.add":
      live.tempMaxHp = [...live.tempMaxHp.filter((e) => e.id !== ev.effect.id), { ...ev.effect }];
      break;
    case "temp-max-hp.remove":
      live.tempMaxHp = live.tempMaxHp.filter((e) => e.id !== ev.id);
      break;
    case "spend":
      spendInto(live, ev.target, Math.max(0, ev.amount), rules);
      break;
    case "regain":
      spendInto(live, ev.target, -Math.max(0, ev.amount), rules);
      break;
    case "effect.start":
      if (!live.effects.some((e) => e.effect === ev.effect))
        live.effects.push({ effect: ev.effect, since: ev.t, source: ev.source });
      break;
    case "effect.end":
      live.effects = live.effects.filter((e) => e.effect !== ev.effect);
      break;
    case "condition.add":
      if (!live.conditions.includes(ev.condition)) live.conditions.push(ev.condition);
      break;
    case "condition.remove":
      live.conditions = live.conditions.filter((c) => c !== ev.condition);
      break;
    case "exhaustion":
      live.exhaustion = clamp(ev.level, 0, 6);
      break;
    case "death-save":
      if (ev.result === "reset") live.deathSaves = { successes: 0, failures: 0 };
      else if (ev.result === "success")
        live.deathSaves = { ...live.deathSaves, successes: clamp(live.deathSaves.successes + 1, 0, 3) };
      else live.deathSaves = { ...live.deathSaves, failures: clamp(live.deathSaves.failures + 1, 0, 3) };
      break;
    case "concentration.start":
      live.concentration = { on: ev.on, since: ev.t };
      break;
    case "concentration.end":
      live.concentration = null;
      break;
    case "inspiration":
      live.inspiration = ev.value;
      break;
    case "rest.short":
      applyRest(live, "short", rules);
      break;
    case "rest.long":
      applyRest(live, "long", rules);
      break;
    default: {
      // An unrecognised event is kept in the log and ignored here, so a file written
      // by a newer version still folds.
      break;
    }
  }
}

/** Appends an event, returning a new state file. Writes are atomic at the file layer. */
export function appendEvent(state: StateFile | undefined, event: StateEvent): StateFile {
  const base = state ?? emptyState();
  return { ...base, events: [...base.events, event] };
}

/** Drops the most recent event. Cheap undo, which is the point of the log. */
export function undoLast(state: StateFile): { state: StateFile; undone?: StateEvent } {
  if (!state.events.length) return { state };
  const undone = state.events[state.events.length - 1];
  return { state: { ...state, events: state.events.slice(0, -1) }, undone };
}

/**
 * Folds the log into a fresh checkpoint and archives the events it replaced.
 * Taken at every rest, short or long: the archive doubles as a session recap.
 */
export function takeCheckpoint(state: StateFile, rules: FoldRules, at = new Date().toISOString()): StateFile {
  const live = foldState(state, rules);
  const checkpoint: Checkpoint = {
    damage: live.damage,
    tempHp: live.tempHp,
    tempMaxHp: live.tempMaxHp,
    spent: live.spent,
    effects: live.effects,
    conditions: live.conditions,
    exhaustion: live.exhaustion,
    deathSaves: live.deathSaves,
    concentration: live.concentration,
    inspiration: live.inspiration,
    t: at,
  };
  const archive = [...(state.archive ?? [])];
  if (state.events.length) archive.push({ until: at, events: state.events });
  return { ...state, checkpoint, events: [], archive };
}

/** Current HP from a folded state and a resolved max. */
export function currentHp(live: Pick<LiveState, "damage">, maxHp: number): number {
  return Math.max(0, maxHp - live.damage);
}

export function tempMaxHpTotal(live: Pick<LiveState, "tempMaxHp">): number {
  return live.tempMaxHp.reduce((n, e) => n + (e.amount ?? 0), 0);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Builds an event with a timestamp, so callers never forget one. */
export function event<T extends StateEvent["type"]>(
  type: T,
  payload: Omit<Extract<StateEvent, { type: T }>, "t" | "type">,
): StateEvent {
  return { t: nowIso(), type, ...payload } as StateEvent;
}

/** Formats a pool target for display: "slots.1" reads as "a level 1 spell slot". */
export function describePool(target: string, nameOf?: (id: string) => string): string {
  const { bucket, key } = bucketOf(target);
  if (bucket === "slots") return key === "pact" ? "pact slot" : `level ${key} spell slot`;
  if (bucket === "hitDice") return `${key} hit die`;
  return nameOf?.(key) ?? key;
}

/**
 * A human-readable line for the event log. `nameOf` turns element ids into names;
 * without it the log still reads, just with ids.
 */
export function describeEvent(ev: StateEvent, nameOf?: (id: string) => string): string {
  switch (ev.type) {
    case "damage":
      return `Took ${ev.amount} damage`;
    case "heal":
      return `Healed ${ev.amount}`;
    case "temp-hp":
      return ev.amount ? `Gained ${ev.amount} temp HP` : "Cleared temp HP";
    case "temp-max-hp.add":
      return `Max HP ${ev.effect.amount >= 0 ? "+" : ""}${ev.effect.amount} (${ev.effect.source ?? ev.effect.id})`;
    case "temp-max-hp.remove":
      return `Max HP effect ended (${ev.id})`;
    case "spend":
      return `Spent ${ev.amount} ${describePool(ev.target, nameOf)}`;
    case "regain":
      return `Regained ${ev.amount} ${describePool(ev.target, nameOf)}`;
    case "effect.start":
      return `${nameOf?.(ev.effect) ?? ev.effect} started`;
    case "effect.end":
      return `${nameOf?.(ev.effect) ?? ev.effect} ended`;
    case "condition.add":
      return `Gained ${ev.condition}`;
    case "condition.remove":
      return `Lost ${ev.condition}`;
    case "exhaustion":
      return `Exhaustion ${ev.level}`;
    case "death-save":
      return ev.result === "reset" ? "Death saves reset" : `Death save ${ev.result}`;
    case "concentration.start":
      return `Concentrating on ${nameOf?.(ev.on) ?? ev.on}`;
    case "concentration.end":
      return "Concentration ended";
    case "inspiration":
      return ev.value ? "Gained inspiration" : "Used inspiration";
    case "rest.short":
      return "Short rest";
    case "rest.long":
      return "Long rest";
    default:
      return (ev as StateEvent).type;
  }
}
