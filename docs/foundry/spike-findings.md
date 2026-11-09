# Foundry integration spike: findings

Branch `spike/foundry-integration`, 5 Nov 2026. Tests the design in
[`integration-design.md`](integration-design.md). Throwaway code is in
`spikes/foundry/`; nothing in `src/` changed.

**How to read this.** Each section gives findings first, then evidence. "Not verified" marks what I could
not test; nothing there is a result.

**What I ran against**

- Plugin at `b01ec9d` plus this branch; Node 22.23.
- Our converted SRD: `../5etools-to-dragonglass/out/srd` (1423 elements) and `out/srd24`
  (1631), built `--fluff`. That is the only place both rulesets exist; `content/srd` in this repo is a
  574-element hand-mechanised slice. The `fluff` text is not all SRD, so nothing here copies it.
- dnd5e `release-6.0.6` (the latest non-prerelease; `release-6.1.0` is a prerelease from 3 Nov) and
  `release-5.3.3`. ddb-importer at `a6ea7cc`, which is the commit the design cites.
- Trystero 0.26.0; Obsidian 1.14.5 (Electron 43.8.3, Chrome 150) on Linux; Firefox 158 headless.

## Summary of what the evidence contradicts

1. **`applyFeatures` / `addFeatures` / `promptAddFeatures` do not exist in dnd5e.** Zero hits in
   `release-5.3.3` and `release-6.0.6`. ddb-importer passes them, so they are dead options there too. The
   design's import step 1 (and the reason it gives for them) is wrong. See §5.
2. **The converted SRD has no mechanised class features.** 0 of 323 (2014) and 0 of 390 (2024) features
   carry a resource or toggle. The design's "v1 covers what the sheet automates today" automates nothing for
   features in the shipped SRD. See §3.
3. **Ids are not all permanent.** 17 and 18 ids in the two trees end in a numeric suffix that comes from
   the level or from a collision, so they change if content is reordered or extended. See §1.
4. **`docs/export.md` contradicts a Decided item.** It puts the dnd5e mapping and a version pin
   inside the plugin (`src/core/export/foundry/pin.ts`); the design decides the plugin carries none. It also
   pins 5.3.3 while the design says latest first. See "Decisions".
5. **The design's table has no place for hit points per level, species/background grants, pending
   choices or an inventory-entry id.** See §2.
6. **Trystero fails silently on dead relays**, which confirms the design's expectation, but a wrong key
   and a TURN-less relay-only network both do report errors, which the design didn't expect. See §6.

## 1. Schema and engine audit

**Findings**

- **Element ids are `source:owner:slug`, source-prefixed, hand-readable.** `srd:barbarian:rage`,
  `srd:spell:bless`, `srd:item:longsword`, `srd:class:sorcerer`. The middle segment is the kind for
  spells/items/classes/species and the owning class or race for features. There are no duplicate ids
  inside either tree, and the 14 (2014) and 19 (2024) same-kind-same-name pairs (two "Unarmored Defense",
  several "Darkvision") are distinguished by that owner segment. `docs/schema.md:42` already says ids are
  "namespaced, human-readable, stable". The engine does not enforce stable.
- **The design's `abbr:slug` is a different scheme from what exists.** Changing it would rewrite every id
  and every character file. The existing scheme already prefixes the source and avoids name collisions.
  Recommend keeping it.
- **Not all ids are name-derived or permanent.** 17 (2014) and 18 (2024) ids differ from `slug(name)`
  other than the six `ability-point` ids. They are positional: `srd:sorcerer:metamagic-10`,
  `srd:cleric:channel-divinity-6`, `srd:item-property:ammunition-2`, `srd:item:potion-of-healing-2`,
  `srd24:warlock:mystic-arcanum-13`. The suffix is a class level or a collision counter, so it changes if the
  converter's order changes. Choice ids are the same: `srd:paladin:asi-4`, `...:skill-1`,
  `...:metamagic-3`. Nothing reserves a removed id or records one that has been renamed.
- **Ids that characters store are already the element ids.** `build.5e` holds species, background, class
  and choice answers; `spells.5e` and `inventory.5e` hold element ids. So an id change is a character-file
  break, which is the practical case for permanence.
- **Spell and inventory entries have no id of their own.** `SpellEntry.id` is the spell's element id;
  `InventoryEntry` has `id` (element) or an inline `item`, and no instance id even though `container`
  refers to a "container entry id" (`src/core/types.ts`, `InventoryEntry`). Two copies of one item are one
  entry with a quantity. The design's "items with stable ids, containers" needs an instance id.
- **Sources are declared in three places.** `source.json` (`SourceManifest` in
  `src/core/content/source-bundle.ts`: `id`, `name`, `description`, `sourcebooks`, `schemaVersion`); the
  `sourcebook` element (`abbreviation`, `version`, `license`, `attribution`, `url`); and the character's
  `sources.5e` (`SourceRef`: `id`, `type`, `location`, `pin`). Mapping onto the design's `source.json`:

  | Design field | Already exists as |
  | --- | --- |
  | `id`, `name` | `source.json` `id`, `name` |
  | `abbr` | sourcebook `abbreviation` |
  | `version`, `license`, `attribution` | sourcebook element |
  | `schema` | `source.json` `schemaVersion` |
  | `ref` | `SourceRef.pin` for GitHub; **nothing for a path, vault or zip source** |

  Reconciled proposal: do not add a second manifest. `source.json` gains optional `version` (so a DM need
  not open the sourcebook), the sourcebook stays the authority for licence and attribution, and `ref` is
  never authored: it is the pin for GitHub and a content hash computed at export time otherwise (the sample
  uses a SHA-256 of the file tree).
