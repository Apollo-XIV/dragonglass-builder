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

## Registering the GitHub OAuth App

Signing in to GitHub (for private sources) uses the device flow, which needs a client id and
nothing else. Until one is set, the sign-in dialog says it isn't set up in this build.

1. GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**. (Use an
   organisation's settings instead if the app should belong to one.)
2. Fill it in:
   - **Application name:** Dragonglass (or similar; users see it on the consent screen).
   - **Homepage URL:** the repository's URL.
   - **Authorization callback URL:** required by the form but unused by the device flow;
     any valid URL works, e.g. the repository's URL.
3. After creating it, tick **Enable Device Flow** and save.
4. Copy the **Client ID** into `GITHUB_CLIENT_ID` in `src/obsidian/github-oauth.ts`. It is
   public, so it is committed. Do not generate or keep a client secret; nothing uses one.
5. Check it end to end in Obsidian: Settings → Dragonglass → GitHub account →
   **Sign in**, enter the code at github.com/login/device, then add a private repo with
   **Use my GitHub login**. When asked, set a password. Check "Signed in as <login>" shows and
   a repo you don't own but can read loads. Then restart Obsidian: the source must still load
   from its cache with no request and say "enter password to check for updates", and its
   button must ask for the password, accept the right one and reject a wrong one. Also try
   "Don't save (this session only)", and the trash button that forgets the saved login.

Things to know:

- The only scope that reads private repos is `repo`, which also writes wherever the user
  can. The sign-in dialog says so. Obsidian has no storage other plugins can't read, so the
  login is sealed with a password the user types before it is saved, and held in memory once
  unlocked; sources fetched with it are cached in the vault, so the password is only needed to
  check for updates. Forgetting the login only deletes our copy; to revoke the token itself,
  remove the app under GitHub → Settings → Applications → Authorized OAuth Apps.
- An organisation with third-party app restrictions blocks the app until an admin approves
  it, and GitHub then answers 404 for that org's repos. The source error mentions this.
- Classic OAuth App tokens don't expire, so there is no refresh. A 401 means the token was
  revoked and the user signs in again.
