/**
 * End-to-end over the real content in content/: the converted SRD slice resolved by
 * the real resolver. This is the test that catches content mistakes as well as code
 * mistakes, which is why the numbers below are written out longhand.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import type { BuildFile, InventoryFile, SpellsFile, StateFile } from "../src/core/types";
import { srdIndex } from "./helpers";

const content = srdIndex();

function paladin(level: number, choices: Record<string, string[]> = {}): BuildFile {
  const levels = Array.from({ length: level }, (_, i) => ({
    class: "srd:class:paladin",
    hp: (i === 0 ? "max" : "average") as "max" | "average",
    choices: {} as Record<string, string[]>,
  }));
  // Level-scoped answers, keyed by the build level where the class reached that level.
  if (choices["srd:class:paladin:skills"]) levels[0].choices = { "srd:class:paladin:skills": choices["srd:class:paladin:skills"] };
  if (level >= 2 && choices["srd:paladin:fighting-style"])
    levels[1].choices = { "srd:paladin:fighting-style": choices["srd:paladin:fighting-style"] };
  if (level >= 3 && choices["srd:paladin:sacred-oath"])
    levels[2].choices = { "srd:paladin:sacred-oath": choices["srd:paladin:sacred-oath"] };
  if (level >= 4 && choices["srd:paladin:asi-4"])
    levels[3].choices = { "srd:paladin:asi-4": choices["srd:paladin:asi-4"] };

  return {
    kind: "build",
    schemaVersion: 1,
    name: "Ilsa",
    level,
    xp: 6500,
    species: "srd:species:dwarf",
    background: "srd:background:acolyte",
    abilities: { method: "point-buy", base: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } },
    levels,
    choices: {
      "srd:species:dwarf:tool-proficiency": ["srd:tool:smiths-tools"],
      "srd:background:acolyte:languages": ["srd:language:elvish", "srd:language:celestial"],
    },
  };
}

const FULL_CHOICES = {
  "srd:class:paladin:skills": ["srd:skill:athletics", "srd:skill:persuasion"],
  "srd:paladin:fighting-style": ["srd:fighting-style:defense"],
  "srd:paladin:sacred-oath": ["srd:subclass:oath-of-devotion"],
  "srd:paladin:asi-4": ["srd:feature:ability-score-improvement"],
};

const inventory: InventoryFile = {
  kind: "inventory",
  schemaVersion: 1,
  items: [
    { id: "srd:item:longsword", equipped: true },
    { id: "srd:item:chain-mail", equipped: true },
    { id: "srd:item:shield", equipped: true },
    { id: "srd:item:potion-of-healing", quantity: 2 },
    { id: "srd:item:holy-symbol" },
  ],
  currency: { gp: 15 },
};

const spells: SpellsFile = {
  kind: "spells",
  schemaVersion: 1,
  spells: [
    { id: "srd:spell:bless", class: "srd:class:paladin", prepared: true },
    { id: "srd:spell:cure-wounds", class: "srd:class:paladin", prepared: true },
    { id: "srd:spell:shield-of-faith", class: "srd:class:paladin" },
    { id: "srd:spell:aid", class: "srd:class:paladin", prepared: true },
  ],
};

describe("the converted content loads cleanly", () => {
  it("has no errors from either source", () => {
    const errors = content.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });

  it("has no unresolved references or unknown kinds", () => {
    const bad = content.diagnostics.filter(
      (d) => d.code === "unresolved-reference" || d.code === "unknown-kind" || d.code === "missing-source",
    );
    expect(bad).toEqual([]);
  });

  it("declares its sourcebooks with attribution", () => {
    const srd = content.sourcebook("srd");
    expect(srd?.abbreviation).toBe("SRD");
    expect(srd?.license).toBe("CC-BY-4.0");
    expect(srd?.attribution).toContain("Wizards of the Coast");
  });

  it("exposes every kind the test slice uses", () => {
    for (const kind of ["species", "species-trait", "class", "class-feature", "subclass", "subclass-feature", "background", "spell", "item", "tool", "language", "skill", "fighting-style"])
      expect(content.kindDef(kind), kind).toBeDefined();
  });
});

describe("Ilsa, dwarf paladin of Devotion", () => {
  const character = resolve({ content, build: paladin(5, FULL_CHOICES), inventory, spells });

  it("knows who she is", () => {
    expect(character.name).toBe("Ilsa");
    expect(character.level).toBe(5);
    expect(character.species?.name).toBe("Dwarf");
    expect(character.background?.name).toBe("Acolyte");
    expect(character.classes).toEqual([
      expect.objectContaining({ name: "Paladin", level: 5, hitDie: "d10", subclass: { id: "srd:subclass:oath-of-devotion", name: "Oath of Devotion" } }),
    ]);
  });

  it("has the right ability scores after the species increase", () => {
    expect(character.abilities.con.score.value).toBe(16);
    expect(character.abilities.con.mod).toBe(3);
    expect(character.abilities.str.mod).toBe(3);
    expect(character.proficiencyBonus.value).toBe(3);
  });

  it("has 49 hit points: 13 at first level then four levels of 9", () => {
    expect(character.hp.max.value).toBe(49);
    expect(character.hp.hitDice).toEqual([{ die: "d10", max: 5, spent: 0, remaining: 5 }]);
  });

  it("wears chain mail and carries a shield for AC 18", () => {
    expect(character.ac.value).toBe(18);
  });

  it("notes Defense as situational, since it depends on wearing armour", () => {
    const annotation = character.ac.annotations.find((a) => a.source === "srd:fighting-style:defense");
    expect(annotation?.when.text).toBe("while wearing armour");
    expect(annotation?.when.context).toBe("wearing-armour");
  });

  it("is proficient in the saves and skills the class and background grant", () => {
    expect(character.abilities.wis.save.value).toBe(1 + 3);
    expect(character.abilities.cha.save.value).toBe(2 + 3);
    expect(character.abilities.str.save.value).toBe(3);
    const skill = (key: string) => character.skills.find((s) => s.key === key)!;
    expect(skill("religion").stat.proficiency).toBe("proficient");
    expect(skill("insight").stat.proficiency).toBe("proficient");
    expect(skill("athletics").stat.proficiency).toBe("proficient");
    expect(skill("persuasion").stat.proficiency).toBe("proficient");
    expect(skill("stealth").stat.proficiency).toBeUndefined();
  });

  it("has disadvantage on Stealth from the chain mail", () => {
    expect(character.skills.find((s) => s.key === "stealth")!.stat.advantage).toBe("disadvantage");
  });

  it("carries the dwarf's speed, darkvision, resistance and languages", () => {
    expect(character.speed.walk.value).toBe(25);
    expect(character.senses.darkvision.value).toBe(60);
    expect(character.sets["resistances"].values).toEqual(["poison"]);
    expect(character.sets["languages"].values.sort()).toEqual(["Celestial", "Common", "Dwarvish", "Elvish"]);
    expect(character.sets["proficiencies.tool"].values).toEqual(["srd:tool:smiths-tools"]);
  });

  it("has advantage against poison as an annotation, not folded into the save", () => {
    const annotation = character.abilities.con.save.annotations.find((a) => a.source === "srd:dwarf:dwarven-resilience");
    expect(annotation?.when.text).toBe("against poison");
    expect(character.abilities.con.save.advantage).toBe("none");
  });

  it("treats Stonecunning as a situational expertise, not a permanent one", () => {
    const history = character.skills.find((s) => s.key === "history")!;
    expect(history.stat.proficiency).toBeUndefined();
    expect(history.stat.annotations[0].value).toBe("expertise");
    expect(history.stat.annotations[0].when.context).toBe("stonecunning");
  });

  it("is immune to disease from Divine Health", () => {
    expect(character.sets["conditionImmunities"].values).toEqual(["disease"]);
  });

  it("has a Lay on Hands pool of 25, read from the class table", () => {
    const pool = character.resources.find((r) => r.key === "srd:paladin:lay-on-hands");
    expect(pool).toMatchObject({ max: 25, remaining: 25, recharge: "long-rest", unit: "hit points" });
  });

  it("has three uses of Divine Sense, from 1 + CHA", () => {
    expect(character.resources.find((r) => r.source === "srd:paladin:divine-sense")?.max).toBe(3);
  });

  it("has one Channel Divinity use that comes back on a short rest", () => {
    const cd = character.resources.find((r) => r.key === "srd:paladin:channel-divinity");
    expect(cd).toMatchObject({ max: 1, recharge: "short-rest" });
  });

  it("has half-caster spell slots: four first and two second at level 5", () => {
    expect(character.spellcasting?.slots.map((s) => s.max)).toEqual([4, 2]);
  });

  it("has a spell save DC of 13 and a +5 spell attack", () => {
    const paladinCasting = character.spellcasting!.classes[0];
    expect(paladinCasting.dc.value).toBe(13);
    expect(paladinCasting.attack.value).toBe(5);
    expect(paladinCasting.type).toBe("prepared");
    expect(paladinCasting.progression).toBe("half");
  });

  it("always has its oath spells prepared, and keeps the spellbook's own picks", () => {
    const byId = new Map(character.spellcasting!.spells.map((s) => [s.id, s]));
    expect(byId.get("srd:spell:sanctuary")).toMatchObject({ alwaysPrepared: true, prepared: true });
    expect(byId.get("srd:spell:zone-of-truth")).toMatchObject({ alwaysPrepared: true, prepared: true });
    expect(byId.get("srd:spell:bless")).toMatchObject({ alwaysPrepared: false, prepared: true });
    expect(byId.get("srd:spell:shield-of-faith")).toMatchObject({ prepared: false });
    expect(character.spellcasting?.orphaned).toEqual([]);
  });

  it("offers Divine Smite as one button per slot level", () => {
    const smites = character.actions.filter((a) => a.source === "srd:paladin:divine-smite");
    expect(smites.map((s) => s.damageResolved)).toEqual(["2d8", "3d8", "4d8", "5d8", "5d8"]);
    expect(smites[0].resolvedCost).toEqual([{ key: "slots.1", amount: 1, label: "level 1 slots" }]);
  });

  it("offers both Channel Divinity options, one of which applies an effect", () => {
    const sacred = character.actions.find((a) => a.id === "sacred-weapon");
    expect(sacred?.applies).toBe("srd:devotion:sacred-weapon");
    expect(sacred?.resolvedCost).toEqual([
      { key: "srd:paladin:channel-divinity", amount: 1, label: "Channel Divinity" },
    ]);
    const turn = character.actions.find((a) => a.id === "turn-the-unholy");
    expect(turn?.save).toEqual({ ability: "wis", dc: 13 });
  });

  it("has no outstanding choices and no diagnostics", () => {
    expect(character.pendingChoices.filter((c) => !c.complete)).toEqual([]);
    expect(character.diagnostics).toEqual([]);
  });

  it("has Extra Attack at level 5 but not Aura of Protection", () => {
    const ids = character.elements.map((e) => e.id);
    expect(ids).toContain("srd:paladin:extra-attack");
    expect(ids).not.toContain("srd:paladin:aura-of-protection");
  });
});

describe("levelling and choices", () => {
  it("asks for the sacred oath at level 3, not before", () => {
    const two = resolve({ content, build: paladin(2, FULL_CHOICES) });
    expect(two.pendingChoices.map((c) => c.id)).not.toContain("srd:paladin:sacred-oath");

    const three = resolve({ content, build: paladin(3, { ...FULL_CHOICES, "srd:paladin:sacred-oath": [] }) });
    const oath = three.pendingChoices.find((c) => c.id === "srd:paladin:sacred-oath");
    expect(oath?.complete).toBe(false);
    expect(oath?.options.map((o) => o.name)).toEqual(["Oath of Devotion"]);
    expect(oath?.level).toBe(3);
  });

  it("offers exactly the six skills the paladin may choose from", () => {
    const one = resolve({ content, build: paladin(1, { ...FULL_CHOICES, "srd:class:paladin:skills": [] }) });
    const skills = one.pendingChoices.find((c) => c.id === "srd:class:paladin:skills");
    expect(skills?.options.map((o) => o.name)).toEqual([
      "Athletics",
      "Insight",
      "Intimidation",
      "Medicine",
      "Persuasion",
      "Religion",
    ]);
  });

  it("offers only the paladin's four fighting styles", () => {
    const two = resolve({ content, build: paladin(2, { ...FULL_CHOICES, "srd:paladin:fighting-style": [] }) });
    const styles = two.pendingChoices.find((c) => c.id === "srd:paladin:fighting-style");
    expect(styles?.options.map((o) => o.name)).toEqual(["Defense", "Dueling", "Great Weapon Fighting", "Protection"]);
  });

  it("has no spellcasting at level 1 and spellcasting at level 2", () => {
    expect(resolve({ content, build: paladin(1, FULL_CHOICES) }).spellcasting?.classes ?? []).toHaveLength(0);
    expect(resolve({ content, build: paladin(2, FULL_CHOICES) }).spellcasting?.classes).toHaveLength(1);
    expect(resolve({ content, build: paladin(2, FULL_CHOICES) }).spellcasting?.slots.map((s) => s.max)).toEqual([2]);
  });

  it("grows the Lay on Hands pool with level", () => {
    for (const [level, expected] of [[1, 5], [5, 25], [20, 100]] as const) {
      const r = resolve({ content, build: paladin(level, FULL_CHOICES) });
      expect(r.resources.find((x) => x.key === "srd:paladin:lay-on-hands")?.max).toBe(expected);
    }
  });

  it("picks up later oath features as the class levels, without re-choosing the oath", () => {
    const twenty = resolve({ content, build: paladin(20, FULL_CHOICES) });
    const ids = twenty.elements.map((e) => e.id);
    expect(ids).toContain("srd:devotion:aura-of-devotion");
    expect(ids).toContain("srd:devotion:purity-of-spirit");
    expect(ids).toContain("srd:devotion:holy-nimbus");
    expect(ids).toContain("srd:paladin:cleansing-touch");
    expect(twenty.spellcasting?.slots.map((s) => s.max)).toEqual([4, 3, 3, 3, 2]);
  });

  it("flags the ability score improvements as outstanding choices", () => {
    const eight = resolve({ content, build: paladin(8, FULL_CHOICES) });
    const asis = eight.pendingChoices.filter((c) => c.id.includes(":asi-"));
    expect(asis.map((c) => c.level)).toEqual([4, 8]);
    expect(asis.map((c) => c.complete)).toEqual([true, false]);
  });

  it("checks the multiclass requirement without enforcing it by default", () => {
    const cls = content.get("srd:class:paladin");
    expect(cls?.multiclassRequires).toMatchObject({ text: "Strength 13 and Charisma 13" });
  });
});

describe("live play", () => {
  const build = paladin(5, FULL_CHOICES);

  function withEvents(...events: StateFile["events"]): StateFile {
    return {
      kind: "state",
      schemaVersion: 1,
      checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] },
      events,
    };
  }

  it("takes damage, spends a slot and burns Lay on Hands", () => {
    const r = resolve({
      content,
      build,
      inventory,
      spells,
      state: withEvents(
        { t: "2026-10-27T19:42:00Z", type: "damage", amount: 12 },
        { t: "2026-10-27T19:43:10Z", type: "spend", target: "slots.1", amount: 1 },
        { t: "2026-10-27T19:44:00Z", type: "spend", target: "srd:paladin:lay-on-hands", amount: 8 },
      ),
    });
    expect(r.hp.current).toBe(37);
    expect(r.spellcasting?.slots[0]).toMatchObject({ max: 4, spent: 1, remaining: 3 });
    expect(r.resources.find((x) => x.key === "srd:paladin:lay-on-hands")?.remaining).toBe(17);
  });

  it("applies Sacred Weapon's attack bonus while the effect is up", () => {
    const off = resolve({ content, build, inventory, spells, state: withEvents() });
    const on = resolve({
      content,
      build,
      inventory,
      spells,
      state: withEvents({ t: "t", type: "effect.start", effect: "srd:devotion:sacred-weapon" }),
    });
    // A path with no contributions is simply absent, which the sheet treats as zero.
    expect(off.stats["attacks.weapon"]).toBeUndefined();
    expect(on.stats["attacks.weapon"].value).toBe(2);
    expect(on.effects.find((e) => e.id === "srd:devotion:sacred-weapon")?.active).toBe(true);
  });

  it("returns Channel Divinity on a short rest but not spell slots", () => {
    const r = resolve({
      content,
      build,
      inventory,
      spells,
      state: withEvents(
        { t: "t", type: "spend", target: "srd:paladin:channel-divinity", amount: 1 },
        { t: "t", type: "spend", target: "slots.1", amount: 2 },
        { t: "t", type: "rest.short" },
      ),
    });
    expect(r.resources.find((x) => x.key === "srd:paladin:channel-divinity")?.remaining).toBe(1);
    expect(r.spellcasting?.slots[0].remaining).toBe(2);
  });

  it("returns everything on a long rest", () => {
    const r = resolve({
      content,
      build,
      inventory,
      spells,
      state: withEvents(
        { t: "t", type: "damage", amount: 20 },
        { t: "t", type: "spend", target: "slots.2", amount: 2 },
        { t: "t", type: "spend", target: "srd:paladin:lay-on-hands", amount: 25 },
        { t: "t", type: "rest.long" },
      ),
    });
    expect(r.hp.current).toBe(49);
    expect(r.spellcasting?.slots[1].remaining).toBe(2);
    expect(r.resources.find((x) => x.key === "srd:paladin:lay-on-hands")?.remaining).toBe(25);
  });

  it("marks Divine Smite unavailable once the slots are gone", () => {
    const r = resolve({
      content,
      build,
      inventory,
      spells,
      state: withEvents({ t: "t", type: "spend", target: "slots.1", amount: 4 }),
    });
    const smite = r.actions.find((a) => a.id === "smite-1");
    expect(smite?.available).toBe(false);
  });
});

describe("degradation", () => {
  it("resolves a character whose source is missing, keeping the selections", () => {
    const empty = resolve({ content, build: { ...paladin(5, FULL_CHOICES), species: "homebrew:species:tiefling" } });
    expect(empty.diagnostics.some((d) => d.code === "unresolved-reference")).toBe(true);
    expect(empty.hp.max.value).toBe(49 - 5 * 1); // no +2 CON from the dwarf
    expect(empty.level).toBe(5);
  });

  it("resolves an empty build without throwing", () => {
    const blank = resolve({
      content,
      build: { kind: "build", schemaVersion: 1, level: 0, abilities: { method: "manual", base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }, levels: [] },
    });
    expect(blank.level).toBe(0);
    expect(blank.ac.value).toBe(10);
    expect(blank.hp.max.value).toBe(1);
  });
});
