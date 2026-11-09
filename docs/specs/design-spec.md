# dragonglass-builder: Design Spec

Oct 27, 2026

## Overview

dragonglass-builder is an Obsidian plugin for D&D 5e with two halves: a data-driven character builder that writes character files, and a character sheet that renders those files as an interactive, standalone view. Claude Code builds it from this spec.

### Design principles

- **Premium, standalone integration.** Characters are first-class files with their own views, not widgets inside a note. The goal is to make Obsidian a proper TTRPG tool.
- **The sheet is a view over character data.** It adds interactivity (HP, spell slots, resources), but it never owns rules logic. The builder generates the data.
- **Source-agnostic content.** The builder reads any rules content that matches the JSON schema, wherever it comes from.
- **Data-driven UI.** Options, tabs and displays are generated from content, so homebrew (including entirely new option types) works without plugin changes.
- **Basic selection by default, optional enforcement.** If content declares dependencies or prerequisites, the builder can enforce them, behind a toggle. Without them, it's a plain options select.
- **Inspired by Aurora Builder**, whose XML elements described how features appear and behave in the GUI. This spec uses the same idea with JSON.
- **LLM-assisted conversion.** Book text is converted to content with a conversion guide and Claude skills, not by hand.

### Development plan

1. Claude Code builds a minimal plugin from this spec.
2. Convert just enough SRD content to test the builder end to end: one species, one class, one subclass, and similar.
3. Iterate from there.

## Architecture

A single pure resolver sits at the centre. Sources load into a content index, character files hold choices and state, and every view reads the resolver's output.

&#91;embedded content: plugin architecture · sources, files, resolver, views\]

The builder writes the build, spells and inventory files, the sheet appends events to `state.5e`, and exporters only read.

### Tech stack

- TypeScript on the Obsidian plugin API, scaffolded from `obsidianmd/obsidian-sample-plugin` with its esbuild pipeline.
- React for UI, because it's what Claude Code writes most reliably. If mobile performance proves too slow, switch to Preact with `preact/compat` later; the code stays ordinary React.
- Each view mounts a React root into its `contentEl` on open and unmounts it on close.
- The schema, validator, expression parser and resolver are plain TypeScript with no Obsidian dependency, so they run in unit tests and in the validation CLI.
- The plugin supports mobile. Desktop-only features (paths outside the vault, print-to-PDF) are guarded with `Platform.isDesktop`.
- Each open character gets its own in-memory store (React state, not localStorage), or at least its own keyed entry in a shared one, so several characters' sheets can be open at once. A store holds that character's loaded files while any of its views are open. Files on disk stay the source of truth, and two panes showing the same character stay in sync.

## Character files

Each character is a folder of `.5e` files, one per kind of data, plus a `sheet.5e` manifest that the unified sheet reads. Every file kind also has its own viewer, so `inventory.5e` opens as an inventory editor on its own. All files are JSON except `details.5e`, which is markdown.

```
Characters/
  Ilsa/
    sheet.5e       # unified viewer + manifest
    build.5e
    state.5e
    details.5e
    spells.5e
    inventory.5e
    sources.5e     # optional per-character source overrides
```

| Default file | `kind` | Holds |
| --- | --- | --- |
| `build.5e` | `build` | Levels, class order, selections, ability scores, XP |
| `state.5e` | `state` | Live play state as an event log with checkpoints |
| `details.5e` | `details` | Markdown with predefined sections: backstory, traits and flaws, physical appearance, and so on |
| `spells.5e` | `spells` | Spellbook, known spells, prepared spells |
| `inventory.5e` | `inventory` | Items from sources or written in as custom objects |
| `sheet.5e` | `sheet` | Manifest: which file supplies each data type |
| `sources.5e` | `sources` | Per-character source overrides |
| `layout.5e` | `layout` | Post-MVP: colours, background image, which gallery images show |
| `gallery.5e` | `gallery` | Post-MVP: character art, one image designated as the avatar |

### Format and dispatch