- **Parts.** `Element` and `LevelEntry` carry `grants`, `choices`, `modifiers`, `resources`, `actions` and
  `effects`. There is no "part kind" field; resource / toggle / passive has to be derived (§3). Parts live on
  the feature element or on the class `levels` entry that grants it, not always on the feature.
- **Resolved progression.** The resolver returns a flat `elements` list with `class`, `level` and `origin`
  per element, and `pendingChoices` with `levelIndex`. There is no per-level view; `export.ts` builds one in
  about 20 lines from those fields, so it is a view to write, not an engine change.
- **Headless Node: yes.** `spikes/foundry/export.ts` resolves a vault character under `tsx` with no Obsidian
  import, using `src/node/load-source.ts` and `resolve`. This is what CLAUDE.md promises.

**Evidence**

```sh
python3 spikes/foundry/classify.py srd=<out/srd> srd24=<out/srd24> slice=content/srd   # id audit is at the end of each block
npx tsx spikes/foundry/export.ts vault/Characters/Ilsa <out/srd> > spikes/foundry/sample-export.json
```

## 2. Sample export

`spikes/foundry/sample-export.json` (20 KB) is the real resolved export of `vault/Characters/Ilsa`: a level-2
Gnome Sorcerer, with the SRD source only, and `fluff` stripped. It has the envelope, identity, progression
with provenance, 10 features, 8 spells, 5 inventory items and the seven `details` sections. The script is
`spikes/foundry/export.ts`.

**Where the design's shape did not fit**

