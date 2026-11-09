# Wave 0 findings — for the checkpoint, not for me to fix

## 0. Two content bugs the longhand test caught, both fixed

Worth leading with, because they are the argument for the plan's insistence that the
converting session writes the assertions. Both validated perfectly and neither was
visible to any existing test.

1. **Dart was categorised `simple-melee`.** The SRD table lists it under *Simple Ranged
   Weapons*. A melee-categorised dart would have taken its attack bonus from Strength
   instead of resolving as a ranged attack. Fixed: `simple-ranged`, and its tag changed
   from `melee-weapon` to `ranged-weapon`.
2. **Beacon of Hope had lost `paladin-spell`.** The 3rd-level converter removed it,
   reasoning that Beacon of Hope is Cleric-only on the class lists — which is true, and
   beside the point: `oath-of-devotion.json:23` grants it at paladin level 9, so it needs
   the tag for the same reason Sanctuary did (finding 4). This one was **latent**: Ilsa is
   below level 9, so the oath spell is never granted and the `spell-mismatch` check never
   fires. It would have surfaced the first time anyone played a Devotion paladin to 9.

Both fixed directly rather than by re-dispatch, since each is a one-token change verified
against the source rather than a judgement call. Flagging that I made them myself.

Note the shape of the second one: the same wrong inference ("not on the class list, so
remove the tag") was made twice by two different agents, and the first instance broke a
test loudly while the second broke nothing at all. The loud one got fixed in minutes. The
quiet one needed a test that nobody had asked for.

## 1. The source's `Spell Lists` section is lossy (data defect, not schema)

The PDF extraction drops whole column runs from page 104–110. Consequences:

- 28 of 320 spells resolve to no class list at all.
- Bard has **no** 1st-, 2nd-, 7th-, 8th- or 9th-level heading, and its cantrip bucket is
  missing four entries. Its "Cantrips" bucket actually contains the tail of its 2nd-level
  column (See Invisibility, Shatter, Silence, Suggestion, Zone of Truth), and its "6th
  Level" bucket wrongly ends with Power Word Stun (an 8th-level Bard spell).
- Most other class/level buckets are short by individual entries (Ranger 1st is missing
  Hunter's Mark; Wizard 1st is missing Grease and Identify).

Spell **levels** are unaffected — those come from each spell's own description line and
are source-verified per spell. Only the class tags are affected.

**Decision taken (user, this session):** converters tag from the real 2014 SRD class
lists and treat the extraction as a cross-check. Every tag added beyond the extraction is
reported by its converter, grouped by class, so the non-source-verified part of wave 0 is
spot-checkable. **This is the one part of wave 0 that is not source-verified.**

## 2. Dice-count scaling — narrower than first reported

The cantrips converter reported that a dice *count* cannot scale, because `resolveDice`
only substitutes the additive part. **That is not correct.** `resolveDice`
(`src/core/expr/evaluate.ts:118`) does a blind textual `@ref` substitution anywhere in the
notation, so the count position works — verified empirically:

| Notation | Resolves to |
| --- | --- |
| `2d6 + @abilities.str.mod` | `2d6 + 3` |
| `@table(wizard, cantrip-dice)d10` | `3d10` |
| `@level d6` | `11 d6` (space survives; reads badly) |
| `@leveld6` | `0` — `DICE_REF` greedily eats `d6` into the ref name |
| `floor((@level+1)/6)d10` | unevaluated literal — no arithmetic in the count position |

So the actual gaps are:

- **No arithmetic in the dice-count position.** Only a bare `@ref` or `@table(...)`
  substitutes; `floor(...)` and friends are left as literal text.
- **A bare `@ref` immediately before `dN` is mis-tokenised** (`@leveld6` → `0`). Only a
  reference ending in `)` — i.e. `@table(a, b)` — is safe directly before the die.
- **There is no shared cantrip-scaling table.** Cantrip scaling is a universal
  character-level rule (5th/11th/17th), not a class table, so there is nothing for
  `@table(...)` to point at. Every damaging cantrip is affected, which is ~10 elements in
  `cantrips.json` alone and recurs in every future wave.

Consequence as shipped: damaging cantrips carry their 1st-level damage in `damage` and the
full scaling sentence in `higherLevels`, so the sheet is correct at character levels 1–4
and understates at 5+. Flagged, not worked around.

## 3. No expression for "the casting class's spellcasting ability modifier" — the real gap

Reported independently by the 1st- and 2nd-level units, which is what makes it credible.

`content/core/content/stat-paths.json` defines `spellcasting.*.dc` and
`spellcasting.*.attack`, both **keyed by class**. A spell element is shared across every
class that has it on a list, so it cannot know which class is casting it, and there is no
`@spellMod` or equivalent. Consequence: anything scaling off "your spellcasting ability
modifier" cannot be mechanised in a cross-class spell file.

Concretely, this costs **Cure Wounds and Healing Word their healing action**. The old
`paladin-spells.json` could hardcode `@abilities.cha.mod` because it was a paladin-only
file; a shared `level-1.json` cannot, because the same element is the Cleric's, Druid's,
Bard's and Ranger's. So they ship as text, and the sheet can no longer roll Cure Wounds
for Ilsa — a capability the old test slice had. Hardcoding was correctly refused.

This is the finding I would put first at the checkpoint. It is not cantrip-shaped
cosmetics: it blocks every "heals for Xd8 + your spellcasting ability modifier" spell in
the game, and the number of those grows with each wave.

## 4. `<class>-spell` conflates two different things

The resolver's `spell-mismatch` check compares a known spell against the casting class's
`list` tag. But subclass-granted spells are frequently **not** on the base class's list —
Sanctuary is an Oath of Devotion oath spell and is Cleric-only on the class lists. It
still needs `paladin-spell` or the resolver warns, which is how batch 1 broke
`tests/srd/paladin.test.ts`.

So the tag means "legal for this class to have", not "on this class's spell list", and
those two diverge for every oath, domain and patron list. Fixed by tagging, but the
divergence will bite again in wave 2 (Cleric domain spells, Warlock patron spells) and
may want a distinct tag or a `grants`-aware check rather than a convention everyone has
to remember.

## 5. Mechanisation depth came out inconsistent across units — corrected

Batch 1 split on whether a damage spell gets an `actions` entry. Cantrips and level 3
mechanised theirs (Fireball, Lightning Bolt, Call Lightning). Level 2 left its whole
damage set as text — Scorching Ray, Acid Arrow, Shatter, Moonbeam, Spiritual Weapon —
reasoning that damage "depends on an attack roll against a chosen target", which is true
of every attack spell and so is not a distinguishing reason. A spell with a damage die
and no `damage` field is one the sheet cannot roll.

Settled in `SPELL-BRIEF.md` for the remaining batches and sent back to the level-2 unit:
damage or save → an `actions` entry with `save: { ability }` (the object shape; a bare
string fails validation, which level 3 found); area, shape and conditions stay text;
target-dependent riders go in `notes`, per the guide's Divine Smite example.

Worth noting as process, not just content: four agents given the same brief produced two
different answers to "how much of a spell is mechanisable". The brief was underspecified,
not the agents unreliable.

## 6. Two reported "schema gaps" that were not gaps — worth knowing why

Both came from converters, both sounded plausible, both were wrong on checking. The
pattern is the same: an agent inferred a limit from the fields it happened to look at
rather than from what the existing content already does.

1. **"A dice count cannot scale with level."** Wrong — `resolveDice` substitutes `@ref`
   textually anywhere in the notation, so `@table(a, b)d10` works. The real limits are
   narrower (see finding 2).
2. **"`ActionDef` has no way to express restoring hit points."** Wrong — healing is
   `damage` plus `damageType: "healing"`, which `srd:item:potion-of-healing` has used
   since before this wave and which a passing test covers.
3. **"There is no stat path for advantage on attack rolls, only `saves.*` and
   `checks.*`."** Wrong — `attacks.**` is defined in `content/core/content/stat-paths.json`
   and matches `attacks.all`. Verified against the real index, with a bogus path returning
   UNKNOWN to make the result meaningful:

   ```
   attacks.all   -> attacks.**
   attacks.melee -> attacks.**
   nonsense.path -> UNKNOWN
   ```

   This one had cost Foresight its main benefit — advantage on attack rolls — which had
   been filed in `notes` as unmechanisable. Now fixed.

The second one had cost real coverage before it was caught: Heal's flat 70 and
Regenerate's `4d8 + 15` had both been left as text as "unmechanisable", while the
level-3 unit had independently mechanised Mass Healing Word with the very pattern the
others believed did not exist. The agents had also conflated two different reasons for
leaving a heal as text — "I cannot express healing" (false) versus "I cannot express
*whose* spellcasting modifier applies" (true, finding 3). Both now fixed, and the brief
keeps the two reasons apart.

Process point for the checkpoint, and the thing I would most want carried into wave 1: **a
converter's report of a schema gap is a lead, not a finding.** Three of the five gaps
reported in wave 0 dissolved under a two-minute check against existing content or the real
index, and each would have silently cost coverage if filed as-is — a flat 70-point heal, a
marquee 9th-level spell's advantage, and every cantrip's scaling. All three reports were
confidently worded and plausible.

The check that worked each time was the same: ask what the existing content already does,
or probe the actual code, rather than reasoning from the field list. Note also that an
inconclusive probe looks exactly like a passing one — my first attempt at the attack-path
check produced no warning for a deliberately bogus path too, which is why the final
version includes a known-bad input as a control. Worth doing that every time.

## 7. Disputed class tags — a one-minute human spot-check, listed

These are the tags where a converter and I disagreed and neither of us has better
evidence than recall. Rather than run a third round of model-versus-model, they are listed
for someone with the SRD in front of them. Each is a one-line edit if confirmed.

The converter **declined to add** these, flagging doubt rather than guessing (which is the
behaviour the brief asks for). I believe all five belong, but I did not override:

| Spell | Tag I believe is missing | Converter's reason for declining |
| --- | --- | --- |
| Stoneskin (4th) | `druid-spell` | "Druid already has Barkskin at 2nd" |
| Black Tentacles (4th) | `warlock-spell` | not recalled on Warlock's 4th list |
| Death Ward (4th) | `paladin-spell` | believed Paladin 4th is only Banishment, Locate Creature |
| Stone Shape (4th) | `cleric-spell` | believed Cleric 4th is exactly the 7 already tagged |
| Freedom of Movement (4th) | `ranger-spell` | believed Ranger 4th is 3 spells |

Also outstanding, raised by the level-6 converter itself:

- **Create Undead (6th)** — has `wizard-spell`, `warlock-spell`. Is it on the Cleric list,
  or Death-domain only? The converter was not confident and left it off deliberately.

Everything else in the tagging either matched the extraction (which is reliable for
presence) or was an addition two independent passes agreed on.

## 8. The reference gap has a target side too, not just a caster side

Finding 3 is that a shared spell cannot name **the caster's** spellcasting modifier. Two
later units found the same shape of hole on the other side of the action:

- **`ActionDef.save` assumes the caster imposes a save on a target.** There is no way to
  express a save the caster makes against their *own* spell — Contact Other Plane's
  Intelligence save is the caster's own risk. Mechanising it with the existing shape would
  misrepresent who rolls, so it stayed text. Correct call.
- **No expression for the target's own values.** Resurrection restores "all its hit
  points", i.e. the *target's* hit point maximum. Not a dice formula and not the caster's
  modifier, so there is nothing to put in `damage`.
- **No path for *incoming* attacks.** `attacks.**` is the character's own attack bonus, so
  "attack rolls against you have disadvantage" has no home — Dispel Evil and Good's main
  defensive effect, and the reciprocal half of Foresight. Note this is the real gap that
  finding 6's debunked report was gesturing at: the outgoing half works, the incoming half
  does not.

Taken with finding 3, the generalisation worth putting at the checkpoint is that an
action is evaluated in exactly one context — the caster's — and a spell is a relationship
between two creatures. Everything that needs the other end of that relationship (whose
modifier, whose save, whose maximum, whose attack roll) currently has no home. That is one
question, not four, and it is the one I would want answered before wave 1's Wizard.

Worth stating plainly: this is the only wave-0 finding I would call load-bearing. The rest
are either cosmetic, already fixed, or turned out not to be gaps at all.

## 9. Smaller observations, recorded without action

- **No model for a GM dice-roll table.** Teleport's d100 mishap table is reproduced as a
  markdown table in `text`. Correct for now; noting it because several wave-3 magic items
  will want the same thing.
- **Mixed-damage-type actions.** `damageType` is a single value, so Ice Storm's
  simultaneous bludgeoning and cold needed two action entries. That follows the guide's
  Divine Smite multiple-variants pattern, so it works, but it reads as two casts on the
  sheet rather than one.
- **A modifier `value` will not take dice.** Heroes' Feast's `2d10` maximum-hit-point
  increase has to live in `notes`. Distinct from the healing pattern, which goes through
  `damage`.
- **Thrown-item attack rolls.** Acid, alchemist's fire and holy water are "a ranged
  attack treating the item as an improvised weapon", and `ActionDef` has `save` and
  `damage` but no attack-roll field, so these stayed text.
- **No container or bundle on `ItemElement`.** The seven equipment packs are each one item
  with their contents as prose. Fine, but a pack cannot be unpacked into its items.

## 8. The tagging asymmetry — the process lesson worth keeping

Working out the class tags surfaced a rule that was not obvious up front and that every
future wave touching spell lists will need:

**The extraction can prove a spell is present on a class list. It can never prove a spell
is absent.** It drops whole column runs, so an absence is evidence of nothing.

Therefore no tag removal can ever be justified by the extraction, and a removal justified
by a model's recall of the SRD rests on the weakest evidence in play. Batch 1 made three
wrong removals (Lesser Restoration/bard, Misty Step/warlock, Locate Animals or
Plants/ranger) while its *additions* in the same passes were almost all correct — the
same agent, the same evidence, reliable in one direction and not the other.

The brief now says: **add freely, never remove; flag a suspect tag in prose instead.** A
flagged tag costs a line of report. A wrong removal silently takes a spell away from a
class that should have it, and nothing will ever flag it — it is the plan's "invisibly
wrong" failure mode exactly.

Also worth noting: instructing agents to write out each class's full list for their level
*before* assigning tags caught errors that spell-by-spell checking did not. The level-2
agent found two of its own bad additions that way.

## 7. Tool proficiencies are almost entirely missing — blocks wave 3, not wave 0

`content/srd/content/proficiencies/tools.json` defines **three** tool proficiencies:
`srd:tool:smiths-tools`, `srd:tool:brewers-supplies`, `srd:tool:masons-tools` — added
only because the Dwarf subrace grants them. The tools unit converted 35 tool **items**
and found the other 32 proficiencies have no element at all: every other artisan's tool,
all six kits, both gaming sets, all ten instruments.

A tool is two different elements — the thing you carry and the proficiency you can have —
and wave 0 only produced the first. So a background or class saying "proficiency with
thieves' tools" or "one musical instrument of your choice" has nothing to grant and no
options to offer. Correctly left alone by the converter: it is out of wave 0's scope.

This lands in wave 3 (backgrounds are full of tool proficiencies) and is cheap, but it
wants doing as one deliberate proficiencies pass rather than piecemeal by whichever
background happens to need one — otherwise ids get minted twice with different slugs,
which is the one expensive mistake per the plan.

## 8. Things left as text by the cantrips unit (all judged correctly, recording for review)

Guidance and Resistance (one-shot reactive d4), Shillelagh (ties the damage die to a
specific held weapon), True Strike (per-target advantage, no stat path), Shocking Grasp's
metal-armour advantage, Vicious Mockery's and Ray of Frost's riders. The recurring theme
is **per-target and one-shot effects have no home in the modifier model** — worth a look
at the checkpoint, since a per-target advantage rider is extremely common across spells.