- Every JSON file has a `kind` and a `schemaVersion`. `details.5e` carries the same fields in its frontmatter.
- Register `.5e` once with `registerExtensions()`. Obsidian binds one view type per extension, so that single view reads `kind` and renders the matching viewer.
- A file with no `kind` takes it from the manifest that references it (`magic.5e` mapped as spells is a spells file), and the manifest can override a file's `kind`.
- Characters are linkable like notes: `[[Ilsa/sheet.5e]]` from a session note opens the sheet.

### The sheet manifest

`sheet.5e` is the unified viewer, with tabs where appropriate. It maps each data type to a file. Absent entries fall back to the default name in the same folder, and any entry can be overridden, for example to use `magic.5e` for spells. Paths resolve relative to the manifest.

```json
{
  "kind": "sheet",
  "schemaVersion": 1,
  "files": {
    "spells": "magic.5e",
    "sources": "sources.5e"
  }
}
```

Layout and styling do not live in the manifest. Layout belongs to plugin settings, because plugin settings aren't part of a character (see Character sheet UI).

### Build state vs live state

There are two different questions: what is my character at this level, and what is my character at this point in time. The build files answer the first. `state.5e` layers the second on top. Keeping them separate prevents confusion between temporary max HP changes, temporary HP, and damage or healing. Exports let the user choose which one to include.

### build.5e

- Stores selections only: species, background, class levels, ability scores and their method, and every choice made. Derived values (AC, modifiers, DCs) are never stored; the resolver computes them.
- Class levels are a level-by-level log, so multiclass order, per-level HP and per-level choices are explicit. Choices are keyed by the content's choice id.
- XP lives here because it's tied closely to level. `xp` and `level` are separate fields rather than level being derived from XP, so milestone campaigns work and XP only prompts a level-up instead of forcing it.

```json
{
  "kind": "build",
  "schemaVersion": 1,
  "xp": 300,
  "level": 2,
  "species": "srd:species:dwarf",
  "background": "srd:background:acolyte",
  "abilities": { "method": "point-buy", "base": { "str": 15, "dex": 10, "con": 14, "int": 8, "wis": 12, "cha": 13 } },
  "levels": [
    { "class": "srd:class:paladin", "hp": "max", "choices": {} },
    { "class": "srd:class:paladin", "hp": "average", "choices": { "srd:paladin:fighting-style": ["srd:fighting-style:defense"] } }
  ],
  "choices": { "srd:species:dwarf:tool-proficiency": ["srd:tool:smiths-tools"] }
}
```

### state.5e

- A snapshotted log: the latest checkpoint plus the events since it. Current state is the checkpoint with later events folded in. Each event is written atomically.
- Holds damage, temp HP, temp max HP effects, spell slots spent, hit dice spent, resource uses, death saves, concentration, inspiration, exhaustion, and active effects and conditions.
- Stores inputs, not totals. Damage taken rather than current HP, so a level-up or CON change keeps current HP correct. Temp HP as its own pool, where a new grant replaces the old one rather than stacking. Temp max HP as a list of effects with a source and optional duration, so expiring one subtracts the right amount.
- A new checkpoint is taken at every rest, short or long, and the older events are archived as a session record. Short rests count too, for games with long gaps between long rests such as survival variants. The archive doubles as a "last session" recap.

```json
{
  "kind": "state",
  "schemaVersion": 1,
  "checkpoint": {
    "damage": 0, "tempHp": 0, "tempMaxHp": [],
    "spent": { "slots": { "1": 0 }, "hitDice": { "d10": 1 }, "resources": { "srd:paladin:lay-on-hands": 0 } },
    "effects": []
  },
  "events": [
    { "t": "2026-10-27T19:42:00Z", "type": "damage", "amount": 7 },
    { "t": "2026-10-27T19:43:10Z", "type": "spend", "target": "slots.1", "amount": 1 },
    { "t": "2026-10-27T19:44:02Z", "type": "effect.start", "effect": "srd:paladin:devotion:sacred-weapon" },
    { "t": "2026-10-27T20:15:00Z", "type": "rest.short" }
  ]
}
```

