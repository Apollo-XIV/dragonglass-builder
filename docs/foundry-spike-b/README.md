# Spikes B and C: dnd5e 5.3.3 in a Foundry world

Probes for what the dnd5e system accepts and does with a character written the way the exporter would write
it (Spike B), and what a Player-role user may create (Spike C). Nothing here is the exporter and no module
code is involved. Target: **dnd5e 5.3.3** (tag `release-5.3.3`), Foundry VTT 13.347 or later.

| File | What it is |
| --- | --- |
| `a-create-world-items.js` | Macro A: four world feature items at fixed ids, the grant targets |
| `b-create-actor.js` | Macro B: a level-1 character, class advancement pre-filled, granted items created with `createEmbeddedDocuments` |
| `c-verify.js` | Macro C: prints each class item's advancement ledger and the actor items it maps to |
| `CHECKLIST.md` | Steps B1 to B4 and C1 to C2, each with its expected result |
| `RESULTS.md` | Template to fill in as you go |
| `spike-b-actor.json` | An earlier import-file probe (see below) |

Run order: A, B, then follow `CHECKLIST.md`; C is run after each step to read the ledger.

## The 5.3.3 data model the macros use

Paths are under `module/` in `foundryvtt/dnd5e` at `release-5.3.3`.

| Field | Where |
| --- | --- |
| `system.advancement` is an **object keyed by advancement `_id`** (arrays are migrated into it) | `data/item/templates/advancement.mjs`, `data/fields/advancement-collection-field.mjs` |
| Advancement base: `_id`, `type`, `configuration`, `value`, `level`, `title`, `hint`, `icon`, `classRestriction` | `data/advancement/base-advancement.mjs` |
| Class: `identifier`, `levels`, `hd.denomination`, `hd.spent`, `hd.additional`, `primaryAbility`, `properties`, `spellcasting` | `data/item/class.mjs` |
| `HitPoints`: `value` is `{ [level]: "max" \| "avg" \| number }`; no data model of its own | `documents/advancement/hit-points.mjs` |
| `ItemGrant` configuration: `items[{uuid, optional}]`, `optional`, `spell` | `data/advancement/item-grant.mjs` |
| `ItemGrant` value: `added` is a **flat** `{ itemId: uuid }` (`storagePath` is `value.added` for every level) | `documents/advancement/item-grant.mjs` |
| `ItemChoice` configuration: `allowDrops`, `choices{level:{count,replacement}}`, `pool[{uuid}]`, `restriction{level,list,subtype,type}`, `spell`, `type` | `data/advancement/item-choice.mjs` |
| `ItemChoice` value: `ability`, `added{level:{itemId:uuid}}`, `replaced{level:{level,original,replacement}}` | `data/advancement/item-choice.mjs`; `storagePath` is `value.added.<level>` in `documents/advancement/item-choice.mjs` |
| Flags `flags.dnd5e.sourceId`, `advancementOrigin` (`<itemId>.<advancementId>`), `advancementRoot` | `documents/advancement/advancement.mjs` `createItemData` |
| `system.details.originalClass` | `data/actor/character.mjs`; `isOriginalClass` in `documents/item.mjs` |
| `system.attributes.hp.max` is `null` by default and then computed from HitPoints | `data/actor/templates/attributes.mjs` (`hitPoints`, `prepareHitPoints`), `data/actor/character.mjs` |
| `system.abilities.<id>.value` and `.proficient` | `data/actor/templates/common.mjs` |
| Feat: `type.value`, `type.subtype`, `requirements`, `properties` | `data/item/feat.mjs`, `data/item/templates/item-type.mjs` |
| `system.source.rules`, `license` | `data/shared/source-field.mjs` |
| Level change and level down | `applications/actor/api/base-actor-sheet.mjs` `#changeLevel`; `applications/advancement/advancement-manager.mjs` `forLevelChange`, `createLevelChangeSteps` |

Differences from what you may have seen in 6.x: the `reverse` of `ItemGrant` carries a `TODO ... ForceDeletion
in DnD5e 6.0`, so its removal path changes after 5.3.3; and `AdvancementCollection.length` is deprecated for `size`.

## `spike-b-actor.json`

The earlier import probe. I changed one thing: each item's `system.advancement` is now keyed by `_id`
(5.3.3's stored form) rather than an array. The array still imports through `migrateAdvancement`. Its ledger
shape was already right: `value.added` flat for `ItemGrant`. Fields outside the table above (skills,
currency, spell and weapon blocks, `movement`) have **not** been checked against the 5.3.3 source. Treat warnings
that name them as findings.
