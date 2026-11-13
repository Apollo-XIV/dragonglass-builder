# Schema gaps found by the full 5etools conversion

13 Nov 2026

## Why this spec exists

The converter in `../5etools-to-dragonglass` now runs the whole 2014 and 2024 5etools
corpus with no validator errors or warnings. What it cannot express it writes to a
worklist (`out/<ruleset>/worklist.json`, 764 elements for 2014), and an LLM pass reads the
worklist and proposes parts. A trial of that pass on 63 questions, with Claude Sonnet,
showed two things:

- About 85 percent of the worklist is **prose the converter cannot read but the schema can
  hold**: actions, numeric bonuses, limited uses, proficiencies, conditional advantage. The
  LLM pass converts those; no schema work is needed.
- The rest is a short list of shapes that **no one can write**, because the schema has no
  field for them. The model declines them, correctly, and they stay as text on the sheet.

This spec lists those shapes, with counts from the 2014 worklist and the exact text they
come from, and says what to add. Every change is additive: existing content keeps
validating and resolving as it does today. The schema's two rules (`docs/schema.md`, "The
two rules everything else serves") hold throughout: the sheet never owns rules logic, and
options are elements.

The converter repo's `README.md` ("Schema questions") and `docs/full-source-audit.md` have
the history of each item. This document is the one to build from.

### Order of work

| # | Change | Elements it unlocks (2014) | Size |
| --- | --- | --- | --- |
| 1 | `attack` on an action | most of the 226 item actions, plus spells and features | a day |
| 2 | Dice in a `damage.*` modifier (hit riders) | 18 flagged, more inside other clauses | half a day |
| 3 | `cost` on an innate spell (a shared pool) | 14 | half a day |
| 4 | `spellListAdditions` for the character's own classes | 15 | half a day |
| 5 | Recharge triggers `midnight` and `special` | 4 | an hour |
| 6 | A feature-owned save DC | Monk, and anything with "8 + proficiency + ability" | an hour, maybe nothing |
| 7 | Options that are bundles or lists | 44 spell-list picks, House Agent | a decision, then a day |
| 8 | A predicate over a tag | Dragonmark feats, 2 shapes | half a day |
| 9 | `ids` and `tags` in one filter | doc contradiction; gaming sets | a decision, an hour |

Items 1 to 6 are independent and can land in any order. 7, 8 and 9 share one design
question (what an option is, and what a filter may say) and should be decided together,
even if built separately. Each item below ends with acceptance criteria; the tests named
are the ones to write.

Where this document says "the converter", the change on that side is listed so the two
repos can move together. The converter's LLM contract (`prompts/llm/_contract.md`) gains
the same vocabulary, so the model can write the new parts.

---

## 1. Attack rolls on actions

### The gap

`ActionDef` (`src/core/types.ts`) has `damage`, `damageType`, `save`, `heal`, `range` and
`target`, and no way to say the action is an **attack roll**. Thrown acid, alchemist's
fire, holy water, a net, a wand's ray, a cannon's shot, Eldritch Blast as a feature's
action: all of them say "make a ranged attack" or "make a melee spell attack", and today
the only place that fact can go is `text`. The sheet shows the damage pill and no attack
bonus, so a player reads the text and works it out.

In the trial Sonnet wrote, for Acid (vial):

```json
{ "id": "throw-acid", "name": "Throw Acid", "activation": "action",
  "damage": "2d6", "damageType": "acid", "range": "20 ft.", "target": "one creature or object",
  "text": "Ranged attack as an improvised weapon; on a hit, 2d6 acid damage." }
```

The sentence in `text` is the part that should be data.

Weapon attacks are a different thing and already work: `resolver/attacks.ts` assembles
them from the items in hand, and nothing in content declares them. This gap is about
attacks that **features, spells and consumable items** make, which no inventory weapon
stands for.

### The change

Add an optional `attack` to `ActionDef`:

```ts
/** What the attack roll is, where the action makes one. */
export interface ActionAttack {
  /** Which bonus applies. */
  type: "melee-weapon" | "ranged-weapon" | "melee-spell" | "ranged-spell";
  /**
   * The ability the attack and damage use. Defaults: `str` for melee-weapon, `dex` for
   * ranged-weapon, the owning class's casting ability for the spell types (the same rule
   * `save.dc` follows), with `attacks.*` modifiers applied as for a weapon.
   */
  ability?: Ability;
  /** Proficient by default: a feature's own attack always is. `false` for an improvised weapon. */
  proficient?: boolean;
  /** A flat bonus on top, an expression: a +1 weapon's "+1". */
  bonus?: Expr;
}
```

`ResolvedAction` gains `attack?: { type, ability, attackBonus: number, attackParts: AttackPart[] }`,
assembled by the resolver with the same parts logic `attacks.ts` uses for a weapon
(ability modifier, proficiency bonus, `attacks.all` and `attacks.melee` or
`attacks.ranged` modifiers, the flat `bonus`). Pull the parts assembly out of
`weaponAttacks` into a function both can call, so the two never disagree.

The damage already on the action is the damage on a hit. Nothing changes there; the
`damage` field keeps meaning "what this action deals", and with `attack` present the sheet
knows it is a hit's damage.

**Improvised weapons.** Thrown flasks are improvised weapons in 5e: `ranged-weapon`,
`proficient: false` unless the character has Tavern Brawler, which the rules do not model
today. The validator accepts `proficient: false`; the sheet shows the bonus without
proficiency. That is the right reading of the rule and better than text.

**Validation** (`src/core/content/validate.ts`, `validateAction`): `attack.type` must be
one of the four; `ability` one of the six; `bonus` a valid expression. An `attack` with no
`damage` is allowed (a net has no damage) and not a warning.

**Sheet** (`sheet-panels.tsx`, narrow sheet): an action with `attack` shows an attack pill
("+7 to hit", with the breakdown on hover from `attackParts`) beside the damage pill, in
the same style as a weapon row. **Export** (`src/core/export/schema.ts`): add the resolved
attack to the action; regenerate `docs/export-schema.json`.

**Docs**: `schema.md` "Parts" table row for `actions`, and a short subsection under
"Chosen-amount costs" or beside it: "Attack rolls on actions".

### Converter

`src/convert/items.ts` and the LLM contract write `attack` where the text says "make a
ranged attack", "make a melee spell attack", or the item is thrown. The judge in
`src/llm/apply.ts` checks `attack.type` is one of the four and `ability` one of the six.

### Acceptance

- A test in `resolve.test.ts`: an element with an action `{ attack: { type: "ranged-spell" } }`
  on a wizard with Int 16 at level 5 resolves `attackBonus` 6 with parts `[Int +3, Proficiency +3]`.
- The same with `type: "ranged-weapon", proficient: false` and Dex 14 resolves +2 with one part.
- An `attacks.ranged` modifier of +1 raises both.
- Validator rejects `attack.type: "spell"` with a clear message and accepts an attack with no damage.
- Export includes the resolved attack and `export-schema.json` is regenerated.
- Existing fixtures resolve byte-identically.

---

## 2. Dice riders on hits: a `damage.*` modifier may carry dice

### The gap

