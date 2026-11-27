/**
 * Custom items without JSON. Each basic item type is a small definition (the fields it
 * shows and their defaults), and a draft is what a form holds: `buildItem` turns it into
 * an element in the same format as source content, `draftFromItem` turns an element back
 * into a draft so an item can be edited, and `overridesOf` keeps only what differs from a
 * base, for an item that stays an instance of the original.
 *
 * A magic bonus is written as modifiers the player never sees as stat paths. They are
 * marked in `notes` (`dg:bonus=N`), which is how they are told from hand-entered ones when
 * the item is edited, and so two edits never stack a second +1.
 */

import type { Element, ItemElement, Modifier, RechargeOn } from "./types";

export const ITEM_FORM_TYPES = ["weapon", "armor", "shield", "tool", "consumable", "magic", "gear"] as const;
export type ItemFormType = (typeof ITEM_FORM_TYPES)[number];

export interface ItemDraft {
  type: ItemFormType;
  name: string;
  weight: number;
  /** Cost in gold pieces; stored as copper. */
  valueGp: number;
  text: string;
  requiresEquipped: boolean;
  rarity: string;
  attunement: boolean;
  charges?: { max: number; on: RechargeOn | "never" };
  /** Hand-entered modifiers only; a magic bonus is generated from `bonus`. */
  modifiers: Modifier[];
  /** The +N on a weapon, armour or shield. */
  bonus: number;
  // weapon
  damage: string;
  damageType: string;
  weaponCategory: string;
  /** Comma-separated, as the content writes them: "finesse, light". */
  properties: string;
  range: string;
  // armour
  armorBase: number;
  /** A number caps the Dex bonus, null adds none, undefined adds all of it. */
  dexMax?: number | null;
  armorCategory: string;
  stealth: boolean;
  // shield
  shieldBonus: number;
}

export interface FormField {
  id: keyof ItemDraft;
  label: string;
  kind: "text" | "number" | "bool" | "select" | "dex";
  options?: readonly string[];
}

export interface ItemForm {
  label: string;
  /** The `itemType` an item built from this form gets. */
  itemType: string;
  defaults: Partial<ItemDraft>;
  /** Fields beyond the common ones. */
  fields: FormField[];
}

export const DAMAGE_TYPES = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
] as const;

const BONUS: FormField = { id: "bonus", label: "Magic bonus (+N)", kind: "number" };

export const ITEM_FORMS: Record<ItemFormType, ItemForm> = {
  weapon: {
    label: "Weapon",
    itemType: "weapon",
    defaults: { requiresEquipped: true, damage: "1d6", damageType: "slashing", weaponCategory: "simple-melee" },
    fields: [
      { id: "damage", label: "Damage dice", kind: "text" },
      { id: "damageType", label: "Damage type", kind: "select", options: DAMAGE_TYPES },
      { id: "weaponCategory", label: "Category", kind: "select", options: ["simple-melee", "simple-ranged", "martial-melee", "martial-ranged"] },
      { id: "properties", label: "Properties", kind: "text" },
      { id: "range", label: "Range", kind: "text" },
      BONUS,
    ],
  },
  armor: {
    label: "Armour",
    itemType: "armor",
    defaults: { requiresEquipped: true, armorBase: 11, armorCategory: "light" },
    fields: [
      { id: "armorBase", label: "Base AC", kind: "number" },
      { id: "dexMax", label: "Dex bonus", kind: "dex" },
      { id: "armorCategory", label: "Category", kind: "select", options: ["light", "medium", "heavy"] },
      { id: "stealth", label: "Stealth disadvantage", kind: "bool" },
      BONUS,
    ],
  },
  shield: {
    label: "Shield",
    itemType: "shield",
    defaults: { requiresEquipped: true, shieldBonus: 2 },
    fields: [{ id: "shieldBonus", label: "AC bonus", kind: "number" }, BONUS],
  },
  tool: { label: "Tool", itemType: "tool", defaults: {}, fields: [] },
  consumable: { label: "Consumable", itemType: "consumable", defaults: { requiresEquipped: false }, fields: [] },
  magic: { label: "Magic item", itemType: "wondrous", defaults: { requiresEquipped: true, rarity: "uncommon" }, fields: [] },
  gear: { label: "Gear", itemType: "gear", defaults: {}, fields: [] },
};

export const RARITIES = ["common", "uncommon", "rare", "very-rare", "legendary", "artifact"] as const;
export const CHARGE_RECHARGES: readonly (RechargeOn | "never")[] = ["dawn", "short-rest", "long-rest", "dusk", "never"];

export function blankDraft(type: ItemFormType): ItemDraft {
  return {
    type,
    name: "",
    weight: 0,
    valueGp: 0,
    text: "",
    requiresEquipped: false,
    rarity: "",
    attunement: false,
    modifiers: [],
    bonus: 0,
    damage: "",
    damageType: "",
    weaponCategory: "",
    properties: "",
    range: "",
    armorBase: 10,
    armorCategory: "",
    stealth: false,
    shieldBonus: 0,
    ...ITEM_FORMS[type].defaults,
  };
}

/** The form an existing item opens in, by its `itemType`. */
export function formTypeOf(item: { itemType?: string; rarity?: string }): ItemFormType {
  switch (item.itemType) {
    case "weapon":
      return "weapon";
    case "armor":
    case "armour":
      return "armor";
    case "shield":
      return "shield";
    case "tool":
      return "tool";
    case "consumable":
    case "potion":
    case "scroll":
      return "consumable";
    case "wondrous":
    case "wondrous-item":
    case "ring":
    case "rod":
    case "staff":
    case "wand":
      return "magic";
    default:
      return item.rarity && item.rarity !== "common" ? "magic" : "gear";
  }
}

