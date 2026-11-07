/**
 * The content model. Every piece of rules content is an `Element`: an id, a kind,
 * a source, rules text, and optional parts. See the design spec, "Rules content format".
 *
 * Nothing in src/core imports from "obsidian" — it all runs in unit tests and the CLI.
 */

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

/** An expression: a number, or a string in the expression language ("@prof + 2"). */
export type Expr = number | string;

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/**
 * What a granted spell is to the character. See docs/schema.md, "Granted and innate spells".
 * - `always-prepared`: prepared, free, never in the spells file. The default.
 * - `learned`: added to the spells known or the spellbook; whether it fills a slot in the
 *   class's limits is the grant's `counts`.
 */
export const SPELL_GRANT_MODES = ["always-prepared", "learned"] as const;
export type SpellGrantMode = (typeof SPELL_GRANT_MODES)[number];

/** A grant is an element id, or an id with authored commentary attached. */
export type Grant =
  | string
  | {
      id: string;
      text?: string;
      notes?: string;
      /** For a spell: how the character has it. Defaults to `always-prepared`. */
      mode?: SpellGrantMode;
      /** For `mode: "learned"`: whether it counts against the class's limits. Defaults to true. */
      counts?: boolean;
    };

export interface Filter {
  /** One kind or several. An element matches if its kind is in the list. */
  kind?: string | string[];
  /** Element must carry at least one of these tags. */
  tags?: string[];
  /** Element must carry all of these tags. */
  allTags?: string[];
  /**
   * Explicit ids, ANDed with the rest like every other criterion: they narrow
   * the candidates the other criteria then filter, they do not union in
   * alongside them. `{ kind: "feat", ids: ["srd:feature:asi"] }` matches
   * nothing, because that element is not a feat.
   */
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
  /**
   * The most times any one option may be taken. Only meaningful alongside
   * `repeatable`, and defaults to `count` — that is, no cap beyond the budget.
   *
   * This is what makes "either +2 to one or +1 to two" a budget of points
   * rather than a list of outcomes: three points among three abilities with
   * `maxPer: 2` is exactly the 2024 background rule.
   */
  maxPer?: number;
  text?: string;
  notes?: string;
}

