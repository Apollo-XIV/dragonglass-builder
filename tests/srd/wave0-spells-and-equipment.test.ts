/**
 * Longhand assertions over wave 0 of the SRD conversion: all 319 spells, and the
 * weapons, armour, gear and tools.
 *
 * The numbers here are written out by hand from the SRD's own tables rather than
 * derived from the content, which is the point — this file is what catches a
 * conversion mistake that validates perfectly. The armour and weapon tables are
 * transcribed in full, because they are small, fixed, and drive the AC stack and
 * the attack maths respectively.
 *
 * Nothing here is about one class, so it sits beside `sources.test.ts` rather than
 * in a per-class file.
 */

import { describe, expect, it } from "vitest";
import { srdIndex } from "../helpers";
import type { Element } from "../../src/core/types";

const content = srdIndex();

const spells = content.byKind("spell").filter((e) => e.source === "srd");
const items = content.byKind("item").filter((e) => e.source === "srd");

const byId = (id: string): any => {
  const el = content.get(id);
  expect(el, `missing element ${id}`).toBeDefined();
  return el as any;
};

describe("the wave-0 inventory", () => {
  it("has all 319 SRD spells", () => {
    // 323 h4 headings under "Spell Descriptions", less four that are sub-tables
    // belonging to other spells: Animated Object Statistics (Animate Objects),
    // and Precipitation / Temperature / Wind (Control Weather).
    expect(spells.length).toBe(319);
  });

  it("partitions them by level, ten files' worth", () => {
    const perLevel = new Map<number, number>();
    for (const s of spells as any[]) perLevel.set(s.spellLevel, (perLevel.get(s.spellLevel) ?? 0) + 1);
    expect([...perLevel.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, 24],
      [1, 49],
      [2, 54],
      [3, 42],
      [4, 31],
      [5, 37],
      [6, 31],
      [7, 20],
      [8, 16],
      [9, 15],
    ]);
  });

  it("has 37 weapons, 13 armour entries and 35 tools", () => {
    const of = (tag: string) => items.filter((i) => (i.tags ?? []).includes(tag)).length;
    expect(of("weapon")).toBe(37);
    expect(of("armor")).toBe(13);
    expect(of("tool")).toBe(35);
  });

  it("gives every spell the fields the sheet reads", () => {
    const incomplete = (spells as any[]).filter(
      (s) =>
        typeof s.spellLevel !== "number" ||
        !s.school ||
        !s.castingTime ||
        !s.range ||
        !s.duration ||
        !s.components ||
        !s.text,
    );
    expect(incomplete.map((s) => s.id)).toEqual([]);
  });

  it("names every element under the locked id convention", () => {
    const bad = [...spells, ...items]
      .map((e) => e.id)
      .filter((id) => !/^srd:(spell|item):[a-z0-9-]+$/.test(id));
    expect(bad).toEqual([]);
  });
});

