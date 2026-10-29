# Converting the SRD

How much to convert, in what order, and what has to be decided before the first file is
written. Written to be handed to a fresh session along with the SRD text.

Read `docs/schema.md` first — it is the authority on the format — and
`docs/conversion-guide.md` for how to decide what a piece of text becomes.

## The recommendation, in one paragraph

**Convert all of it, but in four waves, with a hard stop after wave 1.** Nothing in the
schema blocks breadth any more, and the test slice is too narrow to catch much — one class,
one species, one background. But the first full class conversion will surface schema snags
that the Paladin did not, and finding them after twelve classes means twelve rewrites.
Spells and equipment go first because everything references them and they are the cheapest
to redo; then three deliberately awkward classes; then stop and look.

## What is actually expensive to redo

Worth being precise, because it decides how much caution is warranted.

**Cheap.** The JSON itself. Conversion is re-runnable: the guide, the schema reference, the
validator and a model regenerate a file from the same book text for compute rather than
labour. An additive schema change — a new optional field, which is what `maxPer`,
`levelsBy` and `softMax` all were — does not invalidate a single existing element.

**Expensive.** Three things, and only three:

1. **Ids.** They are referenced by every character file anyone has built, by every
   assertion in `tests/srd/`, and by other content's `grants` and `ids` filters. Renaming them later means rewriting all of that. **This is the one decision to
   lock before writing anything.**
2. **The longhand tests.** `tests/srd/` asserts numbers by hand, which is what makes it
   catch content mistakes. Those assertions are written by a person (or a
   model reasoning carefully) and are not regenerated for free.
3. **Judgement calls about what to mechanise.** A feature left as text is cheap to
   mechanise later. A feature mechanised *wrongly* is expensive, because nothing flags it —
   see "the failure mode that matters" below.

Everything else is a re-run.

## Lock this first: the id convention

```
<source>:<kind-ish>:<slug>                    srd:class:barbarian
<source>:<owner>:<slug>                       srd:barbarian:rage
<source>:<owner>:<slug>:<choice>              srd:barbarian:primal-path
```

Rules, all of which the existing slice already follows:

- Lower-case, hyphenated slugs. No spaces, no capitals, no edition suffix *inside* a slug.
- The source prefix carries the edition: `srd:` is the 2014 SRD. **A 2024 conversion uses a
  different source id** (`srd24:` or similar) and never shares ids with this one, so the
  two can sit in one vault. Decide the 2024 prefix now even though it is not being
  converted yet.
- A feature's owner is the thing that grants it (`srd:barbarian:rage`), not its kind.
- Choice ids live under their owner and say what is being chosen
  (`srd:paladin:sacred-oath`), because that id is the key an answer is stored under
  **forever**.
- Shared mechanisms are owned by nothing: `srd:ability-point:str`, `srd:skill:athletics`,
  `srd:language:elvish`. Reuse these rather than minting per-class copies.

Tag vocabulary matters nearly as much, because tags are how choices find options. Follow
what exists: `<class>-feature`, `<class>-subclass`, `<class>-spell`, `<class>-fighting-style`.
A new family of options wants a tag named the same way.

## The waves

### Wave 0 — spells and equipment

The foundation layer: most volume, least judgement, highest dependency.

- **All SRD spells.** Shape is nearly fixed — `spellLevel`, `school`, `castingTime`,
  `range`, `components`, `duration`, `concentration`, `ritual`, `higherLevels`, text. Damage
  as dice notation. Tag each with every class list it appears on.
- **All weapons, armour and adventuring gear.** `weapon` and `armor` blocks drive attacks
  and AC, which the resolver already computes, so these are immediately testable.
- Skip magic items for now; they come with wave 3.

Why first: wave 1's Wizard is untestable without spells, and the spell list tags have to
exist before any class can reference them.

### Wave 1 — three awkward classes, then **stop**

Levels 1–20, one subclass each. Chosen because between them they exercise nearly every part
of the schema:

