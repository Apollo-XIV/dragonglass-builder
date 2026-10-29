/**
 * The content model. Every piece of rules content is an `Element`: an id, a kind,
 * a source, rules text, and optional parts. See the design spec, "Rules content format".
 *
 * Nothing in src/core imports from "obsidian" — it all runs in unit tests and the CLI.
 */

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export const SKILLS: Record<string, Ability> = {
  acrobatics: "dex",
  "animal-handling": "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  "sleight-of-hand": "dex",
  stealth: "dex",
  survival: "wis",
};

/** An expression: a number, or a string in the expression language ("@prof + 2"). */
export type Expr = number | string;

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** A grant is an element id, or an id with authored commentary attached. */
export type Grant = string | { id: string; text?: string; notes?: string };

export interface Filter {
  /** One kind or several. An element matches if its kind is in the list. */
  kind?: string | string[];
  /** Element must carry at least one of these tags. */
  tags?: string[];
  /** Element must carry all of these tags. */
  allTags?: string[];
  /** Explicit ids. Combined with kind/tags as a union: ids are always eligible. */
  ids?: string[];
  /** Ids to exclude from whatever the rest of the filter matched. */
  exclude?: string[];
}

export interface ChoiceDef {
  id: string;
  name?: string;
  count: number;
  from: Filter;
  /** Gate on the choice as a whole. */
  requires?: Requirement;
  /** May the same option be picked twice? Defaults to false. */
  repeatable?: boolean;
  text?: string;
  notes?: string;
}

export const MODIFIER_OPS = [
  "add",
  "set",
  "min",
  "max",
  "advantage",
  "disadvantage",
  "include",
  "proficiency",
  "base",
] as const;
export type ModifierOp = (typeof MODIFIER_OPS)[number];

export const PROFICIENCY_LEVELS = ["none", "half", "proficient", "expertise"] as const;
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];

/** A modifier that only applies in some circumstance. Never folded into a value. */
export interface When {
  /** What the tooltip shows: "against poison", "while impersonating someone". */
  text: string;
  /**
   * Optional id shared by modifiers that apply together, so the sheet can later
   * offer one toggle that folds them all in. The builder only preserves it.
   */
  context?: string;
}

export interface Modifier {
  /** A stat path: "saves.str", "ac", "skills.stealth", "resistances". */
  target: string;
  op: ModifierOp;
  /** Number or expression for arithmetic ops; string[] for `include`; a
   *  ProficiencyLevel for `proficiency`. Unused by advantage/disadvantage. */
  value?: Expr | string[] | ProficiencyLevel;
  when?: When;
  /** Modifiers sharing a stackKey don't stack; the largest applies. */
  stackKey?: string;
  text?: string;
  notes?: string;
}

export const RECHARGES = [
  "short-rest",
  "long-rest",
  "dawn",
  "dusk",
  "turn",
  "round",
  "never",
  "manual",
] as const;
export type Recharge = (typeof RECHARGES)[number];

export interface ResourceDef {
  /** Local ("rages") or namespaced ("srd:paladin:lay-on-hands"). */
  id: string;
  name: string;
  max: Expr;
  recharge: Recharge;
  /** How much a recharge restores. Defaults to the full max. */
  rechargeAmount?: Expr;
  /** Unit label for pools counted in points, e.g. "hit points" for Lay on Hands. */
  unit?: string;
  text?: string;
  notes?: string;
}

/** A cost is a pool key mapped to an amount, or a variable range (Mystic psi). */
export type Cost = Record<string, number | { min: number; max: number }>;

export const ACTIVATIONS = [
  "action",
  "bonus-action",
  "reaction",
  "free",
  "special",
  "minute",
  "hour",
  "passive",
] as const;
export type Activation = string;

export interface ActionDef {
  id: string;
  name?: string;
  activation: Activation;
  /** e.g. { "rages": 1 } or { "slots.1": 1 }. Keys resolve locally then globally. */
  cost?: Cost;
  /** Effect id this action turns on. */
  applies?: string;
  range?: string;
  target?: string;
  /** Dice notation, may contain expressions: "2d6 + @abilities.str.mod". */
  damage?: string;
  damageType?: string;
  /** "dex" plus the spell save DC, or an explicit expression. */
  save?: { ability: Ability; dc?: Expr };
  recharge?: Recharge;
  text?: string;
  notes?: string;
}