describe("the armour table, transcribed from the SRD", () => {
  // Name, id, cost in copper, AC base, Dex cap (null = none applied), weight,
  // stealth disadvantage. "Dex cap undefined" means the Dex modifier applies in
  // full, which is how light armour differs from heavy.
  const table: [string, number, number, number | null | undefined, number, boolean][] = [
    ["srd:item:padded-armor", 500, 11, undefined, 8, true],
    ["srd:item:leather-armor", 1000, 11, undefined, 10, false],
    ["srd:item:studded-leather-armor", 4500, 12, undefined, 13, false],
    ["srd:item:hide-armor", 1000, 12, 2, 12, false],
    ["srd:item:chain-shirt", 5000, 13, 2, 20, false],
    ["srd:item:scale-mail", 5000, 14, 2, 45, true],
    ["srd:item:breastplate", 40000, 14, 2, 20, false],
    ["srd:item:half-plate", 75000, 15, 2, 40, true],
    ["srd:item:ring-mail", 3000, 14, null, 40, true],
    ["srd:item:chain-mail", 7500, 16, null, 55, true],
    ["srd:item:splint-armor", 20000, 17, null, 60, true],
    ["srd:item:plate-armor", 150000, 18, null, 65, true],
  ];

  for (const [id, cost, base, dexMax, weight, stealth] of table) {
    it(`${id.replace("srd:item:", "")} is AC ${base} at ${cost / 100} gp`, () => {
      const el = byId(id);
      expect(el.itemType).toBe("armor");
      expect(el.value).toBe(cost);
      expect(el.weight).toBe(weight);
      expect(el.armor.base).toBe(base);
      expect(el.armor.dexMax).toBe(dexMax === undefined ? undefined : dexMax);
      expect(Boolean(el.armor.stealthDisadvantage)).toBe(stealth);
    });
  }

  it("makes the shield a +2 that stacks, not a competing base", () => {
    const shield = byId("srd:item:shield");
    expect(shield.value).toBe(1000);
    expect(shield.weight).toBe(6);
    // A base would compete with the armour's own and the higher would win, so a
    // shield has to be an additive modifier for chain mail + shield to reach 18.
    expect(shield.armor?.base).toBeUndefined();
    const ac = (shield.modifiers ?? []).find((m: any) => m.target === "ac");
    expect(ac).toMatchObject({ op: "add", value: 2 });
  });

  it("gates the heavy armour that reduces speed below Strength 13 and 15", () => {
    expect(byId("srd:item:chain-mail").requires.all).toEqual([
      { type: "ability", ability: "str", min: 13 },
    ]);
    for (const id of ["srd:item:splint-armor", "srd:item:plate-armor"]) {
      expect(byId(id).requires.all).toEqual([{ type: "ability", ability: "str", min: 15 }]);
    }
    // Light and medium armour carry no Strength requirement at all.
    expect(byId("srd:item:leather-armor").requires).toBeUndefined();
    expect(byId("srd:item:half-plate").requires).toBeUndefined();
  });
});

describe("the weapon table, transcribed from the SRD", () => {
  // Name, cost in copper, damage, type, category, weight.
  const table: [string, number, string, string, string, number][] = [
    ["club", 10, "1d4", "bludgeoning", "simple-melee", 2],
    ["dagger", 200, "1d4", "piercing", "simple-melee", 1],
    ["greatclub", 20, "1d8", "bludgeoning", "simple-melee", 10],
    ["handaxe", 500, "1d6", "slashing", "simple-melee", 2],
    ["javelin", 50, "1d6", "piercing", "simple-melee", 2],
    ["light-hammer", 200, "1d4", "bludgeoning", "simple-melee", 2],
    ["mace", 500, "1d6", "bludgeoning", "simple-melee", 4],
    ["quarterstaff", 20, "1d6", "bludgeoning", "simple-melee", 4],
    ["sickle", 100, "1d4", "slashing", "simple-melee", 2],
    ["spear", 100, "1d6", "piercing", "simple-melee", 3],
    ["dart", 5, "1d4", "piercing", "simple-ranged", 0.25],
    ["shortbow", 2500, "1d6", "piercing", "simple-ranged", 2],
    ["battleaxe", 1000, "1d8", "slashing", "martial-melee", 4],
    ["flail", 1000, "1d8", "bludgeoning", "martial-melee", 2],
    ["glaive", 2000, "1d10", "slashing", "martial-melee", 6],
    ["greataxe", 3000, "1d12", "slashing", "martial-melee", 7],
    ["greatsword", 5000, "2d6", "slashing", "martial-melee", 6],
    ["halberd", 2000, "1d10", "slashing", "martial-melee", 6],
    ["lance", 1000, "1d12", "piercing", "martial-melee", 6],
    ["longsword", 1500, "1d8", "slashing", "martial-melee", 3],
    ["maul", 1000, "2d6", "bludgeoning", "martial-melee", 10],
    ["morningstar", 1500, "1d8", "piercing", "martial-melee", 4],
    ["pike", 500, "1d10", "piercing", "martial-melee", 18],
    ["rapier", 2500, "1d8", "piercing", "martial-melee", 2],
    ["scimitar", 2500, "1d6", "slashing", "martial-melee", 3],
    ["shortsword", 1000, "1d6", "piercing", "martial-melee", 2],
    ["trident", 500, "1d6", "piercing", "martial-melee", 4],
    ["warhammer", 1500, "1d8", "bludgeoning", "martial-melee", 2],
    ["whip", 200, "1d4", "slashing", "martial-melee", 3],
    ["longbow", 5000, "1d8", "piercing", "martial-ranged", 2],
  ];

  for (const [slug, cost, damage, type, category, weight] of table) {
    it(`${slug} deals ${damage} ${type}`, () => {
      const el = byId(`srd:item:${slug}`);
      expect(el.itemType).toBe("weapon");
      expect(el.value).toBe(cost);
      expect(el.weight).toBe(weight);
      expect(el.weapon.damage).toBe(damage);
      expect(el.weapon.damageType).toBe(type);
      expect(el.weapon.category).toBe(category);
    });
  }

  it("carries versatile's second die, which changes the damage roll", () => {
    const versatile: Record<string, string> = {
      "srd:item:quarterstaff": "1d8",
      "srd:item:spear": "1d8",
      "srd:item:trident": "1d8",
      "srd:item:battleaxe": "1d10",
      "srd:item:longsword": "1d10",
      "srd:item:warhammer": "1d10",
    };
    for (const [id, die] of Object.entries(versatile)) {
      const props: string[] = byId(id).weapon.properties ?? [];
      expect(props.join(" "), id).toContain(`versatile (${die})`);
    }
  });

  it("marks finesse, which changes which ability the attack uses", () => {
    const finesse = [
      "dagger",
      "dart",
      "rapier",
      "scimitar",
      "shortsword",
      "whip",
    ];
    for (const slug of finesse) {
      const props: string[] = byId(`srd:item:${slug}`).weapon.properties ?? [];
      expect(props.map((p) => p.toLowerCase()).join(" "), slug).toContain("finesse");
    }
    // A greatsword is heavy and two-handed, and explicitly not finesse.
    const greatsword: string[] = byId("srd:item:greatsword").weapon.properties ?? [];
    expect(greatsword.map((p) => p.toLowerCase()).join(" ")).not.toContain("finesse");
  });

  it("leaves the net without a damage die, because it deals none", () => {
    const net = byId("srd:item:net");
    expect(net.weapon?.damage ?? null).toBeNull();
  });
});

