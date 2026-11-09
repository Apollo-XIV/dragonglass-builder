# Foundry VTT export: design

The design for the Foundry VTT exporter. The intent is in the design spec's **Export → Foundry VTT**
section; this document says how to build it and what is still open. Where the two disagree, the
design spec wins and this file should be corrected.

Status: **design settled; Spike A done; Spike B written, not yet run in Foundry; Spike C outstanding**
(see [Before implementing](#before-implementing)). Nothing here is implemented.

## What is settled

- **One target: dnd5e 5.3.3's line (5.x)**, pinned as a major version in one constant in the exporter.
  The last verified 5.x release is recorded beside the pin. 6.x is supported later, once it has
  settled, and only after the converter has been verified against it.
- **No system version and no ruleset on the actor.** The Foundry world's own 2014/2024 setting
  is the user's. Each item's rules come from its element's source: `srd` is 2014, `srd24` is
  2024. Mixing rulesets across classes, species and backgrounds is the user's choice, and the
  exporter does not police it.
- **The exporter is a pure adapter.** It reads the resolver's output (`ResolvedCharacter`) and
  nothing else, plus the content index it needs to look up sources. It does not compute rules.
- **Live or level state is asked on every export**, as the design spec says. Resolve without
  state for level state, with state for live state.
- **HP maps directly** (`hp.value`, `hp.max`, `hp.temp`, `hp.tempmax`). Whether `hp.max` is an override
  or left for Foundry to derive is still open (Spike B).
- **The avatar is the actor's portrait and token image.**
- **Two export modes, a toggle on each export.**
  - **Full export**: features are written as world items, and the class's `ItemGrant`s point at them.
    Levelling works. Larger export. The items must be imported before the character.
  - **Character only**: features are plain embedded items, no grants. Smaller and faster. Levelling
    does not add features, and the export says so.
- **World items get stable IDs** derived from the element id (a 16-character hash), so a re-export
  updates the same documents instead of duplicating them.

## Where it lives

| Piece | Where | Why |
| --- | --- | --- |
| Mapping from `ResolvedCharacter` to a Foundry actor object | `src/core/export/foundry/` | Pure, testable in node, no Obsidian imports |
| Pin constant and the verified-release record | `src/core/export/foundry/pin.ts` | One place to change it |
| Writing the file, the save dialog, the live-or-level prompt | `src/obsidian/` | Anything that touches the vault or the Obsidian API |
| 5etools overlay loading (optional) | `src/node/` for the CLI and tests; plugin reads a user-chosen local path | Same split as sources |

`core/` must not import `obsidian`, as CLAUDE.md requires.

## Actor mapping

Field names below follow dnd5e 5.x as the design understands it. **Every path must be checked
against the pinned release's data models in spike A before it is written into code.**

| Foundry (`system.*`) | From `ResolvedCharacter` |
| --- | --- |
| `abilities.<ab>.value` | `abilities[ab].score.value` |
| `abilities.<ab>.proficient` | `abilities[ab].save.proficiency` |
| `skills.<sk>.value`, `.proficient` | `skills[]` by key, from `stat` and proficiency |
| `attributes.hp.{value,max,temp,tempmax}` | `hp.current`, `hp.max.value`, `hp.temp`, `hp.tempMax` |
| `attributes.ac` | `ac.value` |
| `attributes.init`, `attributes.movement` | `initiative`, `speed` |
| `details.level`, `details.xp` | `level`, `xp` |
| `currency` | `currency` |
| `attributes.senses` | `senses` |
| `traits` (resistances, languages, proficiencies) | `sets` |
| `spells.*` slots, `attributes.spellcasting` | `spellcasting.slots`, `spellcasting.classes[].ability` |
| `resources` | `resources`, where a Foundry resource slot exists |

Anything the actor object does not map is dropped, not stored elsewhere.

## Item mapping

Each feature, spell and item becomes an embedded item. The item type and the activities need
spike A.

| Element kind | Foundry item | Notes |
| --- | --- | --- |
| `class` | `class` | Carries `advancement`, see below |
| `subclass` | `subclass` | Carries `advancement` |
| `species` / `subspecies` | species item (`race` in older releases) | Confirm the type name for 5.x |
| `background` | `background` | |
| `class-feature`, `subclass-feature`, `species-trait`, `background-feature`, `feat`, `fighting-style`, `metamagic`, `eldritch-invocation`, `pact-boon` | `feat` | Confirm the subtype |
| `spell` | `spell` | Spell fields and an activity |
| `item` (weapon, armour, gear, tool, magic item) | `weapon`, `equipment`, `consumable`, `tool`, `loot`, `container` | Chosen by the content's item type |

Element kinds that are not listed have no Foundry form yet. The exporter skips them and reports
each one, so no element is dropped silently.

### Class advancement (decided: the export toggle)

Foundry levels a class by its `advancement` list. `ItemGrant` clones each granted item from a UUID
with `fromUuid`, so a feature must exist as a document first (`dnd5e-model.md`).

- **Full export.** Each feature becomes a **world item** with a stable `_id` and the source's
  `rules`, `license` and `book`. The class's `ItemGrant`s at each level point at `Item.<id>`, with
  the 5.3.3 shape from `dnd5e-model.md`. The class's `value.added` for a level it has
  reached maps each granted item's `_id` to its UUID, as the system records it. The export writes
  world items first, then the actor, and says so.
- **Character only.** Features are embedded on the actor as plain items with `flags.dnd5e` left empty,
  and no grants are written. Levelling in Foundry does not add features, and the export says so.

**Stable IDs.** Each world item's `_id` is a 16-character value derived from the element id (for
example, a truncated hash). Re-exporting a character writes the same IDs, so items update in place.
Two characters that share a feature share its world item, which is the point. An element that is
removed from a build leaves its world item in place, since another character may still use it.

## Activities

dnd5e items act through activities. The source of an activity:

1. **Our own content.** An action or spell with a cost, range, damage or save is mapped from its
   structured fields. This is the default and needs nothing outside the repo.
2. **The 5etools overlays** (`5etools-src/data/foundry-*.json`). These hold activities and effects
   for non-SRD items, keyed by `name` and 5etools `source`. They are **optional and local only**: the
   exporter reads them from a path the user chooses, and the publishable build never bundles them.
   They are also `migrationVersion: 3` data, so their shapes need checking against 5.x before use.

The join from an element to an overlay entry is by name and 5etools source. An element records the
book in `abbreviation` and `page`, not 5etools' source code, so the mapping (for example `PHB` to
`PHB`, `srd` to `PHB` for the 2014 SRD) is an explicit table, not a guess.

