/**
 * What a character may learn, and how much of it they have.
 *
 * Driven entirely by each class's `spellcasting` block, so nothing here knows a class
 * by name: a Wizard's spellbook, a Warlock's pact level and a Bard's known count are all
 * a cap or its absence. A cap that is absent is not zero — a class that does not state
 * `known` is not limited to no known spells.
 *
 * Extra spells (`SpellEntry.extra`) are never counted. They are learned outside the
 * class's progression — a scroll, a feat — so they live in their own list and do not
 * eat into anything below.
 */

import type { Diagnostic, ExtraSpellPick } from "../types";
import type { ResolvedSpell, ResolvedSpellcastingClass } from "./resolved";

export interface Count {
  /** Absent when the class states no limit. */
  cap?: number;
  used: number;
}

export interface ClassSpellLimits {
  class: string;
  name: string;
  cantrips: Count;
  /** Leveled spells chosen. Capped by `known` for a known caster. */
  known: Count;
  /** Leveled spells marked prepared, excluding always-prepared. */
  prepared: Count;
  /** Leveled spells in the book. Advisory: scrolls add more, as extras. */
  spellbook: Count;
  /**
   * The count a leveled spell is chosen against, whatever this kind of caster calls it:
   * spells known, spells in the book, or spells prepared. `label` is how to say so.
   */
  leveled: Count & { label: string };
  /** Highest spell level that may be learned. */
  maxSpellLevel: number;
  /** Picks outside the counts that this class level has unlocked. */
  extraPicks: ExtraSpellPick[];
  /** Extra spells held against this class. */
  extras: number;
}

/**
 * Which class a spell counts against. A spell with no class belongs to the only class
 * there is, and to nobody when there are several: a granted spell is not a choice.
 */
function owner(spell: ResolvedSpell, classes: ResolvedSpellcastingClass[]): string | undefined {
  return spell.class ?? (classes.length === 1 ? classes[0]!.class : undefined);
}

export function spellLimits(
  classes: ResolvedSpellcastingClass[],
  spells: ResolvedSpell[],
): ClassSpellLimits[] {
  return classes.map((cls) => {
    const mine = spells.filter((s) => owner(s, classes) === cls.class);
    // Granted spells (oath, domain) and innate ones were not chosen, so they take no room.
    const chosen = mine.filter((s) => !s.alwaysPrepared && !s.innateOnly);
    const regular = chosen.filter((s) => !s.extra);
    const leveled = regular.filter((s) => s.spellLevel > 0);
    const known = { cap: cls.known, used: leveled.length };
    const prepared = { cap: cls.prepared, used: leveled.filter((s) => s.prepared).length };
    const spellbook = { cap: cls.spellbook, used: leveled.length };
    return {
      class: cls.class,
      name: cls.name,
      leveled:
        cls.type === "known"
          ? { ...known, label: "spells known" }
          : cls.type === "spellbook"
            ? { ...spellbook, label: "spells in the book" }
            : { ...prepared, label: "spells prepared" },
      cantrips: { cap: cls.cantrips, used: regular.filter((s) => s.spellLevel === 0).length },
      known,
      prepared,
      spellbook,
      maxSpellLevel: cls.maxSpellLevel,
      extraPicks: cls.extraPicks.filter((p) => p.level <= cls.level),
      extras: chosen.filter((s) => s.extra).length,
    };
  });
}

/** Warnings for what the build holds beyond its limits. Never errors: enforcement is the builder's toggle. */
export function limitDiagnostics(
  classes: ResolvedSpellcastingClass[],
  spells: ResolvedSpell[],
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const limits = spellLimits(classes, spells);
  for (const l of limits) {
    const cls = classes.find((c) => c.class === l.class)!;
    const over = (label: string, count: Count): void => {
      if (count.cap !== undefined && count.used > count.cap)
        out.push({
          severity: "warning",
          code: "spells-over-limit",
          message: `${l.name} has ${count.used} ${label}, more than the ${count.cap} it allows`,
          subject: l.class,
        });
    };
    over("cantrips", l.cantrips);
    // Only the count the class's kind of casting is bound by.
    if (cls.type === "known") over("spells known", l.known);
    if (cls.type !== "known") over("spells prepared", l.prepared);
    if (cls.type === "spellbook") over("spells in the spellbook", l.spellbook);
  }
  for (const spell of spells) {
    if (spell.extra || spell.alwaysPrepared || spell.innateOnly || spell.spellLevel === 0) continue;
    const id = owner(spell, classes);
    const l = limits.find((x) => x.class === id);
    if (l && spell.spellLevel > l.maxSpellLevel)
      out.push({
        severity: "warning",
        code: "spell-level-too-high",
        message: `${spell.name} is level ${spell.spellLevel}; ${l.name} can learn up to level ${l.maxSpellLevel}`,
        subject: spell.id,
      });
  }
  return out;
}
