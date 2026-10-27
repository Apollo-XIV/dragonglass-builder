# dragonglass-builder

An Obsidian plugin for D&D 5e with two halves: a data-driven character builder that
writes character files, and a character sheet that renders those files as an
interactive, standalone view.

Built from [the design spec](./Obsidian%205e%20Builder%20%26%20Sheet%20Design%20Spec.md).

## What's here

| Path | What it is |
| --- | --- |
| `src/core/` | The rules engine. No Obsidian dependency, so it runs in unit tests and the CLI. |
| `src/obsidian/` | The plugin: views, the per-character store, source loading, settings. |
| `src/obsidian/ui/` | React. The sheet, the builder, and the focused per-file viewers. |
| `src/cli/validate.ts` | The validation CLI, sharing the plugin's validator exactly. |
| `content/core/` | Kind and stat-path definitions, bundled into the plugin at build time. |
| `content/srd/` | The converted SRD test slice: Dwarf, Paladin, Oath of Devotion, Acolyte. |
| `docs/conversion-guide.md` | How rules text becomes content. Written for people and LLMs. |
| `.claude/skills/` | A Claude skill that performs conversions using the guide. |
| `vault/` | A test vault with the plugin installed and a sample character. |
| `tests/` | 196 tests: engine, content, store and UI render tests. |

## Commands

```sh
npm install
npm test                       # the whole suite
npm run dev                    # watch build straight into vault/
npm run build                  # typecheck + production bundle
npm run validate -- content/srd --strict    # validate a content source
```

`npm run dev` builds into `vault/.obsidian/plugins/dragonglass-builder/`, so opening
`vault/` in Obsidian and reloading picks up changes.

## Architecture

A single pure resolver sits at the centre.

```
sources ──▶ ContentIndex ──┐
                           ├──▶ resolve() ──▶ ResolvedCharacter ──▶ sheet / builder / exporters
character files ───────────┘
```

- **Sources** are GitHub repos, vault folders or local paths. Each loads into a
  `ContentIndex`, where source priority settles id collisions and kind aliases are
  normalised.
- **Character files** are a folder of `.5e` files: `build.5e` holds selections,
  `state.5e` holds live play state as an event log with checkpoints, and `sheet.5e` is
  the manifest naming which file supplies each data type.
- **`resolve(content, build, inventory, spells, state?)`** is pure, synchronous and
  deterministic. Without `state` it returns level state; with it, live state. Every
  view and exporter reads its output and nothing else.

Each stat in the output carries its value, its situational annotations, and a breakdown
of every contribution attributed to the element it came from — which is what the sheet's
tooltips show.

### Degradation

Anything the engine doesn't recognise — an unknown part, op or stat path — is kept and
shown as text with a warning badge. It never fails the load. A character whose source
isn't loaded keeps its selections as unresolved placeholders and names the missing
source. The worst case is always readable but manual.

## The test vault

`vault/` contains the plugin, the SRD slice as a vault source, and **Ilsa Stonebrook**, a
level 5 dwarf paladin of the Oath of Devotion with live state already in her log. She
exercises nearly every part type: situational modifiers, a tool proficiency choice,
class tables, a subclass choice point, granted oath spells, Channel Divinity actions and
effects, half-caster slots, competing AC candidates, and a custom inventory item.

Open `vault/` as an Obsidian vault and open `Characters/Ilsa/sheet.5e`.

## Status against the spec

In and working:

- The content format: elements, all six part types, kinds and stat paths as data,
  aliases, expressions, stacking rules, degradation.
- The resolver, with the full five-phase order of operations.
- Sources: vault folders, local paths, pinned GitHub repos, priority and overrides,
  per-character source files, caching, attribution.
- Character files, the manifest, cross-file staged writes, debounced state writes.
- The builder: data-driven choices, levels, the progression browser, the sources panel.
- The sheet: HP, slots, hit dice, resources, actions, effects, rests, checkpoints,
  conditions, death saves, undo, breakdown tooltips, markdown details.
- The validation CLI and the conversion guide and skill.

Not yet, and deliberately out of the MVP:

- Both export formats (printed sheet, Foundry VTT). The resolver's output is the only
  thing an exporter needs, so neither touches the builder.
- `layout.5e` and `gallery.5e`. The sheet reads styling through one lookup, so adding
  them later is one more layer.
- Dice rolling and initiative tracking.
- Link indexing for `.5e` files: Obsidian's metadata cache doesn't see wikilinks inside
  them, so backlinks and the graph miss them.
- Mobile is responsive and has large tap targets, but has not been tested on a device.

## Licence

MIT for the code. The SRD content in `content/srd/` is CC-BY-4.0; its attribution is in
`content/srd/content/sourcebook.json` and the plugin shows it for every loaded
sourcebook.
