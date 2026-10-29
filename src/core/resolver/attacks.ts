/**
 * Weapon attacks, derived from what the character is carrying (spec 8.2).
 *
 * The resolver resolves rules; nothing in the content declares "the longsword in
 * your hand is a +7 attack for 1d8+4". That reading is assembled here, once, so
 * the sheet and any exporter agree on it instead of each doing its own arithmetic.
 */

import type { Ability } from "../types";
import type { ResolvedCharacter, ResolvedItem } from "./resolved";

export interface AttackPart {
  label: string;
  amount: number;
}

export interface WeaponAttack {
  key: string;
  name: string;
  item: ResolvedItem;
  /** The ability the attack and damage use, after finesse and ranged rules. */
  ability: Ability;
  proficient: boolean;
  attackBonus: number;
  attackParts: AttackPart[];
  /** "1d8 + 3". */
  damage: string;
  damageParts: AttackPart[];
  /** The dice before the modifier: "1d8". */
  damageDice: string;
  damageType?: string;
  range?: string;
  properties: string[];
  /** Melee unless the weapon's category or tags say otherwise. */
  ranged: boolean;
}

interface WeaponShape {
  damage: string;
  damageType?: string;
  properties?: string[];
  category?: string;
  range?: string;
}

/** Every equipped weapon, in inventory order. */
export function weaponAttacks(character: ResolvedCharacter): WeaponAttack[] {
  const attacks: WeaponAttack[] = [];
  for (const item of character.inventory) {
    const weapon = (item.element as { weapon?: WeaponShape }).weapon;
    if (!weapon || !item.equipped) continue;
    attacks.push(attackFor(character, item, weapon));
  }
  return attacks;
}

function attackFor(character: ResolvedCharacter, item: ResolvedItem, weapon: WeaponShape): WeaponAttack {
  const properties = (weapon.properties ?? []).map((p) => p.toLowerCase());
  const tags = item.element.tags ?? [];
  const ranged = isRanged(weapon, tags);
  const finesse = properties.some((p) => p.startsWith("finesse"));
  const ability = chooseAbility(character, { ranged, finesse });
  const mod = character.abilities[ability].mod;
  const proficient = isProficient(character, item, weapon, tags);
  const bonus = character.proficiencyBonus.value;

  const attackParts: AttackPart[] = [{ label: `${ability.toUpperCase()} modifier`, amount: mod }];
  if (proficient) attackParts.push({ label: "Proficiency bonus", amount: bonus });
  // Content can add to attacks broadly ("attacks.all") or narrowly
  // ("attacks.ranged", "attacks.srd:item:longbow"); all of them apply here.
  for (const part of statBonuses(character, ["attacks.all", `attacks.${ranged ? "ranged" : "melee"}`, `attacks.${item.element.id}`]))
    attackParts.push(part);

  const damageParts: AttackPart[] = [{ label: `${ability.toUpperCase()} modifier`, amount: mod }];
  for (const part of statBonuses(character, ["damage.all", `damage.${ranged ? "ranged" : "melee"}`, `damage.${item.element.id}`]))
    damageParts.push(part);

  const attackBonus = attackParts.reduce((sum, p) => sum + p.amount, 0);
  const damageBonus = damageParts.reduce((sum, p) => sum + p.amount, 0);

  return {
    key: `${item.element.id}:${item.index}`,
    name: item.name,
    item,
    ability,
    proficient,
    attackBonus,
    attackParts,
    damageDice: weapon.damage,
    damage: damageBonus === 0 ? weapon.damage : `${weapon.damage} ${damageBonus > 0 ? "+" : "-"} ${Math.abs(damageBonus)}`,
    damageParts,
    damageType: weapon.damageType,
    range: weapon.range,
    properties,
    ranged,
  };
}

function isRanged(weapon: WeaponShape, tags: string[]): boolean {
  if (weapon.category?.includes("ranged")) return true;
  return tags.some((tag) => tag === "ranged-weapon" || tag === "ranged");
}

/** Finesse takes the better of Strength and Dexterity; a bow always takes Dexterity. */
function chooseAbility(
  character: ResolvedCharacter,
  { ranged, finesse }: { ranged: boolean; finesse: boolean },
): Ability {
  if (ranged) return "dex";
  if (!finesse) return "str";
  return character.abilities.dex.mod > character.abilities.str.mod ? "dex" : "str";
}

/**
 * Weapon proficiency is written loosely in content — "simple weapons", "martial
 * weapons", or a single weapon by name — so the match is deliberately generous:
 * the item's id, its tags, its category, and the first word of its category
 * ("martial-melee" satisfies "martial").
 */
function isProficient(
  character: ResolvedCharacter,
  item: ResolvedItem,
  weapon: WeaponShape,
  tags: string[],
): boolean {
  const held = new Set<string>();
  // Both spellings appear in the wild; neither is worth a migration.
  for (const path of ["proficiencies.weapon", "proficiencies.weapons"])
    for (const value of character.sets[path]?.values ?? []) held.add(value.toLowerCase());
  if (held.size === 0) return false;

  const candidates = new Set<string>([item.element.id.toLowerCase(), item.name.toLowerCase()]);
  for (const tag of tags) {
    candidates.add(tag.toLowerCase());
    candidates.add(tag.toLowerCase().replace(/-weapons?$/, ""));
  }
  if (weapon.category) {
    candidates.add(weapon.category.toLowerCase());
    candidates.add(weapon.category.toLowerCase().split("-")[0]);
  }
  for (const candidate of candidates) if (held.has(candidate)) return true;
  return false;
}

function statBonuses(character: ResolvedCharacter, paths: string[]): AttackPart[] {
  const parts: AttackPart[] = [];
  for (const path of paths) {
    const stat = character.stats[path];
    if (!stat || stat.value === 0) continue;
    // The stat's own breakdown names the feature responsible, which is more use
    // in a roll sheet than the path would be.
    const label = stat.breakdown.find((row) => row.applied && row.op !== "base")?.sourceName ?? "Bonus";
    parts.push({ label, amount: stat.value });
  }
  return parts;
}
