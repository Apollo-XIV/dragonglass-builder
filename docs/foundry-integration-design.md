# Dragonglass ↔ Foundry integration: design

Nov 5, 2026 · @Alix

## Summary

Dragonglass gets a Foundry module that pulls a resolved export of a character, from the player's vault or from a file, and builds a native dnd5e actor that levels up normally. The plugin stays Foundry-agnostic: it emits one neutral, versioned document, and all dnd5e-specific work lives in the module.

Items below are tagged so nothing suggested gets mistaken for agreed:

- **Decided:** settled in the design discussion.
- **Leaning:** the intended direction, not yet settled.
- **Proposed:** a suggestion awaiting a decision.

## Goals and non-goals

The first versions aim for a character that arrives in Foundry correct and levelable, and nothing more.

**Goals**

- **Decided:** a player gets their dragonglass character into a DM's Foundry world as a native dnd5e actor, with working level-up for every feature the world can link to.
- **Decided:** a DM prepares the world once, from a shareable sources list, with a "Build Compendium" action in the module.
- **Decided:** the plugin carries no dnd5e or Foundry-version-specific code. Module releases track dnd5e versions.
- **Decided:** dragonglass ships the 2014 and 2024 SRDs as linked sources, built from 5etools data. It publishes the converter and none of the data. Other sources are shared by their authors through GitHub or as a zip.
- **Decided:** the module targets the latest dnd5e first, with a version toggle later.

**Non-goals for v1**

- **Decided:** syncing levels made inside Foundry back to the vault. Levelling in Foundry is discouraged at first; see the levelling section.
- **Decided:** live state sync (HP, resources, conditions). The v1 export is build only.
- **Decided:** a user-facing setting for resolver order. The order is fixed, with the code structured so it can become configurable.
- **Leaning:** Foundry automation beyond resources and toggles, matching what the sheet automates today.
- **Decided:** other game systems. A Pathfinder 2e variant is a later, separate effort.

## Architecture and workflows

There are three parts and one contract. The plugin produces a resolved export, the module turns it into a Foundry actor, and the same document travels over a file or a paired connection.

&#91;embedded content: architecture · 3 parts, 1 contract\]

Read the top row left to right, then the bottom row right to left: the export drops from the vault into the Foundry client, where the importer, resolver and actor builder run in turn.

**The DM, once per world** (**Decided**)

1. Choose the sources the world uses and send players the sources list.
2. Connect their own Foundry to dragonglass and run "Build Compendium" from the module menu.

**Each player, per character** (**Decided**)

1. Build the character in dragonglass using the sources on the list.
2. Connect their vault to Foundry with the shared key, or export a file.
3. Import. The module links what it can and reports what it couldn't.
4. **Proposed:** to level up, do it in the vault and re-import, since levelling in Foundry is discouraged at first.

## Resolved export document

**Decided:** the plugin runs its own engine and emits one flat, versioned document per character, so the module never re-implements progression, invalid-pick handling or expression evaluation. The table shows the proposed shape; the spike fixes the real field names against the existing schema.

| Section | Carries | Why the module needs it |
| --- | --- | --- |
| Envelope | Schema version, character id, export time, plugin version, the sources used (id and version) | Compatibility checks and the import report |
| Identity | Name, levels per class, species, background, base ability scores, XP | The actor's core fields |
| Progression | Each level in order: class, choices made, and what it granted, with provenance (class, subclass, level, granting rule) | Class and subclass items, and the advancement ledger that makes native level-up work |
| Features | Flat list: stable id, source id, name, literal source text, and parts, each with a kind (resource, toggle, passive, other) and its expression | Resolving to compendium items, or building them; resources and toggles become item uses and effects |
| Spells | Known, prepared and spellbook entries with stable ids | Spell items and preparation state |
| Inventory | Items with stable ids, quantity, equipped, attuned, containers; custom items inline | Equipment items and containers |
| Details | Backstory, traits, appearance as plain text | The biography fields |