## Rulesets

The element's source decides the ruleset: `srd` is 2014 and `srd24` is 2024. The mapping lives
in one table and is tested. The export never writes a ruleset onto the actor.

## Attribution and the publishable build

- The SRD is CC-BY-4.0. The export carries the sourcebook attribution. **Where it goes is a
  decision**; the proposal is the actor's biography, under a line naming each loaded sourcebook.
- `fluff` is prose that is not all SRD. The exporter writes it only when the content was built
  with `--fluff`, following the same rule as the rest of the plugin. A publishable build never
  carries it.
- The MIT dnd5e software is not copied. The exporter reproduces a JSON shape and nothing else.

## Testing

- **Golden files.** Export the test characters (`Ilsa` in the vault, and the SRD content's
  paladin) and compare to checked-in JSON. Golden files are regenerated only by a deliberate command.
- **Schema check.** Each exported item and the actor are checked against the pinned release's
  data models. This test is the main protection against drift on a 5.x minor release.
- **Mapping tests** for the ruleset table, the overlay join, and each unmapped element kind
  being reported.
- **Live import** is manual. A world on the pinned release must load the file, level the class
  if advancement is used, and show mixed 2014/2024 items.

Put the tests under `tests/export/`, one file per concern, as the repo does for other engines.

## Re-verification

- On a new 5.x **minor** release: run the export tests. If they pass, update the recorded
  release. If they fail, fix the mapping and record the new release only after the fix.
- On a **6.x** release: do not change the pin until the converter has been verified against it.
  That verification is a full spike, not a test run.

## Before implementing

- **Spike A: done.** The 5.3.3 and 6.0.6 models are in [`dnd5e-model.md`](dnd5e-model.md).
- **Spike B: written, awaiting a run.** [`spike-b/`](spike-b/README.md) is a hand-written
  5.3.3 actor. It needs the user to import it into a Foundry world. It tests the level-2 grant, the
  HP override, and the mixed rulesets.
- **Spike C: to write.** Full export depends on it. Create a world item with a fixed `_id`, then
  check that a class `ItemGrant` pointing at `Item.<id>` resolves it, and that levelling the class
  grants it. Also check that re-importing the same world item updates it in place rather than
  duplicating it. This runs on the same 5.3.3 world as Spike B.

## Open questions

1. Whether `hp.max` is written as an override or left for Foundry to derive (Spike B).
2. Where the sourcebook attribution goes (proposed: the biography, and `source.license` on each item).
3. The exact 5.x release to record as the first verified one (chosen when the exporter lands).
4. Whether the 5etools overlays should be checked against 5.3.3's structure before any use.
5. Whether `CLAUDE.md`'s table of authoritative documents should list this file. Currently it does not.
