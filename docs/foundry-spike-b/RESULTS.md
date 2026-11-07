# Spike B and C results

| Field | Value |
| --- | --- |
| Date | |
| Foundry version / build | |
| dnd5e version (expect 5.3.3) | |
| "Disable Advancements" setting | |
| Player user role | |
| Configure Permissions: Player "Create New Actors" | |
| Configure Permissions: Player "Create New Items" | |

| Step | Expected | Observed | Notes |
| --- | --- | --- | --- |
| B1 Run macro B | No advancement prompt. Class, Spike Grant L1 and Spike Choice A on the sheet. Macro C: two ledger rows, all `ok`, no orphans, level 1. | As expected. | |
| B2 Level 1 → 2 on the sheet | Spike Grant L2 added without a prompt. One HitPoints prompt. No Level 1 re-grant, no choice re-asked. | As expected. | |
| B3 HP max | 14 at level 1; 23 after B2 with the average. `_source` max stays `null`. | 14 at level 1, 23 after level 2. | |
| B4 Level 2 → 1 | Confirmation dialog. Spike Grant L2 removed, HP back to 14, level 1 items kept. | Level up and down worked as expected. | Dialog buttons; other choice; anything left behind: |
| C1 Player: `createEmbeddedDocuments` on owned actor | Succeeds. | Succeeded; item showed on the character sheet. | Error text if any: |
| C2a Player: `Actor.create` | Permission error (unless the world allows it). | Failed on missing permissions, as expected. | Error text: |
| C2b Player: `Item.create` | Permission error (unless the world allows it). | Failed on missing permissions, as expected. | Error text: |

## Conclusion

Reported by the tester: every step behaved as expected on dnd5e 5.3.3. Pre-filled ItemGrant and ItemChoice ledgers are read as applied, a level-up grants only the new level, HP is computed from the HitPoints advancement, and a Player owner can create embedded items but not world Actors or Items. The exact error text, dialog wording and permission settings were not recorded.

## Anything else odd