- **Proposed:** only active picks are exported. Inactive (invalidated) picks and the planned level queue stay in the plugin.
- **Decided:** no live state in the v1 export. Current HP, temp HP and similar belong to the later sync phase.
- **Proposed:** the schema version is major.minor. Adding fields bumps the minor; changing meaning bumps the major. Each module release lists the majors it reads and refuses others with a plain message.
- **Proposed:** the same document travels over every transport (file, paired connection), so the module has one import path.

## Stable ids and the source manifest

**Proposed:** every feature, spell, item and source gets an id that never depends on its name, so the module never matches by name. ddb-importer's source is full of name-matching fallbacks, including one for two unrelated traits both called "Tireless"; we avoid that class of bug by owning the schema.

**Ids**

- **Proposed:** sourcebook abbreviation plus a slug, for example `abbr:slug`. The spike checks what the engine already uses and proposes the minimum change.
- **Proposed:** an id is permanent once published. Renames change the display name only. A removed entry keeps its id reserved.
- **Proposed:** every document the module creates carries the dragonglass id in a flag. Re-runs find existing documents by that flag and keep Foundry's own `_id` and UUID, because imported characters record those UUIDs in their advancement ledger.

**Source manifest** (`source.json`, one per source)

| Field | Purpose |
| --- | --- |
| `id`, `name`, `abbr` | Identity; the abbreviation prefixes entry ids |
| `version` | Human-readable content version |
| `ref` | Pinned git commit for GitHub sources, or a content hash for zips |
| `license`, `attribution` | Carried into any compendium built from the source |
| `schema` | The dragonglass schema version the source was converted to |

- **Decided:** sources are shared by publishing on GitHub (respecting its terms on licensing and copyright) or by sending a zip. Dragonglass does not ask where non-SRD data comes from.
- **Decided:** a shareable sources list (JSON) lets a DM tell players which sources a world uses.
- **Proposed:** the sources list pins each source by id and version. When a player's vault has a different version from the one the world was built from, the module warns instead of silently linking to the wrong entry.

## Foundry module: resolving and importing

The module resolves each feature, spell and item to an existing compendium document, builds what it can't resolve, then creates the actor with a ledger that makes native level-up work. This design follows how ddb-importer's source does it, adapted to a source we control.

**Resolver tiers**

**Decided:** the order is fixed, structured behind a small provider interface so it can become configurable later without being exposed now. Each item is tried against:

1. The dnd5e system's own SRD packs. The system ships SRD 5.1 and 5.2 fully set up, with working activities and effects.
2. Official content modules the DM has installed.
3. A compendium the module built earlier from vault content.
4. A fresh build from vault content.

- **Proposed:** each provider offers `resolve(entry) → uuid | null`, and the last also offers `build`.
- **Proposed:** each linked document gets a flag naming the tier that resolved it. A later re-resolve can then upgrade items, for example when a DM installs an official module after building.
- **Leaning:** v1 mapping covers what the sheet automates today. Resources become item uses with recovery, toggles become active effects, and everything else lands as description text.

**Build Compendium (DM action)**

- **Decided:** the DM connects their own Foundry to dragonglass and runs "Build Compendium" from the module menu. Players never need to.
- **Proposed:** it only builds entries that tiers 1 and 2 couldn't resolve.
- **Proposed:** it is an update, not a rebuild. Documents are matched by the dragonglass id flag and keep their `_id` and UUID, so existing characters' links survive.

**Character import (player action)**

**Proposed:** materialise the resolved character rather than replay levels through dnd5e's own advancement flow.

