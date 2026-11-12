# Development

Notes for working on dragonglass-builder. For what the project is, see the
[README](../README.md); for the rules a contributor (human or agent) must keep, see
[CLAUDE.md](../CLAUDE.md).

## Layout

| Path | What it is |
| --- | --- |
| `src/core/` | The rules engine. No Obsidian dependency, so it runs in unit tests and the CLI. |
| `src/obsidian/` | The plugin: views, the per-character store, source loading, settings. |
| `src/obsidian/ui/` | React. The sheet, the builder, and the focused per-file viewers. |
| `src/cli/` | The validation and export CLIs, sharing the plugin's own code. |
| `content/core/` | Kind and stat-path definitions, bundled into the plugin at build time. |
| `content/srd/` | A small hand-converted SRD slice, used by the tests and the CLI. The plugin's default sources are the full SRD repos instead. |
| `docs/` | Schema, conversion guide, specs, plans and findings; see [README.md](README.md). |
| `spikes/` | Throwaway research code for the Foundry integration. Nothing imports it. |
| `tests/` | Engine, content, store and UI render tests. |
| `.claude/` | Claude Code skills and agents that perform content conversions. |

## Commands

```sh
npm install
npm test                                    # the whole suite
npm run dev                                 # watch build straight into vault/
npm run build                               # typecheck + production bundle
npm run validate -- content/srd --strict    # validate a content source
```

## The test vault

`npm run dev` builds the plugin into `vault/.obsidian/plugins/dragonglass-builder/`, so
opening `vault/` in Obsidian and reloading picks up changes. `vault/` is git-ignored:
it is your own scratch space and Obsidian writes its state there.

To set one up, create `vault/`, open it in Obsidian, enable community plugins, run
`npm run dev`, and reload. A fresh install loads the two public SRD repos
(`DEFAULT_SOURCES` in `src/obsidian/settings.ts`) from GitHub, so a new vault needs no
setup; to work on the hand-written slice instead, remove them in settings and add
`content/srd/` as a vault source (for example as `vault/Sources/srd`). Then create a
character from the plugin's commands. No test reads from `vault/`; test characters live in `tests/fixtures/`.

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
- **`resolve(...)`** is pure, synchronous and deterministic. Without `state` it returns
  level state; with it, live state. Every view and exporter reads its output and nothing
  else.

Each stat in the output carries its value, its situational annotations, and a breakdown
of every contribution attributed to the element it came from, which is what the sheet's
tooltips show.

### Degradation

Anything the engine doesn't recognise (an unknown part, op or stat path) is kept and
shown as text with a warning badge. It never fails the load. A character whose source
isn't loaded keeps its selections as unresolved placeholders and names the missing
source. The worst case is always readable but manual.

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

Not yet, and deliberately out of the MVP (see also [backlog.md](backlog.md)):

- Both export formats (printed sheet, Foundry VTT). The resolver's output is the only
  thing an exporter needs, so neither touches the builder.
- `gallery.5e`.
- Dice rolling and initiative tracking.
- Link indexing for `.5e` files: Obsidian's metadata cache doesn't see wikilinks inside
  them, so backlinks and the graph miss them.
- Mobile has not been tested on a device.
