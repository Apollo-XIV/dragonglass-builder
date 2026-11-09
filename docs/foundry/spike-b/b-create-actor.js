// Spike B, macro B: a level-1 character whose class advancement is already applied.
// Script macro. Run as a GM, after macro A. Refuses to run if the actor already exists.
//
// Every field below is from dnd5e release-5.3.3. Paths are under module/ and are cited in README.md.
//   Class item   data/item/class.mjs                    hd.denomination, hd.spent, levels, identifier
//   advancement  data/item/templates/advancement.mjs    system.advancement is an object keyed by _id
//                data/fields/advancement-collection-field.mjs
//   base fields  data/advancement/base-advancement.mjs  _id, type, configuration, value, level, title
//   HitPoints    documents/advancement/hit-points.mjs   value is { [level]: "max" | "avg" | number }
//   ItemGrant    data/advancement/item-grant.mjs        configuration.items[{uuid,optional}], optional, spell
//                documents/advancement/item-grant.mjs   value.added is a FLAT { itemId: uuid }  (storagePath)
//   ItemChoice   data/advancement/item-choice.mjs       configuration.choices/pool/restriction/type/allowDrops,
//                                                       value.added { [level]: { itemId: uuid } }, value.replaced
//   flags        documents/advancement/advancement.mjs  createItemData(): flags.dnd5e.sourceId,
//                                                       advancementOrigin = "<classId>.<advancementId>",
//                                                       advancementRoot = origin of the class (or this origin)
//   original class  data/actor/character.mjs            system.details.originalClass

const ACTOR_ID = "SpkBActor0000001";
const CLASS_ID = "SpkBClassItem001";
const ADV = { hp: "SpkBAdvHP0000001", grant1: "SpkBAdvGrant0001", grant2: "SpkBAdvGrant0002", choice: "SpkBAdvChoice001" };
const WORLD = {
  grant1: "Item.SpkBGrantL1Feat0", grant2: "Item.SpkBGrantL2Feat0",
  choiceA: "Item.SpkBChoiceFeatA0", choiceB: "Item.SpkBChoiceFeatB0"
};
const GOT = { grant1: "SpkBGotL1Feat001", choiceA: "SpkBGotChoiceA01" };   // ids of the items on the actor

for ( const uuid of Object.values(WORLD) ) {
  if ( !fromUuidSync(uuid) ) return ui.notifications.error(`SpikeB | ${uuid} is missing. Run macro A first.`);
}
if ( game.actors.has(ACTOR_ID) ) return ui.notifications.error("SpikeB | actor already exists. Delete it first.");

// 1. The actor. hp.max stays null so the HitPoints advancement computes it (data/actor/character.mjs, prepareDerivedData).
const actor = await Actor.create({
  _id: ACTOR_ID, name: "Spike B Level 1", type: "character",
  system: {
    abilities: { con: { value: 14 } },        // +2, so level 1 with "max" on a d12 gives 14
    attributes: { hp: { value: 14 } },
    details: { originalClass: CLASS_ID }
  }
}, { keepId: true });

// 2. The class item, with its advancement already filled in. Giving system.advancement stops
//    preCreateAdvancement() adding the default set (data/item/templates/advancement.mjs).
const classData = {
  _id: CLASS_ID, name: "Spike Class", type: "class",
  system: {
    identifier: "spike-class",
    levels: 1,
    hd: { denomination: "d12", spent: 0 },
    source: { rules: "2014" },
    advancement: {
      [ADV.hp]: { _id: ADV.hp, type: "HitPoints", configuration: {}, value: { 1: "max" } },
      [ADV.grant1]: {
        _id: ADV.grant1, type: "ItemGrant", level: 1, title: "Features",
        configuration: { items: [{ uuid: WORLD.grant1, optional: false }], optional: false, spell: null },
        value: { added: { [GOT.grant1]: WORLD.grant1 } }
      },
      [ADV.grant2]: {
        _id: ADV.grant2, type: "ItemGrant", level: 2, title: "Features",
        configuration: { items: [{ uuid: WORLD.grant2, optional: false }], optional: false, spell: null },
        value: {}
      },
      [ADV.choice]: {
        _id: ADV.choice, type: "ItemChoice", title: "Choice",   // multiLevel: no `level`, levels come from configuration.choices
        configuration: {
          allowDrops: false,
          choices: { 1: { count: 1, replacement: false } },
          pool: [{ uuid: WORLD.choiceA }, { uuid: WORLD.choiceB }],
          restriction: { level: "", list: [], subtype: "", type: "" },
          spell: null,
          type: null
        },
        value: { added: { 1: { [GOT.choiceA]: WORLD.choiceA } }, replaced: {} }
      }
    }
  }
};
await actor.createEmbeddedDocuments("Item", [classData], { keepId: true });

// 3. The items the advancements granted, built the way Advancement#createItemData builds them.
const granted = (gotId, worldUuid, advId) => {
  const data = fromUuidSync(worldUuid).toObject();
  delete data.folder; delete data.sort; delete data.ownership;
  const origin = `${CLASS_ID}.${advId}`;
  return foundry.utils.mergeObject(data, {
    _id: gotId,
    "flags.dnd5e.sourceId": worldUuid,
    "flags.dnd5e.advancementOrigin": origin,
    "flags.dnd5e.advancementRoot": origin      // the class has no advancementRoot of its own
  });
};
await actor.createEmbeddedDocuments("Item", [
  granted(GOT.grant1, WORLD.grant1, ADV.grant1),
  granted(GOT.choiceA, WORLD.choiceA, ADV.choice)
], { keepId: true });

ui.notifications.info(`SpikeB | created ${actor.name} (${actor.uuid})`);
actor.sheet.render(true);