1. Create class and subclass items first, one at a time, with `applyFeatures`, `addFeatures` and `promptAddFeatures` set to false, so the system neither prompts nor grants twice.
2. Build each class item's advancements from the system's own advancement classes, so defaults follow the installed dnd5e. Item-grant advancements point at the resolved UUIDs.
3. Create feature, spell and item documents on the actor, each flagged with its dragonglass id and resolving tier.
4. Fill the ledger: `value.added` on each item-grant maps the actor's item id to its UUID, and granted items get `advancementOrigin`, `advancementRoot` and `sourceId` flags. Item-choice picks are recorded the same way.
5. Anything unresolved arrives as a plain item with no advancement link. The import report lists these with their source.

**Re-import**

- **Proposed:** match existing documents by the dragonglass id flag and keep Foundry's `_id`, so the ledger stays valid.
- **Proposed:** stamp every document with an import id. Documents not stamped by the last import were added locally and are kept.
- **Proposed:** per-document flags let a player or DM protect a local edit from being overwritten.

**Permissions and versions**

- **Proposed:** importing needs only rights to create items on the player's own actor. Creating the compendium needs GM rights. Without a built compendium the import still gives a working sheet, with no native level-up for unlinked features.
- **Decided:** separate module releases track dnd5e versions.
- **Proposed:** the mapping layer is the only version-specific code, behind one interface.

## Connection and transport

The module imports from a file or from a paired vault, and both feed the same import path. **Decided:** a player can either connect their vault or import from a file.

- **Proposed:** build file import first. The converter is the hard part and can be tested with no networking, which makes the paired connection a transport swap.
- **Decided:** pairing uses Trystero for signalling, with a shared key each user copies between their Foundry session and their vault settings. No server of ours sits in between.
- **Decided:** the module pulls character data over the connection with a small RPC.
- **Proposed:** the RPC surface is `listCharacters` and `getCharacter(id)`, which returns the export document. A `subscribe` call for state-log entries arrives with live sync.
- **Proposed:** keys are per client. Each person's Foundry user holds their own key, and the DM's key (for Build Compendium) pairs with the DM's vault. Players never see each other's keys.
- **Proposed:** the module caches the last received document on the actor, so a closed or backgrounded vault doesn't block work. Obsidian mobile drops the connection when backgrounded, so a pull only works while the vault is open.

**Where direct connections fail**

STUN lets each peer learn its public address and punch through NAT. It fails when a router assigns a different external port per destination. These are expectations to verify in the spike, not measured results.

| Scenario | Expectation |
| --- | --- |
| Same home network | Works, unless the router isolates clients or blocks mDNS |
| Phone on mobile data to a home connection | Usually works |
| Both peers on mobile data | Depends on the carrier |
| University halls | Often strict: heavy NAT, sometimes UDP filtering or client isolation |
| Cafe wifi | Client isolation is common; one peer elsewhere usually works |
| VPN | Depends on the VPN; full-tunnel corporate VPNs are the likeliest to break it |

- **Proposed:** a failed connection shows no error by itself, so the plugin needs its own timeout and a plain message that points to file import.
- **Proposed:** an optional TURN server field in settings, for example a self-hosted coturn on port 443 over TLS, for users who hit a blocked network.
- **Proposed:** the default public STUN servers are fine to start with, and overridable.

## Levelling policy and live state (later phases)

The vault is the source of truth for the build, and live state sync comes after the build import works.

**Levelling**

- **Decided:** discourage levelling inside Foundry at first. Once the converter round-trips reliably, the module may accept it as a build update. The undecided details are left for then.
- **Proposed:** because every document the module creates is flagged, it can detect a level change made in Foundry and warn, rather than letting the actor and vault drift silently.

**Live state**

**Leaning:** the ideal is managing a character from the vault or from Foundry interchangeably. Nothing here is needed for v1.

