/**
 * "Where does this number come from?" (spec 8.1, 8.2).
 *
 * The resolver already records every contribution to every stat; this turns that
 * record into something a bottom sheet can print — an ordered list of lines, the
 * conditional notes kept apart from the arithmetic, and a one-line formula for
 * the cases where a feature's text says "Save DC 13" and the reader wants to know
 * why 13.
 *
 * It lives in core because it is a reading of the engine's output, not a
 * presentation decision, and because that makes it testable without a view.
 */

import type { Annotation, Contribution, NumericStat, SetStat } from "./resolved";

/** What kind of dice a rollable rolls, which decides the sheet's buttons. */
export type RollKind = "d20" | "damage" | "other" | "none";

export interface ExplainRow {
  /** "Proficiency bonus", "DEX modifier", "Chain Mail". */
  label: string;
  /** Signed and formatted: "+2", "13", "set to 18", "at least 10". */
  value: string;
  /** The numeric part when there is one, for callers that want to re-add. */
  amount?: number;
  /** Set when the contribution comes from an element rather than the rules. */
  source?: string;
  /** Kept in the list but not counted, with the reason. */
  applied: boolean;
  suppressedBy?: string;
  fromEffect?: boolean;
}

export interface ExplainNote {
  kind: "advantage" | "disadvantage" | "conditional";
  /** "Advantage on saves against being charmed". */
  text: string;
  source: string;
}

export interface Explanation {
  /** "Athletics", "Dexterity save", "Longsword". */
  label: string;
  kind: RollKind;
  total: number;
  /** Dice notation for the roll, when there is one: "1d20 + 5", "1d8 + 3". */
  notation?: string;
  rows: ExplainRow[];
  notes: ExplainNote[];
  /** "13 = 8 base DC + 2 proficiency bonus + 3 INT modifier". */
  formula: string;
  advantage: NumericStat["advantage"];
}

export function signedText(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

/** One contribution as a line of the breakdown. */
export function explainContribution(row: Contribution): ExplainRow {
  const numeric = typeof row.value === "number" ? row.value : undefined;
  const text = Array.isArray(row.value) ? row.value.join(", ") : String(row.value);
  const value = ((): string => {
    switch (row.op) {
      case "add":
        return numeric !== undefined ? signedText(numeric) : text;
      case "base":
        return text;
      case "set":
        return `set to ${text}`;
      case "min":
        return `at least ${text}`;
      case "max":
        return `at most ${text}`;
      default:
        return text;
    }
  })();

  return {
    label: row.sourceName,
    value,
    amount: numeric,
    applied: row.applied,
    suppressedBy: row.suppressedBy,
    fromEffect: row.fromEffect,
  };
}

function noteFor(annotation: Annotation): ExplainNote {
  const kind =
    annotation.op === "advantage" ? "advantage" : annotation.op === "disadvantage" ? "disadvantage" : "conditional";
  const prefix =
    kind === "advantage"
      ? "Advantage"
      : kind === "disadvantage"
        ? "Disadvantage"
        : typeof annotation.value === "number"
          ? signedText(annotation.value)
          : Array.isArray(annotation.value)
            ? annotation.value.join(", ")
            : String(annotation.value ?? annotation.op);
  return { kind, text: `${prefix} ${annotation.when.text}`.trim(), source: annotation.sourceName };
}

/**
 * The arithmetic as one line. Only applied rows appear: a suppressed `base` (the
 * unarmoured 10 that chain mail beat) belongs in the list, where it can carry its
 * "superseded by" reason, but not in the sum.
 */
export function formulaFor(total: number, rows: ExplainRow[]): string {
  const applied = rows.filter((r) => r.applied);
  if (applied.length === 0) return String(total);
  const terms = applied.map((row, i) => {
    const label = row.label.toLowerCase();
    if (i === 0) return `${row.value} ${label}`;
    return `${row.value.startsWith("+") || row.value.startsWith("-") ? row.value : `+ ${row.value}`} ${label}`;
  });
  return `${total} = ${terms.join(" ").replace(/\+(\S)/g, "+ $1")}`;
}

export function explainStat(
  stat: NumericStat,
  { label, kind = "none", notation }: { label: string; kind?: RollKind; notation?: string },
): Explanation {
  const rows = stat.breakdown.map(explainContribution);
  return {
    label,
    kind,
    total: stat.value,
    notation: notation ?? (kind === "d20" ? `1d20 ${signedText(stat.value)}` : undefined),
    rows,
    notes: stat.annotations.map(noteFor),
    formula: formulaFor(stat.value, rows),
    advantage: stat.advantage,
  };
}

/** The same shape for a set-valued stat, where there is no total to explain. */
export function explainSet(stat: SetStat, label: string): Explanation {
  const rows = stat.breakdown.map(explainContribution);
  return {
    label,
    kind: "none",
    total: stat.values.length,
    rows,
    notes: stat.annotations.map(noteFor),
    formula: stat.values.join(", "),
    advantage: "none",
  };
}

/**
 * An explanation assembled by hand, for numbers the resolver reports as a plain
 * value: a weapon's damage, a spell's save DC taken from the spellcasting block.
 */
export function explainParts({
  label,
  kind = "none",
  notation,
  parts,
  notes = [],
  advantage = "none",
}: {
  label: string;
  kind?: RollKind;
  notation?: string;
  parts: { label: string; amount: number; source?: string }[];
  notes?: ExplainNote[];
  advantage?: NumericStat["advantage"];
}): Explanation {
  const total = parts.reduce((sum, part) => sum + part.amount, 0);
  const rows: ExplainRow[] = parts.map((part, i) => ({
    label: part.label,
    value: i === 0 ? String(part.amount) : signedText(part.amount),
    amount: part.amount,
    source: part.source,
    applied: true,
  }));
  return { label, kind, total, notation, rows, notes, formula: formulaFor(total, rows), advantage };
}
