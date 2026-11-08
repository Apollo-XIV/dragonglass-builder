# The content schema

**This document is the authority on the content format.** Where it and anything else
disagree, this wins and the other is a bug — including `Obsidian 5e Builder & Sheet Design
Spec.md`, which stays the authority on *intent* and defers to this on *shape*.

Three things express the same schema, and they are kept in step deliberately:

| Artefact | Role |
| --- | --- |
| This document | Normative. Defines what a field means, not just its type. |
| `src/core/types.ts` | The machine-readable mirror. Every field here appears there. |
| `src/core/content/validate.ts` | The enforcer. Rejects what is unusable, warns about the rest. |

A field that exists in `types.ts` but is described nowhere here is not part of the schema
yet — it is a draft, and content must not rely on it. A field described here that no
validator checks is a gap in the validator, not permission to ignore the rule.

`docs/conversion-guide.md` teaches *how to decide* what a piece of book text should
become. It is a guide, not an authority; when it conflicts with this document, this wins.

## The two rules everything else serves

**1. The engine knows no rules.** There is no 5e in `src/core` — no ability score
improvement, no fighting styles, no subclasses-at-level-3. Every one of those is content
declaring a choice, and the engine's whole job is to walk declarations. If the engine has
to learn a rule to support a feature, the schema is missing vocabulary; adding a special
case to the engine is the wrong fix.

**2. Degradation is a feature.** Unknown kinds, parts, ops and stat paths are kept,
surfaced as diagnostics, and their text is still displayed. Only a missing `id`, `kind`,
`name` or `source` makes an element unusable. A converter can always fall back to a
text-only element and never has to fail.

## Elements

Every piece of rules content is an element: a JSON object identified by `id`, classified
by `kind`, attributed to a `source`, and carrying optional **parts**.

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | Namespaced, human-readable, stable: `srd:barbarian:rage`. Namespacing is by source. |
| `kind` | Yes | Open string. Must resolve to a kind definition. |
| `name` | Yes | Display name. |
| `source` | Yes | Id of a loaded `sourcebook` element. |
| `text` | Strongly recommended | Rules text. Always displayable, and the fallback for anything the parts cannot express. |
| `tags` | No | What choices and browsing filter on. |
| `requires` | No | Prerequisites. Enforced only when the builder's toggle is on. |
| `fluff` | No | Setting prose as markdown: what the thing is in the world, not what it does. An optional enhancement — a source may omit it (a published build can strip it), so nothing may depend on it. Shown above `text` wherever an element is read; rules never go here. |
| `page` | No | Number or string, shown as a badge: "PHB 48". |
| `levels` | No | Parts keyed by level, for anything that gains things as it goes. |
| `levelsBy` | No | What `levels` counts: `class` (default) or `character`. |
| `grants` `choices` `modifiers` `resources` `actions` `effects` | No | Parts. See below. |

Kind-specific fields (a class's `hitDie`, a spell's `spellLevel`, an action's
`activation`) sit alongside these, and keys prefixed `x-` are reserved for experiments the
core engine ignores.

A feature is a *container of independent parts*, because 5e routinely lumps several
separately triggered mechanics under one name. The engine handles each part on its own.

### Being a thing, versus granting one

Several kinds describe something a character *does*, and the schema keeps a consistent
line through them: **an element that *is* the thing carries its properties at element
level; an element that *grants* the thing carries a part.**

| The element | Carries |
| --- | --- |
| An `action` the rules define — Dash, Dodge, Help | `activation`, because the element is the action |
| A feature that grants one — Rage, Second Wind | an `actions` part, because the cost belongs to what it grants |
| A `spell` | `castingTime` and friends describing it, *and* an `actions` part for the castable thing |
| A `skill` | `ability`, and a `modifiers` part granting proficiency with itself |

An `action` element's `activation` is required and uses the same open vocabulary as an
`actions` part's: `action`, `bonus-action`, `reaction`, `free`, `special`, `minute`,
`hour`, `passive`. An unrecognised value is a warning with the text still shown, not a
rejection, and a cost the rules leave open ("varies") is `special`.

## Kinds are data

Kinds are declared by elements of `kind: "kind"`, carrying `key`, `label`, optional
`plural`, `tab` (which sheet or builder tab the kind lives on; `null` means untabbed),
`display` (`list` | `card` | `table`), `aliases` (legacy kind strings translated on load,
so `race` reads as `species`), `browsable` and `order`.

Core kinds ship in a built-in core source (`content/core/`, bundled at build time —
**never hand-edit it as content**). Any other source may add kinds, and the sheet grows a
tab for them with no plugin change.

## Parts

| Part | What it does |
| --- | --- |
| `grants` | Unconditionally adds other elements. A `Grant` is an element id, or `{ id, text?, notes? }` to attach authored commentary to the grant itself. |
| `choices` | A player decision. See **The choice model**. |
| `modifiers` | Passive changes to stat paths, optionally situational. |
| `resources` | A pool with an expression `max` and a `recharge` list of rules. See **Recharge rules**. |
| `actions` | Something the player activates: `activation`, optional `cost`, optional `applies` naming an effect, plus `range`, `target`, `damage`, `damageType`, `save`, `recharge`. |
| `innateSpells` | A spell cast without preparing it or spending a slot, at will or on a pool of its own. See **Granted and innate spells**. |
| `effects` | A named, toggleable overlay of modifiers with a `duration` and optional `concentration`. Active effects live in `state.5e`. |

Any part may carry its own `text` or `notes` for the part of the rule it does not
mechanise. A resource `cost` is a map of pool key to amount, or to `{ min, max }` for a
variable spend.

## The choice model

This is the whole of user-driven decision-making. There is no other mechanism, and
nothing about a particular decision is known to the engine.

