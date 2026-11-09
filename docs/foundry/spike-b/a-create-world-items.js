// Spike B, macro A: create the world feature items the class advancement grants from.
// Script macro. Run as a GM. Safe to re-run: existing ids are skipped.
//
// Field names, all from dnd5e release-5.3.3 (module/data/item/feat.mjs unless noted):
//   system.type.value / system.type.subtype  ItemTypeField, via templates/item-type.mjs
//   system.source.rules                      module/data/shared/source-field.mjs
//   system.requirements                      feat.mjs
// Document ids are 16 characters, [A-Za-z0-9], as DocumentIdField requires.

const items = [
  { _id: "SpkBGrantL1Feat0", name: "Spike Grant L1" },
  { _id: "SpkBGrantL2Feat0", name: "Spike Grant L2" },
  { _id: "SpkBChoiceFeatA0", name: "Spike Choice A" },
  { _id: "SpkBChoiceFeatB0", name: "Spike Choice B" }
];

const created = [];
for ( const { _id, name } of items ) {
  if ( game.items.has(_id) ) { console.log(`SpikeB | ${name} (${_id}) already exists, skipped`); continue; }
  const item = await Item.create({
    _id, name, type: "feat",
    system: {
      description: { value: `<p>Spike B ${name}.</p>` },
      source: { rules: "2014" },
      type: { value: "class", subtype: "" },
      requirements: ""
    }
  }, { keepId: true });
  created.push(item.uuid);
}
ui.notifications.info(`SpikeB | created ${created.length} world item(s): ${created.join(", ") || "none"}`);
