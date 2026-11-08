# Walking the sheet numbers

Ten characters in `vault/Characters/Walk *`, built from the converter's output (`5etools-to-dragonglass/out/srd` and
`out/srd24`, built after the last overlay change) and resolved by the plugin, checked against the rules text. The
numbers that reconcile are asserted in `tests/walk-characters.test.ts` (skipped where the converter is not checked
out). Everything else is below. `vault/Sources/walk-patches` is a source that sits above the converter's and replaces
three elements with the new chosen-amount and provenance shapes, so the characters show them before the converter
writes them. Not for play.

Abilities are set by hand, hit points are the average, nothing is equipped (so AC is unarmoured and no weapon attacks
appear).

## Reconciled

| Character | Checked |
| --- | --- |
| 2024 Paladin 5 (Devotion) | HP 44 (10 + 2 + 4×8). Prof +3, spell DC 14 / attack +6, prepared 6, slots 4/2. Lay on Hands 25 (5×5), long rest. Channel Divinity 2: one back on a short rest, all on a long one. Two weapon masteries. Oath spells Protection from Evil and Good, Shield of Faith, Aid, Zone of Truth, plus Find Steed and Divine Smite always prepared. Magic Initiate (Cleric) innate spells use Wisdom: DC 12. |
| 2014 Paladin 5 (Devotion) | HP 44. Divine Sense 4 (1 + Cha), Channel Divinity 1 on a short rest, Lay on Hands 25, prepared 5 (Cha 3 + half level 2), oath spells. |
| 2014 Barbarian 5 (Berserker, hill dwarf) | HP 65 (60 + 5 Dwarven Toughness). Rages 3, long rest only. Rage: resistance to slashing/piercing/bludgeoning, advantage on Strength checks and saves, +2 melee damage, the last two as the "situational" annotation they are. |
| 2024 Barbarian 5 (Berserker) | HP 55. Rages 3, **one back on a short rest** and all on a long one. Same Rage effect. |
| 2014 Monk 5 (Open Hand) | HP 38. Ki 5, all back on a short rest. Flurry, Patient Defense, Step of the Wind and Stunning Strike cost 1. Stunning Strike DC 14 (8 + 3 + Wis 3), Con save. |
| 2024 Sorcerer 5 (Draconic) | HP 32. Sorcery Points 5, Innate Sorcery 2, DC 16 / +8, prepared 9, cantrips 5, slots 4/3/2. Quickened Spell 2 points. Draconic spells always prepared. |
| 2024 High Elf Wizard 5 (Evoker) | HP 32. DC 16 / +8, prepared 9, spellbook cap 14, cantrips 4. Every innate spell (lineage Prestidigitation/Detect Magic/Misty Step, Magic Initiate Wizard's Mage Hand/Dancing Lights/Shield) reads **Intelligence**, DC 16. Detect Magic, Misty Step and Shield are once per long rest. Evoker's three spellbook picks are learned and free (`used` stays 0). |
| 2014 Lore Bard 10 | HP 73. DC 18 / +10, known 14, cantrips 4, slots 4/3/3/3/2, Bardic Inspiration 6 (Cha), Cutting Words costs one. |
| 2024 Druid 5 (Land, arid) | HP 38. DC 16 / +8, prepared 9, slots 4/3/2. Wild Shape 2: one back on a short rest, all on a long one. Land's Aid costs one, DC 16. Terrain spells Blur, Burning Hands, Fire Bolt (L3) and Fireball (L5) always prepared. |
| 2014 Cleric 6 (Life) | HP 45, prepared 10, DC 15 / +7. Channel Divinity 2, short rest. Bare "Channel Divinity" button gone; Turn Undead and Preserve Life remain. |

**Subclass at its class level.** Paladin, Barbarian, Sorcerer, Wizard and Druid (2024), Monk and Bard (2014) all take their
subclass at class level 3. None has a repeated resource key, a repeated element with the same origin, or a doubled
pool; the level entry is applied once.

## Not reconciled

Each is an observation of the resolved sheet against the book. None was fixed here unless it says so.

### Converter content (for the converter session)

1. **Unarmored Defense has no modifiers**, for the 2014 and 2024 Barbarian and the 2014 Monk (feature is present, empty).
   Barbarian 2024 shows AC 11; the rules give 10 + Dex 1 + Con 3 = **14**. Barbarian 2014: 11 vs **15**. Monk 2014: 13 vs
   **16** (10 + Dex 3 + Wis 3). An `ac` modifier with `op: "base"` would compete with armour as the engine's rule says.
2. **Sorcerer 2024 Draconic Resilience has no modifiers.** Rules: +3 hit points at level 3 and +1 per Sorcerer level after
   (so +5 at 5th), and base AC 10 + Dex + Cha when unarmoured. Shown: HP 32 (expect 37), AC 12 (expect 10 + 2 + 5 = 17).
3. **Twinned Spell costs a flat 1.** The rule is a number of Sorcery Points equal to the spell's level (minimum 1). It
   wants the new chosen-amount shape, `{ "min": 1, "max": 9 }` (see the converter note). Quickened Spell's 2 is right.
4. **2024 Lay on Hands has no action that spends the pool for healing**, only Remove Poison (5). 2014's has an action
   with no cost. Both want the chosen-amount shape and `heal: "@spent"`.
5. **Innate Sorcery** has its 2 uses and a button, but no effect: the +1 spell save DC and advantage on sorcerer spell
   attacks for a minute are not modelled. Same for **Font of Magic** (a button with no cost; slot/point conversion), and
   **Sorcerous Restoration** (the 1 use is there, the points regained are not).
6. **2024 Paladin Sacred Weapon** costs a Channel Divinity use but applies no effect (+Charisma to attack rolls).
7. **Spells with two actions of one id.** Acid Arrow carries `cast-acid` twice (4d4 and 2d4), so a sheet lists it twice
   and the action key repeats (`srd:spell:acid-arrow:cast-acid`). 2014 Divine Smite lists 2d8 and 1d8 as two actions.
8. **2014 Bard, Additional Magical Secrets (College of Lore, 6th)** is `mode: "learned"` and counts against the
   spells known (Lore Bard 10 shows cantrips 1 used, known 1 used of 14). The text says the two spells *don't count
   against the number of bard spells you know*, so the choice wants `"counts": false`.
9. **2014 Bard, Magical Secrets (10th/14th/18th)** is written as `spellcasting.extra` picks, which the limits treat as
   *outside* the counts (`extras`). The text says they *are included in the Spells Known column*. They should count.
   Written as choices with `mode: "learned"` on the class level entries (as the schema's own example shows), they would.
   `docs/schema.md` says the Lore subclass one counts and the class one is the free one; it is the other way round.

### Plugin behaviour

10. **Situational bonuses never fold into the value** (by design, see `docs/schema.md`). Fast Movement (+10, 5th level)
    and Unarmored Movement (+10) therefore leave speed at 25/30 with the bonus as an annotation, and Rage's damage is
    an annotation of +2. The resolver has no idea whether the character is in heavy armour, so it cannot decide.
11. **Effects do not end on a rest.** A Rage toggled on is still on after a long rest.
12. **Fixed here:** a granted spell's own save action was given 8 + proficiency whatever ability the player chose
    (Magic Initiate's Bane showed DC 11 beside an innate DC of 14 or 16). It now reads the innate DC.

### Not checked

Weapon attacks and damage with equipment, AC with armour, multiclass slot tables, and anything after level 5 (10 for
the Bard).
