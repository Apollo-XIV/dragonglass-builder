# Backlog

What is left after the plugin batch (chosen-amount costs, provenance markers, pool-owner buttons, the walk, export 2.3, the Foundry design sync) and the follow-up that pointed the walk at the converted SRD trees. Source: `docs/walk-report.md` and the batch's own notes. Nothing here is started.

## Converter content (for the converter session)

| Item | Detail |
| --- | --- |
| Innate Sorcery, advantage | The effect adds +1 to the spell save DC; advantage on Sorcerer spell attack rolls is not modelled. |
| Font of Magic | A button with no cost; slot and point conversion is not modelled. |
| Sorcerous Restoration | The 1 use exists; the points regained do not. |
| 2024 Paladin Sacred Weapon | Spends a Channel Divinity use but applies no effect (+Charisma to attack rolls). |
| 2014 Divine Smite | Still two actions (2d8 and 1d8), now with distinct ids. Could be one action with a choice. |

## Plugin behaviour

| Item | Detail |
| --- | --- |
| Effects ending on a rest | A Rage toggled on is still on after a long rest. Effects need a duration the fold can end. |
| Situational bonuses | Fast Movement, Unarmored Movement and Rage damage are annotations only, by design. Applying them to real attack and damage numbers needs the sheet to know the situation (armour worn, raging). |
| `@spent` in rolls | Chosen-amount healing is shown, not applied. Variable damage is not rolled. |
| Marker setting | "Hide unverified markers" takes effect on the next render, not live. |

## Not yet walked

- Weapon attacks and damage with equipment.
- AC with armour and shields.
- Multiclass slot tables.
- Levels past 5 (10 for the Bard). Bard Magical Secrets at 14 and 18 are checked on the class entries only, not on a built character.

## Skipped by the owner

- Item 6 of the batch, the display bugs. Skipped on instruction, so the list was never looked at.

## Owner decisions open

- Which converter sources the owner signs off, so `unreviewed` and `auto` provenance can move to `reviewed`.
- Who creates the empty character actor for a Foundry import (Proposed in `docs/foundry-integration-design.md`; DM or player).
- Display choices to confirm: the inline amount picker, "X" shown for `@spent` until an amount is chosen, and the dashed-ring marker.
- The untracked `Dragonglass ↔ Foundry integration design.md` at the repo root differs from `docs/foundry-integration-design.md`. Left alone; one of them should go.

## Housekeeping

- `tests/srd/spell-limits.test.ts` and `tests/walk-characters.test.ts` skip when the converter checkout is absent, so CI without it covers none of the converted-SRD numbers.