- **Proposed:** sync operations, not values. A phone logging "-5" and a DM's token taking "-8" at nearly the same moment should both apply. The plugin's register of deltas already has this shape.
- **Proposed:** each log entry carries a unique id, an origin (vault or Foundry, and which device) and a timestamp. Merging is the union of both sides, replaying gives current state, and a duplicate id is dropped.
- **Proposed:** on reconnect each side sends the last entry id it has seen and the other replays the gap. The module stores its side of the log in a flag on the actor, so changes made while the vault is closed wait there.
- **Proposed:** sync a fixed set of fields: HP, temp HP, temp max HP, death saves, resource uses, spell slots, conditions. Ignore the rest of dnd5e's automation rather than chase it.
- **Proposed:** the player's own Foundry client writes for their own actor, since owners may update their own actors. ddb-importer needs one designated GM client because D&D Beyond is a remote service; we don't.
- **Proposed:** damage the DM applies in Foundry appears in the vault log as a normal entry, tagged with its origin.
- **Proposed:** undo appends a compensating entry rather than deleting, so the other side learns about it.

## Prior art: what ddb-importer's source taught us

ddb-importer solves the same problem against a source it doesn't control, so most of our design is its lessons minus the reverse-engineering. Read from the [ddb-importer repository](https://github.com/MrPrimate/ddb-importer) at commit a6ea7cc (1 November 2026). It is MIT-licensed.

| Topic | What ddb-importer does | Our takeaway |
| --- | --- | --- |
| Getting the data | No public D&D Beyond API, so a proxy fetches the character with the user's session cookie | We own both ends: no proxy, no cookie |
| Level-up | Builds class items from dnd5e's own advancement classes, fills `value.added` and the origin and root flags, and creates items with the system's add-features options off | Same approach |
| Grant targets | Item-grants point at compendium UUIDs found through its compendium index; with no match it skips the advancement and imports a plain item | The degrade path and the import report |
| Matching | By name, with many fallbacks and collision fixes | Stable ids from day one |
| Re-import | Matches by stored ids, keeps Foundry's `_id`, stamps an import id, keeps items it didn't import, and honours per-item retain flags | Same approach |
| Sync-back | Policy-gated fields, one designated GM client, calls serialised per character with only the newest queued write kept | Deltas instead of absolute state; the owner's client can write |
| Testing | A local-source mode runs the parser from saved JSON, with mocked Foundry and fixture characters | The export document doubles as the test fixture |
| Size of the problem | The advancement helper alone is about 4,500 lines, mostly decoding D&D Beyond's data | Owning the schema removes most of it |
| Versions | Separate release series per Foundry and dnd5e version | Same approach |

## Phasing

**Proposed:** build in five phases, each ending at a gate that proves it before the next begins. Phase 1 is the first release players can use.

&#91;embedded content: roadmap · 5 phases, 4 gates\]

Phase 1 is the highlighted release. Each diamond is the check that closes the phase before it, and none of the gates carries a date.

- **Decided:** the v1 Foundry export is build only, so live state waits for phase 4.
- **Decided:** accepting levels made in Foundry as build updates comes after the converter round-trips reliably, so it sits beyond these phases.
- **Proposed:** the gates are checks the owner can run, not dates, and each phase can be reordered if its gate turns out to need another phase first.

## Open questions and risks

Most open questions can be answered by reading the code or running an experiment, which is the spike's job.

**For the spike**

- Which ids does the engine use for features, spells, items and sources today, and what is the smallest change to make them stable and permanent?
- How does the existing sources manifest relate to the proposed `source.json`? Reconcile them rather than add a second format.
- How are feature parts, kinds and expressions represented today? What share of the SRD features classify cleanly as resource, toggle or passive?
- Does the engine already expose a resolved-progression view, or does one need writing? Can the engine run headless in Node, for export and for tests?
- Which Foundry permissions does importing need (creating items on an owned actor), and which does building a compendium need?
- Does the dnd5e SRD pack data carry a stable identifier that can be mapped from 5etools-derived names?
- Does Trystero work in Obsidian's desktop and mobile webviews and in the Foundry client? Which signalling strategy, and what bundle size?
- Should a file export be one JSON file or a zip bundle (document plus source manifest)?

