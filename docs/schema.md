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
| `resources` | A pool with an expression `max` and a `recharge` rule. |
| `actions` | Something the player activates: `activation`, optional `cost`, optional `applies` naming an effect, plus `range`, `target`, `damage`, `damageType`, `save`, `recharge`. |
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
  or a map keyed by level.
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

## Expressions

References `@abilities.con.mod`, `@prof`, `@level`, `@level(monk)`,
`@table(barbarian, rages)`; arithmetic `+ - * /`; functions `floor`, `ceil`, `min`, `max`.
Parsed by a small parser — **never `eval`**. Dice and damage are strings in standard
notation and may embed expressions: `"2d6 + @abilities.str.mod"`.

Stats resolve lazily with cycle detection: a CON modifier feeding HP needs no declared
order, and a stat depending on itself reports `expression-cycle` and yields 0.

## Versioning and conformance

- Content is validated by `npm run validate -- <source> --strict`, which shares the
  plugin's validator. Core fields are strict; `x-` keys are allowed and ignored.
- Ids are namespaced by source; a later source may replace or patch an earlier element,
  resolved by source priority.
- A change to this document is a change to the schema. It wants a matching change to
  `types.ts`, to the validator if the rule is checkable, and a test in `tests/content` or
  `tests/srd/`.