| Design says | Real data |
| --- | --- |
| Progression carries "what it granted" per level | Works for class levels (`granted` with `via`). Species and background grants are build-scope, not level-scope, so they sit under `features` with `class: null` and a `via` chain. The table needs a home for them. |
| Progression carries "choices made" | Works, but a choice can be **pending** (the sample's level 1 has an unanswered `skill-1` and `subclass`). The export has to say pending, not omit it, or the module can't tell "none chosen" from "not yet chosen". |
| Hit points are a progression concern | The build stores `hp: "average"` or `"max"` or a number; the resolver returns only the total (14). A Foundry `HitPoints` advancement needs the value taken at each level, which the engine does not expose. This is a real gap (§5). |
| "Only active picks" | Inactive picks are in `PendingChoice.invalid`; I leave them out. Fine. But planned levels are in `build.planned`; the sample correctly omits them. |
| Features carry parts with a kind | Parts are on the element, or on the class level entry. In the SRD the resource lives nowhere (§3). The sample derives a `part.kind` and labels it "derived". |
| Resources on features | Resolved resources (max evaluated) are in `r.resources`, with owner `source`. A Lay-on-Hands max is an expression over class level, so it must be exported evaluated; `resources` is therefore a top-level list. The sample's list is empty (sorcery points are unmechanised). |
| Inventory "stable ids, containers" | No instance id (§1). An unresolvable item (`srd:item:holy-symbol`, not in the converted SRD) is **dropped by the resolver**, so it is missing from the export, with only a warning in `diagnostics`. Export should keep unresolved entries by reference. |
| Spells "known, prepared, spellbook" | `prepared`, `alwaysPrepared`, `extra` and the owning `class` map cleanly. The sample has 4 known where the class allows 3, plus two spells above the castable level; the export carries the engine's warnings in `diagnostics`, which the module should surface, not fix. |
| Base ability scores | `abilityBase` plus the method. I also export the derived scores as a cross-check, not for the module to use. |
| Sources "id and version" | `ref` has no authored source (§1). The character's `sources.5e` points at an **absolute local path**, which no other machine can use; only GitHub sources carry a `pin`. |
| Details as plain text | `details.5e` is markdown with `[[wikilinks]]` and embeds. The sample exports the text unresolved. Resolving an embed needs Obsidian's API, so it has to happen in the plugin's export step, not the module. |

## 3. Feature classification

Rules used: **resource** if it has `resources`; **toggle** if it has `effects` or an action with `applies`;
**passive** if it has only `modifiers`; **structural** if it has only `choices` or `grants`; **text-only**
otherwise. Features are the kinds the exporter doc lists (class/subclass/species/background feature, feat,
fighting style, metamagic, invocation, pact boon).

| Tree | Features | resource | toggle | passive | structural | text-only |
| --- | --- | --- | --- | --- | --- | --- |
| `srd` (2014) | 323 | 0 | 0 | 11 | 22 | 290 |
| `srd24` | 390 | 0 | 0 | 4 | 32 | 354 |
| `content/srd` (hand slice, for comparison) | 25 | 5 | 0 | 10 | 1 | 7 (+2 actions-only) |

**Findings**

- **The v1 mapping automates nothing for SRD features today.** Resources and toggles together cover 0%
  of both converted trees, and 20% of the hand slice (all resources, no toggles). Nothing in any tree has
  an `effects` part or an action with `applies`, so there is no toggle anywhere to map to an active effect.
  Everything else lands as description, which is what the design says, but it means the plan's "resources
  become item uses" has no input yet.
- **That is a content gap, not a classifier gap.** 80 of the 290 text-only 2014 features and 130 of the
  354 2024 ones have text that describes a mechanic (rests, bonus actions, "uses per"): Rage, Lay on Hands,
  Divine Sense, Breath Weapon, Relentless Endurance. My keyword test is crude; read it as "roughly a
  quarter to a third need mechanising before resources and toggles mean anything", not a precise count.
- **Mechanised parts are elsewhere.** Spells carry `actions` (138 of 319, and 164 of 339 for 2024) and items
  carry `resources` (48 and 52, i.e. charges) and `modifiers`. These are not features, so the design's
  feature-only classification skips the largest mechanised population. Spells are `Spell` items in Foundry
  and are resolved from the system pack, so activities come free at tier 1.
- **The only part kinds present are `passive` and `structural`.** Passives (modifiers) have no v1 Foundry
  form in the design; they become description. That is 11 and 4 features.
- **Unclassifiable by these rules:** none in the converted trees. In the hand slice, `srd:paladin:divine-smite`
  and `srd:fighting-style:protection` are actions without a resource or effect (kind "other"). A Foundry
  activity could carry them, but the design has no row for that.

**Evidence:** `spikes/foundry/classify.py` (prints each table above plus the suspect list).

## 4. SRD id mapping

Method: load every `.yml` in `packs/_source/*` of `release-6.0.6`, and for each of our elements look for a
pack entry in the matching pack by normalised name (lower-case, apostrophes and parentheses removed).
Script: `spikes/foundry/srd-match.mjs`. "Matched" means at least one name hit, so a duplicate-name hit counts
as matched even if it is the wrong one; the ambiguous count is listed.

| Our kind | 2014 matched | 2024 matched | Ambiguous (>1 name hit) |
| --- | --- | --- | --- |
| spell | 319/319 (100%) | 339/339 (100%) | 0 |
| class / subclass | 24/24 | 24/24 | 0 |
| eldritch invocation, metamagic, pact boon, fighting style | 49/49 | 38/38 | 0 |
| background, feat | 2/2 | 21/21 | 0 |
| class-feature | 143/154 (93%) | 159/197 (81%) | 33 and 45 |
| subclass-feature | 67/83 (81%) | 70/70 (100%) | 4 and 0 |
| item | 468/590 (79%) | 424/575 (74%) | 25 and 29 |
| species / subspecies | 9/13 (69%) | 16/33 (48%) | 0 |
| species-trait | 17/34 (50%) | 38/68 (56%) | 0 |

**Mismatches by cause** (from the unmatched lists; counts are approximate where I only sampled)

1. **We have more granularity than the system.** Our items include "Ale (mug)", "Caltrop", "Ball Bearing",
   "Iron Spike", most trade goods and poisons; the system packs don't. The 2014 class-feature misses
   "Wild Shape Improvement" and "Aura improvements" are our per-level splits of one system feature. These
   are real gaps and fall through to a build (tier 4).
2. **Different model of subraces.** The system has no parent "Dwarf", "Elf", "Gnome" or "Halfling" item in the
   2014 `races` pack (only `Hill Dwarf`, `High Elf`, `Rock Gnome`, `Lightfoot Halfling`); we have the parent
   plus a subspecies. 2024 names differ: system `Gnome, Rock`, `Elf, High`; ours `Rock Gnome Lineage`,
   `High Elf Lineage`; also `Legacy` / `Ancestry` suffixes on tieflings and goliaths.
3. **Traits are not separate items in some packs.** 2014 species traits such as Darkvision, Keen Senses and
   Breath Weapon sit inside the race item or one item per colour; ours is one per trait. Names that do exist
   (Darkvision) repeat across races, so name alone is ambiguous: the system folder path is the
   disambiguator.
4. **Same name in several classes.** "Unarmored Defense", "Extra Attack", "Fighting Style" occur under more
   than one class. Matching on name plus owner token reduces 33 ambiguous 2014 class-features to 28 unique
   hits in my crude test; a proper key is (pack, parent class folder, identifier).
5. **Structural entries of ours with no system equivalent.** Our subclass "feature" entries named after the
   subclass ("Champion", "Life Domain", "Oath of Devotion") and "Barbarian Subclass" style grants are
   scaffolding for our choice model, not content.
6. **Naming and punctuation.** "Holy Water (flask)" vs "Flask of Holy Water", "Traveler's Clothes" vs the
   pack's spelling. Fixable with a small alias list.

**Stable identifiers the system uses.**

- Every document has a 16-character `_id`, assigned in the pack source (`VoR0SUrNX5EJVPIO` for Rage;
  hand-made ones like `phbbrbBarbarian0`). **Across `release-5.3.3` → `release-6.0.6` all 677 `_id`s in the
  classfeatures, spells, races, classes and subclasses packs are still present** (667 at the same path; 10
  moved folder, same id). So `_id`, and the UUID `Compendium.dnd5e.<pack>.Item.<_id>` built from it, are
  stable across this release gap. I checked only these five packs and two releases.
- Every item in the packs I read also has `system.identifier` (a slug; 235/235 classfeatures, 12/12
  classes). It is unique only within its context: both Barbarian and Monk have `unarmored-defense`. 317/319
  of our 2014 spells and 337/339 of our 2024 spells share their identifier with a pack entry by slug alone.
- Every item carries `system.source.rules` (`"2014"` or `"2024"`), which is what keeps the two rulesets'
  same-named entries apart.

**Recommended id-map approach**

- Generate `idmap.json` at build time of the module (or as a release artefact), keyed by **our element id**,
  with value `{ pack, _id, identifier, rules, via }` where `via` is how it was matched (`identifier`, `name`,
  `alias`, `manual`).
- Matching order: (1) `(rules, type, parent folder, identifier)` where our last id segment equals the
  identifier; (2) normalised name within the same parent; (3) a hand-kept `aliases.json` for the cases
  above; (4) unresolved → build.
- Keep the map out of the plugin (no dnd5e knowledge there). The module can ship it, regenerated per dnd5e
  release by a script that diffs the old and new maps and reports changed `_id`s, which should be none.
- Unmatched is the expected answer for items and for species traits, and the import report should say so
  rather than treat it as a failure.

## 5. Foundry advancement check

**Findings (dnd5e `release-6.0.6`; differences from `5.3.3` noted)**

- **Advancement base fields** (`module/data/advancement/base-advancement.mjs`): `_id`, `type`,
  `configuration`, `value`, `level`, `name` (was `title` in 5.x; migrated), `hint`, `img` (was `icon`),
  `classRestriction`, `flags`. In 6.x `title`/`icon` are migrated on load, so a document written with the 5.x
  names still loads.
- **`ItemGrant`** configuration: `items: [{ uuid, optional, sort }]`, `optional`, `sorting`, `spell`
  (`item-grant-data.mjs`). The `uuid` is a `DocumentUUIDField` with `embedded: false`, so **it must be a
  world or compendium document, never an item on an actor.** Value: `added`, a map **granted item `_id` on
  the actor → source UUID**, plus `ability` for spell grants (`documents/advancement/item-grant.mjs:159`:
  `updates[item._id] = item.flags.dnd5e.sourceId`).
- **`ItemChoice`** value (`item-choice-data.mjs:84`): `added` is a map of **level → (actor item `_id` → UUID)**,
  one more nesting level than `ItemGrant`; `replaced` maps an id to `{ level, original, replacement }`;
  `ability`. Configuration: `choices` (per level `count`, `replacement`), `pool`, `restriction`, `type`,
  `allowDrops`.
- **`HitPoints`**: configuration `{}`. The value is a map from class level to `"max"`, `"avg"` or a number
  (`documents/advancement/hit-points.mjs`, `valueForLevel`: `"max"` is the die's face, `"avg"` is
  `face / 2 + 1`). The first level of the original class is forced to `"max"` (`:169`). Our `HpChoice`
  (`"max"`, `"average"` or a number) maps one-to-one, so the engine only needs to expose it per level.
- **`ScaleValue`**: `configuration.scale` is a map from level to value, with `identifier`, `type`
  (a choice list I did not read); content can then use `@scale.<class>.<id>` (Rage's `uses.max`
  is `@scale.barbarian.rages`). Only on classes and subclasses. This is the structure behind Rage uses, and
  the module needs it for every scaling resource. `scale-value-data.mjs` is 566 lines.
- **`AbilityScoreImprovement`**: configuration `{ cap, fixed, locked, max, points, recommendation }`; value
  `{ type: "asi" | "feat", assignments, feat }`.
- **Flags** (`documents/advancement/advancement.mjs:385-391`, `createItemData`): the granted clone gets
  `flags.dnd5e.sourceId` = the source UUID, `flags.dnd5e.advancementOrigin` = `"<classItemId>.<advancementId>"`,
  and `flags.dnd5e.advancementRoot` = the root item's own root, or the origin if it has none. So the root of
  a feature granted by a class is that class's `<classId>.<advancementId>`, and a spell granted by a feature
  granted by a class keeps the class as root. Matches the design's step 4.
- **New in 6.x:** `ModifyItem` advancement (`modify-item-data.mjs`), `SpellConfigurationData`, and the data
  models moved to `module/data/advancement/*-data.mjs`. `Size`, `Subclass` and `Trait` remain.

**Does the ddb-importer approach still apply?** Partly.

- **Yes:** build class items with advancement documents; fill `value.added` (ItemGrant) and the nested
  `added[level]` (ItemChoice); write the three flags. ddb-importer does exactly that in
  `src/parser/classes/CharacterClassFactory.ts:103-140` (grants) and `:293-307` (choices), and
  `src/parser/advancements/AdvancementOrigin.ts:29-30` for the flags.
- **No: the creation options.** ddb-importer defines
  `{ applyFeatures: false, addFeatures: false, promptAddFeatures: false }`
  (`src/updater/character.ts:1626`, `src/config/settings/settings.ts:87`) and passes it as the options of
  `createEmbeddedDocuments`. **None of those three names appears anywhere in dnd5e 5.3.3 or 6.0.6** (searched
  `module/` in both tags). They do nothing in these releases.
- **Why creating via the API is safe anyway:** the advancement prompt comes from
  `AdvancementManager.forNewItem`, which is called from the actor sheet's drop handler
  (`module/applications/actor/api/base-actor-sheet.mjs:1910`) and not from item creation. So
  `actor.createEmbeddedDocuments("Item", [...])` should not run advancements. That is my reading of the
  source; **not verified in a live world** (Spikes B and C in `docs/export.md` cover it and haven't
  been run).
- **Whether a recorded grant is read as applied** is the main question for native level-up and is also
  untested. It is what `docs/spike-b/` exists to answer.
- **Level-up uses the same code paths**, so a class advancing from 1 to 2 would grant the level-2 items only
  if the level-2 `ItemGrant` has no `value.added`. Same untested status.

**Permissions**

- **Verified (Foundry v13 API docs, `CONST.USER_PERMISSIONS`):** `ITEM_CREATE` and `ACTOR_CREATE` default to
  role 3 (Assistant GM), not Player (role 1) or Trusted (role 2). So a **world** Item can't be created by a
  default player. `FILES_UPLOAD` is also role 3.
- **Not verified:** whether `createEmbeddedDocuments` on an actor the user owns needs `ITEM_CREATE`. Foundry's
  source is not in the dnd5e repo and isn't installed here. My understanding is that embedded creation is
  governed by ownership of the parent, not the global permission, but I can't show it. This decides whether
  "importing needs only rights on the player's own actor" holds. Test with a Player-role user in Spike C.
- **Compendium creation:** not verified. Treat it as GM-only (the design already does).
- **Actor creation:** a Player also can't *create* a character actor with default permissions (`ACTOR_CREATE` is
  role 3). The design's player-import workflow assumes the player makes the actor; for a default world, the
  DM has to create it or raise the permission. Add to the import report's list of causes.

