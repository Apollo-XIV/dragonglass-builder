# Spike B: a hand-written dnd5e 5.3.3 actor

A test file for importing into Foundry VTT, to find out what the dnd5e system accepts and does with
a character written the way the exporter would write it. It targets **dnd5e 5.3.3**, the last 5.x
release. It needs Foundry VTT 13.347 or later; 5.3.3 is verified on v14.

Nothing here is the exporter. It is a probe.

## Import

1. Install dnd5e 5.3.3 in the world (manifest: the `system.json` from the
   `release-5.3.3` tag). Don't use 6.x for this test.
2. In the Actors directory, use **Create Document → Import Data** and choose
   `spike-b-actor.json`. (If your Foundry version doesn't offer Import Data, tell me and
   I'll give a macro that runs `Actor.create` on the same object.)
3. Open the actor.

## What it contains

| Thing | What it tests |
| --- | --- |
| Actor: abilities, HP 30/35 with 5 temp, flat AC 16, speed 30 ft, 10 gp, Athletics proficiency | Whether the actor-level mapping in the design doc lands in the right fields |
| Barbarian class, `levels: 1`, `source.rules: "2014"` | Class shape, hit die, the rules marker |
| Class advancement at level 1 (`ItemGrant`) with Rage and Unarmored Defense already recorded as granted, with matching `flags.dnd5e` on each feature | Whether a grant that was already applied is read as applied |
| Class advancement at level 2 (`ItemGrant`), nothing recorded yet | Whether levelling the class to 2 grants Reckless Attack and Danger Sense from the compendium. **This is the main test.** |
| Dwarf species, `source.rules: "2024"`, alongside the 2014 Barbarian | The mixed-ruleset case from the design |
| Acid Splash (spell), Greataxe (weapon), both `rules: "2014"` | The spell and weapon shapes. Some fields are my best reading of the 5.3.3 models (for example `school: "con"`, `activation`, `range`, `duration`, `properties`) |

Feature descriptions are placeholders. The features are linked to the real compendium items by UUID,
so their real text comes from the system.

## What to report back

1. **Did the import succeed?** If not, copy the error text.
2. **Console warnings or errors** after import (open the developer tools with F12, and filter for
   `dnd5e` or `DataModel`). Paste any that name a field. A warning that names one of the
   unverified fields above is a finding about my guess, not a failure of the approach.
3. **Abilities, HP, AC, speed, currency and Athletics**: do they show the values above? In particular, does
   HP show **35 max** (the override), or is it recomputed?
4. **Level-up test:** open the Barbarian class and move it from level 1 to level 2 (through the
   class's level-up flow, not by editing `levels` by hand). Do Reckless Attack and Danger Sense appear?
   Do Rage and Unarmored Defense appear only once?
5. **Mixed rules:** on the Dwarf and the Greataxe, does Foundry show the 2024 and 2014 labels
   from `source`?
6. Anything else odd.

The answers to 4 and 3 decide two design points: whether full class advancement is workable, and whether
HP should be written as an override or left for Foundry to compute.
