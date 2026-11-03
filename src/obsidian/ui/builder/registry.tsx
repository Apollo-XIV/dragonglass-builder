/**
 * The builder's sections, as data. Which sections exist for this character, what
 * each one says about itself, and what its body is — and nothing about how they
 * are arranged. The narrow layout scrolls them under a rail; the desktop sets
 * them out as tabs.
 */

import { type ReactNode } from "react";
import type { ResolvedCharacter } from "../../../core/resolver/resolved";
import type { CharacterStore } from "../../character-store";
import { SourcesPanel } from "./sections/sources";
import { ProgressionBrowser } from "./sections/browse";
import type { BuilderFeatures } from "./features";
import { BUILDER_ICONS } from "./model";
import { DetailsSection, EquipmentSection, SpellsSection } from "./sections/collections";
import { LevelsSection } from "./sections/levels";
import { OriginSection } from "./sections/origin";
import { PlannedSection } from "./sections/planned";
import { ReviewSection } from "./sections/review";

export interface SectionDef {
  id: string;
  label: string;
  icon: string;
  status?: string;
  /** Something here needs a decision. */
  attention?: boolean;
  body: ReactNode;
}

export function builderSections(
  store: CharacterStore,
  character: ResolvedCharacter,
  features: BuilderFeatures,
): SectionDef[] {
  const build = store.data.build;
  const openOrigin = character.pendingChoices.filter((c) => c.scope === "build" && !c.complete).length;
  const openLevels = character.pendingChoices.filter((c) => c.scope === "level" && !c.complete).length;
  const sections: Omit<SectionDef, "icon">[] = [];

  sections.push({
    id: "origin",
    label: "Origin",
    status: [character.species?.name, character.background?.name].filter(Boolean).join(" · "),
    attention: openOrigin > 0,
    body: <OriginSection store={store} character={character} />,
  });

  sections.push({
    id: "levels",
    label: "Levels",
    status: `Level ${character.level} of ${character.level}`,
    attention: openLevels > 0,
    body: <LevelsSection store={store} character={character} />,
  });

  if (build?.levels?.length)
    sections.push({
      id: "planned",
      label: "Planned",
      body: <PlannedSection store={store} character={character} />,
    });

  if (character.spellcasting?.classes.length)
    sections.push({
      id: "spells",
      label: "Spells",
      status: `${character.spellcasting.spells.length} known`,
      body: <SpellsSection store={store} character={character} />,
    });

  sections.push({
    id: "equipment",
    label: "Equipment",
    status: `${character.inventory.length} items`,
    body: <EquipmentSection store={store} character={character} />,
  });

  sections.push({ id: "details", label: "Details", body: <DetailsSection store={store} character={character} /> });

  sections.push({
    id: "review",
    label: "Review",
    status: openOrigin + openLevels > 0 ? `${openOrigin + openLevels} open` : "ready",
    body: <ReviewSection character={character} />,
  });

  if (features.browse)
    sections.push({ id: "browse", label: "Browse", body: <ProgressionBrowser store={store} /> });
  if (features.sources) sections.push({ id: "sources", label: "Sources", body: <SourcesPanel store={store} /> });

  return sections.map((section) => ({ ...section, icon: BUILDER_ICONS[section.id] ?? "circle" }));
}

/** Order sections by a layout's preference; any it does not name follow in their own order. */
export function orderSections(sections: SectionDef[], order: readonly string[]): SectionDef[] {
  const rest = new Map(sections.map((s) => [s.id, s]));
  const ordered: SectionDef[] = [];
  for (const id of order) {
    const section = rest.get(id);
    if (section) ordered.push(section);
    rest.delete(id);
  }
  return [...ordered, ...rest.values()];
}
