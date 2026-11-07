/**
 * Weapon mastery picks read their rules text from the property they name, so a
 * converter writes each property's text once and not once per weapon.
 */

import type { Element, MasteryPropertyElement, WeaponMasteryElement } from "../types";
import type { ContentIndex } from "./index";

/** The tag a pick carries for its property: `mastery:sap`. */
export function masteryTag(property: Pick<MasteryPropertyElement, "key">): string {
  return `mastery:${property.key}`;
}

export function masteryProperty(content: ContentIndex, pick: Element): MasteryPropertyElement | undefined {
  if (pick.kind !== "weapon-mastery") return undefined;
  const property = content.get((pick as WeaponMasteryElement).mastery);
  return property?.kind === "mastery-property" ? (property as MasteryPropertyElement) : undefined;
}

/** What an element says for itself, or for a pick, what its mastery property says. */
export function textOf(content: ContentIndex, element: Element): string | undefined {
  if (typeof element.text === "string") return element.text;
  const property = masteryProperty(content, element);
  return property && typeof property.text === "string" ? `**${property.name}.** ${property.text}` : undefined;
}
