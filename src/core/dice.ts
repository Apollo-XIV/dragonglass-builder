/**
 * Rolling dice. The notation arriving here has already had its expressions
 * substituted by the resolver ("2d6 + 3"), so this only has to understand dice.
 *
 * The random source is a parameter so tests can roll known numbers, and so a
 * future shared-dice-server or seeded-replay feature has somewhere to plug in.
 */

export type Rng = () => number;

export interface DieRoll {
  sides: number;
  value: number;
  /** Rolled but not counted: the loser of an advantage pair. */
  dropped?: boolean;
}

export interface RollResult {
  /** The notation as rolled, after any critical doubling. */
  notation: string;
  dice: DieRoll[];
  /** The flat part, summed. */
  modifier: number;
  total: number;
  /** The face of a single d20, for the natural 20 and natural 1 tags. */
  natural?: number;
}

export interface RollOptions {
  advantage?: boolean;
  disadvantage?: boolean;
  /** Doubles the dice, not the modifier. */
  critical?: boolean;
}

const TERM = /([+-]?)\s*(?:(\d*)d(\d+)|(\d+))/gi;

export function defaultRng(): number {
  return Math.random();
}

export function rollDie(sides: number, rng: Rng = defaultRng): number {
  return Math.floor(rng() * sides) + 1;
}

/**
 * Rolls a notation like "1d20 + 5", "2d6+3" or a bare "+4" (treated as a flat
 * bonus with no dice). Unparseable notation yields a zero result rather than
 * throwing: a weapon with odd damage text should still be readable on the sheet.
 */
export function rollNotation(notation: string, rng: Rng = defaultRng, options: RollOptions = {}): RollResult {
  const dice: DieRoll[] = [];
  let modifier = 0;

  for (const match of notation.matchAll(TERM)) {
    const sign = match[1] === "-" ? -1 : 1;
    if (match[3]) {
      const count = (match[2] ? Number(match[2]) : 1) * (options.critical ? 2 : 1);
      const sides = Number(match[3]);
      for (let i = 0; i < count; i++) dice.push({ sides, value: sign * rollDie(sides, rng) });
    } else if (match[4]) modifier += sign * Number(match[4]);
  }

  // Advantage and disadvantage apply to the single d20 of a check, never to
  // damage dice, so the pair is only rolled when there is exactly one d20.
  const d20s = dice.filter((d) => d.sides === 20);
  if ((options.advantage || options.disadvantage) && d20s.length === 1) {
    const first = d20s[0];
    const second: DieRoll = { sides: 20, value: rollDie(20, rng) };
    const keepSecond = options.advantage ? second.value > first.value : second.value < first.value;
    if (keepSecond) first.dropped = true;
    else second.dropped = true;
    dice.splice(dice.indexOf(first) + 1, 0, second);
  }

  const total = dice.reduce((sum, d) => (d.dropped ? sum : sum + d.value), modifier);
  const kept = dice.filter((d) => !d.dropped);
  const naturalDie = kept.length === 1 && kept[0].sides === 20 ? kept[0] : undefined;

  return {
    notation: options.critical ? `${notation} (critical)` : notation,
    dice,
    modifier,
    total,
    natural: naturalDie ? Math.abs(naturalDie.value) : undefined,
  };
}

/** "d20 17 (9 dropped) + 5", for the toast's detail line. */
export function describeRoll(result: RollResult): string {
  const parts = result.dice.map((d) =>
    d.dropped ? `(${Math.abs(d.value)})` : String(Math.abs(d.value)),
  );
  const diceText = parts.length ? `${parts.join(" ")}` : "";
  const mod = result.modifier === 0 ? "" : result.modifier > 0 ? ` + ${result.modifier}` : ` − ${-result.modifier}`;
  return `${diceText}${mod}`.trim();
}
