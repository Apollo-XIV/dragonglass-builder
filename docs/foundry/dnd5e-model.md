# dnd5e data model: reference for the Foundry exporter

What the exporter writes, read from the dnd5e system source. Spike A for
[`export.md`](export.md).

**Sources**, both from `foundryvtt/dnd5e` on GitHub: tag `release-5.3.3` (the last 5.x, the current
pin candidate) and tag `release-6.0.6` (the current release). Field names come from the data models
in `module/data/`. The compendium packs are YAML in `packs/_source/`.

| Release | Foundry VTT | Note |
| --- | --- | --- |
| 5.3.3 | min 13.347, verified 14 | Pin candidate |
| 6.0.6 | min 14.367, verified 14 | Current. Advancement, activities, AC and effects reworked |

## Rules marker

Every item has `system.source` with `book`, `page`, `custom`, `license`, `revision` and **`rules`**
(`"2014"` or `"2024"`). The packs set it on every item (for example `rules: '2014'` on Rage, `rules:
'2024'` on the 2024 Dwarf). When unset it falls back to the world's `dnd5e.settings.rulesVersion`
(`legacy` or `modern`), and the item's behaviour changes with it. **The exporter always writes
`source.rules` explicitly**, which keeps a mixed character's items independent of the world setting.
Both releases have it.

## Item fields

Every item has `system.identifier` (required, a slug) and `system.description.value`.

| Item type | Type-specific fields used |
| --- | --- |
| `class` | `identifier`, `levels`, `hd` (`denomination` like `"d12"`, `additional`, `spent`), `primaryAbility`, `spellcasting`, `advancement` |
| `subclass` | `classIdentifier`, `spellcasting`, `advancement` |
| `race` (species) | `movement`, `senses`, `type` (creature type, defaults to humanoid), `advancement` |
| `background` | `advancement` |
| `feat` (features too) | `type` (`{ value, subtype }`, e.g. `class` / `barbarian`), `requirements` (text), `prerequisites`, `properties`, `activities` |
| `spell` | `level`, `school` (code, e.g. `"con"`), `properties` (set), `activation`, `duration`, `range`, `target`, `materials`, `method`, `prepared`, `ability` |
| `weapon`, `equipment`, `consumable`, `tool`, `loot`, `container` | `quantity`, `weight` (`value`, `units`), `price` (`value`, `denomination`), `rarity`, `equipped`, `attuned`, `attunement`; weapons add `type` and `damage` |

`race` is the species item type in both releases. Classes and subclasses carry an `advancement`
array (see below).

## Activities

Items act through `system.activities`. Types in 5.3.3: `attack`, `cast`, `check`, `damage`,
`enchant`, `forward`, `heal`, `order`, `save`, `summon`, `transform`, `utility`. 6.0.6 adds `teleport`.
The 5etools overlays use `utility`, `save`, `heal` and `check`, which exist in both.

## Advancement

Each advancement has `_id`, `type`, `configuration`, `value`, `level`, `title`, `hint`, `icon`,
`classRestriction`. The types in 5.3.3 are `AbilityScoreImprovement`, `HitPoints`, `ItemChoice`,
`ItemGrant`, `ScaleValue`, `Size`, `Subclass` and `Trait`.

- **`ItemGrant`** configuration: `items: [{ uuid, optional }]`, `optional`, `spell`.
  Value: `added`, a map from **the granted item's `_id` to its source UUID**.
- **Granting resolves UUIDs with `fromUuid`** (`documents/advancement/advancement.mjs`,
  `createItemData`). The granted item is cloned from that document, and the clone gets
  `flags.dnd5e.sourceId`, `advancementOrigin` (`<classId>.<advancementId>`) and `advancementRoot`.
  **So a feature can only be granted if it exists as a compendium or world document.** A feature that
  lives only inside the actor cannot be the source of a grant. This is the biggest consequence for
  full class advancement (see below).