```jsonc
{
  "id": "srd:paladin:fighting-style",  // identity; see "Where answers live"
  "name": "Fighting Style",
  "count": 1,                           // how many picks; >= 1
  "repeatable": false,                  // may one option be picked more than once?
  "maxPer": 2,                          // ...and at most how often? defaults to count
  "from": { "kind": "fighting-style", "tags": ["paladin-fighting-style"] },
  "requires": { /* gate on the choice as a whole */ },
  "text": "…", "notes": "…"
}
```

### Options are elements

A choice's options are **elements matched by its `from` filter**, drawn from every loaded
source, which is why correctly tagged homebrew appears in the right choice automatically.
An answer is therefore a list of element ids, and an id that matches no loaded element is
kept and reported as `unresolved-reference` rather than dropped.

This is a deliberate constraint, and it has a consequence worth stating plainly: a
decision whose outcome is *not* an element cannot be expressed. "Choose an ability score
to raise" is not expressible as `from`; "choose the Ability Score Improvement element,
which itself offers the six +1 elements" is. The schema's answer to parametrised choices
is **nesting**, not a new option source. See `docs/plan-2024.md` for where that stops
being sufficient.

### Nesting

A chosen element is collected exactly like a granted one: its modifiers apply, its
resources appear, **and its own `choices` are declared in turn**. Nesting is therefore
free and unbounded — it is the same mechanism one level down, not a feature.

This is how a subclass works (choose a subclass → its progression declares its own
choices), and it is how any "pick a thing, then configure the thing" rule is modelled:

```jsonc
// The option a player picks at an ASI level…
{ "id": "srd:feature:ability-score-improvement", "kind": "feature",
  "tags": ["ability-score-improvement"],
  "choices": [{ "id": "srd:asi:points", "count": 2, "repeatable": true,
                "from": { "kind": "ability-point" } }] }

// …and the options its nested choice offers. `ability-point` is an untabbed
// kind, like skill or language: a mechanism a feature spends, not a feature.
{ "id": "srd:ability-point:str", "kind": "ability-point", "name": "Strength +1",
  "modifiers": [{ "target": "abilities.str.score", "op": "add", "value": 1 }] }
```

The player picks ASI (or a feat — a sibling option, so the branch costs no vocabulary),
and the ASI element then asks which abilities to raise. `count: 2` with
`repeatable: true` expresses +1/+1 to two abilities *and* +2 to one, because the same
option may be answered twice.

Recursion is cycle-guarded, so content that grants its way back round to itself stops
rather than looping.

### Occurrences

An element may appear in a character more than once, and each appearance is an
**occurrence** that owns its own subtree: its parts apply again, and its nested choices
are asked again and answered independently.

An occurrence is created per pick, per choice instance. Concretely:

- The same option picked twice in one `repeatable` choice is two occurrences, so two `+1`
  modifiers apply and the score goes up by 2.
- The same element picked by two *different* choices — Ability Score Improvement at class
  levels 4, 8 and 12 — is one occurrence each, so each level asks its own nested question
  and gets its own answer.
- Within one occurrence, the grant graph is walked once. An element reached twice by
  different paths under the same occurrence contributes once.

A choice that is not `repeatable` must not record the same id twice; the builder will not
offer it.

**The one limit worth knowing.** An answer is addressed by choice id, scope and level, not
by occurrence — so two occurrences of the same element *in the same place* share one
answer to any choice they declare. Picking the same element twice in one repeatable choice
is fine when its options are leaves, which is what ability points are; it is not yet a way
to ask the same follow-up question twice. Occurrences at different levels are unaffected,
because the level is part of the address, which is why an ASI at 4 and at 8 each get their
own answer.

### Where answers live

An answer is stored **where the choice was declared**, which is what keeps a repeated
choice id unambiguous:

| Choice declared by | Answer stored in |
| --- | --- |
| A class or subclass `levels` entry, or anything reached from one | `build.levels[i].choices[choiceId]` |
| A species, background, feat, item — anything not level-scoped | `build.choices[choiceId]` |
| A class level the character has not reached yet | `build.planned[] = { class, classLevel, choices }` |

`answerFor` in `collect.ts` reads both the level-scoped and build-scoped locations, so a
hand-edited file that puts an answer in the "wrong" one still resolves.

Planned picks are keyed by **class and class level, never character level**, so taking a
level of one class leaves another class's plans untouched. `addLevel` consumes the queue;
`removeLevel` demotes that level's picks back into it.

**The order of `build.planned` is the plan.** It is one queue across classes, and the
Progression list shows it below the PLANNED divider, under the active `levels`. Levels of
one class are always in ascending class level, in `levels` and in `planned` alike, so a
reorder never changes any level's class level: it only moves levels between the two lists
and between classes. `normalisedQueue` (`resolver/levels.ts`) enforces that and fills any
gap, and `reorderProgression` writes a drag's result. An entry may carry `hp` (so a level
dragged below the divider and back keeps its rolled hit points) and `queued: true` (a
place held on purpose when it has no picks in it).

### Validity is derived, never stored

A stored pick is *live* if the current selections lead the collector to the choice it
answers. Nothing records validity, which is what makes invalidation reversible: clearing
an option leaves its dependants in the file, inert, and putting the option back revives
them with nothing having been remembered.

One rule governs the difference, and both halves go through
`previewChange` / `commitChange`:

- A change that puts something **new** in place of the old option **removes** what
  depended on it, for good.
- A change that only **takes an option away** invalidates its dependants **reversibly**.

### Count, caps and completeness

`count` is the number of picks the choice wants; a choice is complete when it has that
many. Completeness never blocks anything — a character with open choices resolves, builds
and plays, and the UI reports the count rather than refusing to proceed.