### details.5e

- `details.5e` is a markdown file with predefined section headers: backstory, personality traits, ideals, bonds, flaws, physical appearance, and similar. Frontmatter holds `kind`, `schemaVersion` and the `avatar` path.
- In edit mode it's an ordinary markdown file. Backstory can be written inline or linked from a separate note with `![[Backstory]]`.
- The viewer splits the file by its section headers and renders each section through Obsidian's `MarkdownRenderer`, in both the details viewer and the unified sheet. Links, embeds, images and callouts all work.
- `avatar` is a vault path, used in the sheet header, the print portrait, and the Foundry portrait and token, until `gallery.5e` exists.

```markdown
---
kind: details
schemaVersion: 1
avatar: Art/ilsa.png
---
## Backstory
![[Ilsa backstory]]

## Personality Traits
Quiet until the forge is lit.

## Ideals

## Bonds

## Flaws

## Appearance
```

### spells.5e

- Spellbook, known spells and prepared spells, grouped per spellcasting class for multiclass characters. Entries reference content ids.
- Spell slots used are live state, so they live in `state.5e`.
- Spell choices are checked against the current build every time the character resolves. Spells that no longer fit, for example after removing a class, are flagged for review rather than silently dropped.

### inventory.5e

- Items are either references to source content (browsed by tag) or custom objects created by the user.
- Each entry has an item id or an inline custom item, plus quantity and notes.
- Inventory feeds the resolver, since armour, shields and magic items change AC and can grant features.
- Equipped and attuned flags and currency live here.
- Custom items use the same element format as source content, so a homemade +1 shield can carry real modifiers. Users create and edit them through a wizard, never by typing JSON.

### Post-MVP: layout.5e and gallery.5e

- `layout.5e` sets background colour, accent colour, background image, and which gallery images appear on the sheet. Styling resolves in order: `layout.5e`, then plugin settings, then theme defaults.
- `gallery.5e` stores character art, with one image designated as the avatar.
- The MVP sheet reads all styling through one lookup function, so adding `layout.5e` later is one more layer, not a refactor.
- Gallery entries reference vault paths or URLs, never embedded image data, and have ids that `layout.5e` refers to. The plugin listens for vault rename events and updates paths.

### Cross-file writes

- Builder actions that touch several files, like a level-up that also adds spell choices and new resources, stage all changes and write them together, or not at all.
- Writes from frequent state changes are debounced, so tapping HP buttons in combat doesn't thrash the file.

## Rules content format

> **`docs/schema.md` is the authority on the content format.** This section is the
> intent behind it and a readable introduction; where the two disagree, the schema
> reference wins. Field-level questions — what `repeatable` means, where a nested
> choice's answer is stored, which ops exist — are answered there.

All rules content is made of **elements**: JSON objects with an id, a kind, a source, rules text, and optional **parts**. A feature is a container of independent parts, because 5e often lumps several separately triggered mechanics into one named feature. The engine handles each part on its own.

### Element fields

| Field | Required | Notes |
| --- | --- | --- |
| `id` | Yes | Namespaced and human-readable: `srd:barbarian:rage` |
| `kind` | Yes | Open string. Must resolve to a kind definition (see Kinds as data) |
| `name` | Yes | Display name |
| `source` | Yes | Must resolve to a sourcebook element. The validator rejects elements that don't |
| `text` | Strongly recommended | Rules text, always displayable. The fallback for anything the parts can't express |
| `tags` | No | Used by choices, filters and browsing |
| `requires` | No | Prerequisites, enforced only when the builder toggle is on |
| `page` | No | Page in the sourcebook, shown as a badge like "PHB 48" |
| parts | No | `grants`, `choices`, `modifiers`, `resources`, `actions`, `effects` |

### Parts

