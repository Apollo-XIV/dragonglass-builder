// Spike B, macro C: print each class item's advancement ledger and which actor items it maps to.
// Script macro. Uses the selected token's actor, else the Spike B actor.
// Reads only: item.advancement.{byId,byType,byLevel} (documents/item.mjs _prepareAdvancement),
// advancement.value / .configuration / .levels, and flags.dnd5e.* on the actor's items.

const actor = canvas?.tokens?.controlled[0]?.actor ?? game.actors.get("SpkBActor0000001");
if ( !actor ) return ui.notifications.error("SpikeB | no actor: select a token or run macro B");

const entries = adv => {
  // ItemGrant stores a flat map (storagePath "value.added"); ItemChoice nests it by level (value.added.<level>).
  const added = adv.value?.added ?? {};
  if ( adv.type === "ItemChoice" ) {
    return Object.entries(added).flatMap(([level, map]) => Object.entries(map).map(([id, uuid]) => ({ level, id, uuid })));
  }
  return Object.entries(added).map(([id, uuid]) => ({ level: adv.level, id, uuid }));
};

const mapped = new Set();
const rows = [];
for ( const cls of actor.itemTypes.class ) {
  console.group(`SpikeB | class ${cls.name} (${cls.id}) levels=${cls.system.levels} original=${cls.isOriginalClass}`);
  for ( const adv of cls.advancement.byId ? Object.values(cls.advancement.byId) : [] ) {
    const head = `${adv.type} ${adv.id} level=${adv.level ?? "-"} levels=[${adv.levels}]`;
    if ( adv.type === "HitPoints" ) {
      console.log(head, "value =", foundry.utils.deepClone(adv.value), "total() =", adv.total(),
        "adjusted(con) =", adv.getAdjustedTotal(actor.system.abilities.con.mod));
      continue;
    }
    if ( !["ItemGrant", "ItemChoice"].includes(adv.type) ) { console.log(head); continue; }
    console.log(head);
    for ( const e of entries(adv) ) {
      const item = actor.items.get(e.id);
      if ( item ) mapped.add(e.id);
      const f = item?.flags?.dnd5e ?? {};
      rows.push({
        advancement: adv.id, type: adv.type, level: e.level, itemId: e.id, uuid: e.uuid,
        onActor: item ? item.name : "MISSING",
        sourceIdOk: item ? f.sourceId === e.uuid : null,
        originOk: item ? f.advancementOrigin === `${cls.id}.${adv.id}` : null,
        root: f.advancementRoot ?? null
      });
    }
  }
  console.groupEnd();
}
console.table(rows);

const orphans = actor.items.filter(i => i.type !== "class" && !mapped.has(i.id))
  .map(i => ({ id: i.id, name: i.name, type: i.type, origin: i.flags.dnd5e?.advancementOrigin ?? null }));
console.log("SpikeB | actor items no ledger entry maps to:"); console.table(orphans);
const hp = actor.system.attributes.hp;
console.log(`SpikeB | hp.max=${hp.max} value=${hp.value} effectiveMax=${hp.effectiveMax} | details.level=${actor.system.details.level} originalClass=${actor.system.details.originalClass}`);
ui.notifications.info("SpikeB | ledger printed to the console (F12)");
return { rows, orphans };