`maxPer` caps how often any **one** option may be taken, and defaults to `count`. Together
with `repeatable` it turns a choice into a budget of points rather than a list of
outcomes, which is how one declaration covers rules phrased as a branch:

```jsonc
// "+2 to one of these three, or +1 to two of them" — 2 points, cap 2.
{ "id": "srd:asi:points", "count": 2, "repeatable": true,
  "from": { "kind": "ability-point" } }

// "+2 and +1, or +1 each" — 3 points among the three the background names, cap 2.
{ "id": "srd24:background:acolyte:abilities", "count": 3, "repeatable": true, "maxPer": 2,
  "from": { "ids": ["srd24:ability-point:int", "srd24:ability-point:wis",
                    "srd24:ability-point:cha"] } }
```

An answer that exceeds the cap is **kept and reported**, never silently obeyed or silently
rewritten: the excess picks land in the choice's `invalid` list, the character carries a
`choice-invalid` diagnostic, and the choice reads as incomplete. The builder will not
produce one — a tap with no room left clears that option instead.

## Filters

```jsonc
{ "kind": "feat" | ["feat", "feature"],  // kind is in this list
  "tags": ["a", "b"],                     // carries at least one of these
  "allTags": ["a", "b"],                  // carries all of these
  "ids": ["srd:x"],                       // always eligible, unioned in
  "exclude": ["srd:y"] }                  // removed from whatever matched
```

**Every criterion is ANDed, `ids` included.** `{ kind, tags }` narrows; it does not union.
Naming ids does not exempt them from the other criteria — `{ kind: "feat", ids: [...] }`
matches only those ids that are *also* feats, so a list of ids plus the wrong `kind`
matches nothing. To offer exactly a named set, give `ids` alone. `exclude` is applied last.
A filter must carry at least one of `kind`, `tags`, `allTags` or `ids`.

Restricting a choice to part of a set is therefore `ids` on its own, which is how a 2024
background offers the three ability scores it names rather than all six.

## Requirements

`requires` takes `all`, `any` and `not` lists of predicates, nests arbitrarily, and may
carry `text` to override the generated description.

Predicates: `{ type: "class-level", class, min }`, `{ type: "level", min }`,
`{ type: "ability", ability, min }`, `{ type: "has", id }`,
`{ type: "proficiency", proficiency, of? }`, `{ type: "spellcaster" }`.

Enforcement is a builder toggle. **With enforcement off, an unmet requirement is a warning
on the option, not a hidden option** — the player is told and allowed to proceed.

## Classes and progression

Class and subclass elements key their parts by level in a `levels` map
(`{ "1": { grants, choices, modifiers, resources, actions, effects, text } }`), so the
progression browser reads straight off the data.