**Evidence:** `module/data/advancement/*.mjs`, `module/documents/advancement/*.mjs` in
`release-6.0.6`; ddb-importer paths above; `https://foundryvtt.com/api/v13/variables/CONST.USER_PERMISSIONS.html`.

## 6. Trystero feasibility

**Setup.** `spikes/foundry/trystero/`: one `pair.js` (join a room with a shared key, answer
`listCharacters` / `getCharacter`, or ask for them via `makeAction(..., { kind: "request" })`), bundled three
ways with an esbuild alias for the strategy. Peers logged to a local server (`trystero-peers.log` is the
raw record). Peer A was a one-view Obsidian plugin (`plugin-entry.js`) in a scratch vault, driven over CDP;
peer B a plain page in headless Firefox. I restored `~/.config/obsidian/obsidian.json` byte-for-byte after.

**Results**

| Test | Result |
| --- | --- |
| Obsidian desktop plugin view ↔ Firefox page, Nostr, shared key | **Connected.** Peer found 0.8 s after the second peer joined (7 s from the first peer's start); request `listCharacters` round trip 4 ms. |
| Firefox ↔ Firefox, Nostr / MQTT / BitTorrent | **All three connected** on this machine, ~0.7 s after the second peer joins, RPC in 1 ms. |
| Obsidian desktop CSP | The window has a CSP `<meta>`; WebSocket to the relays, WebRTC and `fetch` to localhost were all unaffected. Obsidian was Electron 43.8.3 / Chrome 150. |
| Wrong key (same room prefix) | `onJoinError: "incorrect room password when decrypting offer"` within ~3 s, repeating; no peer. |
| `iceTransportPolicy: "relay"` with no TURN | `onJoinError: "could not connect to peer … after exchanging SDP; configure TURN servers with turnConfig or rtcConfig.iceServers"` within 0.5 s, retried until timeout. |
| Unreachable relay URL | **Silence.** No `onJoinError`, no event, nothing until my own 20 s timer. |
| No other peer in the room | `joinRoom` returns immediately and nothing happens; a timeout of our own is the only signal. |

**Findings**

- **Strategies.** Nostr, MQTT and BitTorrent all signalled. Minified, browser, one `joinRoom`:

  | Strategy | Minified | Gzip |
  | --- | --- | --- |
  | `@trystero-p2p/nostr` | 75 KB | 27 KB |
  | `@trystero-p2p/torrent` | 65 KB | 23 KB |
  | `@trystero-p2p/mqtt` | 404 KB | 127 KB |

  Nostr or BitTorrent is the sensible default. MQTT is five times the size for no gain here.
- **Packaging changed in 0.26.** `trystero/mqtt` and `trystero/torrent` now only print a deprecation
  notice; import `@trystero-p2p/<strategy>` (`trystero` itself is the Nostr strategy).
- **STUN/TURN.** `config.rtcConfig` takes an `RTCConfiguration` (including `iceServers` and
  `iceTransportPolicy`) and **replaces** the defaults; `config.turnConfig` is a list of TURN servers **added
  to** the defaults. The defaults are `stun:stun.l.google.com:19302`, `stun1.` and `stun2.` of the same, and
  `stun:stun.cloudflare.com:3478` (`core/dist/peer.mjs:378`). For the design's "TURN field in settings" use `turnConfig`; for "override STUN"
  use `rtcConfig.iceServers`, which must then list TURN too.
- **Signalling relays.** `relayConfig.urls` overrides the public relay list; the default Nostr list has ~10
  community relays I didn't check for availability. A self-hosted option exists (`@trystero-p2p` WebSocket
  relay, per the README; **not tried**).
