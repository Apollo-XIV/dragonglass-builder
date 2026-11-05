# dragonglass-builder

An Obsidian plugin for D&D 5e: a data-driven character builder and an interactive
character sheet. Built from `Obsidian 5e Builder & Sheet Design Spec.md`, which is the
authority on intent — read it before making a design decision.

Four documents are authoritative, each over its own territory:

| Document | Authority on |
| --- | --- |
| `Obsidian 5e Builder & Sheet Design Spec.md` | Intent, and everything not below |
| `docs/schema.md` | The content format: elements, parts, choices, stat paths |
| `mobile-ux-spec.md` | The narrow layout |
| `dragonglass desktop sheet spec.md` | The desktop sheet |

`docs/schema.md` is the one to read before touching `src/core/types.ts`, the validator, or
any content. It defines the choice model — options are elements, nesting is how a
parametrised decision is expressed, and an element picked twice is two occurrences — which
is the part most easily broken by accident.

## Commands

```sh
npm test                                   # vitest
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
  icons.ts           the game icons Lucide has no equivalent for (d20, vial)
  ui/                React
  ui/hp-panel.tsx    the HP vial, register and calc; belongs to neither layout
  ui/builder/        the builder, for both layouts: sections, picker, change confirmation,
                     session and drafts, the feature flags, the registry that lists sections
  ui/builder/reorder/  dragging levels: the pure state machine, the list, the fold override
  ui/narrow/         the narrow layout: rail, sticky sections, hold sheets, toasts
  ui/desktop/        the desktop sheet: header band, identity column, boxes, tabs
src/cli/validate.ts  the validation CLI
src/node/            filesystem source loading, for the CLI and tests only
content/core/        kinds and stat paths, bundled into the plugin at build time
content/srd/         the converted SRD test slice
vault/               test vault with the plugin installed and a sample character
```

## The two layouts

`mobile-ux-spec.md` is the authority on the narrow layout and
`dragonglass desktop sheet spec.md` on the desktop sheet; the design spec is the authority
on everything else. **The layout is chosen from the view container's own width** (900px,
40px of hysteresis), not the window's, so a side pane on a desktop gets the narrow
layout too — `ui/narrow/layout-mode.ts`. Below that width `CharacterApp` renders
`NarrowRoot`; above it, `DesktopSheet`.

**The two are siblings, not separate designs.** `DesktopSheet` mounts the narrow layout's
own hosts — `ToastHost`, `SheetHost`, `NarrowSettingsContext` — so the roll breakdowns,
resource menus, filter chips and feature rows are the same components in both. What
changes between them is arrangement and the gesture that opens things:

| Narrow | Desktop | Does |
| --- | --- | --- |
| tap | click | roll, spend a use, toggle |
| hold | right-click | the detail sheet, with advantage and uses |
| — | hover | a one-line breakdown of a computed number |

The desktop layout's own rules:

- **The design scale lives in `.dg-desk`'s custom properties** (and `.dg-n-ability-block`, which
  borrows it) in `styles.css`: one
  spacing scale, one radius scale, one type scale, and the five colour roles mapped to
  Obsidian's palette variables. Nothing below it uses a value of its own.
- **Surfaces are one elevation ladder**, not a set of named variables: the page, then
  `--d-surface` for a box, then `--d-tile` for a tile on it, then `--d-surface-sunken` for
  a track or a well inside one. Each rung is a `color-mix` towards `--text-normal`,
  because only a mix moves the right way in both a light and a dark theme — Obsidian's
  own `--background-*` variables are barely a step apart in some themes and the whole
  layout flattens. A thing's rung is decided by what it sits on, so a chip on the page
  is a tile and a tile inside a box is one rung above the box.
- **Tiles and pills carry a fill or a border, never both.** The accent outline is the
  hover and proficiency state, so it has to arrive on something that had no edge.
- **A hover card is portalled to `document.body`**, because every box in the layout is a
  scroll container that would clip it.
- **`addIcon` declares a 100-unit box.** `src/obsidian/icons.ts` draws in Lucide's
  24-unit one and scales, so the d20 and the vial fill their frame instead of sitting as
  a speck in its corner. Size icons in a label in `rem`, not `em`: labels are 11px, and a
  fraction of that is a smudge.
- **Nothing rollable carries an `aria-label`.** Obsidian opens a tooltip of its own for
  any element that has one, on top of the hover card; the accessible name is a
  `.dg-sr-only` span inside the button instead.
- **The top row's height is the identity column's.** The HP register holds a whole
  session, so the HP panel carries a `max-height` rather than being allowed to set the
  row — and `.dg-desk` needs `height: 100%`, not `min-height`, or a 1fr row sizes to
  its content and the page scrolls instead of the boxes.
- **Which resources are pinned is `choosePins` in core**, not a layout decision: three
  layers, most specific first — the character's `layout.5e`, the plugin settings, then
  the `pin` weight the content carries.
