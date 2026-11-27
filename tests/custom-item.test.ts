import { describe, expect, it } from "vitest";
import {
  blankDraft,
  buildItem,
  customItemId,
  draftFromItem,
  formTypeOf,
  ITEM_FORMS,
  ITEM_FORM_TYPES,
  overridesOf,
} from "../src/core/custom-item";
import { resolve } from "../src/core/resolver/resolve";
import { weaponAttacks } from "../src/core/resolver/attacks";
import type { Element, InventoryEntry, ItemElement } from "../src/core/types";
import { TEST_BOOK, build, testIndex } from "./helpers";

const longsword = {
  id: "test:item:longsword",
  kind: "item",
  name: "Longsword",
  source: "test",
  itemType: "weapon",
  weight: 3,
  value: 1500,
  weapon: { damage: "1d8", damageType: "slashing", category: "martial-melee", properties: ["versatile (1d10)"] },
} as ItemElement;
const content = testIndex([TEST_BOOK, longsword]);

const run = (entry: Omit<InventoryEntry, "uid">) =>
  resolve({ content, build: build(), inventory: { kind: "inventory", schemaVersion: 1, items: [{ uid: "a", ...entry }] } });

describe("the type forms", () => {
  it("covers every basic type, each with a blank draft that builds", () => {
    expect(ITEM_FORM_TYPES).toEqual(["weapon", "armor", "shield", "tool", "consumable", "magic", "gear"]);
    for (const type of ITEM_FORM_TYPES) {
      const item = buildItem({ ...blankDraft(type), name: type }, "custom:item:x");
      expect(item.itemType).toBe(ITEM_FORMS[type].itemType);
      expect(item.name).toBe(type);
    }
  });

  it("picks the form an existing item opens in", () => {
    expect(formTypeOf({ itemType: "weapon" })).toBe("weapon");
    expect(formTypeOf({ itemType: "potion" })).toBe("consumable");
    expect(formTypeOf({ itemType: "gear", rarity: "rare" })).toBe("magic");
    expect(formTypeOf({ itemType: "pack" })).toBe("gear");
  });

  it("gives two items of one name different ids", () => {
    expect(customItemId("Sword!", "ab12")).toBe("custom:item:sword-ab12");
  });
});

describe("a magic bonus", () => {
  const plusOne = () => {
    const draft = { ...draftFromItem(longsword), name: "+1 Longsword", bonus: 1 };
    return buildItem(draft, "custom:item:plus-one");
  };
  const attack = (item: Partial<ItemElement>) => {
    const r = run({ item, equipped: true });
    return weaponAttacks(r)[0];
  };

  it("reaches the attack roll and the damage through the paths the attack code reads", () => {
    const plain = attack(overridesOf(longsword, buildItem(draftFromItem(longsword), "custom:item:plain")));
    const magic = attack(overridesOf(longsword, plusOne()));
    expect(magic.attackBonus - plain.attackBonus).toBe(1);
    expect(magic.damage).not.toBe(plain.damage);
    expect(magic.damageParts.some((p) => p.amount === 1)).toBe(true);
  });

  it("is read back as a bonus, not as a modifier to edit, and an edit does not stack a second", () => {
    const again = buildItem(draftFromItem(plusOne()), "custom:item:plus-one");
    expect(draftFromItem(plusOne()).modifiers).toEqual([]);
    expect(again.modifiers).toHaveLength(2);
  });

  it("adds to armour class on armour and folds into a shield's bonus", () => {
    const armor = buildItem({ ...blankDraft("armor"), name: "Mail +1", bonus: 1 }, "c:a");
    expect(armor.modifiers?.[0]).toMatchObject({ target: "ac", op: "add", value: 1 });
    const shield = buildItem({ ...blankDraft("shield"), name: "Shield +1", bonus: 1 }, "c:s");
    expect(shield.modifiers?.[0]).toMatchObject({ target: "ac", value: 3, stackKey: "shield" });
    const back = draftFromItem(shield);
    expect([back.shieldBonus, back.bonus]).toEqual([2, 1]);
  });
});

describe("a linked item", () => {
  it("stores the base, its id and only what changed", () => {
    const built = buildItem({ ...draftFromItem(longsword), name: "Sunblade", weight: 2 }, "custom:item:sun");
    const over = overridesOf(longsword as Element, built) as Record<string, unknown>;
    expect(over.base).toBe("test:item:longsword");
    expect(over.name).toBe("Sunblade");
    expect(over.weight).toBe(2);
    expect(over.weapon).toBeUndefined();
    expect(over.value).toBeUndefined();
  });

  it("resolves to the edited item with the base's weapon", () => {
    const built = buildItem({ ...draftFromItem(longsword), name: "Sunblade" }, "custom:item:sun");
    const r = run({ item: overridesOf(longsword as Element, built) });
    expect(r.inventory[0].name).toBe("Sunblade");
    expect((r.inventory[0].element as ItemElement).weapon?.damage).toBe("1d8");
    expect(r.diagnostics.filter((d) => d.code === "unresolved-reference")).toEqual([]);
  });

  it("round-trips through a draft", () => {
    const draft = draftFromItem(longsword);
    expect(draft.type).toBe("weapon");
    expect(draft.valueGp).toBe(15);
    expect(draft.properties).toBe("versatile (1d10)");
    const built = buildItem(draft, "x");
    expect(built.weapon).toEqual(longsword.weapon);
    expect(built.value).toBe(1500);
  });
});

describe("charges", () => {
  it("builds a pool that recharges, and reads it back", () => {
    const item = buildItem({ ...blankDraft("magic"), name: "Wand", charges: { max: 7, on: "dawn" } }, "c:w");
    expect(item.charges).toMatchObject({ max: 7, recharge: [{ on: "dawn", amount: "all" }] });
    expect(draftFromItem(item).charges).toEqual({ max: 7, on: "dawn" });
  });
});
