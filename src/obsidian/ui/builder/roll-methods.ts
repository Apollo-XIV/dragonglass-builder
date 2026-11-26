/**
 * How a pool's values are rolled. A method supplies rules, never UI: the range a value can
 * take and a roll that lands in it. Typing a value reads the range too, so a method with a
 * different range changes which digits are accepted without anything else changing.
 */

export interface ValueRange {
  min: number;
  max: number;
}

export interface RollMethod extends ValueRange {
  id: string;
  label: string;
  /** One line for the method's help panel. */
  rules: string;
  roll: (random?: () => number) => number;
}

function die(sides: number, random: () => number): number {
  return 1 + Math.floor(random() * sides);
}

function dice(count: number, sides: number, random: () => number): number[] {
  return Array.from({ length: count }, () => die(sides, random));
}

const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);

export const ROLL_METHODS: readonly RollMethod[] = [
  {
    id: "4d6-drop-lowest",
    label: "4d6, drop the lowest",
    rules: "Roll four six-sided dice, drop the lowest die and add the other three.",
    min: 3,
    max: 18,
    roll: (random = Math.random) => {
      const rolled = dice(4, 6, random).sort((a, b) => a - b);
      return sum(rolled.slice(1));
    },
  },
  {
    id: "3d6",
    label: "3d6",
    rules: "Roll three six-sided dice and add them.",
    min: 3,
    max: 18,
    roll: (random = Math.random) => sum(dice(3, 6, random)),
  },
  {
    id: "2d6+6",
    label: "2d6 + 6",
    rules: "Roll two six-sided dice and add 6.",
    min: 8,
    max: 18,
    roll: (random = Math.random) => sum(dice(2, 6, random)) + 6,
  },
];

export const DEFAULT_ROLL_METHOD = "4d6-drop-lowest";

/** A method by id; an id this version doesn't know rolls as the default. */
export function rollMethod(id: string | undefined): RollMethod {
  return ROLL_METHODS.find((m) => m.id === id) ?? ROLL_METHODS.find((m) => m.id === DEFAULT_ROLL_METHOD)!;
}

/** The values a range holds, as typed: no leading zeros. */
function* written(range: ValueRange): Generator<string> {
  for (let n = Math.max(0, range.min); n <= range.max; n++) yield String(n);
}

/** Some value in range could still be typed starting with these digits. */
export function canStart(range: ValueRange, prefix: string): boolean {
  if (!/^\d+$/.test(prefix)) return false;
  for (const s of written(range)) if (s.startsWith(prefix)) return true;
  return false;
}

/** The digits are a value in range, and no longer value in range starts with them. */
export function isFinished(range: ValueRange, prefix: string): boolean {
  if (!inRange(range, prefix)) return false;
  for (const s of written(range)) if (s.length > prefix.length && s.startsWith(prefix)) return false;
  return true;
}

function inRange(range: ValueRange, text: string): boolean {
  if (!/^(0|[1-9]\d*)$/.test(text)) return false;
  const n = Number(text);
  return n >= range.min && n <= range.max;
}

export interface Typed {
  /** Values finished, in order: each fills a slot and moves on to the next. */
  commits: number[];
  /** What is still being typed, for the slot after the last commit. */
  draft: string;
}

const SEPARATOR = /[\s,;]/;

/**
 * Typing `text` after `draft`, a character at a time. A digit no value could start with is
 * dropped; a value that can't be extended is finished at once. A space or a comma finishes
 * what has been typed if it is a value, so a pasted list fills slot after slot.
 */
export function typeInto(range: ValueRange, draft: string, text: string): Typed {
  const commits: number[] = [];
  let current = draft;
  for (const ch of text) {
    if (/\d/.test(ch)) {
      const next = current + ch;
      if (!canStart(range, next)) continue;
      current = next;
      if (isFinished(range, current)) {
        commits.push(Number(current));
        current = "";
      }
    } else if (SEPARATOR.test(ch) && inRange(range, current)) {
      commits.push(Number(current));
      current = "";
    }
  }
  return { commits, draft: current };
}

/** A draft left in a slot when it loses focus: kept if it is a value, dropped otherwise. */
export function finishDraft(range: ValueRange, draft: string): number | undefined {
  return inRange(range, draft) ? Number(draft) : undefined;
}