- `hitDie`, optional `key` (the short name `@level(x)` and `@table(x, col)` use; defaults
  to the id's last segment), `primaryAbility`, `multiclassRequires`.
- `tables` are named columns read by `@table(class, column)`, as an array indexed by level
  or a map keyed by level. A cell the book prints as "Unlimited" is the string `"unlimited"`
  (case does not matter; `"∞"` also works) and reads as no cap: see **Unlimited resources**.
- A subclass declares its `class`, or carries the class's subclass tag, and may have its
  own `levels`, `tables` and `spellcasting`.
- The subclass is **a choice at the level the class gains it** — not a schema concept.

A **subspecies** works the same way and is the same non-concept: the species declares a
choice, and `subspecies` elements carrying its tag are the options. A subspecies' own
traits are `species-trait` elements, tagged after the subspecies. Nothing links a
subspecies to its species except that tag, which is what lets a later source add one.
- `spellcasting`: `ability`, `progression` (`full` | `half` | `third` | `pact` | `none`),
  `type` (`prepared` | `known` | `spellbook`), `list` (the spell list tag), `startsAt`,
  and optional count expressions. Multiclass slot totals derive from the progressions.
  The counts each mean one thing, so a reader never has to guess from `type`:

  | Field | Counts |
  | --- | --- |
  | `cantrips` | cantrips known |
  | `known` | spells known (`type: known`) |
  | `prepared` | spells prepared each day (`prepared`, `spellbook`) |
  | `spellbook` | spells the book holds (`spellbook`); advisory, because scrolls add more |
  | `maxSpellLevel` | highest spell level learnable; defaults to the highest slot level held (the pact slot level for `pact`) |
  | `extra` | picks outside the above: `{ level, choose, spellLevels?, anyClass? }`, one per class level that grants them (Mystic Arcanum, Magical Secrets) |

  A spell learned outside the class's progression (a scroll, a feat, an item) is stored in
  the spells file with `extra: true`. It never counts toward any figure above, and the
  builder adds it through its own picker.

### Granted and innate spells

Two ways a character has a spell they did not choose from the class's list. Neither counts
against `cantrips`, `known`, `prepared` or `spellbook`, neither is checked against the class's
spell list, and neither can be removed from the spells file, because neither is in it.

**Always prepared: `grants` a spell.** A spell element in any `grants` (a class or subclass
level, a feature, a species, an item) is always prepared and takes no room. This is the whole
representation for domain, oath and circle spells and for Paladin's Smite ("you always have
Divine Smite prepared"). The spell is owned by the class whose level granted it, which is what
matters for a multiclass character. `SpellEntry.alwaysPrepared` is the same thing for a spell
the player writes into the spells file by hand.

**Innate: the `innateSpells` part.** A list on an element or a level entry:

```json
"innateSpells": [
  { "spell": "srd:spell:mage-armor", "ability": "cha", "notes": "On yourself, no slot or material components." },
  { "spell": "srd:spell:misty-step", "ability": "cha", "uses": 1,
    "recharge": [{ "on": "long-rest", "amount": "all" }] }
]
```

| Field | Meaning |
| --- | --- |
| `spell` | The id of a spell element. Required; an unknown id is an `unresolved-reference` warning. |
| `ability` | Casting ability, for the save DC and attack shown with the spell. Defaults to the owning class's; absent when neither exists. |
| `uses` | Casts before it recharges (an expression). Omitted means **at will**. |
| `recharge` | The same rules as a resource's; empty or omitted means the uses do not come back. Meaningless without `uses`. |
| `text`, `notes` | Conditions on the cast, shown with it. |

With `uses`, the engine creates a resource for the cast, id `innate-<spell>` on the owning
element, named for the spell. That is the only thing that makes it spendable: rests, the
event log, pinning and the sheet's resource list treat it like any resource, and the resolved
spell's `innate[].resource` names its key.

The spell is listed with `innate` set and `innateOnly: true` if nothing else puts it there. It
is not prepared and the checkbox is disabled. If the player has also picked the spell as one
of their own, it is one resolved spell: `innateOnly` is false, it counts as a normal pick, and
`innate` lists each way it can be cast. Two sources of the same spell are two `innate` entries
with separate pools.

A cast from a different source keeps its own pool: a species' Misty Step and an invocation's
Misty Step do not share uses.

#### Spells and abilities that are a choice

`InnateSpell.spell` and `InnateSpell.ability` may each be `{ "choice": "<choice id>" }` instead
of a fixed value. The id names a `ChoiceDef` declared **anywhere in the same owning element**: on the element
itself or in any of its level entries, whichever the part is in. A lineage declares its ability
choice once and every level entry that needs it just refers to it. (If two places in the element
declare the same id, the one beside the part is read first, then the element's, then the level
entries in order.) The part reads the answer, so there is no new kind of choice, and
validity works as it always does: until the choice is answered the part is inert (no spell is
listed, no pool exists), and answering it brings it to life.

- **`ability: { choice }`**: the answer is an element that carries an `ability` field
  (`"int"`, `"wis"`...). The options are ordinary elements of a kind the source defines (say
  `casting-ability`), one per ability; the choice is `{ "from": { "kind": "casting-ability",
  "ids": [...] } }` to offer three of them. Every innate spell naming the same choice uses the
  same ability, which is how a lineage picks once for all its spells. An unanswered choice leaves
  `ability` unset, so the owning class's applies, or none.
- **`spell: { choice }`**: the answer is a spell element. The pick is also collected like any
  chosen element, so a spell picked this way is **granted** (always prepared, free, off the class
  list without complaint) as well as innate: it is one resolved spell with `alwaysPrepared` and
  an `innate` entry. A choice with `count` above 1 applies the part to **each pick**: Magic
  Initiate's two cantrips are one `innateSpells` entry naming a `count: 2` choice, and both are
  cast with the chosen ability. Each pick has its own `innate-<spell>` pool if the part has
  `uses`. An `ability` reference always reads its first pick, since it is one decision.

```json
{ "id": "srd24:feat:magic-initiate-wizard", "kind": "feat", "name": "Magic Initiate (Wizard)", "source": "srd24",
  "choices": [
    { "id": "ability", "count": 1, "from": { "ids": ["srd24:casting-ability:int", "srd24:casting-ability:wis", "srd24:casting-ability:cha"] } },
    { "id": "spell",   "count": 1, "from": { "kind": "spell", "tags": ["wizard-spell"], "allTags": ["spell-level:1"] } }
  ],
  "innateSpells": [
    { "spell": { "choice": "spell" }, "ability": { "choice": "ability" }, "uses": 1,
      "recharge": [{ "on": "long-rest", "amount": "all" }] }
  ] }
{ "id": "srd24:casting-ability:int", "kind": "casting-ability", "name": "Intelligence", "source": "srd24", "ability": "int" }
```

A `Filter` cannot ask for a spell's level, so "a level 1 spell" is a tag the source puts on its
spells (`spell-level:1`, in the manner of `mastery:<key>`); the schema reserves no such tag.

A 2024 lineage is the same with only the `ability` reference, on several `innateSpells`
entries that name one choice. Each spell's pool is `innate-<spell>` on the owning element, so a
different pick moves the pool with it. A spell the player picked for itself and also gets
innately is still one spell with an `innate` entry for each way of casting it.

### Spell grant modes

A spell element in `grants` is **always prepared and free** unless the grant says otherwise.
A grant written as an object can name a `mode`:

| `mode` | Meaning |
| --- | --- |
| `always-prepared` | The default, and what a bare id means. Prepared, takes no room, not in the spells file, not checked against the class list. |
| `learned` | Added to the spells known or the spellbook. Not prepared until the player prepares it (the sheet writes the spells file's entry for that), not removable in the builder, and not checked against the class list. |

`counts` (default `true`, only meaningful with `learned`) says whether the spell fills a slot
in the owning class's limits: spells known, spells in the book, cantrips known and, once
prepared, spells prepared. The 2014 Bard's Magical Secrets counts (the text includes them in the Spells
Known column); 2014 College of Lore's Additional Magical Secrets and the 2024 Evoker's free
spellbook spells (`"counts": false`) do not. A learned spell that does not count is skipped by
the over-limit and level-too-high warnings.

```json
"grants": [
  { "id": "srd24:spell:detect-magic", "mode": "learned", "counts": false },
  "srd:spell:shield"
]
```

The grant's class is the class whose level carries it, as for any grant. A grant's `mode` applies
to the spell it names, not to what that element grants in turn.

A **choice of spells** takes the same two fields, `mode` and `counts`, and applies them to every
pick. Without `mode` a picked spell is granted as above (always prepared, free). With
`"mode": "learned"` each pick is added to the spells known or the spellbook: held, unprepared
until the player prepares it, not checked against the class list, and counting against the
owning class's limits unless `"counts": false`. The owning class is the class whose level entry
declares the choice, as for a grant (a subclass's levels belong to its class).

```json
{ "id": "magical-secrets", "count": 2, "from": { "kind": "spell" }, "mode": "learned" }
{ "id": "evoker-spells",   "count": 2, "from": { "kind": "spell", "tags": ["wizard-spell"] },
  "mode": "learned", "counts": false }
```

The 2014 Bard's Magical Secrets is the first (it fills known spells); College of Lore's Additional
Magical Secrets and the 2024 Evoker's free spellbook spells are the second. `mode` on a choice of anything but spells does nothing and
is a validator warning when the filter's `kind` says so.

### Extending a class's spell list

A class's spell list is a tag on each spell. `spellListAdditions` is a part, on an element or a
level entry, that adds **options** to one class's list. It grants nothing: the spells appear in
that class's pickers, and a spell picked from them is not a `spell-mismatch`, nothing more.

```json
"spellListAdditions": [
  { "spells": ["srd:spell:burning-hands", "srd:spell:command"] },
  { "class": "srd24:class:bard", "fromClasses": ["srd24:class:cleric", "srd24:class:druid", "srd24:class:wizard"] }
]
```

| Field | Meaning |
| --- | --- |
| `class` | The class whose list grows. Defaults to the class that owns the part (a subclass's `levels` belong to its class). Required on a part no class owns, such as a feat; without it the part does nothing and says so. |
| `spells` | Spell element ids, added one by one. An unknown id is an `unresolved-reference` warning. |
| `fromClasses` | Class element ids whose entire spell list (their `spellcasting.list` tag) is added. |

A part waits for its level like any other, and for the target class to be one the character
casts with. The resolver reads the result as
`spellcasting.classes[].listAdditions: { spells, lists }`. This covers 2014 expanded lists
(Fiend's, as `spells` on a level-1 entry) and 2024 Bard Magical Secrets (`fromClasses`, on the
level that gives it). Granting the same spell for free is `grants`, a different thing.

### Unlimited resources

A resource whose `max` evaluates to unlimited has no cap. The one way to write it is a class
table cell of `"unlimited"` read by `@table`: Rages at 2014 level 20 is
`"tables": { "rages": [2, 2, 3, ..., 6, "unlimited"] }` with `"max": "@table(barbarian, rages)"`.
The expression evaluates to infinity; `max: "unlimited"` written straight into a resource is not
a form, and arithmetic on it is not meaningful (`0 * unlimited` is not a number).

`ResolvedResource.unlimited` is then true and `max` and `remaining` are infinity in memory. The
sheet shows ∞ and never refuses to spend; nothing is tallied, so there is nothing to restore and
rests skip the pool. Actions whose `cost` names it are always available.

**What a converter must not guess.**

- A spell in `grants` with no `mode` is always prepared and free. Only map 5etools
  `additionalSpells` to `learned` where the text says the character *learns* it, and to
  `spellListAdditions` where it only says the spell is on the list.
- Where `additionalSpells` lets the player choose the ability, use `ability: { choice }` and
  declare the choice; do not pick one.
- `Action.recharge` is its own type, a single descriptive word, and is not a `RechargeRule[]`.
- Ritual-only casting is not modelled. Report it, and leave it as text.

### Weapon mastery

A weapon mastery pick is an ordinary choice whose options are two core kinds, in the manner of
`ability-point`: elements that exist to be chosen.

| Kind | One per | Fields |
| --- | --- | --- |
| `weapon-mastery` | kind of weapon | `mastery` (the id of its property, required), `weapon` (the item it stands for, reference only), `tags`, no `text` of its own |
| `mastery-property` | mastery property (Cleave, Graze, Nick...) | `key` (`"sap"`), `text` (the rules text, required) |

```json
{ "id": "srd24:mastery-property:sap", "kind": "mastery-property", "name": "Sap", "source": "srd24",
  "key": "sap", "text": "If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn." }
{ "id": "srd24:mastery:longsword", "kind": "weapon-mastery", "name": "Longsword", "source": "srd24",
  "weapon": "srd24:item:longsword", "mastery": "srd24:mastery-property:sap",
  "tags": ["martial-weapon", "melee-weapon", "mastery:sap"] }
```

- **A pick is not the item.** It is a different element, so choosing one collects no parts from
  the weapon and never touches `inventory.5e`. `weapon` is for display and for tools that
  want to join the two; nothing in the engine reads it.
- **Tagging.** A pick carries the weapon's own tags (`simple-weapon`, `martial-weapon`,
  `melee-weapon`, `ranged-weapon`, `finesse`, `light`...) so a class's pool is an ordinary
  filter (`tags` any, `allTags` all), plus `mastery:<key>` for its property. A pick that names
  a property but lacks that tag, or whose `mastery` is not a loaded `mastery-property`, is a
  warning on load.
- **How many.** `Choice.count` is a number, so "2 at level 1, 3 at 4" is one choice per level
  the total rises, as for fighting styles.
- **Text.** The pick has none; the resolver reads `**<Property>.** <text>` from the property
  for the sheet's Features list, the detail sheet and the picker. A pick's own `text` wins.
- **The sheet.** `weapon-mastery` is on the `features` tab, so chosen picks list with the
  class's features, grouped under the class that offered them.
- **Not modelled.** "With which you have proficiency" is not stateable per option. Re-picking
  on a long rest is an ordinary edit of the answer in the builder; there is no rest behaviour.

A class's class level is **how many `levels` entries the build has for it**, which is why
nothing renumbers when a level is removed.

### Staging against character level

`levels` is not only for classes. Any element may carry one, and `levelsBy` says what the
keys count:

| `levelsBy` | Read against | Used by |
| --- | --- | --- |
| `class` (default) | The level of the class that governs the element | A class, and a subclass catching up to the class that offered it |
| `character` | Total character level | A species whose traits arrive as the character grows |

Total character level is just how many entries `build.levels` has, so nothing progresses on
its own clock — a trait staged at level 5 belongs to the fifth build level, and rides along
with it when that level is removed. Multiclassing counts: three levels of one class and two
of another is a level-5 character.

**A `levels` map with the default basis on something no class governs is read by nothing**,
which is a mistake rather than a configuration. The validator says so at conversion time
and the resolver reports `unknown-part` at load; setting `levelsBy` either way silences it,
which is the escape hatch for a custom class-governed kind.

## Stat paths and operations

Core paths: `abilities.<ability>.score`, `saves.<ability>`, `checks.<ability>`,
`skills.<skill>`, `ac`, `hp.max`, `speed.<mode>`, `senses.<sense>`, `initiative`,
`proficiencyBonus`, `resistances`, `immunities`, `vulnerabilities`, `languages`,
`proficiencies.<type>`, `damage.<scope>`, `spellcasting.<class>.dc`. Sources may declare
more.

**`skills.*` is an open family, and content declares its members.** Core declares the
stat path; a `skill` element declares one skill and the ability its checks use:

```jsonc
{ "id": "srd:skill:animal-handling", "kind": "skill", "name": "Animal Handling",
  "source": "srd", "ability": "wis",
  "modifiers": [{ "target": "skills.animal-handling", "op": "proficiency", "value": "proficient" }] }
```

`ability` is required and must be one of the six — nothing else knows what a skill
rolls. `key` is what a modifier targets and defaults to the id's last segment, the same
rule a class's `key` follows; give it explicitly when the two differ. The modifier is the
self-granting option element pattern, which is what makes "choose two skills" need no
special handling.

The consequences are the point. A source may add a skill and it appears on the sheet, in
`skills.all` and in every skill choice with no plugin change. A vault whose sources
declare no skills has an empty skill list, which is correct rather than a gap: there is
nothing to roll.

### Families and the `.all` fan-outs

Several stat paths are families, and a modifier may address a whole family at once
instead of naming each member. The engine expands the target before anything else sees
it, so a fan-out is indistinguishable from having written the members out:

| Target | Expands to |
| --- | --- |
| `saves.all` | `saves.str` … `saves.cha` |
| `checks.all` | `checks.str` … `checks.cha` |
| `abilities.all.score` | `abilities.str.score` … `abilities.cha.score` |
| `skills.all` | every **declared** skill (see above) |
| `spellcasting.all.dc` / `spellcasting.all.attack` | the same path for each class **this character casts with** |

The last two are the ones worth understanding, because their members are not fixed. A
skill's family comes from *content*, so a source that adds a skill gets it covered with no
plugin change. A spellcasting family comes from *the character*: `spellcasting.all.dc` on a
Rod of the Pact Keeper means the classes its holder actually casts with, it reaches both
halves of a wizard/cleric, and it expands to nothing at all for a fighter — which is
correct, rather than a modifier landing somewhere arbitrary.

**`attacks.all` is deliberately not a fan-out.** Its member is the weapon in hand, which
nothing knows until an attack is assembled, so `resolver/attacks.ts` reads `attacks.all`,
`attacks.melee` / `attacks.ranged` and `attacks.<item id>` itself when it builds one. The
same goes for `damage.*`.

Operations: `add`, `multiply`, `set`, `min` (a floor), `max` (a ceiling), `advantage`,
`disadvantage`, `include` (add to a set), `proficiency` (`none` | `half` | `proficient` |
`expertise`), and `base` (a competing formula).

**Stacking.** `base` candidates compete and the highest wins — including the stat's own
computed base, which is how unarmoured AC loses to chain mail. Modifiers sharing a
`stackKey` do not stack; the largest applies. Everything else accumulates.

**Order.** The stat's own base, then the winning `base` candidate, then `set`, then the
`add`s, then `multiply`, then `min` and `max`. `multiply` sits where it does because
"your speed is doubled" doubles the speed you have — bonuses included — while a floor
still holds afterwards. Several multipliers compose, the way several bonuses accumulate,
and the result **rounds down**, as 5e rounds down.

**Soft caps.** A `stat-path` element may declare `softMax` — 20 for an ability score. It is
**advisory and never enforced**: the engine does not clamp, because items legitimately take
a score past 20 and a table may houserule the cap anywhere. The builder asks for
confirmation when a change would newly cross one, the same way it asks before removing a
level, and a character already over a cap is not asked again. `floor` is the opposite and
*is* enforced, because a speed below zero is not a houserule.

**Situational modifiers.** Any modifier may carry `when: { text, context? }`. A modifier
with `when` **never folds into the value**: it attaches as an annotation, attributed to its
element, and the sheet shows it in the breakdown. `when.context` groups modifiers that
apply together so the sheet can later offer one toggle. Every op is available
situationally, not just numbers.

## Recharge rules

A resource's `recharge` is a **list** of rules, each `{ "on": <trigger>, "amount": "all" | <Expr> }`:

```json
"recharge": [
  { "on": "short-rest", "amount": 1 },
  { "on": "long-rest", "amount": "all" }
]
```

- `on` is `short-rest`, `long-rest`, `dawn`, `dusk`, `turn` or `round`. The sheet's rest buttons
  apply the rules that match: a short rest matches `short-rest`; a long rest matches
  `short-rest`, `long-rest`, `dawn` and `dusk`. `turn` and `round` are descriptive only.
- `amount` is `"all"` (the whole pool) or an expression for a number of uses, read at the
  character's level. `"all"` is reserved.
- When more than one rule matches a rest, the **largest amount** is restored. They are
  alternatives, not a sum, so a long rest never gives back more than `max`.
- An empty list means the resource never comes back by itself (a Healer's Kit).
- `ActionDef.recharge` is unchanged: a single descriptive word for an action's own recharge.

## Chosen-amount costs

An action's `cost` maps a pool to what using it spends. A number is a fixed amount. An object
`{ "min": <Expr>, "max"?: <Expr> }` lets the player **choose** the amount when they use the
action:

```json
"actions": [{
  "id": "lay-on-hands", "activation": "bonus-action",
  "cost": { "pool": { "min": 1 } },
  "heal": "@spent"
}]
```

- `min` is the least that can be spent. `max` is a **cap**, and is optional: the most that can be
  spent is the lesser of the cap and what the pool has left. No `max` means "all that is left"
  (Lay on Hands); `{ "min": 1, "max": 9 }` is Twinned Spell's 1 to 9, in sorcery points. Both are
  expressions, read at the character's level, and are rounded down to whole numbers.
- The sheet asks for the amount in a small picker when the action is used, shows what the pool has
  left, and refuses an amount outside the range. If the pool cannot cover `min`, the action is
  unavailable.
- **`@spent`** is the amount chosen. It reads in the action's own `damage`, `heal` and `duration`
  (`"@spent minutes"`), and nowhere else. An action with several chosen-amount costs reads the
  first one's. Using `@spent` with no chosen-amount cost is a validator warning.
- `heal` and `duration` are new on actions: `heal` is dice notation like `damage` and `duration` is
  free text. Both may use any expression and `@spent`. The sheet shows a heal or damage that depends
  on `@spent` as `X` until an amount is chosen, and does not roll it. It does not apply healing for
  you: Lay on Hands usually heals someone else.

## Part provenance

Any part (a modifier, resource, action, effect, innate spell, spell list addition or choice, on an
element or in a level entry) may carry an optional `provenance`, saying where it came from and
whether anyone has checked it:

```json
{ "id": "rage", "activation": "bonus-action", "cost": { "rages": 1 },
  "provenance": { "source": "pack:release-5.3.3", "review": "auto" } }
```

- `source` is `hand` (a person wrote it from the book), `approved-match` (a person approved a loose
  class-table match), `prose` (an extractor read it from the feature's text) or `pack:<tag>` (derived
  from the Foundry dnd5e system's data at that release). Any other string is kept and shown as written.
- `review` is `reviewed`, `unreviewed` (a person wrote it and no one has checked it) or `auto`
  (a tool derived it and no one has read it). Anything but `reviewed` counts as unverified.
- **It never changes behaviour.** A part with provenance resolves, spends and exports exactly as
  one without. A malformed value is a validator warning and is ignored.
- The sheet puts a small dashed marker on an action, resource, effect or feature row that has an
  unverified part, with a tooltip: "From Foundry's dnd5e data, not yet reviewed", "Read from the
  feature's text, not yet reviewed", and so on. The setting **Hide unverified markers** hides them.
- Not to be confused with a feature's export `provenance` (`class`, `classLevel`, `via`), which says
  where the *feature* came from in the character's build.

### The pool owner's bare action

A feature that owns a pool may also carry an action that only spends a use of it (the converter
writes one for 2014 Channel Divinity). While **another action** spends the same pool, Turn Undead
and Preserve Life here, the sheet leaves that bare action out: it would be a way to spend a use on
nothing. It is "bare" when it is named for the feature, costs only the pool the feature owns, and
has no `applies`, `damage`, `heal`, `save`, `duration`, `range`, `target` or `text`. With no other
spender it stays. Rage, which applies an effect, is never bare.

## Expressions

References `@abilities.con.mod`, `@prof`, `@level`, `@level(monk)`,
`@table(barbarian, rages)`; arithmetic `+ - * /`; functions `floor`, `ceil`, `min`, `max`.
Parsed by a small parser — **never `eval`**. Dice and damage are strings in standard
notation and may embed expressions: `"2d6 + @abilities.str.mod"`.

Stats resolve lazily with cycle detection: a CON modifier feeding HP needs no declared
order, and a stat depending on itself reports `expression-cycle` and yields 0.

## Inventory entries and the export

An `inventory.5e` entry has its own required `uid`, and `container` is the `uid` of the entry
that holds it, never an element id. An entry gets its `uid` when it is added in the builder.
A character's `sheet.5e` likewise has a required `id` (a UUID), made when the character is
created. Nothing assigns either to a file that lacks it: the loader and the export CLI refuse
such a character with a message saying to rebuild it. Two copies of one item are one entry
with a `quantity`, unless the item has charges, resources or attunement, or the entry has
state of its own.

`hp.levels` on the resolved character lists the hit points taken at each class level
(`resolver/hit-points.ts`), with the first-level rule applied once.

The export document that leaves the plugin is defined in `src/core/export/schema.ts`;
`docs/export-schema.json` is generated from it with `npm run export:schema`, and
`npm run export -- <character> <source>...` writes one from disk.

**Export 2.0** changed `resources[].recharge` from one word to the list of rules described
under **Recharge rules** and dropped `rechargeAmount`, which was folded into the rules'
`amount`. That changes what a field means, so it is a major version. The same release added
`spells[].innate` and `spells[].innateOnly`, and the `innate-spell` part (`from: "innateSpells"`)
on features. A cast with uses names its pool by `innate[].resource`, which is the `key` of an
ordinary `resources[]` entry. Weapon mastery picks need nothing of their own: they are
features of kind `weapon-mastery` whose `text` is already the property's.

**Export 2.1** is additive. `resources[].unlimited` is true for an unlimited pool, whose `max`
is then 0 because JSON has no infinity. `spells[].learned` and `.free` carry a learned grant.
`spellcasting.classes[].listAdditions` is `{ spells, lists }`, the ids and list tags added to
that class's options. A `spellListAdditions` part exports with kind `spell-list` and
`from: "spellListAdditions"`. An `innate-spell` part is exported **as authored**, so its `spell`
or `ability` may be a `{ choice }`; `spells[].innate` always carries the values the choices
resolved to.

**Export 2.2** is additive. `choices[].mode` (always `"learned"`) and `choices[].counts` appear
only on a choice of spells whose picks are learned; the picks themselves already carry
`spells[].learned` and `.free`. Nothing existing changed meaning, but a choice reference now
resolves from anywhere in its owning element and applies to each pick, so `spells[].innate`
can hold one entry per picked spell, each with its own `resource`.

**Export 2.3** is additive. A feature's `parts[]` entry gains two optional fields. `cost` is on an action
or toggle that spends something: a list of `{ pool, amount }` for a fixed cost or `{ pool, min, max? }` for an
amount the player chooses (see **Chosen-amount costs**), with `pool` resolved to a key that matches a
`resources[].key` (or `slots.<n>`, `pact`, `hitDice.<die>`) and the amounts evaluated at the character's
level. `max` is the content's cap and is absent when it has none, meaning "all the pool has left"; the
pool's remainder is never applied, because the export is not a play session. The authored `definition` is
still exported as written, `@spent` and all. `provenance` is `{ source, review }` as authored (see **Part
provenance**), lifted off the definition. Nothing existing changed meaning.

## Type reference

The shapes added by recharge rules, innate spells, weapon mastery, grant modes, learned choices,
spell list additions and unlimited tables, for anything that mirrors `src/core/types.ts` (the converter's
`src/types.ts` among them):

```ts
type RechargeOn = "short-rest" | "long-rest" | "dawn" | "dusk" | "turn" | "round";
interface RechargeRule { on: RechargeOn; amount: "all" | Expr }

interface Resource {
  id: string; name: string; max: Expr;
  recharge: RechargeRule[];          // required; [] = never recharges by itself
  unit?: string; die?: string; pin?: number; text?: string; notes?: string;
  // gone: `rechargeAmount`, and `recharge` as a string
}

type CostAmount = number | { min: Expr; max?: Expr };  // object = chosen when used; max is a cap
type Cost = Record<string, CostAmount>;                 // pool key -> amount

interface PartProvenance { source: string; review: string }   // see "Part provenance"
// `provenance?: PartProvenance` is optional on Modifier, Resource, Action, Effect, InnateSpell,
// SpellListAddition and ChoiceDef.

// In the export (2.3), on each feature part:
interface ExportCost { pool: string; amount?: number; min?: number; max?: number }
// `amount` for a fixed cost; `min` (and an optional `max` cap) for a chosen one.
// ExportPart.cost?: ExportCost[]; ExportPart.provenance?: PartProvenance

interface Action {
  /* ... */
  cost?: Cost;
  heal?: string;                     // dice notation; may use @spent
  duration?: string;                 // free text; may use @spent
  recharge?: "short-rest" | "long-rest" | "dawn" | "dusk" | "turn" | "round" | "never" | "manual";
  // unchanged: a descriptive word on an action, not a rule list
}

interface ChoiceRef { choice: string }   // a ChoiceDef declared anywhere in the owning element:
                                         // on it, or in any of its level entries. A choice with
                                         // count > 1 applies the part to each pick (`ability`
                                         // reads the first).

interface ChoiceDef {
  /* id, name?, count, from, requires?, repeatable?, maxPer?, text?, notes?: unchanged */
  mode?: SpellGrantMode;             // a choice of spells: "learned" holds each pick as a learned
                                     // grant does; default is granted (always prepared, free)
  counts?: boolean;                  // with "learned": fills a slot in the limits; default true
}

interface InnateSpell {
  spell: string | ChoiceRef;         // a spell element id, or the choice whose answer is one
  ability?: Ability | ChoiceRef;     // defaults to the owning class's; a choice's answer is an
                                     // element carrying `ability`
  uses?: Expr;                       // omitted = at will
  recharge?: RechargeRule[];         // only with `uses`
  text?: string; notes?: string;
}
// `innateSpells?: InnateSpell[]` is a part, on Element and on every level entry,
// beside `resources`, `actions` and `effects`.

type SpellGrantMode = "always-prepared" | "learned";
type Grant =
  | string                           // a bare id; for a spell, always-prepared
  | { id: string; text?: string; notes?: string;
      mode?: SpellGrantMode;         // for a spell; default "always-prepared"
      counts?: boolean };            // with "learned": fills a slot in the limits; default true

interface SpellListAddition {
  class?: string;                    // default: the class that owns the part
  spells?: string[];                 // spell element ids
  fromClasses?: string[];            // class element ids; their whole list is added
}
// `spellListAdditions?: SpellListAddition[]` is a part, on Element and on every level entry.

// A class table cell may be the string "unlimited" (or "∞"), meaning no cap.
type TableCell = number | string | null;

interface WeaponMastery extends Element {
  kind: "weapon-mastery";
  mastery: string;                   // id of a mastery-property
  weapon?: string;                   // id of the item, reference only
  // tags: the weapon's tags + `mastery:<key>`; no text
}
interface MasteryProperty extends Element {
  kind: "mastery-property";
  key: string;                       // "sap"
  text: string;
}
```

Always-prepared spells have no type of their own: they are a spell id in `grants`, or a grant
with `mode: "always-prepared"`.

## Versioning and conformance

- Content is validated by `npm run validate -- <source> --strict`, which shares the
  plugin's validator. Core fields are strict; `x-` keys are allowed and ignored.
- Ids are namespaced by source; a later source may replace or patch an earlier element,
  resolved by source priority.
- A change to this document is a change to the schema. It wants a matching change to
  `types.ts`, to the validator if the rule is checkable, and a test in `tests/content` or
  `tests/srd/`.
