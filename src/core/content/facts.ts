import type { Element, ItemElement, SpellElement } from "../types";

/** One labelled line of an element's reference data: a spell's range, say. */
export interface Fact {
  label: string;
  value: string;
}

const ordinal = (n: number): string => {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Cost is stored in copper pieces; show it in the largest coin that divides it evenly. */
function costOf(copper: number): string {
  if (copper % 100 === 0) return `${copper / 100} gp`;
  if (copper % 10 === 0) return `${copper / 10} sp`;
  return `${copper} cp`;
}

function itemFacts(item: ItemElement): Fact[] {
  const facts: Fact[] = [];
  if (item.weapon) {
    const { damage, damageType, category, properties, range } = item.weapon;
    facts.push({ label: "Damage", value: damageType ? `${damage} ${damageType}` : damage });
    if (category) facts.push({ label: "Category", value: capitalise(category.replace(/-/g, " ")) });
    if (properties?.length) facts.push({ label: "Properties", value: properties.map(capitalise).join(", ") });
    if (range) facts.push({ label: "Range", value: range });
  }
  if (item.armor) {
    const { base, dexMax, category, stealthDisadvantage } = item.armor;
    if (typeof base === "number") {
      const dex = dexMax === undefined ? " + Dex" : dexMax === null ? "" : dexMax === 0 ? "" : ` + Dex (max ${dexMax})`;
      facts.push({ label: "Armor class", value: `${base}${dex}` });
    }
    if (category) facts.push({ label: "Category", value: capitalise(category) });
    if (stealthDisadvantage) facts.push({ label: "Stealth", value: "Disadvantage" });
  }
  if (item.rarity) facts.push({ label: "Rarity", value: capitalise(item.rarity.replace(/-/g, " ")) });
  if (item.attunement) facts.push({ label: "Attunement", value: "Required" });
  if (typeof item.value === "number") facts.push({ label: "Cost", value: costOf(item.value) });
  if (typeof item.weight === "number") facts.push({ label: "Weight", value: `${item.weight} lb` });
  return facts;
}

/**
 * The reference data an element carries beside its text: a spell's range and
 * components, an item's damage, cost and weight. Other kinds return an empty list,
 * so callers can pass any element.
 */
export function factsOf(element: Element | undefined): Fact[] {
  if (!element) return [];
  if (element.kind === "item") return itemFacts(element as ItemElement);
  if (element.kind !== "spell") return [];
  const spell = element as SpellElement;
  const facts: Fact[] = [];
  const level = typeof spell.spellLevel === "number" ? spell.spellLevel : undefined;
  if (level !== undefined) {
    const school = spell.school ? capitalise(spell.school) : undefined;
    facts.push({
      label: "Level",
      value: level === 0 ? (school ? `${school} cantrip` : "Cantrip") : `${ordinal(level)} level${school ? ` ${school.toLowerCase()}` : ""}`,
    });
  }
  const castingTime = spell.castingTime
    ? spell.ritual && !/ritual/i.test(spell.castingTime)
      ? `${spell.castingTime} (ritual)`
      : spell.castingTime
    : spell.ritual
      ? "Ritual"
      : undefined;
  if (castingTime) facts.push({ label: "Casting time", value: castingTime });
  if (spell.range) facts.push({ label: "Range", value: spell.range });
  if (spell.components) facts.push({ label: "Components", value: spell.components });
  if (spell.duration) {
    const concentrating = spell.concentration && !/concentration/i.test(spell.duration);
    facts.push({ label: "Duration", value: concentrating ? `Concentration, ${spell.duration}` : spell.duration });
  }
  if (spell.higherLevels) facts.push({ label: "At higher levels", value: spell.higherLevels });
  return facts;
}