export interface EffectDef {
  id: string;
  name: string;
  /** Free text: "1 minute", "until you finish a long rest". */
  duration?: string;
  concentration?: boolean;
  modifiers?: Modifier[];
  text?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export type Predicate =
  | { type: "class-level"; class: string; min: number }
  | { type: "level"; min: number }
  | { type: "ability"; ability: Ability; min: number }
  | { type: "has"; id: string }
  | { type: "proficiency"; proficiency: string; of?: string }
  | { type: "spellcaster" }
  | Requirement;

export interface Requirement {
  all?: Predicate[];
  any?: Predicate[];
  not?: Predicate[];
  /** Shown instead of a generated description when present. */
  text?: string;
}

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

export interface Element {
  id: string;
  /** Open string; must resolve to a kind definition. */
  kind: string;
  name: string;
  /** Must reference a loaded sourcebook element. */
  source: string;
  text?: string;
  tags?: string[];
  requires?: Requirement;
  page?: number | string;

  grants?: Grant[];
  choices?: ChoiceDef[];
  modifiers?: Modifier[];
  resources?: ResourceDef[];
  actions?: ActionDef[];
  effects?: EffectDef[];

  /** Kind-specific fields and `x-` extensions. */
  [key: string]: unknown;
}

export interface SourcebookElement extends Element {
  kind: "sourcebook";
  abbreviation: string;
  version?: string;
  license?: string;
  attribution?: string;
  url?: string;
}

export interface KindElement extends Element {
  kind: "kind";
  /** The kind key this element defines, e.g. "species-trait". */
  key: string;
  label: string;
  plural?: string;
  /** Sheet/builder tab this kind lives on. null means it isn't tabbed. */
  tab?: string | null;
  display?: "list" | "card" | "table";
  /** Legacy kind strings translated to `key` on load, e.g. "race" -> "species". */
  aliases?: string[];
  /** Appears in the content browser. */
  browsable?: boolean;
  order?: number;
}

/** A level entry in a class or subclass progression. */
export interface LevelEntry {
  grants?: Grant[];
  choices?: ChoiceDef[];
  modifiers?: Modifier[];
  resources?: ResourceDef[];
  actions?: ActionDef[];
  effects?: EffectDef[];
  text?: string;
}

export type ProgressionKind = "full" | "half" | "third" | "pact" | "none";
export type PreparationKind = "prepared" | "known" | "spellbook";

export interface Spellcasting {
  ability: Ability;
  progression: ProgressionKind;
  type: PreparationKind;
  /** Tag identifying this class's spell list, e.g. "paladin-spell". */
  list: string;
  /** First class level with spell slots. Defaults to 1. */
  startsAt?: number;
  /** Expression for how many cantrips are known at the current level. */
  cantrips?: Expr;
  /** Expression for the number of prepared/known spells. */
  prepared?: Expr;
  /** Ritual casting, focus, etc. — carried through for display. */
  notes?: string;
}

/** Class tables: named columns read by @table(class, column), indexed by level. */
export type ClassTables = Record<string, (number | string | null)[] | Record<string, number | string | null>>;

export interface ClassElement extends Element {
  kind: "class";
  hitDie: string;
  /** Short reference used by @level(x) and @table(x, col). Defaults to the id's last segment. */
  key?: string;
  primaryAbility?: Ability[];
  spellcasting?: Spellcasting;
  levels?: Record<string, LevelEntry>;
  tables?: ClassTables;
  /** Requirement to take this class as a second or later class. */
  multiclassRequires?: Requirement;
}

export interface SubclassElement extends Element {
  kind: "subclass";
  /** Class id this subclass belongs to. */
  class?: string;
  spellcasting?: Spellcasting;
  levels?: Record<string, LevelEntry>;
  tables?: ClassTables;
}

export interface SpellElement extends Element {
  kind: "spell";
  spellLevel: number;
  school?: string;
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  concentration?: boolean;
  ritual?: boolean;
  higherLevels?: string;
}

export interface ItemElement extends Element {
  kind: "item";
  itemType?: string;
  /** Weight in pounds. */
  weight?: number;
  /** Cost in copper pieces, so currencies compare. */
  value?: number;
  rarity?: string;
  attunement?: boolean;
  armor?: { base: Expr; dexMax?: number | null; category?: string; stealthDisadvantage?: boolean };
  weapon?: { damage: string; damageType?: string; properties?: string[]; category?: string; range?: string };
  /** Modifiers only apply while equipped. Defaults true for armour and weapons. */
  requiresEquipped?: boolean;
  charges?: ResourceDef;
}

// ---------------------------------------------------------------------------
// Character files
// ---------------------------------------------------------------------------

export type FileKind =
  | "sheet"
  | "build"
  | "state"
  | "details"
  | "spells"
  | "inventory"
  | "sources"
  | "layout"
  | "gallery";

export interface CharacterFile {
  kind: FileKind;
  schemaVersion: number;
}

/**
 * The narrow layout's preferences. They are declared here rather than with the
 * plugin's settings because `layout.5e` can carry them per character, and both
 * layers have to agree on the shape. Styling and layout resolve in the order
 * the design spec gives: `layout.5e`, then plugin settings, then defaults.
 */
export interface NarrowPrefs {
  /** Auto follows the view's own width; the others force one layout. */
  layout: "auto" | "narrow" | "desktop";
  /** Also require width >= height for the desktop layout. */
  desktopNeedsLandscape: boolean;
  railSide: "left" | "right";
  railHeight: "middle" | "low";
  railTap: "glide" | "jump";
  scrollTicks: boolean;
  snap: boolean;
  /** Snap grab distance, as a percentage of viewport height. */
  snapGrabPercent: number;
  /** How long to hold before details open. */
  holdMs: number;
  haptics: boolean;
  infoButtons: boolean;
  holdHint: boolean;
  /** Rail section order, by section id. */
  sheetSections: string[];
  builderSections: string[];
}

/**
 * Per-character styling and layout. Everything is optional: whatever a
 * character does not state follows the plugin's settings, and whatever the
 * plugin does not state follows the theme.
 */
export interface LayoutFile extends CharacterFile {
  kind: "layout";
  /** CSS colour; overrides the plugin's accent for this character. */
  accent?: string;
  /** Vault path or URL, for a character with its own backdrop. */
  background?: string;
  /** Gallery image ids to show on the sheet. */
  images?: string[];
  /** Per-character narrow-layout overrides. */
  narrow?: Partial<NarrowPrefs>;
}

export type AbilityMethod = "point-buy" | "standard-array" | "rolled" | "manual";
export type HpChoice = "max" | "average" | number;

export interface BuildLevel {
  class: string;
  /** Subclass is recorded as a choice, not here, so the choice id stays authoritative. */
  hp: HpChoice;
  choices?: Record<string, string[]>;
}

/** A queued build: picks made for a class level the character hasn't reached. */
export interface PlannedLevel {
  class: string;
  classLevel: number;
  choices: Record<string, string[]>;
}

export interface BuildFile extends CharacterFile {
  kind: "build";
  name?: string;
  xp?: number;
  level: number;
  species?: string;
  background?: string;
  abilities: {
    method: AbilityMethod;
    base: Record<Ability, number>;
  };
  levels: BuildLevel[];
  /** Choices not tied to a class level: species, background, feats. */
  choices?: Record<string, string[]>;
  /**
   * Picks for class levels not yet taken, applied on level-up (spec 7.6). Keyed
   * by class and class level, never by character level, so taking a level of one
   * class leaves the other classes' plans where they were. An ordered plan across
   * classes, if it ever arrives, is an extra list rather than a change here.
   */
  planned?: PlannedLevel[];
  /** Free-form notes the builder never touches. */
  notes?: string;
}

export interface TempMaxHpEffect {
  id: string;
  amount: number;
  source?: string;
  /** Free text; expiry is manual in the MVP. */
  duration?: string;
}

export interface ActiveEffect {
  /** Effect definition id. */
  effect: string;
  /** When it started, for display. */
  since?: string;
  /** Element that applied it, when several could. */
  source?: string;
}

export interface Checkpoint {
  damage: number;
  tempHp: number;
  tempMaxHp: TempMaxHpEffect[];
  spent: {
    slots?: Record<string, number>;
    hitDice?: Record<string, number>;
    resources?: Record<string, number>;
  };
  effects: ActiveEffect[];
  conditions?: string[];
  exhaustion?: number;
  deathSaves?: { successes: number; failures: number };
  concentration?: { on: string; since?: string } | null;
  inspiration?: boolean;
  /** When this checkpoint was taken. */
  t?: string;
}

export type StateEvent =
  | { t: string; type: "damage"; amount: number; note?: string }
  | { t: string; type: "heal"; amount: number; note?: string }
  | { t: string; type: "temp-hp"; amount: number }
  | { t: string; type: "temp-max-hp.add"; effect: TempMaxHpEffect }
  | { t: string; type: "temp-max-hp.remove"; id: string }
  | { t: string; type: "spend"; target: string; amount: number }
  | { t: string; type: "regain"; target: string; amount: number }
  | { t: string; type: "effect.start"; effect: string; source?: string }
  | { t: string; type: "effect.end"; effect: string }
  | { t: string; type: "condition.add"; condition: string }
  | { t: string; type: "condition.remove"; condition: string }
  | { t: string; type: "exhaustion"; level: number }
  | { t: string; type: "death-save"; result: "success" | "failure" | "reset" }
  | { t: string; type: "concentration.start"; on: string }
  | { t: string; type: "concentration.end" }
  | { t: string; type: "inspiration"; value: boolean }
  | { t: string; type: "rest.short" }
  | { t: string; type: "rest.long" };

export type StateEventType = StateEvent["type"];

export interface StateFile extends CharacterFile {
  kind: "state";
  checkpoint: Checkpoint;
  events: StateEvent[];
  /** Archived pre-checkpoint event runs, newest last. Doubles as a session recap. */
  archive?: { until: string; events: StateEvent[] }[];
}

export interface SpellEntry {
  id: string;
  /** Build class id this spell belongs to, for multiclass bookkeeping. */
  class?: string;
  prepared?: boolean;
  /** Always available without preparation (oath spells, domain spells). */
  alwaysPrepared?: boolean;
  /** In the spellbook but not scribed/known yet. */
  known?: boolean;
  notes?: string;
}

export interface SpellsFile extends CharacterFile {
  kind: "spells";
  spells: SpellEntry[];
}

export interface InventoryEntry {
  /** Reference to source content. Mutually exclusive with `item`. */
  id?: string;
  /** An inline custom item, same element format as source content. */
  item?: Partial<ItemElement>;
  quantity?: number;
  equipped?: boolean;
  attuned?: boolean;
  /** Container entry id, for bags of holding later. */
  container?: string;
  notes?: string;
}

export interface InventoryFile extends CharacterFile {
  kind: "inventory";
  items: InventoryEntry[];
  currency?: { cp?: number; sp?: number; ep?: number; gp?: number; pp?: number };
}

export interface SourceRef {
  /** Stable id, matching the source's own source.json id where possible. */
  id: string;
  type: "github" | "vault" | "path" | "url";
  /** owner/repo for github; a vault-relative or absolute path otherwise. */
  location: string;
  /** Tag or commit SHA. Required for github sources so content can't drift. */
  pin?: string;
  enabled?: boolean;
  name?: string;
}

export interface SourcesFile extends CharacterFile {
  kind: "sources";
  /** Sources this character adds, highest priority first. */
  sources?: SourceRef[];
  /** Vault-wide source ids this character switches off. */
  disabled?: string[];
}

export interface SheetFile extends CharacterFile {
  kind: "sheet";
  name?: string;
  /** Data type -> file path, relative to the manifest. Absent entries use defaults. */
  files?: Partial<Record<Exclude<FileKind, "sheet">, string>>;
  /** Override a referenced file's kind when the file itself declares none. */
  kinds?: Record<string, FileKind>;
}

export interface DetailsFrontmatter {
  kind: "details";
  schemaVersion: number;
  avatar?: string;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticCode =
  | "unknown-kind"
  | "unknown-part"
  | "unknown-op"
  | "unknown-stat-path"
  | "unresolved-reference"
  | "missing-source"
  | "expression-error"
  | "expression-cycle"
  | "unmet-requirement"
  | "invalid-element"
  | "overridden"
  | "spell-mismatch"
  | "choice-invalid"
  | "duplicate-id";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  message: string;
  /** Element id, or the source id when the element is too broken to have one. */
  subject?: string;
  /** Dotted path inside the element, for the validator. */
  path?: string;
  /** Source-relative file the element was read from, when known. */
  file?: string;
  /** Source the problem belongs to, for filtering by source in the UI and CLI. */
  source?: string;
}

/**
 * Stat paths are data too, so a source can add its own. `key` may contain `*`
 * wildcards for families: "speed.*", "spellcasting.*.dc".
 */
export interface StatPathElement extends Element {
  kind: "stat-path";
  key: string;
  valueType: "number" | "set";
  /** Starting value before modifiers. */
  base?: Expr;
  label?: string;
  /** Lowest value the stat can take after modifiers, e.g. 0 for speed. */
  floor?: number;
}
