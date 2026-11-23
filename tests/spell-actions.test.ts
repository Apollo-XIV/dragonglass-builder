/**
 * What casting a spell rolls: a spell's own `actions` part, resolved for the class it is
 * cast as, so the spells panel can show the save DC, the attack bonus and the healing
 * without the spell being one of the character's features.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import type { ActionDef, Element, SpellEntry } from "../src/core/types";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const spell = (n: string, spellLevel: number, actions?: ActionDef[]): Element =>
  ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel, tags: ["wizard-spell"], ...(actions ? { actions } : {}) }) as Element;

const wizard: Element = {
  id: "test:class:wizard", kind: "class", name: "Wizardish", source: "test", key: "wizard", hitDie: "d6",
  spellcasting: { ability: "int", progression: "full", type: "spellbook", list: "wizard-spell", prepared: 4, spellbook: 6 },
} as Element;

const cast = (id: string, extra: Partial<ActionDef>): ActionDef => ({ id: "cast", name: id, activation: "action", ...extra });

const elements = [
  spell("fire-bolt", 0, [cast("Fire Bolt", { attack: { type: "ranged-spell" }, damage: "1d10", damageType: "fire" })]),
  spell("fireball", 3, [cast("Fireball", { save: { ability: "dex" }, damage: "8d6", damageType: "fire" })]),
  spell("cure-wounds", 1, [cast("Cure Wounds", { heal: "1d8 + @spellcasting.mod" })]),
  spell("alarm", 1),
];

function character(picks: string[], int = 16) {
  const spells: SpellEntry[] = picks.map((n) => ({ id: `test:spell:${n}`, class: "test:class:wizard", prepared: true }));
  return resolve({
    content: testIndex([TEST_BOOK, wizard, ...elements]),
    build: build({ abilities: { method: "manual", base: scores({ int }) }, levels: [{ class: "test:class:wizard", hp: "average", choices: {} }] }),
    spells: { kind: "spells", schemaVersion: 1, spells },
  });
}
const actionsOf = (c: ReturnType<typeof character>, n: string) => c.spellcasting!.spells.find((s) => s.id === `test:spell:${n}`)!.actions;

describe("a picked spell's actions", () => {
  it("makes a spell attack at the class's attack bonus", () => {
    const [action] = actionsOf(character(["fire-bolt"]), "fire-bolt")!;
    // Int 16 is +3 and a level 1 character's proficiency is +2.
    expect(action!.attack).toMatchObject({ type: "ranged-spell", ability: "int", attackBonus: 5 });
    expect(action!.attack!.attackParts.map((p) => p.amount)).toEqual([3, 2]);
    expect(action).toMatchObject({ damage: "1d10", damageResolved: "1d10", damageType: "fire" });
  });

  it("saves at the class's spell save DC", () => {
    const [action] = actionsOf(character(["fireball"]), "fireball")!;
    expect(action!.save).toEqual({ ability: "dex", dc: 13 });
  });

  it("follows the casting ability when it changes", () => {
    expect(actionsOf(character(["fireball"], 10), "fireball")![0]!.save!.dc).toBe(10);
  });

  it("reads @spellcasting.mod as the casting ability's modifier", () => {
    const [action] = actionsOf(character(["cure-wounds"]), "cure-wounds")!;
    expect(action).toMatchObject({ heal: "1d8 + @spellcasting.mod", healResolved: "1d8 + 3" });
  });

  it("has no actions for a spell with nothing to roll", () => {
    expect(actionsOf(character(["alarm"]), "alarm")).toBeUndefined();
  });

  it("stays out of the character's own action list", () => {
    expect(character(["fire-bolt", "fireball", "cure-wounds"]).actions).toEqual([]);
  });
});
