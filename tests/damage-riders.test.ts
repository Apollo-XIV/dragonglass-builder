/**
 * Dice riders on hits (schema-gaps spec, item 2): a `damage.*` modifier may carry dice,
 * which the weapon row appends to the damage string rather than folding into a number.
 */
import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import { weaponAttacks } from "../src/core/resolver/attacks";
import { resolve } from "../src/core/resolver/resolve";
import type { Element, InventoryFile, Modifier, StateFile } from "../src/core/types";
import { build, scores, testIndex, TEST_BOOK, withUids } from "./helpers";

const LONGSWORD: Element = {
  id: "test:item:longsword", kind: "item", name: "Longsword", source: "test", tags: ["weapon", "martial-weapon", "melee-weapon"],
  weapon: { damage: "1d8", damageType: "slashing", category: "martial-melee" },
} as Element;

const feature = (modifiers: Modifier[], extra: Partial<Element> = {}): Element => ({
  id: "test:feature:mark", kind: "class-feature", name: "Hunter's Mark", source: "test", modifiers, ...extra,
});

const FIGHTER: Element = {
  id: "test:class:fighter", kind: "class", name: "Fighter", source: "test", key: "fighter", hitDie: "d10",
  levels: { "1": { grants: ["test:feature:mark"], modifiers: [{ target: "proficiencies.weapon", op: "include", value: ["martial"] }] } },
} as Element;

function sword(mark: Element, state?: StateFile) {
  const content = testIndex([TEST_BOOK, FIGHTER, LONGSWORD, mark]);
  const inventory: InventoryFile = { kind: "inventory", schemaVersion: 1, items: withUids([{ id: "test:item:longsword", equipped: true }]), currency: {} };
  const character = resolve({
    content,
    build: build({ abilities: { method: "manual", base: scores({ str: 16 }) }, levels: [{ class: "test:class:fighter", hp: "average", choices: {} }] }),
    inventory,
    state,
  });
  return { character, attack: weaponAttacks(character)[0] };
}

describe("validating a dice rider", () => {
  const el = (mod: Modifier) => ({ id: "hb:feat:x", kind: "feat", name: "X", source: "hb", modifiers: [mod] });

  it("accepts dice as an add to damage, conditional or not", () => {
    expect(validateElement(el({ target: "damage.melee", op: "add", value: "1d6" })).diagnostics).toHaveLength(0);
    expect(validateElement(el({ target: "damage.all", op: "add", value: "1d6", when: { text: "against the marked target" } })).diagnostics).toHaveLength(0);
    expect(validateElement(el({ target: "damage.all", op: "add", value: "1d6 + @abilities.wis.mod" })).diagnostics).toHaveLength(0);
  });

  it("rejects dice anywhere else, and says why", () => {
    const ac = validateElement(el({ target: "ac", op: "add", value: "1d6" })).diagnostics;
    expect(ac.map((d) => d.code)).toContain("expression-error");
    expect(ac[0].message).toContain('"damage.*"');
    const multiply = validateElement(el({ target: "damage.melee", op: "multiply", value: "1d6" })).diagnostics;
    expect(multiply.map((d) => d.code)).toContain("expression-error");
    expect(validateElement(el({ target: "damage.melee", op: "add", value: "1d6 fire" })).diagnostics.map((d) => d.code)).toContain("expression-error");
  });
});

describe("a dice rider on a weapon attack", () => {
  it("is appended to the damage string as its own part", () => {
    const { attack } = sword(feature([{ target: "damage.melee", op: "add", value: "1d6" }]));
    expect(attack.damage).toBe("1d8 + 3 + 1d6");
    expect(attack.damageParts).toEqual([
      { label: "STR modifier", amount: 3 },
      { label: "Hunter's Mark", amount: 0, dice: "1d6" },
    ]);
  });

  it("sits beside a numeric bonus on the same path, in source order", () => {
    const { attack } = sword(feature([
      { target: "damage.all", op: "add", value: 2 },
      { target: "damage.melee", op: "add", value: "1d6" },
    ]));
    expect(attack.damage).toBe("1d8 + 5 + 1d6");
    expect(attack.damageParts).toHaveLength(3);
  });

  it("substitutes expressions inside the dice", () => {
    const { attack } = sword(feature([{ target: "damage.melee", op: "add", value: "1d4 + @abilities.str.mod" }]));
    expect(attack.damage).toBe("1d8 + 3 + 1d4 + 3");
  });

  it("with a condition, leaves the damage alone and shows up as a note", () => {
    const { attack } = sword(feature([{ target: "damage.all", op: "add", value: "1d6", when: { text: "against the marked target" } }]));
    expect(attack.damage).toBe("1d8 + 3");
    expect(attack.damageParts).toHaveLength(1);
    expect(attack.damageNotes).toEqual([{ kind: "conditional", text: "1d6 against the marked target", source: "Hunter's Mark" }]);
  });

  it("a numeric conditional bonus is a note too, signed", () => {
    const { attack } = sword(feature([{ target: "damage.all", op: "add", value: 2, when: { text: "against undead" } }]));
    expect(attack.damageNotes[0].text).toBe("+2 against undead");
  });

  it("inside an effect, applies only while the effect is on", () => {
    const mark = feature([], { effects: [{ id: "marked", name: "Hunter's Mark", modifiers: [{ target: "damage.all", op: "add", value: "1d6" }] }] });
    expect(sword(mark).attack.damage).toBe("1d8 + 3");
    const on: StateFile = { kind: "state", schemaVersion: 1, events: [{ t: "2026-01-01T00:00:00.000Z", type: "effect.start", effect: "marked" }] } as unknown as StateFile;
    expect(sword(mark, on).attack.damage).toBe("1d8 + 3 + 1d6");
  });
});
