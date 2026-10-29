# dragonglass-builder

An Obsidian plugin for D&D 5e: a data-driven character builder and an interactive
character sheet. Built from `Obsidian 5e Builder & Sheet Design Spec.md`, which is the
authority on intent — read it before making a design decision.

## Commands

```sh
npm test                                   # vitest, 196 tests
npm run typecheck                          # tsc --noEmit
npm run build                              # bundle content, typecheck, build main.js
npm run dev                                # watch build into vault/
npm run validate -- content/srd --strict   # validate a content source
```

## The rule that shapes everything

**`src/core/` must not import from `obsidian`.** The engine runs in unit tests and in the
validation CLI, which is what makes both possible. If you need an Obsidian API in the
engine, you are solving it in the wrong layer — pass the data in instead.

Tests resolve `obsidian` to `tests/stubs/obsidian.ts` (see `vitest.config.ts`), so store
and UI tests can run in node.

## Layout

```
src/core/            the rules engine, no Obsidian imports
  types.ts           elements, parts, character files, diagnostics
  expr/              the expression language: parser and evaluator, never eval
  content/           validator, ContentIndex, requirements, source bundles
  resolver/          collect → stats → resolve; resolved.ts is the output shape
  state/fold.ts      folding the live-state event log
src/obsidian/        the plugin
  view.ts            one view for .5e, dispatching on each file's kind
  character-store.ts one store per character folder; owns reads, writes and resolution
  sources.ts         vault, path and pinned GitHub source loading
  ui/                React
  ui/narrow/         the narrow layout: rail, sticky sections, hold sheets, toasts
src/cli/validate.ts  the validation CLI
src/node/            filesystem source loading, for the CLI and tests only
content/core/        kinds and stat paths, bundled into the plugin at build time
content/srd/         the converted SRD test slice
vault/               test vault with the plugin installed and a sample character
```

## The two layouts

`mobile-ux-spec.md` is the authority on the narrow layout, as the design spec is on
everything else. **The layout is chosen from the view container's own width** (900px,
40px of hysteresis), not the window's, so a side pane on a desktop gets the narrow
layout too — `ui/narrow/layout-mode.ts`. Below that width `CharacterApp` renders
`NarrowRoot` instead of the tabbed `Sheet`/`Builder`; above it, nothing changed.

The narrow layout's own rules:

- **Tap interacts, hold reads.** One hook (`narrow/hold.ts`) and the innermost target
  under the finger wins, which is how a roll box inside a feature row shows its
  breakdown rather than the row's text.
- **The narrow layout owns its scroll container** (`narrow/scroller.tsx`), because
  sticky section headers only work if the scroller is in our tree. The view's element
  stops scrolling via `shell.setLayout`.
- **The scroll maths is pure** (`narrow/scroll.ts`): rail scrubbing, detents, snapping
  and the active section are plain functions over stop positions, and tested as such.
- **Tuned values live in `narrow/constants.ts`**, user-facing ones in
  `settings.narrow`. Everything in the spec's section 10 is one of the two.
- **Every CSS rule styling a `<button>` needs two classes.** Obsidian fills bare
  buttons at specificity (0,1,1), so a one-class rule loses and the button keeps
  `--interactive-normal`. The narrow layout's button selectors carry a `.dg-layout`
  prefix for exactly this reason.
- **Sheet and builder switch through the pane menu**, via `onPaneMenu` in `view.ts` —
  not `addAction`, which adds a header icon the narrow layout has no room for. Switching
  is `this.leaf.openFile(...)` on the counterpart file: same tab, and the view already
  rebuilds around whatever file it is given. Leaving the builder that way unmounts it,
  which is what hands its unsaved work to the draft.
- **`layout.5e` is the per-character layer.** Styling and narrow preferences resolve in
  the design spec's order: the character's `layout.5e`, then plugin settings, then the
  theme — `resolveNarrow` and `resolveAccent` in `settings.ts`. An absent field is not an
  override, which is what keeps a plugin-wide change reaching every character that has
  not said otherwise. Rail order and side live here when a character wants its own.
- **The rail highlights on the tap, not on the scroll.** A tapped section becomes active
  immediately (`motion.intent`) and holds until the glide lands or the reader takes over.
  Deriving it from scroll position alone makes the highlight lag the whole animation and
  land on the section above whenever the final position is a rounding error short.
- **Anything a bottom sheet shows while it stays open must read from the store**, not
  from props. The sheet host sits above the component that opened it, so React renders
  the host first and a prop-derived value is always one update behind — which is exactly
  the case the resource menu exists for.
- **The shell boundary** (`narrow/platform.ts`) carries the things only Obsidian can
  do — vibrate, set the title, open the sheet, reclass the container — so narrow
  components don't import `obsidian` for them.

## Things worth knowing before you change them

**The resolver is pure and runs twice when live state is supplied.** Pass A computes
resource maxima and slot counts (the fold rules the event log needs); the state is then
folded; pass B recomputes with the active effects' modifiers included. Both passes are
cheap. Don't try to collapse them — the circularity is real.

