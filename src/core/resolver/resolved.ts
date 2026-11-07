/** The resolver's output. Every view and exporter reads this and nothing else. */

import type { ClassSpellLimits } from "./spell-limits";
import type {
  Ability,
  ActionDef,
  Activation,
  ChoiceDef,
  Cost,
  Diagnostic,
  EffectDef,
  Element,
  ExtraSpellPick,
  InventoryEntry,
  Modifier,
  ModifierOp,
  PreparationKind,
  ProficiencyLevel,
  ProgressionKind,
  SpellEntry,
  When,
} from "../types";
import type { ResolvedRecharge } from "../state/recharge";
import type { HpLevel } from "./hit-points";

export type { HpLevel } from "./hit-points";

/** Where an element came from, innermost last: ["srd:class:paladin", "srd:paladin:spellcasting"]. */
export type Origin = string[];

export interface ResolvedElement {
  id: string;
  kind: string;
  name: string;
  source: string;
  /** Sourcebook abbreviation, for the "PHB 48" badge. */
  abbreviation?: string;
  page?: number | string;
  text?: string;
  fluff?: string;
  tags: string[];
  /** Class level this came from, when it came from a class progression. */
  level?: number;
  /** Class id, when it came from a class or subclass progression. */
  class?: string;
  origin: Origin;
  element: Element;
}

export interface Contribution {
  /** Element id the modifier came from, or a pseudo-source like "base" or "species". */
  source: string;
  sourceName: string;
  op: ModifierOp;
  /** The evaluated value, or the raw value for non-numeric ops. */
  value: number | string | string[] | ProficiencyLevel;
  /** False when another modifier beat it (lost a `base` race, or shares a stackKey). */
  applied: boolean;
  /** Why it didn't apply. */
  suppressedBy?: string;
  stackKey?: string;
  /** True when the contribution comes from an active effect rather than the build. */
  fromEffect?: boolean;
}

export interface Annotation {
  when: When;
  op: ModifierOp;
  value?: number | string | string[] | ProficiencyLevel;
  source: string;
  sourceName: string;
}

export type AdvantageState = "none" | "advantage" | "disadvantage" | "both";

export interface NumericStat {
  path: string;
  value: number;
  /** The value before modifiers, for the breakdown's first row. */
  base: number;
  breakdown: Contribution[];
  annotations: Annotation[];
  advantage: AdvantageState;
  proficiency?: ProficiencyLevel;
}

export interface SetStat {
  path: string;
  values: string[];
  breakdown: Contribution[];
  annotations: Annotation[];
}

export interface AbilityBlock {
  ability: Ability;
  score: NumericStat;
  mod: number;
  save: NumericStat;
  check: NumericStat;
}

export interface SkillBlock {
  key: string;
  name: string;
  ability: Ability;
  stat: NumericStat;
  passive: number;
}

export interface HitDicePool {
  die: string;
  max: number;
  spent: number;
  remaining: number;
}

export interface ResolvedHp {
  max: NumericStat;
  /** Live state only; equals max in level state. */
  current: number;
  damage: number;
  temp: number;
  tempMax: number;
  hitDice: HitDicePool[];
  /** What each level contributed before CON, in build order. */
  levels: HpLevel[];
}

export interface ResolvedResource {
  /** Globally unique pool key. */
  key: string;
  /** The id as authored. */
  id: string;
  name: string;
  max: number;
  spent: number;
  remaining: number;
  recharge: ResolvedRecharge[];
  unit?: string;
  /** The die it is spent as, where the content gives one. */
  die?: string;
  /** The content's own pin weight, the first of the three pin layers. */
  pin?: number;
  source: string;
  sourceName: string;
  notes?: string;
}

export interface ResolvedAction {
  key: string;
  id: string;
  name: string;
  activation: Activation;
  cost?: Cost;
  /** Pool keys the cost resolved to, so the sheet can spend without re-resolving. */
  resolvedCost?: { key: string; amount: number | { min: number; max: number }; label: string }[];
  applies?: string;
  range?: string;
  target?: string;
  damage?: string;
  /** Dice notation with expressions already substituted: "2d6 + 3". */
  damageResolved?: string;
  damageType?: string;
  save?: { ability: Ability; dc: number };
  text?: string;
  notes?: string;
  source: string;
  sourceName: string;
  /** False when a cost can't be paid right now (live state only). */
  available: boolean;
  unavailableReason?: string;
  definition: ActionDef;
}

export interface ResolvedEffect {
  id: string;
  name: string;
  duration?: string;
  concentration?: boolean;
  active: boolean;
  modifiers: Modifier[];
  text?: string;
  notes?: string;
  source: string;
  sourceName: string;
  since?: string;
  definition: EffectDef;
}

export interface ChoiceOption {
  id: string;
  name: string;
  kind: string;
  source: string;
  abbreviation?: string;
  page?: number | string;
  text?: string;
  fluff?: string;
  tags: string[];
  /** False when `requires` isn't met. With enforcement off this is a warning only. */
  allowed: boolean;
  warnings: string[];
  element: Element;
}