describe("spells whose numbers the sheet rolls", () => {
  it("fireball is a 3rd-level 8d6 Dexterity save, not a concentration spell", () => {
    const el = byId("srd:spell:fireball");
    expect(el.spellLevel).toBe(3);
    expect(el.school).toBe("evocation");
    expect(el.castingTime).toBe("1 action");
    expect(el.range).toBe("150 feet");
    expect(el.concentration ?? false).toBe(false);
    expect(el.ritual ?? false).toBe(false);
    expect(el.higherLevels).toContain("1d6");
    expect(el.actions[0]).toMatchObject({
      damage: "8d6",
      damageType: "fire",
      save: { ability: "dex" },
    });
  });

  it("heal restores a flat 70 hit points", () => {
    // Healing is damageType "healing", the same shape srd:item:potion-of-healing
    // uses. A heal with a fixed amount is mechanisable; one that scales with the
    // caster's spellcasting modifier is not — see Cure Wounds below.
    const el = byId("srd:spell:heal");
    expect(el.spellLevel).toBe(6);
    expect(el.actions[0]).toMatchObject({ damage: "70", damageType: "healing" });
  });

  it("regenerate restores 4d8 + 15", () => {
    expect(byId("srd:spell:regenerate").actions[0]).toMatchObject({
      damage: "4d8 + 15",
      damageType: "healing",
    });
  });

  it("leaves cure wounds and healing word unmechanised, and says why in the text", () => {
    // Both heal "1d8 + your spellcasting ability modifier". There is no expression
    // for *which* class is casting a shared spell, so hardcoding an ability would
    // be right for one class and wrong for the others. Deliberately text.
    for (const id of ["srd:spell:cure-wounds", "srd:spell:healing-word"]) {
      const el = byId(id);
      expect(el.actions ?? [], id).toEqual([]);
      expect(el.text.toLowerCase()).toContain("spellcasting ability modifier");
    }
  });

  it("gives foresight advantage on attacks as well as saves and checks", () => {
    const targets = (byId("srd:spell:foresight").effects ?? [])
      .flatMap((e: any) => e.modifiers ?? [])
      .filter((m: any) => m.op === "advantage")
      .map((m: any) => m.target)
      .sort();
    expect(targets).toEqual(["attacks.all", "checks.all", "saves.all"]);
  });

  it("flags concentration and ritual where the SRD does", () => {
    expect(byId("srd:spell:bless").concentration).toBe(true);
    expect(byId("srd:spell:fireball").concentration ?? false).toBe(false);
    expect(byId("srd:spell:find-familiar").ritual).toBe(true);
    expect(byId("srd:spell:magic-missile").ritual ?? false).toBe(false);
  });
});