**For the owner**

- Should the backstory export as plain text (resolving embeds), or stay out of the export?
- Where does the module live: its own repository, and under which licence?
- Input pending from a Foundry DM: do his players create their own actors and items, which compendiums he uses, what annoyed him about character imports, whether his players level up in Foundry, and whether he'd trust a module that connects to a player's vault.

**Risks**

| Risk | Mitigation |
| --- | --- |
| dnd5e changes its data model | Build advancements from the system's own classes; keep mapping behind one interface; release per dnd5e version |
| Names differ between the 5etools-derived SRD and the system's SRD items | An id map; unresolved entries fall through to a build |
| Direct connections fail on strict networks | File import as the fallback; optional TURN server |
| A world's source versions differ from a player's vault | Pinned versions in the sources list, with a warning on mismatch |
| A world doesn't let players create items on their own actors | Import report says so; a GM-run import from a file works as a fallback |

## Export contract: defaults chosen while building it

Nothing below blocked the build, so each is a default the owner can overturn. The export is
generic: the plugin has no Foundry or dnd5e code in it.

- **Schema version is 1.1.** It started at 1.0, not the spike's 0.1, and gained `proficiencies` in 1.1. The validator refuses another major and accepts a later minor and unknown fields.
- **Tooling.** The schema is written once in TypeBox (`src/core/export/schema.ts`). The TypeScript types and `docs/export-schema.json` derive from it, and a test fails if the checked-in JSON drifts. This adds `@sinclair/typebox` as a dependency.
- **Character id is a UUID in `sheet.5e`.** It is made when a character is created. A character without one gets it with its next write of any kind, or when Export character runs (which creates `sheet.5e` if the folder has none). Loading never writes. Renaming or moving the folder keeps it. The disk-only CLI cannot write, so for a sheet with no id it falls back to the folder name.
- **Source pins.** `ref` is the GitHub pin, or `sha256:` of the source's files (path and text, sorted by path) read at export time. `version` comes from the first sourcebook that has one. `source.json` did not gain a `version` field.
- **Inventory entry id** is `uid` (`id` already names the element). Old files get ids on their next save, or when Export character runs. An inventory with no ids exports provisional `legacy-N` ids through the CLI.
- **Stacking.** Adding an item raises the quantity of an existing entry only when copies are interchangeable: the item has no `charges`, no `resources` and no `attunement`, and the entry holds nothing but the item and a quantity. An entry that is equipped, attuned, in a bag, noted, named or carries any other field stays as it is, and the new copy is an entry of its own. An item that cannot be found never stacks. Removing a container frees what it held.
- **A container that is not an entry** exports as loose with a `reason` on the entry, rather than failing the export.
- **Pending means fewer valid picks than `count`.** Picks the engine marks invalid are left out of `picked`, and its warning stays in `diagnostics`.
- **Parts.** Each feature part carries a derived `kind` (resource, toggle, passive, action) and the part as authored. Parts on a class's own `levels` entries are not exported; the resolved proficiencies below cover what they grant. Spells and inventory items export identity only, plus the whole inline definition of a custom item.
- **Proficiencies.** A top-level `proficiencies` carries all six saves and every skill (level none, half, proficient or expertise, the total bonus as the sheet rolls it, and the passive score for skills), then tools, armour, weapons and languages as the values the content states (element ids, categories such as `martial`, language names). Each carries `by`: the elements that grant it, with the chain of grants behind each. Only unconditional proficiencies are resolved; conditional ones stay in the features' parts.
- **Details.** Text before the first heading exports under an empty heading. Embeds follow headings and blocks, to depth three, and images and missing notes read as nothing.
- **Export reads the saved character.** If the builder holds unsaved changes, the command says so and exports what is in the files. Missing inventory ids and the character id are written without saving the builder's work, and the session adopts them so saving it later keeps the ids that were exported.
- **Not exported:** per-character avatar, `layout.5e`, notes on `build`.