export interface PendingChoice {
  /** The content's choice id. */
  id: string;
  name: string;
  count: number;
  chosen: string[];
  /** Picks that are no longer valid options, kept rather than dropped. */
  invalid: string[];
  options: ChoiceOption[];
  definition: ChoiceDef;
  /** Element that declared the choice. */
  source: string;
  sourceName: string;
  /** Where the answer is written. */
  scope: "build" | "level";
  /** 0-based index into build.levels when scope is "level". */
  levelIndex?: number;
  level?: number;
  class?: string;
  /** True when count is satisfied. */
  complete: boolean;
  /** The choice's own requirement isn't met. */
  blocked: boolean;
  blockedReason?: string;
}

export interface ResolvedSpellcastingClass {
  class: string;
  name: string;
  ability: Ability;
  progression: ProgressionKind;
  type: PreparationKind;
  list: string;
  /** Class level. */
  level: number;
  /** Level counted toward the multiclass slot table. */
  slotLevel: number;
  dc: NumericStat;
  attack: NumericStat;
  /** Spells prepared each day, when the class states a count. */
  prepared?: number;
  /** Spells known, when the class states a count. */
  known?: number;
  /** Spells the book holds, when the class states a count. */
  spellbook?: number;
  cantrips?: number;
  /** Highest spell level that may be learned. */
  maxSpellLevel: number;
  /** Every pick the class can ever unlock outside its counts; filter by `level`. */
  extraPicks: ExtraSpellPick[];
}

export interface ResolvedInnate {
  /** The element that gives the cast. */
  source: string;
  sourceName: string;
  /** Absent when neither the grant nor the owning class names one. */
  ability?: Ability;
  dc?: number;
  attack?: number;
  /** Key of the uses pool; absent when the spell is cast at will. */
  resource?: string;
  text?: string;
  notes?: string;
}

export interface ResolvedSpell {
  id: string;
  name: string;
  spellLevel: number;
  school?: string;
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  concentration?: boolean;
  ritual?: boolean;
  text?: string;
  higherLevels?: string;
  prepared: boolean;
  alwaysPrepared: boolean;
  /** Learned outside the class's progression; counts toward no limit. */
  extra: boolean;
  /** Granted as learned (`mode: "learned"`): known or in the book, and not removable. */
  learned: boolean;
  /** A learned spell that takes no room against the class's limits (`counts: false`). */
  free: boolean;
  /** Every way the character casts this without a slot. Empty for an ordinary spell. */
  innate: ResolvedInnate[];
  /** Here only because something grants it innately: not prepared, picked or counted. */
  innateOnly: boolean;
  class?: string;
  source: string;
  abbreviation?: string;
  page?: number | string;
  entry: SpellEntry;
  element: Element;
}

export interface SlotPool {
  level: number;
  max: number;
  spent: number;
  remaining: number;
}

export interface ResolvedSpellcasting {
  classes: ResolvedSpellcastingClass[];
  slots: SlotPool[];
  /** Warlock pact magic, tracked separately from the shared multiclass table. */
  pact?: { level: number; max: number; spent: number; remaining: number };
  spells: ResolvedSpell[];
  /** Spells that no longer fit the build, flagged for review. */
  orphaned: ResolvedSpell[];
  /** What each class may learn and how much of it is used. */
  limits: ClassSpellLimits[];
}

export interface ResolvedItem {
  entry: InventoryEntry;
  /** Index in inventory.items, so the UI can write back. */
  index: number;
  element: Element;
  name: string;
  quantity: number;
  equipped: boolean;
  attuned: boolean;
  weight: number;
  value: number;
  /** False when the referenced id isn't in any loaded source. */
  resolvedRef: boolean;
}

export interface ResolvedClass {
  /** Class element id. */
  id: string;
  name: string;
  level: number;
  hitDie: string;
  subclass?: { id: string; name: string };
  /** The class's own level entries up to the current level, for display. */
  element: Element;
}

export interface LiveStatus {
  conditions: string[];
  exhaustion: number;
  deathSaves: { successes: number; failures: number };
  concentration: { on: string; name?: string; since?: string } | null;
  inspiration: boolean;
  tempMaxHpEffects: { id: string; amount: number; source?: string; duration?: string }[];
}

export interface ResolvedCharacter {
  name: string;
  level: number;
  xp?: number;
  /** True when state.5e was folded in. */
  live: boolean;
  species?: ResolvedElement;
  background?: ResolvedElement;
  classes: ResolvedClass[];
  proficiencyBonus: NumericStat;
  abilities: Record<Ability, AbilityBlock>;
  skills: SkillBlock[];
  /** Every numeric stat by path, including the ones surfaced above. */
  stats: Record<string, NumericStat>;
  /** Set-valued stats: resistances, languages, proficiencies.*, senses by name. */
  sets: Record<string, SetStat>;
  hp: ResolvedHp;
  ac: NumericStat;
  initiative: NumericStat;
  speed: Record<string, NumericStat>;
  senses: Record<string, NumericStat>;
  resources: ResolvedResource[];
  actions: ResolvedAction[];
  effects: ResolvedEffect[];
  spellcasting?: ResolvedSpellcasting;
  inventory: ResolvedItem[];
  currency: Record<string, number>;
  /** Encumbrance-relevant totals. */
  carried: { weight: number; capacity: number };
  /** Everything collected, grouped by kind for data-driven tabs. */
  features: Record<string, ResolvedElement[]>;
  /** Flat list in collection order. */
  elements: ResolvedElement[];
  pendingChoices: PendingChoice[];
  status: LiveStatus;
  diagnostics: Diagnostic[];
}