- **Timeouts.** There is `onJoinError` (wrong password, failed handshake, or exchanged SDP with no
  connection) and per-request `timeoutMs`; there is no "no peer found" event. So the design's own-timeout
  proposal is right, and the plugin can distinguish three messages: wrong key, network blocks WebRTC (point
  to TURN / file import), and nobody there (our timeout).
- **Built-in RPC.** `makeAction(name, { kind: "request", onRequest })` plus `.request(data, { target,
  timeoutMs })` already is `listCharacters`/`getCharacter`, with errors thrown to the caller. No RPC layer to
  write.
- **Passwords.** The shared key is used as the Trystero `password`, which encrypts the signalling and
  rejects wrong-key peers. Anyone who knows `appId` and the room name can still *attempt* to join; they just
  can't complete. The room name here is a prefix of the key, which would leak part of it to the relays;
  derive the room from a hash of the key instead.

**Not verified**

- **Obsidian mobile (iOS and Android): not tested.** I had no device. The WebRTC and WebSocket APIs exist in
  both webviews, but I can't claim it works or how it behaves when backgrounded.
- **Foundry client: not tested.** Foundry runs in Electron or a browser, and the browser path worked, but
  I did not load the page inside Foundry, so Foundry's own CSP and module loader are untested.
- **Any real network.** Everything above ran on one machine on one connection. Nothing in the design's
  "where direct connections fail" table has been tested. Same-machine peers connect over host candidates, so
  this says nothing about NAT traversal. The relay-only case failed only because there was no TURN server; I
  did not run a TURN server.
