# Starting equipment in the SRD sources

The plugin side of the Inventory Release is done: the `equipment` part, `to: "inventory"` on a
choice, the entry `origin`, `build.starting` and the builder UI. What is left is content, and it
lives outside this repo, in the private converter and in the 5.1 (`srd`) and 5.2 (`srd24`) source
repositories. This is the brief for it. Read `docs/schema.md` ("Starting equipment") and
`docs/conversion-guide.md` (section 8a) first; `content/srd` holds a working example (the Paladin
and the Acolyte) and `tests/srd/starting-equipment.test.ts` shows how to check one.

## What every source needs

1. **The kind.** One element declaring `equipment-option` (see `content/srd/content/equipment-kind.json`).
2. **Every class**: a choice on its `levels."1"` entry, from two options, the kit and the gold
   alternative. 2014 classes: nested "(a) or (b)" groups, category choices for "any martial weapon",
   gold as `5d4 × 10`-style dice. 2024 classes: Option A (the kit and a fixed amount of gold) and
   Option B (gold only, a fixed amount).
3. **Every background**: the same shape. A 2014 background with no gold alternative carries
   `equipment` directly, as the Acolyte does.
4. **Items the SRD lacks**, minted as minimal `gear` elements.
5. **The `container` tag** on bags, backpacks, chests, pouches, quivers, sacks, barrels and baskets.

## Approach

- **Check the 5etools data first.** It should carry equipment groups and a gold alternative per class
  and background in structured form. That was believed, not confirmed. If it does, the converter emits
  the elements procedurally, mapping each group to a nested choice and each category ("any martial
  weapon") to a `from` filter on the existing weapon tags; an LLM fills only what the data does not
  say (prose-only entries). If it does not, fall back to converting from the SRD text in the usual
  way.
- **Keep the printed wording** in `text` on the class, the background and each option, as for other
  content. The structure carries the rules.
- **Provenance.** Mark equipment parts as the converter marks other derived parts
  (`provenance: { source: "pack:<tag>" | "prose", review: "auto" }`), so a human can review them.

## Checks

- `npm run validate -- <source> --strict` is clean: every equipment item id resolves, gold dice parse,
  and no `to: "inventory"` sits on a choice that is not of items.
- Resolve a build for each class with each option chosen and read the inventory and purse
  (`applyStarting` in `src/core/starting-equipment.ts`). The kit's items, the category picks and the
  gold must each match the book's list.
- A background's equipment must not be added twice by a class that lists the same item: they are
  separate origins, so two entries is correct.

## Format additions made for the conversion

- **`contents` on an item** unpacks a pack into the container it is when starting equipment hands it
  out (one level deep). The converter writes it from 5etools' `packContents`, leaving out the
  backpack, which the pack is.
- **`name` on an `equipment` line** is what the source calls an item ("prayer book" for the Book): the
  entry is an instance of the item under that name. To name one alternative of a pick, make each
  alternative an option element.
- Coins are not contents: the purse is one pool, so a pouch "containing 15 gp" is a pouch and a
  `currency` line.

## Known gaps in the format

- A choice with more than three options in the builder falls back to the ordinary choice row rather
  than a selector.