- **The HP calc is parsed, never evaluated** (`core/state/hp-calc.ts`), and the preview
  is the commit run without committing, so the vial's ghosts and the register's row can
  never disagree about what Enter will do.
- **`hp.set` is the one event that stores a total** rather than an input. "My HP is 35"
  is what the player is asserting, and expressing it as damage would eat their temp HP
  on the way past.

**The builder is one builder.** `ui/builder/` holds the sections (`sections/`), the pickers, the
change confirmation (`changes.tsx`), the session and drafts, and `registry.tsx`, which says which
sections exist and what each says about itself — and nothing about how they are arranged.
`NarrowBuilder` scrolls them under the rail; `desktop/DesktopBuilder` sets them out as tabs with a
reading sidebar. Levels and Planned are one section, the Progression list. Shared code never imports `narrow/scroller` or
`rail`. Two known exceptions: the picker still uses narrow's `hold` and sheet host (the sheet host is
already a dialog on desktop), and `sections/sources.tsx` imports `obsidian`. The seams that differ are:

- **`builder/nav.tsx`**: register a card, jump to a card. The narrow scroller and the desktop tab shell
  each answer it, so Review's "go to this choice" works in both.
- **`builder/detail.tsx`**: how a thing is read. Narrow holds a row and a sheet opens; desktop hovers
  and the sidebar shows it. With `inlinePicker` on, a choice's options open under its row (`usePickerSlot`)
  and are read in that same sidebar, so there is no dialog with a column of its own. Sections render `InfoRow`.
- **`builder/features.ts`**: `BuilderFeatures` flags for what a layout opts into (per-level HP, options that
  open under their row, search in pickers, row removal, custom items, Browse, Sources, Notes...). Each is written once as a shared
  component; narrow sets none today, so adding one to a phone is a flag in `NarrowRoot` and a CSS job.
  `tests/builder-model.test.ts` fails if a shell stops naming every flag.

New builder behaviour goes in `ui/builder/`, never in a shell.

**The Progression list** (`sections/progression.tsx`) is one ordered list: the levels taken, a draggable
PLANNED divider, then the queue. Reordering it is the progression spec's conflict rule, and these are the
parts worth knowing before you touch it:

- **The machine is pure** (`reorder/machine.ts`). It knows no DOM, React or dnd-kit: it takes the pointer's
  position in the list and the measured heights and returns the proposed order, the dragged *group* (an
  anchor, always the lowest level, plus a tail of its higher levels) and whether the anchor is being held
  back from a lower level of its class. Every transition is pushed on a stack with the pointer position it
  fired at and undone at that same position, so a drag is exactly reversible, handoffs included. A fresh
  transition is only looked for in the direction the top of the stack was travelling. Tested in
  `tests/reorder-machine.test.ts` with the spec's own examples.
- **dnd-kit only supplies the gesture.** Sensors, keyboard and auto-scroll are its; `collisionDetection`
  returns nothing, and `ReorderList` reads the pointer itself (dnd-kit's delta folds in scroll, which is
  wrong here) and draws the gap, the floating group (inside the view, not a portal) and the lift cue.
  The handle element is never unmounted mid-drag: a touch keeps sending events to the element it began on.
- **A drop is one `reorder` change** through `previewChange` / `commitChange`, so it gets the same
  confirmation as any edit, and it is one `mutateBuild` — one write, which is what "one undo entry" means
  here (the builder session discards or saves as a whole; there is no per-edit undo). The list holds the
  proposed order while the confirmation is up and snaps back if it is cancelled.
- **Every level's class level survives a reorder**, because the conflict rule keeps each class in order.
  So an item is keyed by `class#classLevel` and a reorder only moves levels between the two lists and
  between classes. `build.planned`'s array order *is* the queue; `normalisedQueue` repairs it and
  `reorderProgression` writes it. The look-ahead the list shows (levels the queue doesn't mention) is
  written into the queue only when dragged, and `trimQueue` lets go of what is still in default order.
- **Folding is an override, not a state** (`reorder/fold.tsx`, the `foldOnDrag` feature flag): a card's own
  expanded state is untouched and `useCardShown` just lays the drag over it. Desktop folds; narrow doesn't
  yet, so the group is drawn from headers (`Layout.groupCard`) whatever the cards measure.
- **Scroll anchoring** (`keepInPlace`) scrolls by how far the held card moved when the cards above it
  folded. Where the scroll is already at its limit it adds `padding-top` to the list for the length of the
  drag instead, so the card stays under the thumb.

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
- `tests/srd/` resolves the real content in `content/` and asserts the numbers
  longhand: `sources.test.ts` for source-wide checks, then one file per class
  (`paladin.test.ts`). It catches content mistakes as well as code mistakes — when you
  convert a class, add its own file rather than editing a shared one, so parallel
  conversion sessions never touch the same test.
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

Use the `convert-5e-content` skill, which reads `docs/conversion-guide.md` for how to
decide what text becomes, and `docs/schema.md` for what the fields mean. Never write
into `content/core/` — that is the plugin's own kind and stat-path definitions.
