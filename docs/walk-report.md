# Walking the sheet numbers

Ten characters in `vault/Characters/Walk *`, built from the converter's output (`5etools-to-dragonglass/out/srd` and
`out/srd24`, at converter commit `4e265ba`) and resolved by the plugin, checked against the rules text. The numbers
that reconcile are asserted in `tests/walk-characters.test.ts` (skipped where the converter is not checked out).
The characters read the converter's trees directly; the patch source they used for the first walk is gone.

Abilities are set by hand, hit points are the average, nothing is equipped (so AC is unarmoured and no weapon attacks
appear).

## Reconciled

| Character | Checked |
| --- | --- |
| 2024 Paladin 5 (Devotion) | HP 44 (10 + 2 + 4×8). Prof +3, spell DC 14 / attack +6, prepared 6, slots 4/2. Lay on Hands 25 (5×5), long rest, a chosen 1–25 healing `@spent`. Channel Divinity 2: one back on a short rest, all on a long one. Two weapon masteries. Oath spells Protection from Evil and Good, Shield of Faith, Aid, Zone of Truth, plus Find Steed and Divine Smite always prepared. Magic Initiate (Cleric) innate spells use Wisdom: DC 12. |
| 2014 Paladin 5 (Devotion) | HP 44. Divine Sense 4 (1 + Cha), Channel Divinity 1 on a short rest, Lay on Hands 25 as a chosen 1–25 amount healing `@spent`, prepared 5 (Cha 3 + half level 2), oath spells. |
| 2014 Barbarian 5 (Berserker, hill dwarf) | AC 15 (Unarmored Defense: 10 + Dex 1 + Con 4). HP 65 (60 + 5 Dwarven Toughness). Rages 3, long rest only. Rage: resistance to slashing/piercing/bludgeoning, advantage on Strength checks and saves, +2 melee damage, the last two as the "situational" annotation they are. |
| 2024 Barbarian 5 (Berserker) | AC 14 (10 + Dex 1 + Con 3). HP 55. Rages 3, **one back on a short rest** and all on a long one. Same Rage effect. |
| 2014 Monk 5 (Open Hand) | AC 16 (10 + Dex 3 + Wis 3). HP 38. Ki 5, all back on a short rest. Flurry, Patient Defense, Step of the Wind and Stunning Strike cost 1. Stunning Strike DC 14 (8 + 3 + Wis 3), Con save. |
| 2024 Sorcerer 5 (Draconic) | HP 37 and AC 17 (Draconic Resilience: +3 at 3rd, +1 per level after; 10 + Dex 2 + Cha 5). Twinned Spell is a flat 1 point, as the 2024 text says. Sorcery Points 5, Innate Sorcery 2, DC 16 / +8, prepared 9, cantrips 5, slots 4/3/2. Quickened Spell 2 points. Draconic spells always prepared. |
| 2024 High Elf Wizard 5 (Evoker) | HP 32. DC 16 / +8, prepared 9, spellbook cap 14, cantrips 4. Every innate spell (lineage Prestidigitation/Detect Magic/Misty Step, Magic Initiate Wizard's Mage Hand/Dancing Lights/Shield) reads **Intelligence**, DC 16. Detect Magic, Misty Step and Shield are once per long rest. Evoker's three spellbook picks are learned and free (`used` stays 0). |
| 2014 Lore Bard 10 | HP 73. DC 18 / +10, known 14, cantrips 4. Additional Magical Secrets (6th) is free: its two spells use no room. Magical Secrets (10th) counts: a cantrip against the 4 and a spell against the 14. The 14th and 18th are the same shape (asserted on the class entries). Slots 4/3/3/3/2, Bardic Inspiration 6 (Cha), Cutting Words costs one. |
| 2024 Druid 5 (Land, arid) | HP 38. DC 16 / +8, prepared 9, slots 4/3/2. Wild Shape 2: one back on a short rest, all on a long one. Land's Aid costs one, DC 16. Terrain spells Blur, Burning Hands, Fire Bolt (L3) and Fireball (L5) always prepared. |
| 2014 Cleric 6 (Life) | HP 45, prepared 10, DC 15 / +7. Channel Divinity 2, short rest. Bare "Channel Divinity" button gone; Turn Undead and Preserve Life remain. |

**Subclass at its class level.** Paladin, Barbarian, Sorcerer, Wizard and Druid (2024), Monk and Bard (2014) all take their
subclass at class level 3. None has a repeated resource key, a repeated element with the same origin, or a doubled
pool; the level entry is applied once.

## Not reconciled

Each is an observation of the resolved sheet against the book. The first walk (before the converter's changes) listed
nine converter gaps; the rest of this section is what is still open.

### Closed by the converter's changes

Unarmored Defense (Barbarian 2014 and 2024, Monk 2014), Draconic Resilience, Lay on Hands (both rulesets: a chosen
amount with `heal: "@spent"`), the duplicate action ids (Acid Arrow, 2014 Divine Smite: no repeated key on any walk
character now), Lore's Additional Magical Secrets (`counts: false`), and the Bard's Magical Secrets (learned choices
that count). Innate Sorcery now has an effect, +1 to the Sorcerer spell save DC.

**A correction to the first report.** Twinned Spell was listed as wanting a cost equal to the spell's level. That is
the 2014 rule; the 2024 text, which is what this content is, reads "spend 1 Sorcery Point". A flat 1 was right.

### Converter content (for the converter session)

1. **Innate Sorcery's advantage on Sorcerer spell attack rolls** is not modelled (only the DC). **Font of Magic** is a
   button with no cost, and **Sorcerous Restoration** has its 1 use but not the points regained.
2. **2024 Paladin Sacred Weapon** costs a Channel Divinity use but applies no effect (+Charisma to attack rolls).
3. **2014 Divine Smite** is still two actions (2d8, 1d8), now with distinct ids.

### Plugin behaviour

4. **Situational bonuses never fold into the value** (by design, see `docs/schema.md`). Fast Movement (+10, 5th level)
   and Unarmored Movement (+10) therefore leave speed at 25/30 with the bonus as an annotation, and Rage's damage is
   an annotation of +2. The resolver has no idea whether the character is in heavy armour, so it cannot decide.
5. **Effects do not end on a rest.** A Rage toggled on is still on after a long rest.
6. **Fixed in the first walk:** a granted spell's own save action was given 8 + proficiency whatever ability the
   player chose (Magic Initiate's Bane showed DC 11 beside an innate DC of 14 or 16). It now reads the innate DC.

### Not checked

Weapon attacks and damage with equipment, AC with armour, multiclass slot tables, and anything after level 5 (10 for
the Bard).