**Stats resolve lazily with cycle detection** (`src/core/resolver/stats.ts`). A CON
modifier feeding HP works without a hand-written evaluation order. A stat that depends
on itself reports `expression-cycle` and returns 0 rather than looping.

**Stacking.** `base` candidates compete and the highest wins — including the stat's own
computed base, which is how unarmoured AC loses to chain mail. Modifiers sharing a
`stackKey` don't stack. `min` is a floor, `max` a ceiling. Modifiers with a `when` never
fold into the value; they attach as annotations.

**Choice answers are stored where the choice was declared.** A choice in a class or
subclass `levels` entry is written to that build level; a choice on an element goes in
`build.choices`. This is what makes a repeated id (an ASI at 4, 8 and 12) unambiguous.
`answerFor` in `collect.ts` reads both places so hand-edited files still work.

**Filter criteria are ANDed.** `{ kind, ids }` narrows; it does not union. Getting this
wrong made every skill appear in a six-skill choice.

**Degradation is a feature, not error handling.** Unknown parts, ops and stat paths are
kept and surfaced as diagnostics with the text still displayed. Only a missing `id`,
`kind`, `name` or `source` makes an element unusable. Preserve this when adding checks.

**Every builder edit goes through `previewChange` / `commitChange`**
(`src/core/resolver/validity.ts`). Validity is never stored: a pick is live if the
current selections lead the collector to the choice it answers. So clearing an option
leaves its dependants in the file, inert, and putting the option back revives them with
nothing having been remembered. The one rule: a change that puts something **new** in
place of the old option removes what depended on it for good; a change that only takes
an option away invalidates it reversibly. Adding a level, removing a level and editing a
choice all come through the same two calls.

**The builder is ephemeral once a character exists** (`ui/narrow/session.tsx`,
`CharacterStore.beginEdit`). A session holds writes to `build`, `spells` and `inventory`
in memory — other kinds still write through, which is what keeps the sheet's hit points
working in another pane. Leaving the builder discards the session and leaves the work in
a draft (plugin data, keyed by folder), so the sheet shows what is saved. Making a
character for the first time saves live instead, decided once when the builder opens.

**Picks for levels not yet taken.** `build.planned` queues choices by class and class
level, never by character level, so taking a Fighter level leaves the Wizard plans
alone. `addLevel` applies and consumes the queue; `removeLevel` demotes that level's
picks back into it. A class's class level is how many `levels` entries it has, which is
why nothing renumbers. See `src/core/resolver/levels.ts`.

**Explaining a number.** `resolver/explain.ts` turns a stat's recorded contributions
into the lines a roll sheet prints, and `resolver/attacks.ts` assembles weapon attacks
from equipped items — the one reading the resolver doesn't do itself. Both are in core
so the wording is testable without a view.

**Resource and pool keys.** A resource id containing `:` is used as-is; otherwise it is
namespaced by its owning element (`srd:barbarian:rage:rages`). Pool targets in the event
log are `slots.<n>`, `pact`, `hitDice.<die>`, or `resources.<key>`; `bucketOf` and
`canonicalPoolKey` in `fold.ts` normalise them.

**Writes are debounced and batched.** `store.update` stages a file and schedules a flush;
`store.updateMany` stages several so a level-up writes them together. Serialisation
happens before any write begins. The store ignores the vault `modify` event for content
it just wrote, and reloads for anything else.

## Testing

- `tests/expr`, `tests/content`, `tests/state`, `tests/resolver` cover the engine with
  synthetic fixtures.
- `tests/srd-content.test.ts` resolves the real content in `content/` and asserts the
  numbers longhand. It catches content mistakes as well as code mistakes — when you
  convert content, add to it.
- `tests/store.test.ts` runs the store against an in-memory vault adapter.
- `tests/ui.test.tsx` renders the sheet and builder to static markup, so a crash in a
  panel fails a test instead of showing a blank pane. It covers both layouts.
- `tests/narrow-layout.test.ts` covers the layout decision and the rail's arithmetic;
  `tests/levels.test.ts` the level and queue operations; `tests/validity.test.ts` the
  invalidate-versus-remove rules; `tests/diff.test.ts` the save's change list;
  `tests/explain.test.ts` the breakdown wording and the dice.

For a real end-to-end check, build into `vault/`, open it in Obsidian, and open
`Characters/Ilsa/sheet.5e`. Obsidian can be driven over CDP
(`obsidian --remote-debugging-port=9222`, then Node 22's global `WebSocket`) if you need
to verify rendering without a person looking at it — but **restore
`~/.config/obsidian/obsidian.json` afterwards**, since registering a vault changes which
one the user's next launch opens.

## Converting content

Use the `convert-5e-content` skill, which reads `docs/conversion-guide.md`. Never write
into `content/core/` — that is the plugin's own kind and stat-path definitions.
