---
name: convert-5e-content
description: Convert D&D 5e rules text (a class, species, background, feat, spell, item or subclass) into dragonglass JSON content elements, then validate them. Use when the user pastes book or SRD text and wants content for the dragonglass-builder plugin, asks to convert/mechanise a feature, or asks to add a class/species/spell/item to a source.
---

# Converting 5e rules text to dragonglass content

Read `docs/conversion-guide.md` in this repo **before writing any JSON**. It is the
specification for this task; this file only describes the loop around it.

## The loop

1. **Read the guide.** `docs/conversion-guide.md`. Pay attention to §3 (phrasing cues),
   §5 (stacking and `base`), §6 (situational modifiers) and §11 (worked examples).
2. **Look at existing content** for the pattern you are about to repeat.
   `content/srd/content/` has a converted species, class, subclass, background, spells
   and items. Match its shape rather than inventing one.
3. **Decide the target source.** Ask which source directory to write into if the user
   has not said. Never write into `content/core/` — that is the plugin's own kind and
   stat-path definitions.
4. **Write the elements.** One file per logical group; a file holds one element or an
   array. Mechanise what maps cleanly, leave the rest as `text`.
5. **Validate, and loop until clean:**
   ```
   npm run validate -- <source-dir> --strict
   ```
   Fix what it reports and run it again. Do not stop on a non-zero exit.
6. **Resolve a character.** A validator cannot tell you that a number is wrong. Write or
   update a test that resolves a character using the new content and asserts the numbers
   you would check on a printed sheet — HP, AC, save bonuses, resource maxima, slot
   counts. `tests/srd-content.test.ts` is the model. Then `npm test`.
7. **Report** what you mechanised, what you deliberately left as text, and why.

## Rules that are easy to get wrong

- `source` must equal the **sourcebook element's id**, not the repo or folder name. An
  element whose source is not a loaded sourcebook is rejected outright.
- Criteria inside a choice's `from` are **ANDed**. `{ kind, ids }` means "these ids,
  which are also of this kind" — not a union.
- "A minimum of +1" is `max(1, …)`.
- Competing formulas (AC from armour, walking speed from a species) use op `base`.
  Bonuses use `add`. `set` is for overrides only.
- Anything conditional ("when", "against", "while", "related to") needs a `when`. It will
  not be added to the number, by design.
- Tag choice points and their options with a class-named tag, or homebrew can never
  extend them.
- Per-level numbers belong in a class `tables` column, read with `@table(class, column)`.

## When something does not map

Put it in `text`, or in the `notes` of the nearest part, and say so in your report. A
text-only element is valid and displayable. A wrong mechanisation is neither, and is
harder to find later.