const bonusNote = (n: number): string => `dg:bonus=${n}`;
const bonusOf = (m: Modifier): number | undefined => {
  const hit = /^dg:bonus=(-?\d+)$/.exec(m.notes ?? "");
  return hit ? Number(hit[1]) : undefined;
};

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";

/** `custom:item:<name>-<suffix>`: a stat path names an item by this, so two must never share one. */
export function customItemId(name: string, suffix: string): string {
  return `custom:item:${slug(name)}-${suffix}`;
}

/** The element a draft makes, in the format source content uses. */
export function buildItem(draft: ItemDraft, id: string): ItemElement {
  const form = ITEM_FORMS[draft.type];
  const modifiers: Modifier[] = [...draft.modifiers];
  const n = draft.bonus;
  if (draft.type === "weapon" && n) {
    modifiers.push({ target: `attacks.${id}`, op: "add", value: n, notes: bonusNote(n) });
    modifiers.push({ target: `damage.${id}`, op: "add", value: n, notes: bonusNote(n) });
  }
  if (draft.type === "armor" && n) modifiers.push({ target: "ac", op: "add", value: n, stackKey: `bonus:${id}`, notes: bonusNote(n) });
  if (draft.type === "shield")
    modifiers.push({ target: "ac", op: "add", value: draft.shieldBonus + n, stackKey: "shield", notes: bonusNote(n) });

  const item: ItemElement = {
    id,
    kind: "item",
    name: draft.name.trim() || "Custom item",
    source: "custom",
    itemType: form.itemType,
    weight: draft.weight,
    value: Math.round(draft.valueGp * 100),
    requiresEquipped: draft.requiresEquipped,
  };
  if (draft.text.trim()) item.text = draft.text.trim();
  if (draft.rarity) item.rarity = draft.rarity;
  if (draft.attunement) item.attunement = true;
  if (modifiers.length) item.modifiers = modifiers;
  if (draft.charges && draft.charges.max > 0)
    item.charges = {
      id: "charges",
      name: "Charges",
      max: draft.charges.max,
      recharge: draft.charges.on === "never" ? [] : [{ on: draft.charges.on, amount: "all" }],
    };
  if (draft.type === "weapon") {
    const properties = draft.properties.split(",").map((p) => p.trim()).filter(Boolean);
    item.weapon = {
      damage: draft.damage || "1d4",
      ...(draft.damageType ? { damageType: draft.damageType } : {}),
      ...(draft.weaponCategory ? { category: draft.weaponCategory } : {}),
      ...(properties.length ? { properties } : {}),
      ...(draft.range.trim() ? { range: draft.range.trim() } : {}),
    };
  }
  if (draft.type === "armor")
    item.armor = {
      base: draft.armorBase,
      ...(draft.dexMax !== undefined ? { dexMax: draft.dexMax } : {}),
      ...(draft.armorCategory ? { category: draft.armorCategory } : {}),
      ...(draft.stealth ? { stealthDisadvantage: true } : {}),
    };
  return item;
}

/** The draft an existing item reads as, for From Existing Item and for editing. */
export function draftFromItem(element: Partial<ItemElement> & Record<string, unknown>, type = formTypeOf(element)): ItemDraft {
  const draft = blankDraft(type);
  draft.name = element.name ?? "";
  draft.weight = element.weight ?? 0;
  draft.valueGp = (element.value ?? 0) / 100;
  draft.text = typeof element.text === "string" ? element.text : "";
  draft.requiresEquipped = element.requiresEquipped ?? ((type === "weapon" || type === "armor" || type === "shield") ? true : draft.requiresEquipped);
  draft.rarity = element.rarity ?? "";
  draft.attunement = element.attunement === true;
  const max = element.charges?.max;
  if (typeof max === "number") {
    const on = element.charges?.recharge?.[0]?.on;
    draft.charges = { max, on: on ?? "never" };
  }
  const weapon = element.weapon;
  if (weapon) {
    draft.damage = weapon.damage;
    draft.damageType = weapon.damageType ?? "";
    draft.weaponCategory = weapon.category ?? "";
    draft.properties = (weapon.properties ?? []).join(", ");
    draft.range = weapon.range ?? "";
  }
  const armor = element.armor;
  if (armor) {
    draft.armorBase = typeof armor.base === "number" ? armor.base : Number(armor.base) || 10;
    draft.dexMax = armor.dexMax;
    draft.armorCategory = armor.category ?? "";
    draft.stealth = armor.stealthDisadvantage === true;
  }
  for (const m of element.modifiers ?? []) {
    const bonus = bonusOf(m);
    if (bonus !== undefined) {
      if (m.target === "ac" && type === "shield" && typeof m.value === "number") draft.shieldBonus = m.value - bonus;
      draft.bonus = bonus;
    } else if (type === "shield" && m.target === "ac" && m.op === "add" && m.stackKey === "shield" && typeof m.value === "number")
      draft.shieldBonus = m.value;
    else draft.modifiers.push(m);
  }
  return draft;
}

/**
 * What a linked item stores: `base`, its own id, and only the fields that differ from
 * the base. A field the player cleared cannot be expressed as an override, so it stays
 * what the base says.
 */
export function overridesOf(base: Element, built: ItemElement): Partial<ItemElement> {
  const out: Record<string, unknown> = { base: base.id, id: built.id };
  for (const [key, value] of Object.entries(built))
    if (key !== "id" && key !== "source" && JSON.stringify(value) !== JSON.stringify(base[key])) out[key] = value;
  return out as Partial<ItemElement>;
}
