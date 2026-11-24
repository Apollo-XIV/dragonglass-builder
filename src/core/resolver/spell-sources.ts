/**
 * The Spells page's sources: who the character casts as, which spells and slots each owns,
 * and how their stats group into the header. Pure, so the sheet's header and chips are
 * tested here rather than through a view.
 *
 * A source is anything with a casting ability of its own: a casting class (a subclass's
 * spellcasting rides with its class, so it is the class's source), or a feat, lineage or item
 * whose innate spells name an ability. Slots belong to classes only.
 */

import type { Ability } from "../types";
import type {
  NumericStat,
  ResolvedSpell,
  ResolvedSpellcasting,
  SlotPool,
} from "./resolved";

/** Which slots a source owns: the shared multiclass table, Pact Magic, or none. */
export type SlotOwnership = "shared" | "pact" | "none";

export interface SpellSource {
  /** The class's id, or the id of the element whose innate spells name the ability. */
  id: string;
  name: string;
  ability: Ability;
  dc: number;
  attack: number;
  /** The breakdowns behind `dc` and `attack`; innate sources only have the numbers. */
  dcStat?: NumericStat;
  attackStat?: NumericStat;
  slots: SlotOwnership;
}

/** Sources that share an ability, a save DC and an attack modifier read as one. */
export interface StatSet {
  /** Stable for a given membership: the member ids. */
  key: string;
  sourceIds: string[];
  /** The member names, in order; the view puts the separators between them. */
  names: string[];
  /** The names joined with " + ", for accessible names and tests. */
  label: string;
  ability: Ability;
  dc: number;
  attack: number;
  /** Breakdowns of the first member, when it has them. */
  dcStat?: NumericStat;
  attackStat?: NumericStat;
}

export const ALL_SOURCES = "all";

/**
 * A stat set's DC or attack as a stat the breakdown can explain. A class's own is the
 * engine's; an innate source only has the total, so its rows are rebuilt from the
 * proficiency bonus, the remainder being the ability modifier.
 */
export function setStat(set: StatSet, which: "dc" | "attack", proficiency: number): NumericStat {
  const own = which === "dc" ? set.dcStat : set.attackStat;
  if (own) return own;
  const total = which === "dc" ? set.dc : set.attack;
  const row = (sourceName: string, value: number, op: "base" | "add"): NumericStat["breakdown"][number] => ({
    source: "rules",
    sourceName,
    op,
    value,
    applied: true,
  });
  const base = which === "dc" ? 8 : proficiency;
  const breakdown = [
    row(which === "dc" ? "Base DC" : "Proficiency bonus", base, "base"),
    row(`${set.ability.toUpperCase()} modifier`, total - base - (which === "dc" ? proficiency : 0), "add"),
    ...(which === "dc" ? [row("Proficiency bonus", proficiency, "add")] : []),
  ];
  return { path: `spellcasting.${set.key}.${which}`, value: total, base, breakdown, annotations: [], advantage: "none" };
}

export function spellSources(casting: ResolvedSpellcasting): SpellSource[] {
  const sources: SpellSource[] = casting.classes.map((cls) => ({
    id: cls.class,
    name: cls.name,
    ability: cls.ability,
    dc: cls.dc.value,
    attack: cls.attack.value,
    dcStat: cls.dc,
    attackStat: cls.attack,
    slots: cls.progression === "pact" ? "pact" : cls.slotLevel > 0 ? "shared" : "none",
  }));

  const seen = new Set(sources.map((s) => s.id));
  for (const spell of casting.spells)
    for (const cast of spell.innate) {
      if (!cast.ownAbility || !cast.ability || cast.dc === undefined || cast.attack === undefined) continue;
      if (seen.has(cast.source)) continue;
      seen.add(cast.source);
      sources.push({
        id: cast.source,
        name: cast.sourceName,
        ability: cast.ability,
        dc: cast.dc,
        attack: cast.attack,
        slots: "none",
      });
    }
  return sources;
}

/** Groups on the exact triple; sharing an ability alone is not enough. */
export function statSets(sources: SpellSource[]): StatSet[] {
  const sets: StatSet[] = [];
  for (const source of sources) {
    const same = sets.find((s) => s.ability === source.ability && s.dc === source.dc && s.attack === source.attack);
    if (same) {
      same.sourceIds.push(source.id);
      same.names.push(source.name);
      same.label = same.names.join(" + ");
      same.key = same.sourceIds.join("+");
    } else
      sets.push({
        key: source.id,
        sourceIds: [source.id],
        names: [source.name],
        label: source.name,
        ability: source.ability,
        dc: source.dc,
        attack: source.attack,
        dcStat: source.dcStat,
        attackStat: source.attackStat,
      });
  }
  return sets;
}

/** The sources a spell is cast as: its class, and every feat or lineage that grants it. */
export function sourcesOfSpell(spell: ResolvedSpell, sources: SpellSource[]): string[] {
  const ids = new Set<string>();
  const known = new Set(sources.map((s) => s.id));
  for (const cls of [spell.class, ...(spell.alsoClasses ?? [])]) if (cls && known.has(cls)) ids.add(cls);
  for (const cast of spell.innate) {
    const owner = cast.ownAbility ? cast.source : cast.class;
    if (owner && known.has(owner)) ids.add(owner);
  }
  return [...ids];
}

/** The slot pools one or more sources own. Pact slots are one pool, shared ones another. */
export function slotsOwnedBy(
  casting: Pick<ResolvedSpellcasting, "slots" | "pact">,
  sources: SpellSource[],
): { slots: SlotPool[]; pact?: NonNullable<ResolvedSpellcasting["pact"]> } {
  return {
    slots: sources.some((s) => s.slots === "shared") ? casting.slots : [],
    pact: sources.some((s) => s.slots === "pact") ? casting.pact : undefined,
  };
}

/**
 * A selection that no longer names a source is All. With one source there is nothing to
 * choose between, so it is All as well.
 */
export function effectiveSelection(selected: string, sources: SpellSource[]): string {
  if (sources.length < 2) return ALL_SOURCES;
  return sources.some((s) => s.id === selected) ? selected : ALL_SOURCES;
}

export interface SpellsView {
  sources: SpellSource[];
  /** More than one source: the chips are worth showing. Counts sources, not stat sets. */
  showChips: boolean;
  selected: string;
  sets: StatSet[];
  spells: ResolvedSpell[];
  slots: SlotPool[];
  pact?: NonNullable<ResolvedSpellcasting["pact"]>;
  /** Neither pool is shown, so the row should not render at all. */
  noSlots: boolean;
}

/** The page as if the character had only the selected source. */
export function spellsView(casting: ResolvedSpellcasting, selection: string): SpellsView {
  const all = spellSources(casting);
  const selected = effectiveSelection(selection, all);
  const shown = selected === ALL_SOURCES ? all : all.filter((s) => s.id === selected);
  const owned =
    selected === ALL_SOURCES
      ? { slots: casting.slots, pact: casting.pact }
      : slotsOwnedBy(casting, shown);
  return {
    sources: all,
    showChips: all.length > 1,
    selected,
    sets: statSets(shown),
    spells:
      selected === ALL_SOURCES
        ? casting.spells
        : casting.spells.filter((spell) => sourcesOfSpell(spell, all).includes(selected)),
    slots: owned.slots,
    pact: owned.pact,
    noSlots: owned.slots.length === 0 && !owned.pact,
  };
}