describe("class spell lists", () => {
  const tagged = (tag: string) => spells.filter((s) => (s.tags ?? []).includes(tag));

  it("tags every spell with at least one class list", () => {
    // The PDF extraction of "Spell Lists" drops whole column runs, so 28 spells
    // came through on no list at all. Tags were filled from the SRD lists; a spell
    // reachable by no class is the signature of that extraction gap reappearing.
    const orphans = spells
      .filter((s) => !(s.tags ?? []).some((t) => t.endsWith("-spell")))
      .map((s) => s.name);
    expect(orphans).toEqual([]);
  });

  it("caps paladin and ranger at 5th level, as half-casters", () => {
    for (const tag of ["paladin-spell", "ranger-spell"]) {
      const levels = tagged(tag).map((s: any) => s.spellLevel);
      expect(Math.max(...levels), tag).toBeLessThanOrEqual(5);
    }
  });

  it("gives every full caster spells at all ten levels", () => {
    for (const tag of ["wizard-spell", "cleric-spell", "druid-spell", "bard-spell"]) {
      const levels = new Set(tagged(tag).map((s: any) => s.spellLevel));
      const missing = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((l) => !levels.has(l));
      // Cleric and Druid have no cantrip-less level; a gap here means a whole
      // class/level bucket was lost, which is exactly how the extraction fails.
      expect(missing, tag).toEqual([]);
    }
  });

  it("keeps the Oath of Devotion spells on the paladin list", () => {
    // These are granted by the subclass and are mostly not on the Paladin class
    // list, but the resolver's spell-mismatch check compares against the casting
    // class's list tag and warns without it.
    for (const id of [
      "srd:spell:protection-from-evil-and-good",
      "srd:spell:sanctuary",
      "srd:spell:lesser-restoration",
      "srd:spell:zone-of-truth",
      "srd:spell:beacon-of-hope",
      "srd:spell:dispel-magic",
    ]) {
      expect(byId(id).tags, id).toContain("paladin-spell");
    }
  });
});

describe("the ids the existing test slice depends on", () => {
  // These were in the hand-written slice before wave 0 and are referenced by
  // tests/srd/paladin.test.ts, tests/ui.test.tsx and vault/Characters/Ilsa.
  // Wave 0 moved them into the by-level and by-category files; the ids must not
  // have moved with them.
  const contract = [
    "srd:spell:bless",
    "srd:spell:cure-wounds",
    "srd:spell:divine-favor",
    "srd:spell:heroism",
    "srd:spell:shield-of-faith",
    "srd:spell:protection-from-evil-and-good",
    "srd:spell:sanctuary",
    "srd:spell:lesser-restoration",
    "srd:spell:zone-of-truth",
    "srd:spell:aid",
    "srd:spell:magic-weapon",
    "srd:spell:beacon-of-hope",
    "srd:spell:dispel-magic",
    "srd:item:longsword",
    "srd:item:battleaxe",
    "srd:item:handaxe",
    "srd:item:light-hammer",
    "srd:item:warhammer",
    "srd:item:chain-mail",
    "srd:item:leather-armor",
    "srd:item:half-plate",
    "srd:item:shield",
    "srd:item:holy-symbol",
    "srd:item:potion-of-healing",
  ];

  for (const id of contract) {
    it(`still resolves ${id}`, () => {
      expect((content.get(id) as Element | undefined)?.id).toBe(id);
    });
  }
});