## Spike prompt for Claude Code

Paste this into a Claude Code session in the dragonglass repo. First export this doc as Markdown and save it in the repo at `docs/foundry-integration-design.md`, since the prompt points there.

```text
You are running a research spike for dragonglass-builder, our Obsidian 5e character sheet and builder. We are designing a Foundry VTT integration. Read docs/foundry-integration-design.md first. It is the design under test.

HOW TO TREAT THE DESIGN
Items tagged Decided are settled. Items tagged Leaning or Proposed are NOT decisions. If evidence contradicts any item, say so plainly and show the evidence. Do not quietly adopt a proposal because it is written down.

GOAL
Answer the open questions in the design doc with evidence, and produce a real sample of the proposed resolved export document. This is research. Do not build the Foundry module and do not change production code. Work on a new branch (spike/foundry-integration). Throwaway scripts go in spikes/foundry/ and are labelled as throwaway. Never commit non-SRD content.

INVESTIGATIONS
1. Schema and engine audit (read-only). Report what ids exist today for features, spells, items and sources, and whether they are stable and unique. Report how sources are declared today (the existing sources manifest and sourcebook entities) and how that relates to the proposed source.json; propose one reconciled manifest. Report how feature parts, kinds, effects and expressions are represented. Report whether a resolved-progression view already exists, and whether the engine can run headless in Node.
2. Sample export. Using a throwaway script and a character from the test vault, produce a real resolved export document that follows the design's envelope: identity, progression with provenance, flat features with parts and kinds, spells, inventory, details. Active picks only. Save it as spikes/foundry/sample-export.json. Note every place the design's shape did not fit the real data.
3. Feature classification. Run over both SRD source repos and count features by part kind (resource, toggle, passive, other). List the features that cannot be classified. State what share the planned v1 Foundry mapping (resources to item uses, toggles to active effects, the rest as description) would cover.
4. SRD id mapping. Fetch the dnd5e system source from github.com/foundryvtt/dnd5e at its latest release tag and compare its SRD pack entries (classes, subclasses, features, spells, items) to our 5etools-derived SRD entries. Report the match rate by name and by any stable identifier the system uses. Group mismatches by cause. Recommend an id-map approach.
5. Foundry advancement check. From the same dnd5e source, document the advancement data model we would build (ItemGrant, ItemChoice, HitPoints, ScaleValue, AbilityScoreImprovement), the shape of each advancement's value ledger, and the advancementOrigin, advancementRoot and sourceId flags. Check whether the approach described in the design (taken from github.com/MrPrimate/ddb-importer, MIT) still applies to the latest dnd5e. Report which Foundry permissions are needed to create items on an owned actor, and which to create a compendium.
6. Trystero feasibility. Build the smallest throwaway pairing between an Obsidian plugin view (desktop, and mobile if you can test it) and a plain browser page, using a shared key. Report which signalling strategies work in each webview, the bundle size, any CSP or sandbox problems, how to set STUN and TURN servers through the config, and what happens on a timeout. Do not claim results for networks you did not test.
7. Module scaffolding. Recommend a repository layout (monorepo or separate repo), the build toolchain, and whether the export schema should live in a shared package used by both the plugin and the module.

DELIVERABLES
- docs/spikes/foundry-integration-findings.md: one section per investigation, findings first, then evidence (file paths, commands, links). Mark anything you could not verify.
- spikes/foundry/sample-export.json.
- A short list of decisions that need the owner, each with your recommendation.
- A proposed work breakdown for phase 1 (module imports an export file), in order, with rough sizes.

RULES
If the network or a tool is unavailable, say which investigation it blocks and move on. Keep each investigation brief, and stop and report if you are blocked rather than guessing. When finished, summarise the findings in under 300 words and list anything in the design that the evidence contradicts.
```