| Part | What it does | Who uses it |
| --- | --- | --- |
| `grants` | Unconditionally adds other elements: a feature, proficiency, spell | Builder and resolver |
| `choices` | Pick N from elements matching a filter (kind, tags, ids), with optional requirements | Builder renders a select |
| `modifiers` | Passive changes to stat paths, optionally situational | Resolver |
| `resources` | A pool with a max (an expression) and a recharge rule | Resolver and sheet |
| `actions` | Something the player activates: activation type, optional resource cost, optional effect it applies | Sheet renders a button |
| `effects` | A toggleable overlay of modifiers with a duration. Active effects are recorded in `state.5e` | Resolver overlay |

Any part can carry its own `text` or `notes` for whatever isn't mechanised.

### Example: Rage

One resource, one action, and one effect with several modifiers, plus a restriction left as text. Ki works the same way, with three actions (Flurry of Blows, Patient Defense, Step of the Wind) spending one resource, each its own button on the sheet.

```json
{
  "id": "srd:barbarian:rage", "kind": "class-feature", "name": "Rage", "source": "srd",
  "tags": ["barbarian-feature"],
  "text": "In battle, you fight with primal ferocity…",
  "resources": [{ "id": "rages", "name": "Rages", "max": "@table(barbarian, rages)", "recharge": [{ "on": "long-rest", "amount": "all" }] }],
  "actions": [{ "id": "rage", "activation": "bonus-action", "cost": { "rages": 1 }, "applies": "raging" }],
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

### Situational modifiers

Any modifier can take an optional `when`. Modifiers without `when` fold into the stat's value. Modifiers with `when` never do: they attach to the stat as annotations, attributed to the element they came from, and the sheet shows them in a tooltip.

- `when.text` is what the tooltip shows.
- `when.context` is an optional id. It lets the sheet later offer a toggle ("I'm impersonating someone") that folds every modifier sharing that context into the numbers. The builder only has to preserve it.
- Situational modifiers support every `op`, not just numbers. The Actor feat's impersonation benefit is advantage; Stonecunning is a situational proficiency change.

```json
{
  "id": "srd:dwarf:dwarven-resilience", "kind": "species-trait", "name": "Dwarven Resilience", "source": "srd",
  "text": "You have advantage on saving throws against poison…",
  "modifiers": [
    { "target": "saves.all", "op": "advantage", "when": { "text": "against poison" } },
    { "target": "resistances", "op": "include", "value": ["poison"] }
  ]
}
```

### Choices and requirements

- A choice has an `id`, a `count`, and a `from` filter by `kind`, `tags` and/or explicit `ids`. Options come from every loaded source, so homebrew carrying the right tag appears automatically.
- A choice's options are elements, and a chosen element declares its own choices in turn. Nesting is how a parametrised decision is expressed — pick Ability Score Improvement, which then asks which abilities to raise — and `repeatable` lets one option be picked more than once. See `docs/schema.md`, "The choice model".
- `requires` takes `all`, `any` and `not` lists of predicates: class level, total level, ability minimum, has element, has proficiency.
- Enforcement is optional, behind a builder toggle.
- With enforcement off, unmet requirements show as a warning on the option rather than hiding it.

### Classes and progression

- Class and subclass elements key their grants and choices by level in a `levels` map, so the progression browser reads straight off the data.
- Class tables are named columns (`rages`, `rage-damage`) referenced from expressions with `@table(class, column)`.
- The subclass is a choice at the level the class gains it, filtered by kind `subclass` and a class tag.
- Spellcasting is declared on the class: ability, progression (full, half, third, pact), preparation type (prepared, known, spellbook), spell list tag, and starting level. Multiclass slot totals derive from the progressions.

```json
{
  "id": "srd:class:paladin", "kind": "class", "name": "Paladin", "source": "srd",
  "hitDie": "d10",
  "spellcasting": { "ability": "cha", "progression": "half", "type": "prepared", "list": "paladin-spell", "startsAt": 2 },
  "levels": {
    "1": { "grants": ["srd:paladin:divine-sense", "srd:paladin:lay-on-hands"] },
    "2": {
      "grants": ["srd:paladin:spellcasting", "srd:paladin:divine-smite"],
      "choices": [{ "id": "srd:paladin:fighting-style", "count": 1, "from": { "kind": "fighting-style", "tags": ["paladin-fighting-style"] } }]
    },
    "3": {
      "grants": ["srd:paladin:divine-health"],
      "choices": [{ "id": "srd:paladin:sacred-oath", "count": 1, "from": { "kind": "subclass", "tags": ["paladin-subclass"] } }]
    }
  }
}
```

### Kinds as data

- Kinds are declared by elements of kind `kind`, with UI hints: label, plural, which sheet tab they live on, and list or card display.
- Core kinds (species, class, subclass, background, feat, feature, spell, item, and similar) ship in a built-in core source. Other sources can add kinds.
- A Mystic port would declare `psionic-discipline` and `psionic-talent` kinds and a `psi` resource, and give disciplines actions with a variable cost (`{ "psi": { "min": 2, "max": 7 } }`). The sheet grows a Disciplines tab with no plugin changes.

### Terminology

- The schema uses the most recent official terminology, so `species` rather than `race`.
- Legacy terms are translated on load. Kind definitions can declare aliases, so content using `race` (such as `srd:race:dwarf`) is read as `species` by default.
- Once a species is selected, the options it offers come from the source's own data, so the plugin works the same whichever SRD version the content was converted from.

### Stat paths and operations

- Core stat paths include `abilities.<ability>.score`, `saves.<ability>`, `checks.<ability>`, `skills.<skill>`, `ac`, `hp.max`, `speed.<mode>`, `senses.<sense>`, `initiative`, `proficiencyBonus`, `resistances`, `immunities`, `vulnerabilities`, `languages`, `proficiencies.<type>`, `damage.<scope>` and `spellcasting.<class>.dc`. Sources can declare new stat paths and resources.
- Operations: `add`, `set`, `min` (a floor), `max` (a ceiling), `advantage`, `disadvantage`, `include` (add to a set), `proficiency` (half, proficient, expertise), and `base` for competing formulas.
- Stacking: `base` candidates compete and the highest wins, which is how armour, Unarmored Defense and Mage Armor coexist. Modifiers sharing a `stackKey` don't stack; the highest applies.

### Expressions

- References: `@abilities.con.mod`, `@prof`, `@level` (total), `@level(monk)`, `@table(barbarian, rages)`.
- Arithmetic (`+ - * /`) and `floor`, `ceil`, `min`, `max`.
- Parsed by a small, safe parser. Never `eval`.
- Damage and dice are strings in standard notation (`2d6 + @abilities.str.mod`).

### Degradation and versioning

- Anything the engine doesn't recognise (an unknown part type, op or stat path) is kept and shown as text with a small warning badge. It never fails the load. The worst case is always readable but manual.
- Content is validated against a versioned JSON Schema. Core fields are strict. Keys prefixed `x-` are allowed for experimental extensions and ignored by the core engine.
- Ids are namespaced by source. Homebrew can replace or patch an existing element, resolved by source priority (see Sources).

## Sources

Content comes from **sources**, which are either GitHub repos (where the converted SRD repo will be hosted) or local/network paths. Vault-wide sources and their load order live in plugin settings, and a character can override them through `sources.5e` or whatever its manifest points to. More specific always wins.

A source is a location. A **sourcebook** is the book an element comes from. One source can contain several sourcebooks.

### Sourcebooks

- Sourcebooks are elements of kind `sourcebook`, with a required `abbreviation`.
- Every element's `source` must reference a loaded sourcebook. The validator rejects elements that don't.
- Sourcebooks also carry `version`, `license` and `attribution`. The SRD is licensed CC-BY-4.0, which requires attribution, so the plugin shows the notice for every loaded sourcebook in one place.

```json
{
  "id": "srd", "kind": "sourcebook", "name": "System Reference Document",
  "abbreviation": "SRD",
  "version": "5.1",
  "license": "CC-BY-4.0",
  "attribution": "…"
}
```

### Priority and overrides

- Plugin settings hold the vault-wide source list with a load order.
- Per-character sources (`sources.5e`, or the file the manifest names) take priority over vault-wide ones.
- When two sources define the same id, the higher-priority one wins.
- A per-character list can both add sources and disable vault-wide ones, for a campaign that doesn't allow a homebrew book other campaigns use.
- The builder's element info shows "overridden by X" when a collision was resolved, to make homebrew debugging easy.

### Source repository layout

- A `source.json` at the root gives the source's id and name and lists its sourcebooks. Every `.json` file under `content/` is loaded, and each file holds one element or an array of elements. Folder structure inside `content/` is free.

### Fetching, pinning and caching

- Use Obsidian's `requestUrl` for remote fetches. It works on mobile and avoids CORS.
- Paths inside the vault work on every platform. Paths outside the vault, including network shares, rely on Node's filesystem access and work on desktop only.
- GitHub sources are pinned to a tag or commit SHA in their source entry, so a fix pushed to the SRD repo can't silently change anyone's AC. Updating a pin is a deliberate action that shows what changed.
- If the same source appears with conflicting pins, the more specific entry wins, as with every other source setting.
- Caching is configurable in plugin settings, because a phone shouldn't have to download every source and image. There are three tiers:
  - **None:** cache only the content the user's characters use.
  - **Smart:** cache content available to the user's characters, such as the full Paladin progression for a paladin, but no Wizard features.
  - **All:** cache everything, for speed.

### Validation and missing content

- Content is validated against the JSON Schema on load. Invalid elements are skipped and reported per element in the sources panel. Valid elements still load.
- If a character references elements from a source that isn't loaded, the selections are kept as unresolved placeholders, with a message naming the missing source. Re-adding the source restores everything.

## Resolver

The resolver is a pure function from loaded content plus a character's files to a resolved character. The sheet, the builder and every exporter read its output, and none of them compute rules themselves.

```
resolve(content, build, inventory, spells, state?) → ResolvedCharacter
```

- **Level state** is `resolve` with no state. **Live state** passes `state.5e`. Exports choose between them.
- It is synchronous, deterministic and fast enough to re-run on every change. Memoise by input.

### Order of operations

1. **Collect elements.** Start from the build's selections (species, background, class levels, choices) and follow `grants` recursively. Add inventory items that apply, with their parts.
2. **Check choices.** Unmade choices are returned as pending choices for the builder. Unmet requirements are returned as warnings.
3. **Compute stats.** Start from base values, apply modifiers, let `base` candidates compete, and apply `stackKey` rules. Expressions are evaluated in dependency order (a CON modifier depends on every modifier to the CON score). Cycles are reported as errors, not looped.
4. **Attach situational modifiers** as annotations on their target stats.
5. **Overlay state** (live state only). Active effects apply their modifiers. Damage, temp HP, temp max HP and spent resources produce current values.

### Output

- Every stat has a value, its situational annotations, and a breakdown of contributions, each attributed to its source element, so a tooltip can show where a number comes from.
- Resources with max, spent and remaining. Spent amounts above a new max are clamped.
- Available actions and active effects.
- Features grouped by kind, ready for data-driven tabs.
- Diagnostics: unknown parts, unmet requirements, unresolved references, missing sources, expression errors, and spells that no longer fit the build.

### Testing

The resolver is the most test-worthy part of the plugin. Every part type, op and stacking rule should have fixture-based unit tests that run without Obsidian.

## Builder UI

The builder generates a character's data by walking the content graph. Every choice the content declares becomes a select, so the builder contains no class-specific or source-specific code.

### Flow

- The builder is the same set of sections in both layouts: origin, levels (with planned levels), spells, equipment, details and review. Narrow scrolls them under a rail; desktop shows them as tabs with a reading sidebar.
- Selections add or remove tabs where applicable. A character with no spellcasting has no spells tab, and a source's new kinds can add tabs of their own.
- Working through the tabs in order feels like a wizard, but any tab can be revisited at any time, and changing an earlier choice updates everything after it retroactively.
- If an earlier change invalidates a later choice, for example because it came from a feature the character no longer has, the choice is kept and flagged in the pending-choices list.
- Saving while conflicts remain asks for confirmation: "Conflicting options checked, saving now means your character sheet may not render properly. Continue?"

### Selection

- The normal flow is feature by feature: make each choice as it comes up.
- Each choice is a plain options select. If the content declares requirements, a toggle enforces them.
- A pending-choices list, read from the resolver, shows everything still to choose.
- Element info shows the name, the sourcebook abbreviation (plus page when present), rules text and tags.
- Levelling up adds a level, asks for the class, then presents that level's new choices. The write follows the cross-file rules in Character files.

### Class and subclass browser

The user can view a full class or subclass progression without changing their level. This fixes a frustration with Aurora Builder, where looking ahead meant setting level 20, browsing, then levelling back down.

- Shows levels 1–20 as a timeline. Choice points expand to show their options, such as every Fighting Style. Subclass features appear at their levels.
- Read-only. It reads the content directly and never touches the character.
- A "view source" view renders a mimic of the sourcebook page for a class or subclass, constructed from its features.

### Sources section

- Add sources from a GitHub repo or a local/network path.
- Shows the character's effective source list: vault-wide sources from plugin settings plus the character's own, in priority order.
- Shows validation errors per source and the attribution for each loaded sourcebook.

## Character sheet UI

The sheet is a full-pane, tabbed view of the resolved character, with interactivity for live play: HP, spell slots, resources, effects and rests. It reads everything from the resolver and records every change as an event in `state.5e`.

### Views and tabs

- `sheet.5e` opens the unified view. Each tab draws on the file the manifest maps to it.
- Each file kind also opens in its own viewer.
- Tabs for new kinds are generated from their kind definitions, so a Mystic source gets its Disciplines tab without plugin changes.

### Interactivity

- HP: damage, healing, temp HP and temp max HP, each recorded as its own event type so they can't be confused.
- Spend and regain spell slots, hit dice and feature resources.
- Actions spend resources and toggle effects. Dice rolling and initiative tracking come later and don't affect the current design.
- Short rest and long rest restore resources according to each resource's recharge rule.
- Death saves, conditions, exhaustion, concentration and inspiration.
- Undo, which the event log makes cheap.

### Display

- Stats with situational modifiers show a marker. The tooltip lists each annotation and the element it came from.
- The tooltip also shows the stat's breakdown, so players can see where a number comes from.
- The details tab renders each section of `details.5e` through `MarkdownRenderer`, so inline markdown and `![[embeds]]` both work.
- Content the engine couldn't mechanise shows its text with a small warning badge.
- The avatar appears in the sheet header.

### Styling

- Layout configuration lives in plugin settings. With no plugin settings, the sheet uses theme defaults.
- All colours and spacing come from Obsidian's CSS variables, so the sheet matches the user's theme, light or dark.
- `layout.5e` adds a per-character layer later (see Character files).

### Mobile

- The sheet is the at-the-table experience on phones and tablets, so the layout is responsive with large tap targets for HP, slots and death saves.
- A play mode hides builder controls.
- Mobile support stays basic for now and gets reworked in depth once the foundation exists.

## Export

Two export formats: a standard printed character sheet and Foundry VTT. Every export asks whether to include live state or use level state.

- Each exporter is a separate adapter that reads the resolver's output and nothing else, so adding a format never touches the builder.

### Printed character sheet

- A standard printed character sheet layout.
- Rendered as HTML with a print stylesheet and saved to PDF through Electron's print-to-PDF on desktop. Mobile gets the HTML for the system share sheet.
- The avatar fills the portrait slot.

### Foundry VTT

- Exports a JSON actor for Foundry's dnd5e system: features, spells and inventory become items, and modifiers become active effects where they map.
- HP maps directly, since the dnd5e actor already separates `hp.value`, `hp.max`, `hp.temp` and `hp.tempmax`.
- Targets dnd5e 5.x, pinned as one constant in the exporter. The pin is a major version because FVTT's major releases change the data model; moving to 6.x is a deliberate change made only after the converter has been verified against it, never automatic. The exporter records the last 5.x release it was verified against beside the pin, for reproducibility. A new 5.x minor release is re-verified by running the exporter's tests, and the recorded release is updated when they pass.
- The actor carries no system version and no ruleset. Foundry's own 2014/2024 setting is left to the user; the exporter writes each item by its element's source, so `srd` items are 2014 and `srd24` items are 2024. Mixing rulesets across classes, species and backgrounds is the user's choice and the export does not police it.
- The avatar becomes the actor portrait and token image.
- The export has a toggle, chosen each time:
  - **Full export** supports levelling in Foundry, at the cost of a larger export. Each class's features are written as world items with stable IDs, and the class's advancement grants them from those UUIDs. Stable IDs come from the element id, so a re-export updates the same items rather than duplicating them. The export says the items must be imported before the character, since a grant to a missing item fails silently.
  - **Character only** is faster and smaller, and doesn't support levelling. Features are embedded on the actor as plain items with no grants. The export says that levelling in Foundry won't add features.

## Conversion tooling

Book text is converted into content by an LLM, guided by a conversion guide and Claude skills. Rule-based automation can't handle the variety of 5e feature text, and manual conversion takes too long. The user hands feature text to an LLM or Claude Code and gets valid elements back.

### Deliverables

- **A conversion guide** explaining how feature text maps to elements and parts, written for both people and LLMs.
- **Claude skills** that perform the conversion using the guide.
- **A validation CLI** that shares the plugin's validator: JSON Schema checks plus reference checks (sources exist, ids resolve, expressions parse). Claude Code runs it on its own output in a loop until it passes.

### Guide content

- The core rule: mechanise what maps cleanly and leave the rest as text. The converter never has to fail, because a text-only element is always valid.
- Phrasing cues worth teaching: "when", "against" and "related to" usually signal a situational modifier, and "you can use this feature N times" signals a resource.
- Later, once prototyping has settled the format: worked examples of tricky features as few-shot material, such as multi-part features (Rage, Ki), situational modifiers (Dwarven Resilience, Stonecunning), choice features (Fighting Style), subclass choice points, spellcasting and multiclass slot progression, and a text-only feature.

## MVP scope and test content

The MVP is a minimal plugin plus just enough converted SRD content to test the builder end to end: one species, one class, one subclass, and similar. Everything after that is iteration.

### Out of the MVP

- `layout.5e` and `gallery.5e`.
- Dice rolling and initiative.
- Link indexing for `.5e` files. Obsidian's metadata cache doesn't see wikilinks inside them, so backlinks and the graph miss them, including backstory notes embedded from `details.5e`. This gap is accepted for now and revisited post-MVP.
- Both export formats.

### In the MVP

The MVP isn't scoped feature by feature. Claude Code builds what it can from this spec first, and the scope gets tweaked as it goes.

### Test content

These picks exercise nearly every part type with very little content:

| Element | Pick | What it exercises |
| --- | --- | --- |
| Species | Dwarf | Situational modifiers, a tool proficiency choice, speed and senses |
| Class | Paladin | Resources, actions that spend spell slots, a Fighting Style choice, half-caster spellcasting |
| Subclass | Oath of Devotion | Subclass choice at level 3, granted oath spells, Channel Divinity actions and effects |
| Background | Acolyte | Grants and proficiency choices |
| Spells | A handful of paladin spells | Spell lists, preparation, slot spending |
| Items | Longsword, chain mail, shield, potion of healing | AC base candidates, equipping, consumables |

For early testing, levels 1–5 are mechanised fully and higher levels are converted as text-only elements, which also tests the text fallback. The finished MVP handles the full 1–20 progression.