- Compendium UUIDs have the form `Compendium.dnd5e.classfeatures.<id>`. The Barbarian's
  `Rage` is `VoR0SUrNX5EJVPIO`, for example. The packs have 22 sources, including `classes`,
  `classfeatures`, `subclasses`, `spells`, `races`, `origins24` (2024 species) and `classes24`.
- **`HitPoints`** is a class advancement with `configuration: {}` and `value: {}` in the packs.

## Actor (character)

| Path | Shape |
| --- | --- |
| `abilities.<ab>` | `value`, `proficient` (0 or 1), `max`, `bonuses`, `check`, `save` |
| `skills.<key>` | `value` (0, 0.5, 1, 2), `ability`, `bonuses`. Keys are 3 letters (`acr`, `ath`, `prc`…) |
| `attributes.hp` | `value`, `max`, `temp`, `tempmax`, `dt`, `bonuses`. See below |
| `attributes.ac` | `calc`, `flat`, `formula`… |
| `attributes.movement` | `walk`, `burrow`, `climb`, `fly`, `swim` (formula strings), `units` |
| `attributes.init`, `attributes.senses`, `attributes.spellcasting` | |
| `details.xp.value`, `details.biography.value` | |
| `currency` | keys from `CONFIG.DND5E.currencies` |
| `spells` | slot pools |
| `traits` | languages, resistances, weapon and armour proficiencies |

**AC:** with `calc: "flat"`, `attributes.ac.value` is set to `Number(ac.flat)` and nothing else is
computed (`attributes.mjs`). That's the mode for "our resolver computes AC". Its branch still exists in
6.0.6, but 6.0 adds an AC formulas field, so the mode needs re-checking there.

**HP:** when `attributes.hp.max` is `null`, the max is derived. It is the sum of the classes'
`HitPoints` advancements, plus CON, plus `bonuses` (`character.mjs`, `prepareHitPoints`). When it is set,
it is an override. The exporter has to choose. Writing our resolved max as an override keeps the
numbers exact but stops Foundry levelling HP. Leaving it `null` lets Foundry compute it, but only if its
number matches ours. Spike B tests this.

## What changed between 5.3.3 and 6.0.6

From the source diff. The shapes in this document are for 5.3.3.

- Advancement is rewritten into `*-data.mjs` files: `ItemGrant` now lives in `item-grant-data.mjs`,
  with `uuid` as a `DocumentUUIDField`. Grants still resolve with `fromUuid`. Also new: `modify-item`,
  `scale-value-data`, `item-choice-data`, `ability-score-improvement-data`.
- Activities gain `teleport`, and an `applied-behavior-field`.
- Actor fields change: a new `ac-formulas-field`, an `actor-size-field`, and changes to `simple-trait`
  and `travel`.
- Active effects gain `base` and `condition` models.
- The `source.rules` field is unchanged apart from translation strings.

So the 5.x shapes don't carry over to 6.x without a re-check. That is the reason for the pin.

## The 5etools overlays against these models

The overlays use these values, all of which exist in both releases: `itemUses` (consumption),
`creatureOrObject` (target), `temphp` (healing), `initiativeAlert` (flag), `attributes.hp.bonuses.overall`,
and `armor.type`. That shows they use current *values*. It does not show their *structure* is right.
They still have to be checked against the models before any use.

## Consequences for the design

1. **Full class advancement needs the features to exist as documents.** Options:
   - **(a)** The exporter writes a world compendium of our content and grants from it. Publishable, since
     the content is SRD. Largest change.
   - **(b)** Grant from dnd5e's own compendium UUIDs, found by name. Works only for features the system
     ships, which are SRD material, and only for the matching ruleset's pack (`classfeatures` for 2014,
     and the 24 packs for 2024). Non-SRD features can't be granted at all, so they stay flat.
   - **(c)** Flat items everywhere, with no grants. Simplest. Level-up does nothing.
   Spike B's level-2 test decides how much (b) is worth.
2. **HP** needs the override-or-derive decision (Spike B).
3. **The pin** is now a real decision: 5.3.3 is the last 5.x, and 6.0.6 is current and needs
   Foundry 14. Both are verified on v14.
