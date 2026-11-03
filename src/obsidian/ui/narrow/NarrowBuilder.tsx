/**
 * The builder in the narrow layout (spec 7): one vertical scroll in dependency
 * order, somewhere between a wizard and a freeform editor. A new player scrolls
 * down and picks as they go; an experienced one jumps with the rail.
 *
 * This file is the arrangement and nothing else. The sections, the choices in
 * them and the save flow are the builder's own (`ui/builder/`), shared with the
 * desktop layout, and nothing in them knows a rule either: every choice on
 * screen is one the content declared, and every selection goes back through the
 * resolver.
 */

import { useMemo, type ReactNode } from "react";
import type { ResolvedCharacter } from "../../../core/resolver/resolved";
import type { CharacterStore } from "../../character-store";
import { DraftBanner } from "../builder/sections/review";
import { builderSections, orderSections } from "../builder/registry";
import { useBuilderFeatures } from "../builder/features";
import { useNarrowSettings } from "./context";
import { NarrowNavBridge } from "./nav-bridge";
import { Rail } from "./rail";
import { NarrowScroller, type SectionSpec } from "./scroller";

export function NarrowBuilder({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const settings = useNarrowSettings();
  const features = useBuilderFeatures();

  const sections = useMemo<SectionSpec[]>(
    () =>
      orderSections(builderSections(store, character, features), settings.builderSections).map((section) => ({
        ...section,
        body: <NarrowNavBridge>{section.body}</NarrowNavBridge>,
      })),
    [store, character, settings.builderSections, features],
  );

  return (
    <NarrowScroller sections={sections} banner={<DraftBanner />}>
      <Rail sections={sections} />
    </NarrowScroller>
  );
}
