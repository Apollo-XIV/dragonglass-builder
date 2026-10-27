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
src/cli/validate.ts  the validation CLI
src/node/            filesystem source loading, for the CLI and tests only
content/core/        kinds and stat paths, bundled into the plugin at build time
content/srd/         the converted SRD test slice
vault/               test vault with the plugin installed and a sample character
```

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
  panel fails a test instead of showing a blank pane.

For a real end-to-end check, build into `vault/`, open it in Obsidian, and open
`Characters/Ilsa/sheet.5e`. Obsidian can be driven over CDP
(`obsidian --remote-debugging-port=9222`, then Node 22's global `WebSocket`) if you need
to verify rendering without a person looking at it — but **restore
`~/.config/obsidian/obsidian.json` afterwards**, since registering a vault changes which
one the user's next launch opens.

## Converting content

Use the `convert-5e-content` skill, which reads `docs/conversion-guide.md`. Never write
into `content/core/` — that is the plugin's own kind and stat-path definitions.