- **Safari/WebKit and Chrome browsers:** only Firefox and Obsidian's Chromium.

## 7. Module scaffolding

**Recommendation**

- **Separate repository** (`dragonglass-foundry`). The design decides module releases track dnd5e versions
  (Decided); the plugin releases on its own cadence; Foundry packages are installed from a manifest URL on a
  release, which a monorepo subdirectory complicates. A monorepo would also pull the plugin's `obsidian`
  stubs, React and vitest config into the module's CI.
- **Toolchain:** TypeScript with esbuild or Vite, ES modules, output `module.json` + `dist/`. Plain ESM
  works since Foundry loads modules as scripts. Type-check against
  `@league-of-foundry-developers/foundry-vtt-types` if it tracks v14 by then; otherwise a hand-written
  `.d.ts` for the 15 or so Foundry APIs used. I did not check that package's current status.
- **Tests:** Vitest with a mocked Foundry (`Actor.create`, `fromUuid`, a fake compendium index), using the
  export document as the fixture. That is how ddb-importer tests (§ prior art) and needs no running Foundry.
  Real-world checks stay manual: Spikes B and C.
- **Shared schema:** yes, as a small package, but not yet a workspace. Put the export document's types, the
  JSON Schema and a `validateExport()` in `src/core/export/` in the plugin (pure, no `obsidian` import,
  consistent with the layout rule), and publish it to npm as `@dragonglass/export-schema` when the module
  needs it. The module depends on a pinned version; the plugin and the module both validate. Until then the
  module can vendor a copy of the generated JSON Schema.
- **Licence of the module.** dnd5e is MIT and ddb-importer is MIT; the data is CC-BY-4.0. The owner decides,
  but MIT matches both and keeps the module free to read their source.

## 8. The 5etools `foundry-*.json` overlays (added after the first pass)

**Question:** would `../5etools-src/data/foundry-*.json` (plus `class/foundry.json`, `spells/foundry.json`,
`bestiary/foundry.json`) improve matching between systems, and could the converter use them to produce the
mechanics §3 found missing?

### What they are

Not a mapping to dnd5e. They are Plutonium's *delta over the dnd5e SRD compendium*, keyed by 5etools
`name + source` (plus `className`, `subclassShortName`, `level` for class features). Each entry may carry
`activities`, `effects` (Active Effect `changes` in Foundry key paths), `system` overrides (e.g.
`"uses.max": "@scale.barbarian.rages"`), `advancement` (class and race `ScaleValue`), and the flags
`ignoreSrdActivities` / `ignoreSrdEffects` / `isIgnored`. Counts in this checkout:

| File | Entries | With activities / effects |
| --- | --- | --- |
| `class/foundry.json` | 12 classes, 21 subclasses, 171 class features, 442 subclass features | 70 / 50 and 297 / 102 |
| `spells/foundry.json` | 352 (295 XPHB) | 349 / 195 |
| `foundry-optionalfeatures.json` | 105 | 100 / 47 |
| `foundry-feats.json` | 84 | 59 / 51 |
| `foundry-races.json` | 11 races, 90 race features | 69 / 25 (features) |
| `foundry-items.json` | 419 items, 25 magic variants | 386 / 179 |

None of the six files contains an `_id`, a compendium UUID or a `Compendium.` reference. `identifier` appears on
63 class entries and 10 items, as a dnd5e `system.identifier`. So **for id matching they add almost nothing**.
They are keyed by the same 5etools name that our converter already carries, and a name match is what §4 did.

### Where they do help matching

1. **A confirmed-absent signal.** Plutonium writes an entry only where dnd5e's own data needs replacing or
   adding to. An XPHB entry with `ignoreSrdEffects: true` says "dnd5e has a feature by this name and it is
   wrong or incomplete here". That is a cheap cross-check for the §4 misses, but it is a hint, not proof.
2. **Scale identifiers.** Class `ScaleValue` advancements give the dnd5e scale names (`rages`, `rage-damage`,
   `sorcery-points`, `superiority`). The enrichment worklist already offers `@table(barbarian, rages)`
   handles, and these line up by name. This supplies the *table name to scale identifier* map the module needs
   for `uses.max` formulas. The identifiers are derived from the `title` when `identifier` is absent. I read
   that off the sample (Rage, Sorcerer, Battle Master) and did not check the rule across all 12.
3. **Identifier overrides** (`modify-magic`, `tokens-departed`): ten or so entries where dnd5e's identifier
   differs from the slugged name, which is the case that breaks name-based matching.

I did not test whether these raise the §4 percentages. The 2014 class features are the biggest miss, and the
overlay has only 37 PHB class features, so I would not expect much there.

### Coverage of our converted SRD (name match, so an upper bound)

