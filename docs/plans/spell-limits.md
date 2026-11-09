# Plan: spell limits driven by the schema

## Finding

The engine already evaluates `spellcasting.cantrips` and `spellcasting.prepared` into
`ResolvedSpellcastingClass`, and the slot table / pact level say how high a spell may be. The
builder uses none of it: `SpellsSection` (`ui/builder/sections/collections.tsx`) passes
`count: 99`, does not separate cantrips, and does not filter by castable level. The sheet prints
"N prepared" and the prepared checkbox has no cap. The converter also leaves gaps (below).

No UI code may name a class. Everything is driven from `spellcasting` on the class element, and
fixed at the converter so every sourcebook gets it.

## 1. Schema (`docs/schema.md`, `src/core/types.ts`, validator)

`spellcasting` says what each number means:

| Field | Meaning |
| --- | --- |
| `cantrips` | Cantrips known (unchanged). |
| `known` | Spells known, for `type: known`. |
| `prepared` | Daily prepared count, for `prepared` and `spellbook`. |
| `spellbook` | Size of the book: `{ start, perLevel }` or an expression. Advisory. |
| `maxSpellLevel` | Optional. Defaults to the highest slot level, or the pact slot level. |
| `extra` | `{ level, choose, from }[]` for fixed or out-of-list picks (Mystic Arcanum, Magical Secrets). |

`SpellEntry` gains `extra?: boolean` and an optional `note` (for example "Scroll of Fireball").

### Extra spells

Spells learned outside the class's own progression (a Wizard copying from a scroll, and similar)
are stored with `extra: true`.

- They do **not** count toward `cantrips`, `known`, `prepared` or `spellbook`.
- They get their own picker and their own list, separate from the main levelled picker. Both live
  in `SpellsSection`, as two groups: the class's spells, then Extra spells.
- Their picker is limited by `maxSpellLevel` and the class's spell list tag, with no count cap.
  It has a toggle to widen the list to any class, since not every extra source is a class's own
  list.
- Level changes never touch them. Removing the class orphans them, as for any spell.
- Whether an extra spell is prepared is still the player's call; preparing it counts against
  `prepared` like any other spell.

## 2. Converter (`../5etools-to-dragonglass`, `src/convert/classes.ts:624-691`)

- Emit `known` from `spellsKnownProgression` instead of reusing `prepared`.
- Emit `spellbook` from `spellsKnownProgressionFixed`. Today only `type: spellbook` is set and the
  numbers go to `tables["spellbook-additions"]`, which is a per-level delta.
- Emit `extra` from `spellsKnownProgressionFixedByLevel` and `additionalSpells`, replacing the two
  `unconverted-spellcasting` info diagnostics.
- Tests in `tests/classes.test.ts` for Wizard, Warlock, Bard, Cleric and Paladin in `srd` and
  `srd24`.
- Regenerate `out/` and replace the hand-written content in `content/srd/` (the Paladin there has
  no `prepared` or `cantrips` at all).

## 3. Engine (`src/core/`)

- `spellLimits(character)` in `resolver/`, per class: cantrip cap and used, known/prepared cap and
  used, spellbook size and used, `maxSpellLevel`, and the extra spells held.
- Diagnostics: `spells-over-limit` and `spell-level-too-high`, both warnings. Enforcement is a
  builder toggle, as requirements already are.
- Fold extras into `validity.ts` so they follow the same invalidate-versus-remove rules.

## 4. UI (`ui/builder/`)

- The main picker takes its counts from `spellLimits`, groups cantrips separately, and flags or
  hides levels above `maxSpellLevel`.
- Header: "3/4 cantrips · 5/9 spells".
- A second button, "+ Add extra spells", opens the extra picker.
- The prepared checkbox on the sheet is capped from the same data.
- Multiclass uses per-class lists through `SpellEntry.class`.

## 5. Tests

- `tests/srd/wizard.test.ts` and `warlock.test.ts` assert the longhand numbers: Wizard at level 3
  has 4 cantrips and a 10-spell book; Warlock at level 5 has 3rd-level pact slots.
- Extras are excluded from every count.
- A UI test that the picker excludes spells above the level cap.

## Order

1. Schema and types, then validator.
2. Converter and its tests, then regenerate content.
3. Engine `spellLimits` and diagnostics.
4. UI pickers.
5. SRD longhand tests.