| Class | What it stresses |
| --- | --- |
| **Barbarian** | A resource, an effect with several modifiers, `base` AC competing with armour (Unarmored Defense), class tables for rages and rage damage, a feature that is mostly text (Rage's restrictions) |
| **Wizard** | Full casting, `spellbook` preparation, cantrips and prepared expressions, a resource recharging on a short rest (Arcane Recovery), ritual casting |
| **Rogue** | Expertise — a repeated choice whose options carry their own `proficiency` modifier and a `requires` that they already be proficient — plus scaling sneak attack dice and a subclass that adds casting (Arcane Trickster) |

**Then stop and review.** The question at the checkpoint is not "is the JSON valid" — the
validator answers that. It is: did anything need a shape the schema does not have, and did
anything get mechanised that should have stayed text? Expect two to five findings. Fix the
schema, re-run the three, and only then continue.

### Wave 2 — the remaining nine classes

Cleric, Druid, Fighter, Monk, Paladin (already done — review it against whatever wave 1
changed), Ranger, Sorcerer, Warlock, Bard. One subclass each. By now the patterns are
established and this is largely mechanical.

Known awkward spots to expect: Warlock's pact slots and invocations, Druid's Wild Shape
(leave the forms as text — there is no creature model), Monk's martial arts die and ki,
Cleric's domain chosen at level 1 rather than 3, Sorcerer's metamagic and font of magic.

### Wave 3 — origins and magic items

All species, all backgrounds, all feats, then the SRD magic items (attunement, charges,
items that raise a score past 20 — which is now supported and worth having a test for).

### Never — monsters

There is no creature model and no sheet for one. Converting them produces content nothing
reads.

## The acceptance gate, per wave

1. `npm run validate -- content/srd --strict` reports **0 errors and 0 warnings**. Warnings
   are not advisory here: `unknown-part` and the `levelsBy` hint both mean something will be
   silently ignored at runtime.
2. **Add `tests/srd/<class>.test.ts`**, with the numbers written out longhand, for a
   character taken to a level where the interesting features are live. One file per class,
   never a shared one, so parallel sessions cannot collide. This is the real gate: the
   session that converts a class writes its assertions, because stating what it believes the
   AC and the save DC should be is exactly where a wrong mechanisation becomes visible.
3. `npm test` and `npm run typecheck` clean.

## The failure mode that matters

The validator checks **shape and references**: that `op` is a real op, that an id resolves,
that an expression parses. It cannot check **meaning**. Every one of these validates
perfectly and is wrong:

- A modifier that should have carried `when` and so should never have folded into the value.
- `abilities.str.score` where `checks.str` was meant.
- A resource recharging on a long rest that should recharge on a short one.
- A feature mechanised as a flat `+2` when the book says it scales with a class table.
- A choice whose `from` filter is one tag too broad, so it offers every skill in the game.

Each of these is worse than leaving the feature as text, because text is visibly incomplete
and a wrong number is invisibly wrong. **The core rule from the conversion guide is the
right one: mechanise what maps cleanly, leave the rest as text.** When a converter is
unsure, `text` is always the correct answer.

## Which model should do this

The task is: read book text, emit JSON against a documented schema, run a validator, iterate
until clean, then write test assertions. With the guide and worked examples in context, it
is mostly pattern-following — but the judgement calls above are where cost differences show
up, and they are invisible to the validator.

| Content | Model | Why |
| --- | --- | --- |
| Spells, weapons, armour, gear | **Sonnet 5** | Highly templated, large volume, little judgement. Haiku 4.5 could probably manage spells with the examples in front of it, but the saving is small against the cost of a wrong `concentration` flag nobody notices. |
| Species, backgrounds, feats | **Sonnet 5** | Moderate judgement — mostly "is this situational?", which the guide's phrasing cues cover well. |
| **Classes and subclasses** | **Opus 5** | The hard one, and where I would not economise: `levels` maps, class tables, expressions, spellcasting blocks, multi-part features, and the mechanise-or-text call on every feature. A cheaper model's mistakes here are both likelier and more expensive to find. |
| The wave-1 checkpoint review | **Opus 5**, plus a human skim | The checkpoint's whole value is judgement about the schema, not throughput. |
| The longhand test assertions | Same model as the content | Writing the numbers is the check. Don't split it from the conversion. |

Two practical notes. Run the validator **in a loop inside the conversion session** rather
than as a review step afterwards — the guide already says this, and it converts a whole
class of errors into zero human attention. And convert **one class per session** for wave 1,
so each has the full schema reference in context rather than competing with eleven other
classes for attention.

I should be honest that this is a judgement from the shape of the task, not a benchmark. If
wave 0 comes back clean on a spot check of twenty spells, Sonnet is doing the job; if it
comes back with subtle `components` or `duration` errors, move up a tier rather than adding
review.