| | 2014 (`srd`, overlay source PHB) | 2024 (`srd24`, XPHB) |
| --- | --- | --- |
| class and subclass features in our tree | 237 | 267 |
| matched an overlay entry by name | 54 | 164 |
| of those, carrying activities / effects / system | 23 | 127 |
| overlay entries using `uses` | 2 | 19 |

The 2014 gap is structural, not a matching failure: for PHB content dnd5e's own compendium already has the
activities and effects, so Plutonium wrote no overlay (Rage, Lay on Hands and Divine Smite are all absent from
the 2014 matches). **The overlay is the mechanics source for 2024 only.** For 2014 the equivalent data is the
dnd5e pack itself (MIT-licensed system data, `packs/_source`), which I already have for §4.

The 2024 worklist (`out/srd24/enrichment.md`) lists 128 elements with unexpressed mechanics. Of the worklist's
non-item entries, **the overlay has mechanics for 11 of 14 class features, 11 of 12 subclass features,
5 of 9 spells, 3 of 9 species traits and 3 of 3 invocations** (including Rage, Lay on Hands, Divine Sense,
Bardic Inspiration, Font of Magic, Innate Sorcery). Items it largely does not help with, because the worklist
items are mundane gear (Antitoxin, Book) and the overlay's items are the XDMG magic items.

Shape of what is in it, for the 2024 matches: activity types are `utility` 68, `damage` 19, `save` 19,
`heal` 18, `enchant` 5; consumption is `itemUses` 74, `activityUses` 6, `spellSlots` 8, `attribute` 4. The
commonest Active Effect keys are `system.traits.dr.value` (48, Rage and Cleric-type resistances),
`system.skills.*` (9), `system.attributes.movement.walk` (4), `system.traits.ci.value` (3),
`system.bonuses.mwak.damage` and the `roll.mode` advantage keys. That is a small vocabulary.

### Can the converter produce mechanics from them?

**Yes for a useful subset, and only for 2024.** My recommendation is a separate, optional pass rather than a
change to the existing text readers:

1. **Resources (do this).** `system.uses.max` + `recovery` (or `uses.recovery`) on a feature maps directly to
   our `resources` part: `max` becomes `@table(class, name)` or an ability-mod expression, `recharge` maps
   `lr`/`sr`/`day`. `consumption.targets[itemUses]` on an activity becomes `cost: {uses: 1}` on an `actions`
   entry. This is the exact gap §3 found (0 resources in the converted SRD) and the thing the design's v1
   needs. It also matches the hand-written Paladin shape in `content/srd`.
2. **Passive modifiers (do this, narrowly).** Map `ADD`/`UPGRADE`/`OVERRIDE` changes whose key is in a small
   allow-list (`system.traits.dr|ci|di|dv.value`, `system.attributes.movement.*`, `system.skills.*.value`,
   `system.attributes.senses.*`, ability and save bonuses) to `modifiers` on a stat path. Anything outside the
   list is reported on the worklist, exactly as `mechanics.ts` does now.
3. **Toggles (do this second).** An `effects` entry with `disabled: true, transfer: true` plus an activity
   that references it by `foundryId` is Foundry's "Rage is on" pattern. It maps to our `effects` part and an
   action with `applies`. §3 found 0 of these in the converted SRD and the engine supports them, so this is
   the highest-value mapping but needs the most care: the duration and `statuses` fields need a policy.
4. **Do not translate** `damage`/`save`/`cast`/`summon`/`transform`/`enchant` activities, `@scale` rolls beyond
   a plain table, or `flags.dnd5e.*`. They have no schema equivalent and would land as prose-plus-warning.

Principles to keep, copied from the converter's own header in `mechanics.ts`: every overlay-derived part is
reported for audit, a wrong number on a sheet is worse than none, and unmapped keys go to the worklist.

**Cost and risks**

- The converter reads from `../5etools-srd-only`, which is a pared-down extract (`2014/`, `2024/`,
  `extract.ts`) and **contains no foundry files**. `extract.ts` would need to copy the relevant overlay entries
  by SRD name. I did not read `extract.ts` to see how it selects.
- **Licensing is unverified and matters.** The SRD prose is CC-BY. The overlay is Plutonium's data in the
  5etools repo. I did not check its licence. Do not commit overlay-derived output until that is settled; the
  converter's output tree is committed (`content/srd/`).
- The overlay is a moving target (`migrationVersion: 3`) and targets a specific dnd5e data model, so the
  mapping is a conversion layer to maintain. The allow-list approach contains that.
- Everything here was done with name matching on one machine's checkout. I read about a dozen entries by hand
  and counted the rest. I did not run a converter prototype or check any translated number against the book.

### Would it benefit the plugin itself?

**Yes, independently of Foundry, and that is the main argument for doing it.** The plugin's own sheet gets
nothing from text-only features: no use counters, no Rage toggle, no resistances, no damage bonus, and §3
shows that is 100% of the converted SRD. The enrichment worklist already names this as the outstanding job
("a resource with limited uses" 7, "an action" 28, and so on). The overlay hands the converter a typed source
for the 2024 cases, instead of regex over prose. It also feeds the Foundry export for free, since the same
`resources`/`effects` parts become `system.uses` and Active Effects on the module side.

Caveats: it would still be a human-reviewed pass (`srd-reviewer`), because the overlay encodes Foundry's
reading of the rule, which is not always the book's (e.g. Rage's advantage is a `roll.mode` change on STR
checks and saves only, which is right, but I did not audit the others). For 2014 the source would have to be the
dnd5e packs rather than this overlay, which is a separate job.

