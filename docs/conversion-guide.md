# Converting rules text to content

This guide explains how a feature's printed text becomes a dragonglass **element**. It
is written for both people and LLMs: a human reads it top to bottom once, a converter
reads the cues and the worked examples.

**The core rule: mechanise what maps cleanly and leave the rest as text.** The
converter never has to fail. A text-only element is always valid, always displayable,
and always better than a wrong mechanisation. When in doubt, put it in `text` and move
on.

Run `npm run validate -- <source-dir>` on everything you write. It is the same
validator the plugin runs on load, so if it passes, the plugin will load it.

---

## 1. The shape of an element

Every piece of content is one JSON object:

```json
{
  "id": "srd:barbarian:rage",
  "kind": "class-feature",
  "name": "Rage",
  "source": "srd",
  "page": 48,
  "tags": ["barbarian-feature"],
  "text": "In battle, you fight with primal ferocity…"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Namespaced and human-readable: `<source>:<owner>:<thing>`. Lowercase, hyphens for spaces. |
| `kind` | yes | Must match a kind definition (see §2). |
| `name` | yes | As printed. |
| `source` | yes | The **sourcebook element's id**, not the repo name. Must be a loaded sourcebook or the element is rejected. |
| `text` | strongly recommended | The printed rules text, in markdown. The fallback for anything the parts can't express. |
| `tags` | no | What choices, filters and browsing key off. Get these right; they are how content finds content. |
| `page` | no | Shows as a badge: "SRD 48". |
| `requires` | no | Prerequisites. Only enforced when the builder's toggle is on. |

Then the optional **parts**: `grants`, `choices`, `modifiers`, `resources`, `actions`,
`effects`. A feature is a *container of independent parts*, because 5e often lumps
several separately triggered mechanics into one named feature. Split them; the engine
handles each on its own.

Anything prefixed `x-` is preserved and ignored, for experiments.

## 2. Kinds

`kind` must resolve to a kind definition. The built-in core source declares:

`species`, `species-trait`, `class`, `class-feature`, `subclass`, `subclass-feature`,
`background`, `background-feature`, `feat`, `feature`, `fighting-style`, `spell`,
`item`, `tool`, `language`, `skill`, `condition`.

Pick the most specific one that fits. `feature` is the generic fallback.

If a book introduces a genuinely new category of thing — psionic disciplines, say — the
source declares its own kind and the builder and sheet grow a tab for it with no plugin
changes:

```json
{
  "id": "ua:kind:psionic-discipline", "kind": "kind", "name": "Psionic Discipline",
  "source": "ua", "key": "psionic-discipline", "label": "Discipline",
  "plural": "Disciplines", "tab": "disciplines", "display": "card", "browsable": true
}
```

Legacy terminology is handled by aliases, not by rewriting content. The schema uses
current terms (`species`, not `race`); a kind definition lists `"aliases": ["race"]` and
content written as `race` loads as `species`.

## 3. Phrasing cues

These are the patterns worth learning. They cover most of a book.

| What the text says | What it usually is |
| --- | --- |
| "you gain proficiency in…" | a `modifier` with op `proficiency` (skills, saves) or `include` (tools, weapons, armour, languages) |
| "your speed increases by 10 feet" | `{ "target": "speed.walk", "op": "add", "value": 10 }` |
| "your walking speed is 30 feet" | op `base` — not `set`. See §5. |
| "you have resistance to fire damage" | `{ "target": "resistances", "op": "include", "value": ["fire"] }` |
| **"when"**, **"against"**, **"related to"**, "while…" | a **situational** modifier: add `when`. See §6. |
| "you have advantage on X" (unconditionally) | op `advantage` with no `when` |
| "you can use this feature N times" | a `resource` with a `recharge` |
| "you regain all expended uses when you finish a long rest" | `"recharge": "long-rest"` |
| "as an action/bonus action/reaction, you can…" | an `action` |
| "for 1 minute, you gain…" | an `effect` the action `applies` |
| "choose N from…" | a `choice` |
| "you learn the X spell" | `grants` the spell element's id |
| "you are immune to disease" | `{ "target": "conditionImmunities", "op": "include", "value": ["disease"] }` |
| everything else | `text`, or a `notes` on the nearest part |

## 4. Expressions

Numbers that scale are expressions, not hardcoded values.

- References: `@abilities.con.mod`, `@prof`, `@level` (character level), `@level(monk)`
  (class level), `@table(barbarian, rages)` (a class table column at the current level).
- Arithmetic `+ - * /` and `floor`, `ceil`, `round`, `abs`, `min`, `max`.
- Dice stay strings in standard notation and may contain references:
  `"2d6 + @abilities.str.mod"`.

Two habits worth keeping:

- **"a minimum of +1" means `max(1, …)`.** Aura of Protection is
  `"max(1, @abilities.cha.mod)"`, not `"@abilities.cha.mod"`.
- **Put spaces around operators.** `@prof - 1` subtracts; a hyphen directly before a
  letter is read as part of a path (`@skills.animal-handling`).

A table column is the clean way to express a per-level progression:

```json
"tables": {
  "lay-on-hands": [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]
}
```

Arrays are indexed by level, 1 first. `null` means "nothing at this level".

## 5. Stacking, and why `base` matters

Operations: `add`, `set`, `min` (a floor), `max` (a ceiling), `advantage`,
`disadvantage`, `include` (add to a set), `proficiency` (`half`/`proficient`/`expertise`),
and `base`.

**`base` candidates compete, and the highest wins.** This is how armour, Unarmored
Defense and Mage Armor coexist without any of them knowing about the others:

```json
{ "target": "ac", "op": "base", "value": "10 + @abilities.dex.mod + @abilities.con.mod" }
```

Unarmoured AC (10 + DEX) is itself a candidate, so a formula that comes out lower simply
loses. A shield is `add`, because a shield stacks with whatever you are wearing.

Use `set` only for "your speed *becomes* 0" style overrides. Prefer `base` for competing
formulas; prefer `add` for bonuses.

**Things that shouldn't stack with themselves share a `stackKey`.** Two sources of the
same named bonus → same `stackKey`, and the larger applies:

```json
{ "target": "ac", "op": "add", "value": 2, "stackKey": "shield-of-faith" }
```

Armour has typed sugar, so the dex formula need not be written by hand:

```json
"armor": { "base": 15, "dexMax": 2, "category": "medium", "stealthDisadvantage": true }
```

`dexMax: null` means no dex at all (heavy armour); omitting it means uncapped (light).

## 6. Situational modifiers

A modifier with `when` **never folds into the number**. It attaches to the stat as an
annotation, attributed to the element, and the sheet shows it in the tooltip. This is
deliberate: a sheet that silently adds "+1 AC while wearing armour" to a character who
isn't wearing armour is worse than one that tells you the condition.

```json
{
  "target": "saves.all",
  "op": "advantage",
  "when": { "text": "against poison", "context": "poison" }
}
```

- `when.text` is what the tooltip shows. Write it as a phrase that completes the stat:
  "against poison", "while wearing armour", "on History checks about stonework".
- `when.context` is an optional shared id. Modifiers sharing a context apply together,
  so the sheet can later offer one toggle for them. Use a stable, obvious slug.
- Every op works situationally, not just numbers. Stonecunning is a situational
  *proficiency* change (`"op": "proficiency", "value": "expertise"`); the Actor feat's
  impersonation benefit is situational advantage.

`saves.all`, `checks.all` and `skills.all` fan out to every member of the family.

## 7. Resources, actions and effects

These three work together and are easiest to learn as a set.

- A **resource** is a pool: an id, a name, a `max` expression, and a `recharge`
  (`short-rest`, `long-rest`, `dawn`, `dusk`, `turn`, `round`, `never`, `manual`).
  Use `unit` for pools counted in something other than uses ("hit points" for Lay on
  Hands). A resource id without a colon is namespaced by its element automatically.
- An **action** is something the player activates: an `activation`, an optional `cost`
  (a pool key mapped to an amount, or `{ "min": n, "max": m }` for a variable cost), an
  optional `applies` naming an effect, and optional `damage`, `range`, `save`.
  Cost keys resolve against the element's own resources first, then globally; use
  `slots.1`…`slots.9` for spell slots and `pact` for pact magic.
- An **effect** is a toggleable overlay of modifiers with a duration. The sheet records
  active effects in `state.5e` and the resolver applies their modifiers while they run.

A feature with "you can't do X while this is active" puts that in the effect's `notes`.
Restrictions are text; the engine does not police them.

## 8. Choices

```json
{
  "id": "srd:paladin:fighting-style",
  "name": "Fighting Style",
  "count": 1,
  "from": { "kind": "fighting-style", "tags": ["paladin-fighting-style"] },
  "text": "You adopt a particular style of fighting as your specialty."
}
```

**Every criterion in `from` is a constraint, and they are combined with AND.**
`{ "kind": "skill", "ids": [...six] }` means those six skills, not every skill plus
those six. To offer options across kinds, list `ids` alone.

Options come from every loaded source, so homebrew carrying the right tag appears
automatically. That makes **tags the extension point**: when you convert a class, give
its choice points a tag named after the class (`paladin-fighting-style`,
`paladin-subclass`, `paladin-spell`), and tag every option with it.

A choice declared inside a class or subclass `levels` entry is answered at that level. A
choice declared on an element is answered once. Repeating the same choice id at levels
4, 8 and 12 is fine and correct — each level stores its own answer.

Choices that grant a proficiency are modelled as **self-granting option elements**: a
`tool` element carries the modifier that grants proficiency with itself. That is why
"choose an artisan's tool" needs no special code.

## 9. Classes and subclasses

```json
{
  "id": "srd:class:paladin", "kind": "class", "name": "Paladin", "source": "srd",
  "key": "paladin",
  "hitDie": "d10",
  "spellcasting": {
    "ability": "cha", "progression": "half", "type": "prepared",
    "list": "paladin-spell", "startsAt": 2
  },
  "tables": { "lay-on-hands": [5, 10, "…"] },
  "levels": {
    "1": { "grants": ["srd:paladin:divine-sense"], "modifiers": [], "choices": [] },
    "3": { "choices": [{ "id": "srd:paladin:sacred-oath", "count": 1,
                         "from": { "kind": "subclass", "tags": ["paladin-subclass"] } }] }
  }
}
```

- `key` is the short name `@level(x)` and `@table(x, col)` use. Defaults to the id's last
  segment.
- Level entries carry the same parts as elements, keyed by **class** level.
- The subclass is a choice at the level the class gains it, filtered by kind `subclass`
  and the class's subclass tag. Nothing else is needed; the resolver catches a subclass
  up to the class's current level automatically and applies its later features as the
  class levels.
- `progression` is `full`, `half`, `third`, `pact` or `none`. Multiclass slot totals
  derive from these; you never write a slot table.
- Starting proficiencies go in `levels["1"].modifiers`.

## 10. Levels 6–20 as text

Converting a class in two passes is a legitimate and recommended workflow: mechanise
levels 1–5 fully, and convert the rest as text-only elements that are still granted at
the right level. The sheet shows them with a "not mechanised" badge, and the character is
correct in everything except the automation. Come back to them later.

## 11. Worked examples

### A multi-part feature: Rage

One resource, one action, and one effect carrying several modifiers, plus a restriction
left as text.

```json
{
  "id": "srd:barbarian:rage", "kind": "class-feature", "name": "Rage", "source": "srd",
  "tags": ["barbarian-feature"],
  "text": "In battle, you fight with primal ferocity…",
  "resources": [
    { "id": "rages", "name": "Rages", "max": "@table(barbarian, rages)", "recharge": "long-rest" }
  ],
  "actions": [
    { "id": "rage", "name": "Rage", "activation": "bonus-action", "cost": { "rages": 1 }, "applies": "raging" }
  ],
  "effects": [{
    "id": "raging", "name": "Raging", "duration": "1 minute",
    "modifiers": [
      { "target": "checks.str", "op": "advantage" },
      { "target": "saves.str", "op": "advantage" },
      { "target": "damage.weapon.melee.str", "op": "add", "value": "@table(barbarian, rage-damage)" },
      { "target": "resistances", "op": "include", "value": ["bludgeoning", "piercing", "slashing"] }
    ],
    "notes": "Can't cast spells or concentrate on them while raging."
  }]
}
```

### One resource, several actions: Ki

Three actions spending one pool, each its own button on the sheet.

```json
"resources": [{ "id": "ki", "name": "Ki", "max": "@level(monk)", "recharge": "short-rest" }],
"actions": [
  { "id": "flurry", "name": "Flurry of Blows", "activation": "bonus-action", "cost": { "ki": 1 } },
  { "id": "patient-defense", "name": "Patient Defense", "activation": "bonus-action", "cost": { "ki": 1 } },
  { "id": "step-of-the-wind", "name": "Step of the Wind", "activation": "bonus-action", "cost": { "ki": 1 } }
]
```

A Mystic-style variable cost is `{ "psi": { "min": 2, "max": 7 } }`.

### Situational modifiers: Dwarven Resilience and Stonecunning

```json
"modifiers": [
  { "target": "saves.all", "op": "advantage", "when": { "text": "against poison", "context": "poison" } },
  { "target": "resistances", "op": "include", "value": ["poison"] }
]
```

```json
"modifiers": [
  { "target": "skills.history", "op": "proficiency", "value": "expertise",
    "when": { "text": "on History checks related to the origin of stonework", "context": "stonecunning" } }
]
```

Note the split in the first one: the resistance is unconditional and folds in; the
advantage is conditional and becomes an annotation. One sentence, two parts.

### An action that costs a spell slot: Divine Smite

"Expend a spell slot of any level" has no single representation, so give the player one
button per slot level. It reads better on the sheet than a dropdown would.

```json
"actions": [
  { "id": "smite-1", "name": "Divine Smite (1st-level slot)", "activation": "free",
    "cost": { "slots.1": 1 }, "damage": "2d8", "damageType": "radiant" },
  { "id": "smite-2", "name": "Divine Smite (2nd-level slot)", "activation": "free",
    "cost": { "slots.2": 1 }, "damage": "3d8", "damageType": "radiant" }
],
"notes": "Add 1d8 against undead and fiends, to a maximum of 6d8."
```

The undead rider stays in `notes`: it depends on the target, which the engine has no
model of.

### A text-only feature

Perfectly valid, and the right answer more often than you'd think.

```json
{
  "id": "srd:fighting-style:great-weapon-fighting",
  "kind": "fighting-style",
  "name": "Great Weapon Fighting",
  "source": "srd",
  "page": 23,
  "tags": ["paladin-fighting-style", "fighter-fighting-style"],
  "text": "When you roll a 1 or 2 on a damage die for an attack you make with a melee weapon that you are wielding with two hands, you can reroll the die and must use the new roll…"
}
```

Rerolling dice is not something the sheet models, so there is nothing to mechanise. The
player reads it and applies it.

## 12. Source layout

```
my-source/
  source.json          # { "id": "...", "name": "...", "sourcebooks": ["..."] }
  content/
    sourcebook.json    # the sourcebook element: abbreviation, version, license, attribution
    species/…          # folder structure under content/ is free
    classes/…
