# Spike B and C checklist (dnd5e 5.3.3)

Paths are in `foundryvtt/dnd5e` at tag `release-5.3.3`, under `module/`. Where a result depends on Foundry
core rather than dnd5e, the step says so, and the expectation is a guess to be confirmed, not read from source.

**Environment.** Foundry VTT 13.347 or later, dnd5e 5.3.3, a world with the
"Disable Advancements" system setting **off** (`disableAdvancements`, read in
`applications/actor/api/base-actor-sheet.mjs` `#changeLevel`). Open the browser console with F12 (or the GM client for B).
Record the Foundry build and the dnd5e version shown in the Manage Modules/Systems screen in `RESULTS.md`.

## Setup

1. Paste `a-create-world-items.js` into a new Script macro and run it as the GM. Expect a notification
   naming four created world items: Spike Grant L1, Spike Grant L2, Spike Choice A, Spike Choice B.
2. Paste `b-create-actor.js` into another Script macro. Do not run it yet; B1 is the run.
3. Paste `c-verify.js` into a third Script macro.

## B: advancement

### B1 Create the pre-filled character

Run macro B.

**Expect:**
- No advancement prompt or dialog. (The advancement manager is only started by the sheet's drop and level
  controls, `applications/actor/api/base-actor-sheet.mjs`; `createEmbeddedDocuments` does not start it.)
- The actor "Spike B Level 1" opens. Its Features tab lists the class "Spike Class" (level 1), "Spike Grant L1"
  and "Spike Choice A".
- Run macro C. Its table shows two ledger rows, both with `onActor` set (not `MISSING`), `sourceIdOk: true` and
  `originOk: true`; the orphans table is empty; the HitPoints line shows `value = {1: "max"}`.
- Level 1, `originalClass` = `SpkBClassItem001`.

### B2 Level the class from 1 to 2

On the character sheet, raise the class's level to 2 with the sheet's own level control (it calls
`AdvancementManager.forLevelChange`, `applications/advancement/advancement-manager.mjs:381`). Do not edit
`system.levels` by hand. If you can't find the control, write that in the notes and stop here.

**Expect, from `createLevelChangeSteps` (same file, line 396):**
- Flows only for class level 2. `ItemGrant` L2 is automatic
  (`documents/advancement/item-grant.mjs` `automaticApplicationValue`): "Spike Grant L2" is added with no prompt.
- **One HitPoints prompt.** HitPoints applies at every level (`documents/advancement/hit-points.mjs`, `levels`) and is only
  automatic when level 1 was `"avg"`; macro B wrote `"max"`. Take the average (7 on a d12) so B3 is deterministic.
  This is a level-2 advancement, not a re-grant, but note it.
- No prompt for Spike Grant L1. No Item Choice prompt: the choice is configured for level 1 only
  (`documents/advancement/item-choice.mjs` `levels` = the keys of `configuration.choices`).
- Run macro C: three ledger rows, still one "Spike Grant L1" and one "Spike Choice A" on the actor.

### B3 HP max

`hp.max` is stored as `null` here, so it is computed: the sum over `HitPoints` levels of
`max(value + CON mod, 1)` (`data/actor/character.mjs`, `data/actor/templates/attributes.mjs` `prepareHitPoints`,
`documents/advancement/hit-points.mjs` `getAdjustedTotal`). CON is 14, so +2.

**Expect:**
- At level 1 (check before B2, or read it from macro C's last line): **14** (`max(12+2, 1)`).
- After B2 with the average: **23** (`14 + max(7+2, 1)`). With a roll of r: `14 + max(r+2, 1)`.
- `hp.max` in macro C's output matches the number the sheet shows. In the console,
  `game.actors.get("SpkBActor0000001")._source.system.attributes.hp.max` is still `null`.

### B4 Level back down

Lower the class from 2 to 1 with the same control. A confirmation dialog should appear first
(`AdvancementConfirmationDialog.forLevelDown`). Choose the option that removes the advancements. Then run macro C.

**Expect from source, to be confirmed:**
- `ItemGrant.reverse` deletes everything in that advancement's `value.added`
  (`documents/advancement/item-grant.mjs`, `reverse`): "Spike Grant L2" leaves the actor.
- `HitPoints.reverse(2)` removes `value.2` and the HP it gave; `hp.max` returns to 14.
- "Spike Grant L1" and "Spike Choice A" stay: their advancements are level 1, and no flow runs for level 1.
- Note what the dialog's buttons say and what the other choice does (repeat from B2 and pick it). Note any item
  that is deleted, duplicated, or left behind.

## C: Player permissions

**Setup.** Create a Player-role user (not Trusted, not Assistant) and set "Spike B Level 1" Ownership for that user to
Owner. In *Configure Permissions* (Game Settings), note the state of "Create New Actors" and "Create New Items" for
Player, and record it in `RESULTS.md`. Log in as that user in a separate browser profile and open the console.

### C1 Create an item on the owned actor

```js
const a = game.actors.get("SpkBActor0000001");
await a.createEmbeddedDocuments("Item", [{ name: "Player Made", type: "feat" }]);
```

**Expect (Foundry core, not dnd5e):** success, and the item on the sheet; dnd5e adds no veto on this path (the one
`ACTOR_CREATE` check in `documents/actor/actor.mjs:408` is for summoning only). Record the success or the full error text. Delete the
item afterwards.

### C2 Create a world Actor and a world Item

```js
await Actor.create({ name: "Player Actor", type: "character" });
await Item.create({ name: "Player Item", type: "feat" });
```

**Expect (Foundry core):** each rejected with a permission error unless the world grants the permission, whose
text is Foundry's, not dnd5e's. Record each error exactly, and whether the document appears in the sidebar for the GM.
If either succeeds, record the permission setting that allowed it and delete the document.