**Recommendation:** prototype items 1 and 2 against Barbarian, Paladin and Sorcerer (2024), diff the result
against the hand-written Paladin content in `content/srd`, and settle the licence question first. Add it as
owner decision 11 below.

## Decisions that need the owner

1. **Which dnd5e to target first?** The design says latest; `docs/export.md` pins 5.3.3. Latest is
   `6.0.6` (needs Foundry 14.367+; 6.1.0 is a prerelease). *Recommend 6.0.6, one release series, and ask the
   Foundry DM which Foundry version his world runs; if it is 13, 5.3.3 is the only option.*
2. **Retire the exporter in the plugin.** `docs/export.md` and the design disagree about where the
   dnd5e mapping lives. *Recommend the design wins; rewrite `export.md` as the module's mapping
   reference and keep `dnd5e-model.md` (it is accurate for 6.0.6 and still useful).*
3. **Id scheme.** *Keep `source:owner:slug`; do not adopt `abbr:slug`.* Fix the 17+18 positional ids in the
   converter, and add a per-source `ids.lock` test that fails when a published id disappears.
4. **Manifest.** *Extend `source.json` with optional `version`; no second format;* licence and attribution stay
   on the sourcebook; `ref` is computed.
5. **Export file.** *One JSON file;* the source details are already in the envelope, so a zip adds nothing
   until we ship binary assets (avatar).
6. **Backstory.** *Export it, as plain text with embeds resolved by the plugin at export time* (it has the
   metadata cache; the module doesn't). Skip it from the paired-connection document only if size matters.
7. **Content mechanisation before phase 1 means anything.** 0 resources and 0 toggles in the SRD features.
   *Recommend mechanising a first set of resource features (Rage, Lay on Hands, Channel Divinity, Second Wind,
   Bardic Inspiration, Wild Shape, Ki, Sorcery Points…) as a precondition to phase 1's gate;* otherwise phase 1 can
   only prove description import.
8. **Trystero strategy and relays.** *Nostr (27 KB gzip) with the default relays to start, `relayConfig.urls`
   exposed in settings, plus the optional TURN field.* Decide whether depending on public Nostr relays is
   acceptable, or whether to self-host one.
9. **Who creates the actor.** With default Foundry permissions a player cannot create actors or world
   items. *Recommend the module documents it and offers a GM-run "import from file" for a player's actor.*
10. **Module repo location and licence** (§7).
11. **Mechanise from the Foundry overlay?** (§8). *Yes for 2024 resources and passives, prototyped on three classes;
    it serves decision 7 and the plugin's own sheet. Blocked on confirming the overlay's licence.*

## Proposed work breakdown for phase 1 (module imports an export file)

S = under a day, M = 2–3 days, L = about a week. Order matters; items in the same group can overlap.

| # | Work | Size | Gate / note |
| --- | --- | --- | --- |
| 1 | **Run Spikes B and C in a live 6.0.6 world** (the hand-written actor in `docs/spike-b/`, retargeted to 6.0.6; a world item grant at a fixed `_id`; a Player-role user creating items on an owned actor) | S | Answers the three open points in §5. Needs a human in Foundry. Blocks #9. |
| 2 | Decide #1–#6 above; rewrite `docs/export.md` | S | |
| 3 | Fix positional ids in the converter; add the id-permanence test | M | Separate repo (`5etools-to-dragonglass`) |
| 4 | Export document: types, JSON Schema, `validateExport`, fill the gaps in §2 (HP per level, pending flags, instance ids, unresolved inventory, species/background grants) | M | `src/core/export/`, pure |
| 5 | Plugin command "Export for Foundry" writing the JSON file, resolving embeds in details | S | `src/obsidian/` |
| 6 | Module repo, `module.json`, build, test harness with a mocked Foundry, dnd5e version matrix | S | |
| 7 | `idmap.json` generator from dnd5e packs plus alias list; unresolved report | M | §4 |
| 8 | Provider interface and tier 1 (system packs) via the id map | S | |
| 9 | Class and subclass items with advancements (`ItemGrant`, `ItemChoice`, `HitPoints`, `ScaleValue`, ASI) and the ledger | L | Gated on #1 |
| 10 | Actor core mapping (abilities, skills, HP, AC, currency, biography) | M | Use `attributes.ac.calc: "flat"` per the model doc; confirm on 6.x |
| 11 | Feature, spell and item documents; flags (`dragonglass.id`, tier); resources to uses; import report | M | |
| 12 | Re-import: match by flag, keep `_id`, stamp import id, protect local edits | M | |
| 13 | Fixtures and golden tests from `spikes/foundry/sample-export.json` plus a mechanised multiclass character | S | |

Phase 1 gate (the design's own, restated): a character imported from a file shows correct numbers, links
every feature the world can link, reports what it couldn't, and re-importing changes nothing.

## Files

- `docs/foundry/integration-design.md`: the design, saved as the spike prompt asked.
- `spikes/foundry/export.ts`, `sample-export.json`: §2.
- `spikes/foundry/classify.py`, `survey.py`: §1 and §3.
- `spikes/foundry/srd-match.mjs`: §4 (needs `yaml`; I installed it outside the repo).
- `spikes/foundry/trystero/`: §6 (`pair.js`, `plugin-entry.js`, `page-entry.js`, `server.mjs`, `runpair.sh`,
  `runcase.sh`, `cdp.mjs`), and `spikes/foundry/trystero-peers.log` the raw peer log.