```

Every `.json` file under `content/` is loaded. A file holds one element or an array of
them. Group however you like; the loader does not care.

The sourcebook element's **`id` is what every element's `source` field must equal**:

```json
{
  "id": "srd", "kind": "sourcebook", "name": "System Reference Document 5.1",
  "source": "srd", "abbreviation": "SRD", "version": "5.1",
  "license": "CC-BY-4.0", "attribution": "…"
}
```

Attribution is not optional for licensed content. The plugin shows the notice for every
loaded sourcebook in one place; it can only do that if you fill the field in.

## 13. Checklist

Before you call a conversion done:

- [ ] `npm run validate -- <source-dir> --strict` passes.
- [ ] Every element's `source` is the sourcebook's id.
- [ ] Every grant and choice id resolves (the validator checks this).
- [ ] Choice points carry a class-named tag, and every option carries it too.
- [ ] Scaling numbers are expressions or table columns, not hardcoded.
- [ ] "Minimum +1" wording became `max(1, …)`.
- [ ] Every conditional benefit has a `when`, and every `when` has readable `text`.
- [ ] Competing AC and speed formulas use `base`, bonuses use `add`.
- [ ] Anything not mechanised is in `text` or a part's `notes` — not dropped.
- [ ] Resolve a test character and read the sheet. Numbers on a sheet catch mistakes
      that a validator cannot.
