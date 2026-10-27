# Quick reference

Full detail is in `docs/conversion-guide.md`. This is the lookup table.

## Ops

| op | Meaning | Use for |
| --- | --- | --- |
| `add` | Adds to the running value | bonuses that stack |
| `base` | A competing candidate; the highest wins | armour AC, species speed, Unarmored Defense |
| `set` | Replaces the value | overrides ("your speed becomes 0") |
| `min` | A floor | "your speed is at least 30" |
| `max` | A ceiling | caps |
| `advantage` / `disadvantage` | Roll state | advantage, with or without `when` |
| `include` | Adds to a set | resistances, languages, tool/weapon/armour proficiency |
| `proficiency` | `half`, `proficient`, `expertise` | skill and save proficiency |

## Core stat paths

```
abilities.<str|dex|con|int|wis|cha>.score
saves.<ability>        saves.all
checks.<ability>       checks.all
skills.<skill>         skills.all
ac   hp.max   initiative   proficiencyBonus
speed.<walk|fly|swim|climb|burrow>
senses.<darkvision|blindsight|tremorsense|truesight>
resistances   immunities   vulnerabilities   conditionImmunities   languages
proficiencies.<armor|weapon|tool|vehicle>
damage.<scope…>        attacks.<scope…>
spellcasting.<class>.dc        spellcasting.<class>.attack
```

Skill keys are lowercase and hyphenated: `animal-handling`, `sleight-of-hand`.

## Expressions

```
@prof                      proficiency bonus
@level                     total character level
@level(paladin)            level in one class
@table(paladin, column)    a class table column at the current level
@abilities.cha.mod         an ability modifier
floor ceil round abs min max        + - * /
```

Dice are strings and may embed references: `"2d8 + @abilities.str.mod"`.

## Recharge values

`short-rest`, `long-rest`, `dawn`, `dusk`, `turn`, `round`, `never`, `manual`.
Dawn and dusk come back on a long rest as well.

## Activations

`action`, `bonus-action`, `reaction`, `free`, `special`, `minute`, `hour`, `passive`.

## Cost keys

- `slots.1` … `slots.9` — spell slots
- `pact` — pact magic
- `hitDice.d10` — hit dice
- a bare resource id — resolved against the element's own resources first

## Requirement predicates

```json
{ "all": [
  { "type": "ability", "ability": "str", "min": 13 },
  { "type": "class-level", "class": "paladin", "min": 3 },
  { "type": "level", "min": 5 },
  { "type": "has", "id": "srd:paladin:spellcasting" },
  { "type": "proficiency", "proficiency": "stealth" },
  { "type": "spellcaster" }
] }
```

`any` and `not` take the same predicates. A `text` field overrides the generated
description. Unknown predicate types never block — they are ignored.

## Spellcasting block

```json
"spellcasting": {
  "ability": "cha",
  "progression": "full | half | third | pact | none",
  "type": "prepared | known | spellbook",
  "list": "<tag on this class's spells>",
  "startsAt": 2,
  "prepared": "max(1, @abilities.cha.mod + floor(@level(paladin) / 2))",
  "cantrips": 0
}
```

Slot tables are derived from `progression`. Never write one.