"You deal an extra 1d6 damage to the target whenever you hit it with a weapon attack"
(Hunter's Mark), "the attack deals an extra 1d6 damage" (Dive Attack), Divine Strike,
Sneak Attack, Colossus Slayer, Favored Foe, Hex, Green-Flame Blade. `Modifier.value` on
`damage.*` is `Expr`, a number, and `expressions.ts` has no dice. The validator warns
"unexpected trailing input at 1 in `1d6`", which is how the trial caught Haiku writing it.
The sheet's weapon row (`attacks.ts`, `damageParts`) folds `damage.*` modifiers into the
damage string, so a dice value has an obvious home there: `"1d8 + 3 + 1d6"`.

18 flagged clauses in 2014, and the shape appears inside many "a numeric bonus" clauses
that were flagged for another reason.

### The change

Allow a **dice string** as `value` on a modifier whose target is in the `damage.*`
family, for ops `add` only:

- Type: `Modifier.value: Expr | string[] | ProficiencyLevel` already admits a string; the
  change is in validation and resolution, not the type. Add a doc comment.
- Validation: a string value on `damage.<scope>` with `op: "add"` is parsed as **dice
  notation with embedded expressions**, the same grammar `ActionDef.damage` uses
  (`"2d6 + @abilities.str.mod"`). Any other target keeps the current rule: an
  expression, and dice are an error.
- Resolution: `attacks.ts` appends the dice as its own `AttackPart` with a string amount
  (`{ label: "Hunter's Mark", dice: "1d6" }`), and `damage` becomes `"1d8 + 3 + 1d6"`.
  `AttackPart` gains an optional `dice?: string` alongside `amount`; a part has one or the
  other. Numbers still sum; dice concatenate in source order.
- `when`: most of these are situational ("against the marked target", "once per turn").
  A modifier with `when` already never folds in and shows as an annotation; keep that.
  The sheet shows the dice in the annotation line exactly as it shows "+2 against
  undead" today. An **unconditional** dice rider (Divine Strike's "once on each of your
  turns" is a condition; a Flame Tongue's fire damage is not) folds in.
- Effects: a dice rider inside an `EffectDef.modifiers` (Hunter's Mark is a concentration
  effect the cast applies) works the same when the effect is on.

Not in scope: rerolls (Savage Attacks, Elemental Adept), minimum-damage-die rules, and
"once per turn" as anything but `when.text`. The sheet does not model a turn.

### Converter

The LLM contract currently says "a modifier's value is a number or an expression, never
dice". Change it to: dice are allowed on `damage.*` with `op: add`, and the condition goes
in `when.text`. The judge's dice check (`checkModifier` in `src/llm/apply.ts`) becomes
"dice only on `damage.*` add". The prose extractor's "extra damage" label can then write
the part itself for the stock sentence "deals an extra NdM damage".

### Acceptance

- Validator accepts `{ target: "damage.melee", op: "add", value: "1d6" }` and
  `{ target: "damage.all", op: "add", value: "1d6", when: { text: "…" } }`; rejects
  `{ target: "ac", op: "add", value: "1d6" }` and `{ target: "damage.melee", op: "multiply", value: "1d6" }`.
- A longsword on a Str 16 character with an unconditional `damage.melee` `1d6` rider
  resolves `damage: "1d8 + 3 + 1d6"` and three parts.
- With `when`, the damage string is unchanged and the annotation carries the dice.
- Export carries the part with `dice`; schema regenerated.

---

## 3. A shared pool across innate spells: `cost` on an innate spell

### The gap

Way of the Four Elements: "you can spend 2 ki points to cast *Burning Hands*", "you can
spend 5 ki points to cast *Cone of Cold*". 5etools writes these as `additionalSpells` with
`resource` mode: a named pool and an amount per spell. `InnateSpellDef` has `uses` and
`recharge`, which make the spell **its own** pool (`innate-<spell>`). There is no way to
say "cast this by spending N of **that** pool". 14 disciplines in 2014; the same shape is
the Genie warlock's and several items' "expend a charge to cast".

### The change

Add `cost?: Cost` to `InnateSpellDef`, with the same type and resolution as
`ActionDef.cost`: a map of pool key to a fixed amount or `{ min, max }`, keys resolving
locally then globally (`collect.ts`, `resolveCost`).

```json
"innateSpells": [
  { "spell": "srd:spell:burning-hands", "cost": { "srd:monk:ki-points": 2 } }
]
```

Rules:

- `cost` and `uses` are **exclusive** on one entry: a spell is cast from its own pool or
  from another's, not both. Both present is a validator error. `recharge` without `uses`
  was already meaningless and stays a warning.
- An innate spell with `cost` creates no `innate-<spell>` resource. Its resolved
  `innate[]` entry carries `cost` and `resolvedCost` (pool keys), exactly as a
  `ResolvedAction` does, so the sheet's cast button can spend the pool and the spells
  panel can grey the spell when the pool cannot cover `min`.
- An unresolvable pool key is `unresolved-reference` on the part, as for an action.
- A chosen amount (`{ min: 2 }`, "spend 2 or more ki points to cast at a higher level")
  uses the same picker as a chosen-amount action cost; `@spent` is not read anywhere
  on a spell for now.

**Sheet**: in the spells panel, an innate entry with a cost shows "2 ki" where a pooled
innate spell shows its uses, and casting spends it through the same path a resource
action uses. **Export**: `innate[].cost` and `resolvedCost`.

**Docs**: `schema.md` "Granted and innate spells" table gains a `cost` row and a sentence
on exclusivity with `uses`.

### Converter

`src/additional-spells.ts` maps 5etools `resource` mode to `cost` naming the pool the
converter already derives for the class (`srd:monk:ki-points`, with the discipline's amount).
The `unexpressible-spells` info "innate casting resource … is not one the schema has"
goes away.

### Acceptance

- Validator: `cost` with `uses` is an error; `cost` alone is fine; unknown pool key is a warning.
- A monk with 5 ki and an innate Burning Hands at `cost: 2` resolves `innate[0].resolvedCost`
  to the ki pool, no `innate-burning-hands` resource exists, and spending through the
  sheet's path reduces ki by 2.
- Fixtures unchanged.

---

## 4. Spell list additions for the character's own classes

### The gap

Dragonmark subraces (Mark of Warding, Mark of Shadow, fourteen more) say: "If you have
the Spellcasting or Pact Magic class feature, the spells on the Mark of Warding Spells
table are added to the spell list of your spellcasting class." `SpellListAddition.class`
"defaults to the class that owns the part" and is "required on a part no class owns, such
as a feat; without it the part does nothing and says so". A species owns no class. 15
elements in 2014.

### The change

Let `class` take the value `"any"`:

```json
"spellListAdditions": [{ "class": "any", "spells": ["srd:spell:alarm", "srd:spell:mage-armor"] }]
```

Resolution (`collect.ts` list additions → `spellcasting.classes[].listAdditions`): with
`"any"`, the addition applies to **every class the character casts with**, which is the
same set `spellcasting.all.dc` fans out to. A non-caster gets nothing, correctly. Keep the
existing behaviour for a named class and for the owner default.

Validation: `class` is a class element id, `"any"`, or absent where an owner exists. The
"does nothing and says so" warning stays for an ownerless part with no `class`.

Docs: one row in the `spellListAdditions` table and a sentence under it.

### Converter

`src/additional-spells.ts`: an `expanded` block on a species, subspecies, feat or
background writes `class: "any"`. The 13 "no class to name" infos go away.

### Acceptance

- A wizard/cleric with a Mark of Warding resolves both classes' `listAdditions.spells` to
  include the mark's spells; a fighter resolves none and no diagnostic is raised.
- Validator accepts `"any"` and still rejects an unknown class id.

---

## 5. Recharge triggers the data uses

### The gap

`RECHARGE_TRIGGERS` is `short-rest | long-rest | dawn | dusk | turn | round`. Two items
recharge at **midnight**; two have a recharge the text describes and no rest applies
("when you take a short rest in the Feywild", "when you roll a 20"). The converter writes
a note and a `recharge-unexpressible` info. `ActionDef.recharge` is already a descriptive
word for an action's own recharge; a resource has no descriptive form.

### The change

- Add `"midnight"` to `RECHARGE_TRIGGERS`. A long rest matches it, as it matches `dawn`
  and `dusk` (the sheet's rest button applies the same rule).
- Add `"special"` to `RECHARGE_TRIGGERS` with an optional `text` on the rule:
  `{ "on": "special", "amount": "all", "text": "when you take a short rest in the Feywild" }`.
  No rest applies it; the sheet shows the text under the pool, and the pool is restored
  by the manual control every resource already has. A `special` rule with no `text` is
  a validator warning.
- `RechargeRule` gains `text?: string`, meaningful for any trigger (shown as a tooltip)
  and required-by-warning for `special`.

Docs: "Recharge rules" bullet list.

### Converter

`RECHARGE_ON` in `src/items.ts` maps `midnight` → `midnight` and `special` → `special`
with the sentence as `text`. The info goes away.

### Acceptance

- A `midnight` pool is restored by a long rest and not a short one.
- A `special` pool is restored by neither and shows its text; without `text` the validator warns.

---

## 6. A feature-owned save DC

### The gap, if it is one

Ki save DC is "8 + your proficiency bonus + your Wisdom modifier", and the monk is not a
caster, so `spellcasting.all.dc` expands to nothing for a pure monk. Sonnet declined
Stunning Strike for this reason. But `ActionDef.save` is `{ ability, dc?: Expr }` with the
comment "an explicit expression", so `{ "ability": "con", "dc": "8 + @prof + @abilities.wis.mod" }`
should already resolve.

### The change

Probably none in the schema. Confirm with a test that an explicit `save.dc` expression
resolves and the sheet shows it; if it does, this item is a **contract fix** in the
converter (tell the model the expression form exists) and a note in `schema.md`. If a
feature wants one DC shared by several actions (every ki save), consider a stat path the
class can declare (`monk.ki-dc`), but do not build that until a second class needs it.

### Acceptance

- Test: an action with `save: { ability: "con", dc: "8 + @prof + @abilities.wis.mod" }` on
  a level 5 monk with Wis 16 resolves `dc: 14`.

---

## 7. Options that are bundles or lists

### The gap

Three shapes, one cause: **an option must be an element**, and the thing picked is not one.

- "Choose one of the following lists: Evil, Good, Neutral" (Divinely Favored), "choose a
  moon: Nuitari, Lunitari, Solinari" (Initiate of High Sorcery), "choose a college:
  Lorehold, Prismari, Quandrix, Silverquill, Witherbloom" (Strixhaven). Each option is a
  **list of spells with a grant rule**. 44 diagnostics in 2014.
- "Choose two rows from the House Tool Proficiencies table" (House Agent). Each row is
  several grants. One element, decides G11 in the converter's audit.
- "A gaming set or thieves' tools" and other open categories, which is item 9.

### The decision

Two ways to close it. **Recommend the first.**

**(a) Bundle elements, no schema change.** The converter mints one element per option
(`srd:feat:divinely-favored:good`, kind `option` or a source-declared kind such as
`spell-list-choice`) carrying the grants, innate spells or spell list additions of that
row, and the feat's choice offers them by `ids`. This is exactly the schema's stated
answer to parametrised choices ("nesting, not a new option source"), the id comes from
the row's own word so it needs no counter, and the sheet already shows a chosen element's
parts under it. The cost is content volume: 44 small elements for 2014, which the
converter writes and no one reads.

What the plugin needs for (a): nothing in the schema. Two small things in the builder:
an option whose kind is not a tabbed feature should render its grants and spells in the
choice picker's option card (it likely already does, as fighting styles do); and the
kind declaration for `option` lives in the converter's `kinds.json`, as its other derived
kinds do.

**(b) An option that is a filter.** `ChoiceDef.from` gains `anyOf: Filter[]`, each
alternative an option in its own right, and an answer may be an alternative's index.
This changes "options are elements" and everything that stores answers as element ids
(`answerFor`, invalidation, the export). Do not do this for 44 elements.

### Acceptance (for a)

- Converter writes bundle elements; a Divinely Favored character who picks `…:good` has
  the Good list's spells and nothing from the others.
- The choice picker shows a bundle option's grants in its card.

---

## 8. A predicate over a tag

### The gap

`Predicate` has `has` by id. "You can't take another Dragonmark feat" is `not` over every
element carrying `dragonmark-feat`; "prerequisite: a Dragonmark feat" is `any` over them.
The converter writes both as prose today (`proseOf` in `src/requires.ts`), so the builder
cannot enforce them.

### The change

Add one predicate:

```ts
| { type: "has-tag"; tag: string; kind?: string }
```

True when the character has (by grant or pick, through `collect`) at least one element
carrying the tag, optionally of that kind. `requirements.ts` evaluates it over the
collected elements, which it already has; `validate.ts` checks the shape; `describe`
renders "a Dragonmark feat" from the tag's declaration where the source declares one
(`FEAT_CATEGORY_LABELS` in the converter is where the words live, so the predicate may
also carry `text`).

`not: [{ type: "has-tag", tag: "dragonmark-feat" }]` is then "no other Dragonmark feat",
with one subtlety: when enforcement is on and the character is evaluating the very feat
they are picking, the feat itself must not count. `requirements.ts` does not exclude the
candidate today (the `has` case asks `ctx.has(id)` with no notion of which option is being
judged, and no existing predicate needed one). `RequirementContext` therefore gains an
optional `candidate?: string`, set by the builder when it judges an option, and `has-tag`
skips the element with that id. `has` by id is unaffected: a feat that requires itself does
not exist. Add a note in `requirements.ts` that unknown predicate types never block, so a
source written against this spec still loads in an older plugin with a warning rather
than hidden options.

### Converter

`src/requires.ts`: `featCategory` → `{ type: "has-tag", tag }`, `exclusiveFeatCategory`
→ `not: [...]`. The `prose-prerequisite` info drops for these.

### Acceptance

- A character with Mark of Warding sees Mark of Shadow as unmet when enforcement is on,
  and as a warning when off.
- A character with no dragonmark meets `has-tag` only after taking one.

---

## 9. `ids` and `tags` in one filter

### The gap

`schema.md` says both things. The example comments `ids` as "always eligible, unioned in";
the paragraph under it says every criterion ANDs, `ids` included, and `types.ts` agrees
with the paragraph. The converter believes the code, so "a gaming set or thieves' tools"
expands the category to its members and offers `ids` alone, which closes the list to the
source's own gaming sets: a homebrew gaming set never appears.

### The decision

Pick one and make the doc match the code, or the code match the comment.

**Recommend: keep AND and add `anyOf`.** AND is what every other criterion does, the
code does it, and tests depend on it. Add to `Filter`:

```ts
/** Alternatives: an element matches if it matches any one of these filters. */
anyOf?: Filter[];
```

A filter with `anyOf` may carry nothing else (validator error otherwise), and each
alternative is an ordinary filter. "A gaming set or thieves' tools" is then
`{ anyOf: [{ kind: "tool", tags: ["gaming-set"] }, { ids: ["srd:tool:thieves-tools"] }] }`,
open to homebrew gaming sets. Fix the comment in the doc's example.

This is the small, contained version of item 7(b): it changes what a **filter** may say,
not what an **option** is, so answers stay element ids and nothing downstream moves.

### Converter

`proficiencyParts` in `src/grants.ts` writes `anyOf` for a mixed category-and-ids choice
instead of expanding the category. The `empty-category` warning path simplifies.

### Acceptance

- `matches` returns true for an element matching any alternative; validator rejects
  `anyOf` beside `kind`.
- Existing filter tests unchanged.

---

## Not changing

Things the trial or the worklist surfaced that are **not** schema gaps, so they are not
in this spec:

- **Narrative effects**: seeing through a familiar's eyes, moving an illusion, changing
  appearance, storing an object. No sheet should hold these; they stay as text.
- **Rerolls and minimum dice**: the sheet does not roll, so nothing to model.
- **Light radius, carrying capacity, falling**: no stat path, and no one has asked for one.
- **Use-time choices**: "choose acid or cold when you breathe". A text note on the action.
- **"Once per turn", "once per combat"**: `when.text`, as today.
- **Ritual-only casting**: `schema.md` already says to report it and leave it as text.
- **Casting a spell spending a slot**: a recorded decision in the converter README, not a gap.
- **Choices in LLM answers**: the schema has them; the converter's LLM contract does not
  offer them. A contract change on the converter side.

## Checklist for the implementer

For each item built:

1. `src/core/types.ts`, then `src/core/content/validate.ts`, then the resolver
   (`collect.ts`, `resolve.ts`, `attacks.ts`, `requirements.ts` as the item says).
2. `src/core/export/schema.ts` where the resolved shape changes, then
   `npm run export:schema` to regenerate `docs/export-schema.json`.
3. The sheet (`sheet-panels.tsx` and the narrow sheet) where the item says the player sees
   something new.
4. `docs/schema.md`: the field table, one example, one sentence on the rule.
5. Tests named under the item's acceptance, and the existing fixtures resolving unchanged.
6. Tell the converter: the field name and shape, so `prompts/llm/_contract.md`, the judge
   in `src/llm/apply.ts`, and the extractor named under "Converter" can be updated and the
   LLM pass re-run once, after all the items it needs have landed.
