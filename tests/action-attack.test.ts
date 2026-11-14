/**
 * Attack rolls on actions (schema-gaps spec, item 1): a feature's, spell's or
 * consumable's own attack, assembled as a weapon's is.
 */
import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import { partsOf } from "../src/core/export/build";
import { resolve } from "../src/core/resolver/resolve";
import type { ActionDef, Element } from "../src/core/types";
import { build, scores, testIndex, TEST_BOOK } from "./helpers";

const WIZARD: Element = {
  id: "test:class:wizard", kind: "class", name: "Wizard", source: "test", key: "wizard", hitDie: "d6",
  spellcasting: { ability: "int", progression: "full", type: "spellbook", list: "wizard-spell" },
  levels: { "1": { grants: ["test:feature:ray"] }, "2": {}, "3": {}, "4": {}, "5": {} },
} as Element;

const ray = (attack: ActionDef["attack"], extra: Partial<Element> = {}): Element => ({
  id: "test:feature:ray", kind: "class-feature", name: "Ray", source: "test",
  actions: [{ id: "fire", name: "Fire the ray", activation: "action", damage: "1d10", damageType: "force", attack }],
  ...extra,
});

function wizard(feature: Element, abilities = scores({ int: 16, dex: 14 }), levels = 5) {
  const content = testIndex([TEST_BOOK, WIZARD, feature]);
  return resolve({
    content,
    build: build({
      abilities: { method: "manual", base: abilities },
      levels: Array.from({ length: levels }, () => ({ class: "test:class:wizard", hp: "average", choices: {} })),
    }),
  });
}

describe("an action's attack roll", () => {
  it("a ranged spell attack takes the owning class's casting ability and proficiency", () => {
    const c = wizard(ray({ type: "ranged-spell" }));
    const action = c.actions.find((a) => a.id === "fire")!;
    expect(action.attack).toMatchObject({ type: "ranged-spell", ability: "int", proficient: true, attackBonus: 6 });
    expect(action.attack!.attackParts).toEqual([
      { label: "INT modifier", amount: 3 },
      { label: "Proficiency bonus", amount: 3 },
    ]);
  });

  it("an improvised ranged weapon takes Dexterity and no proficiency", () => {
    const c = wizard(ray({ type: "ranged-weapon", proficient: false }));
    const action = c.actions.find((a) => a.id === "fire")!;
    expect(action.attack).toMatchObject({ ability: "dex", proficient: false, attackBonus: 2 });
    expect(action.attack!.attackParts).toEqual([{ label: "DEX modifier", amount: 2 }]);
  });

  it("a melee weapon attack defaults to Strength, and an explicit ability overrides it", () => {
    expect(wizard(ray({ type: "melee-weapon" })).actions[0].attack).toMatchObject({ ability: "str", attackBonus: 3 });
    expect(wizard(ray({ type: "melee-weapon", ability: "dex" })).actions[0].attack).toMatchObject({ ability: "dex", attackBonus: 5 });
  });

  it("an attacks.ranged modifier raises a ranged attack of either type, and a flat bonus adds on top", () => {
    const archery: Partial<Element> = { modifiers: [{ target: "attacks.ranged", op: "add", value: 1 }] };
    const spell = wizard(ray({ type: "ranged-spell" }, archery)).actions[0].attack!;
    expect(spell.attackBonus).toBe(7);
    expect(spell.attackParts.map((p) => p.label)).toEqual(["INT modifier", "Proficiency bonus", "Ray"]);
    const thrown = wizard(ray({ type: "ranged-weapon", proficient: false, bonus: "1 + 1" }, archery)).actions[0].attack!;
    expect(thrown.attackBonus).toBe(5);
    expect(thrown.attackParts.at(-1)).toEqual({ label: "Bonus", amount: 2 });
    expect(wizard(ray({ type: "melee-spell" }, archery)).actions[0].attack!.attackBonus).toBe(6);
  });

  it("a spell attack carries the class's spell attack bonuses on top of the modifier and proficiency", () => {
    const rod: Partial<Element> = { modifiers: [{ target: "spellcasting.wizard.attack", op: "add", value: 2 }] };
    const attack = wizard(ray({ type: "ranged-spell" }, rod)).actions[0].attack!;
    expect(attack.attackBonus).toBe(8);
    expect(attack.attackParts).toHaveLength(3);
  });

  it("an attack action is never the pool owner's bare button", () => {
    const net: Element = {
      id: "test:feature:ray", kind: "class-feature", name: "Net", source: "test",
      resources: [{ id: "nets", name: "Net", max: 1, recharge: [] }],
      actions: [{ id: "throw", name: "Net", activation: "action", cost: { nets: 1 }, attack: { type: "ranged-weapon" } }],
    };
    const c = wizard(net);
    expect(c.actions.map((a) => a.id)).toEqual(["throw"]);
    expect(c.actions[0].attack).toMatchObject({ attackBonus: 5 });
    expect(c.actions[0].damage).toBeUndefined();
  });

  it("is exported on the action part", () => {
    const c = wizard(ray({ type: "ranged-spell" }));
    const feature = c.features["class-feature"].find((e) => e.id === "test:feature:ray")!;
    const parts = partsOf(feature.element, c.actions);
    expect(parts[0].attack).toEqual({
      type: "ranged-spell", ability: "int", proficient: true, bonus: 6,
      parts: [{ label: "INT modifier", amount: 3 }, { label: "Proficiency bonus", amount: 3 }],
    });
  });
});

describe("validating an action's attack", () => {
  const element = (attack: unknown, rest: Record<string, unknown> = {}) => ({
    id: "hb:item:acid", kind: "item", name: "Acid", source: "hb",
    actions: [{ id: "throw", activation: "action", attack, ...rest }],
  });

  it("rejects a type it does not know, naming the four it does", () => {
    const r = validateElement(element({ type: "spell" }));
    const d = r.diagnostics.find((x) => x.path === "actions[0].attack.type");
    expect(d?.severity).toBe("error");
    expect(d?.message).toContain("melee-weapon, ranged-weapon, melee-spell, ranged-spell");
  });

  it("accepts an attack with no damage, and an improvised one", () => {
    expect(validateElement(element({ type: "ranged-weapon", proficient: false })).diagnostics).toHaveLength(0);
  });

  it("rejects an unknown ability and warns about a bad bonus", () => {
    expect(validateElement(element({ type: "melee-spell", ability: "luck" })).diagnostics.map((d) => d.path)).toContain("actions[0].attack.ability");
    const r = validateElement(element({ type: "melee-spell", bonus: "1 +" }));
    expect(r.usable).toBe(true);
    expect(r.diagnostics.map((d) => d.path)).toContain("actions[0].attack.bonus");
  });
});