export const MODIFIER_OPS = [
  "add",
  "multiply",
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

/** What a resource can recharge on. Rests are applied by the sheet's rest buttons. */
export const RECHARGE_TRIGGERS = ["short-rest", "long-rest", "dawn", "dusk", "turn", "round"] as const;
export type RechargeOn = (typeof RECHARGE_TRIGGERS)[number];

/**
 * One way a resource gets uses back. A resource carries a list of them, so "one use
 * on a short rest, all on a long rest" is two rules. When several match a rest, the
 * largest amount wins: they are alternatives, not a sum.
 */
export interface RechargeRule {
  on: RechargeOn;
  /** "all" restores the whole pool; an expression restores that many uses. */
  amount: "all" | Expr;
}

export interface ResourceDef {
  /** Local ("rages") or namespaced ("srd:paladin:lay-on-hands"). */
  id: string;
  name: string;
  max: Expr;
  /** Empty means the resource never comes back by itself. */
  recharge: RechargeRule[];
  /** Unit label for pools counted in points, e.g. "hit points" for Lay on Hands. */
  unit?: string;
  /** The die this resource is spent as, where it has one: Bardic Inspiration's d6. */
  die?: string;
  /** How much this resource wants a pinned slot on the sheet. Higher wins. */
  pin?: number;
  text?: string;
  notes?: string;
}

/**
 * "Whatever the player picked in this choice." `choice` is the id of a `ChoiceDef` on
 * the same element, or in the same level entry, as the part holding the reference. An
 * unanswered choice leaves the part inert, and answering it revives it.
 */
export interface ChoiceRef {
  choice: string;
}

/** An innate spell once its choices are read: what the resolver and the export see. */
export type InnateSpell = Omit<InnateSpellDef, "spell" | "ability"> & { spell: string; ability?: Ability };

/**
 * A spell the character casts without preparing it or spending a slot: a species'
 * Misty Step, an invocation's Armor of Shadows. With `uses` it has a pool of its own,
 * recharged by the same rules as any resource; without, it is cast at will.
 */
export interface InnateSpellDef {
  /** The spell element's id, or the choice (declared beside this part) whose answer is it. */
  spell: string | ChoiceRef;
  /**
   * Casting ability for its save DC and attack: fixed, or the choice (declared beside
   * this part) whose answer is an element carrying an `ability`. Defaults to the
   * owning class's.
   */
  ability?: Ability | ChoiceRef;
  /** Casts before it recharges. Omitted means at will. */
  uses?: Expr;
  /** How the uses come back; empty or omitted means they do not. */
  recharge?: RechargeRule[];
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
  /**
   * Setting and flavour, as markdown: what the thing is in the world, not what it
   * does. Optional enhancement — a source may leave it out entirely (a published
   * build can strip it), so nothing may depend on it being there. Never rules text.
   */
  fluff?: string;
  tags?: string[];
  requires?: Requirement;
  page?: number | string;

  /**
   * Parts keyed by level, for anything that gains things as it goes. Classes and
   * subclasses read it against their own class level; anything else must set
   * `levelsBy: "character"` to be read at all.
   */
  levels?: Record<string, LevelEntry>;
  /** What `levels` counts. Defaults to `class`. */
  levelsBy?: LevelBasis;

  grants?: Grant[];
  choices?: ChoiceDef[];
  modifiers?: Modifier[];
  resources?: ResourceDef[];
  actions?: ActionDef[];
  effects?: EffectDef[];
  innateSpells?: InnateSpellDef[];

  /** Kind-specific fields and `x-` extensions. */
  [key: string]: unknown;
}

/** A weapon mastery pick. See docs/schema.md, "Weapon mastery". */
export interface WeaponMasteryElement extends Element {
  kind: "weapon-mastery";
  /** The `mastery-property` element this weapon's mastery is. */
  mastery: string;
  /** The item element the pick stands for. Reference only: never added to the inventory. */
  weapon?: string;
}

/** A mastery property definition: text only. */
export interface MasteryPropertyElement extends Element {
  kind: "mastery-property";
  /** Short key used in `mastery:<key>` tags, e.g. "sap". */
  key: string;
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

/**
 * Whether an element's `levels` map is keyed by the level of the class that
 * governs it, or by the character's total level.
 *
 * Defaults to `class`, which is every 2014 element: a subclass catches up to
 * the class that offered it. A 2024 species stages its traits against total
 * character level instead, and says so.
 */
export type LevelBasis = "class" | "character";

/** A level entry in a class or subclass progression. */
export interface LevelEntry {
  grants?: Grant[];
  choices?: ChoiceDef[];
  modifiers?: Modifier[];
  resources?: ResourceDef[];
  actions?: ActionDef[];
  effects?: EffectDef[];
  innateSpells?: InnateSpellDef[];
  text?: string;
}

export type ProgressionKind = "full" | "half" | "third" | "pact" | "none";
export type PreparationKind = "prepared" | "known" | "spellbook";

/** A spell pick granted by a class level that the known/prepared counts do not cover. */
export interface ExtraSpellPick {
  /** Class level that grants it. */
  level: number;
  /** How many spells. */
  choose: number;
  /** Spell levels allowed. Absent means any the character can cast. */
  spellLevels?: number[];
  /** Whether the spell may come from any class's list, not only this one's. */
  anyClass?: boolean;
}

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
  /** Spells known, for `type: "known"`. Counts non-cantrip spells chosen. */
  known?: Expr;
  /** Spells prepared each day, for `type: "prepared"` and `"spellbook"`. */
  prepared?: Expr;
  /** How many spells the book holds, for `type: "spellbook"`. Advisory: scrolls add more. */
  spellbook?: Expr;
  /** Highest spell level that may be learned. Defaults to the highest slot level held. */
  maxSpellLevel?: Expr;
  /** Picks that sit outside the progression above: Mystic Arcanum, Magical Secrets. */
  extra?: ExtraSpellPick[];
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
  /**
   * Resources pinned to the sheet's stat cluster, most wanted first. Pool keys,
   * bare resource ids, or a slot target ("slots.3", "pact"). The most specific
   * of the three pin layers.
   */
  pins?: string[];
}

export type AbilityMethod = "point-buy" | "standard-array" | "rolled" | "manual";
export type HpChoice = "max" | "average" | number;

export interface BuildLevel {
  class: string;
  /** Subclass is recorded as a choice, not here, so the choice id stays authoritative. */
  hp: HpChoice;
  choices?: Record<string, string[]>;
}

/**
 * A level in the planned queue: picks made for a class level the character hasn't
 * reached. The array is ordered, and that order is the plan.
 */
export interface PlannedLevel {
  class: string;
  classLevel: number;
  choices: Record<string, string[]>;
  /** Hit points, carried so that dragging a level below the divider and back loses nothing. */
  hp?: HpChoice;
  /**
   * A place in the queue held on purpose, even with no picks in it. Without it an
   * empty entry is indistinguishable from one that was never made, and clearing
   * its last pick would drop the level back to the end of the queue.
   */
  queued?: boolean;
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
  /** Sets the damage counter outright: what the sheet's "=35" entry commits. */
  | { t: string; type: "hp.set"; damage: number; note?: string }
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
  /**
   * Learned outside the class's own progression (a scroll, a feat, an item). Never
   * counts toward cantrips, known, prepared or the spellbook.
   */
  extra?: boolean;
  notes?: string;
}

export interface SpellsFile extends CharacterFile {
  kind: "spells";
  spells: SpellEntry[];
}

export interface InventoryEntry {
  /**
   * This entry's own id, given when it is added; stable for the life of the entry and
   * unique within the file. `container` points at it. Required.
   */
  uid: string;
  /** Reference to source content. Mutually exclusive with `item`. */
  id?: string;
  /** An inline custom item, same element format as source content. */
  item?: Partial<ItemElement>;
  quantity?: number;
  equipped?: boolean;
  attuned?: boolean;
  /** The `uid` of the entry that holds this one (a bag, a chest). Not an element id. */
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
  /** A UUID, made when the character is created, that names it whatever its folder is called. Required. */
  id: string;
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
  | "unknown-activation"
  | "unresolved-reference"
  | "missing-source"
  | "expression-error"
  | "expression-cycle"
  | "unmet-requirement"
  | "invalid-element"
  | "overridden"
  | "spell-mismatch"
  | "spells-over-limit"
  | "spell-level-too-high"
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
 * An action the rules define: Dash, Dodge, Help, Grapple.
 *
 * The distinction worth holding on to: an element of this kind *is* an action, so
 * what it costs is a property of the element. An element that *grants* an action —
 * Rage, Second Wind — carries an `actions` part instead, and the cost belongs to
 * the part. A spell is the precedent for the descriptive half: it carries
 * `castingTime` at element level and an `actions` part for the castable thing.
 *
 * `activation` is open like `ActionDef`'s, so an unknown value degrades to a
 * warning with the text still displayed. "special" is what a cost that varies
 * converts to.
 */
export interface ActionElement extends Element {
  kind: "action";
  activation: Activation;
}

/**
 * A skill, and the ability its checks use.
 *
 * `skills.*` is an open family: core declares the stat path, content declares its
 * members. The engine therefore carries no list of skills — which ability
 * Acrobatics uses is a rule, and rules live in content.
 *
 * `key` is what a modifier targets (`skills.animal-handling`) and defaults to the
 * id's last segment, the same rule a class's `key` follows.
 */
export interface SkillElement extends Element {
  kind: "skill";
  key?: string;
  ability: Ability;
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
  /**
   * The value this stat is not *expected* to exceed: 20 for an ability score.
   *
   * Advisory, and deliberately not enforced by the engine — a Tome of Clear
   * Thought legitimately takes a score past 20, and a table may houserule the
   * cap anywhere. The builder asks for confirmation when a change would cross
   * it; nothing clamps.
   */
  softMax?: number;
}
