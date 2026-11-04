/**
 * The builder in the desktop layout: tabs for the sections, a sidebar for
 * reading, and the save controls pinned in the header.
 *
 * The sections themselves are the narrow builder's (`ui/builder/`), as are the
 * pickers, the change confirmation and the save flow. What differs is the
 * arrangement, and the gesture that reads a thing: hover and a sidebar here, hold
 * and a sheet there. Levels and Planned share a tab, since one is the other's
 * look-ahead and there is room to see both.
 */

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { ResolvedCharacter } from "../../../core/resolver/resolved";
import type { CharacterStore } from "../../character-store";
import { resolveNarrow, type DragonglassSettings } from "../../settings";
import { Diagnostics, Icon } from "../components";
import {
  FeaturesContext,
  useBuilderFeatures,
  type BuilderFeatures,
} from "../builder/features";
import { BuilderNavProvider, type BuilderNav } from "../builder/nav";
import {
  builderSections,
  orderSections,
  type SectionDef,
} from "../builder/registry";
import { DraftBanner } from "../builder/sections/review";
import { PickerSlotProvider } from "../builder/picker";
import { BuilderSessionProvider, useBuilderSession } from "../builder/session";
import { NarrowSettingsContext } from "../narrow/context";
import { useShell } from "../narrow/platform";
import { SheetHost } from "../narrow/sheet";
import { ToastHost } from "../narrow/toast";
import { DetailPane, DesktopDetailProvider } from "./builder-detail";
import { TabBar, type TabSpec } from "./tabs";

/** What the desktop turns on. Every key is named, so a new flag cannot be forgotten here. */
export const DESKTOP_FEATURES: BuilderFeatures = {
  levelHp: true,
  xpHint: true,
  enforceToggle: true,
  inlinePicker: true,
  pickerSearch: true,
  rowEditing: true,
  customItem: true,
  abilityInputs: true,
  diagnostics: true,
  browse: true,
  sources: true,
  foldOnDrag: true,
  plannedOpen: true,
};

/** Sections that share a tab: the first names it, the rest follow it down the page. None do
 * today: Levels and Planned were one list long before they were one section. */
const TAB_OF: Record<string, string> = {};

export function DesktopBuilder({
  store,
  character,
  settings,
  onSheet,
  initialTab = "origin",
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  settings: DragonglassSettings;
  /** The tab to open on. */
  initialTab?: string;
  /** Back to the sheet. Absent when the builder is its own file. */
  onSheet?: () => void;
}): ReactNode {
  const narrow = resolveNarrow(settings.narrow, store.data.layout);

  return (
    <NarrowSettingsContext.Provider value={narrow}>
      {/* Above the sheet host, which renders pickers and forms in its own subtree: they
          have to read in the pane and see the flags too. */}
      <FeaturesContext.Provider value={DESKTOP_FEATURES}>
        <DesktopDetailProvider>
          <ToastHost>
            <SheetHost>
              <BuilderSessionProvider store={store} active>
                <PickerSlotProvider>
                  <div className="dg-desk dg-b">
                    <BuilderBody
                      store={store}
                      character={character}
                      order={narrow.builderSections}
                      onSheet={onSheet}
                      initialTab={initialTab}
                    />
                  </div>
                </PickerSlotProvider>
              </BuilderSessionProvider>
            </SheetHost>
          </ToastHost>
        </DesktopDetailProvider>
      </FeaturesContext.Provider>
    </NarrowSettingsContext.Provider>
  );
}

function BuilderBody({
  store,
  character,
  order,
  onSheet,
  initialTab,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  order: readonly string[];
  onSheet?: () => void;
  initialTab: string;
}): ReactNode {
  const shell = useShell();
  const features = useBuilderFeatures();
  const leave = onSheet ?? shell.openSheet;
  const [wanted, setWanted] = useState(initialTab);
  const stops = useRef(new Map<string, HTMLElement>());

  const sections = useMemo(
    () => orderSections(builderSections(store, character, features), order),
    [store, character, order, features],
  );
  const tabs = useMemo(() => tabsFor(sections), [sections]);
  const active = tabs.some((t) => t.id === wanted)
    ? wanted
    : (tabs[0]?.id ?? "origin");

  // Review jumps to a card by id. Across tabs that is two steps: show the tab the
  // card is on, then scroll once it exists.
  const nav = useMemo<BuilderNav>(
    () => ({
      register: (id, el) => {
        if (el) stops.current.set(id, el);
        else stops.current.delete(id);
      },
      goTo: (id) => {
        setWanted(id.startsWith("level-") ? "levels" : (TAB_OF[id] ?? id));
        requestAnimationFrame(() =>
          stops.current
            .get(id)
            ?.scrollIntoView({ block: "center", behavior: "smooth" }),
        );
      },
    }),
    [],
  );

  return (
    <BuilderNavProvider nav={nav}>
      <BuilderHeader character={character} onSheet={leave} />
      <DraftBanner />
      <div className="dg-b-main">
        <section className="dg-d-tabs-panel">
          <TabBar tabs={tabs} active={active} onPick={setWanted} />
          <div className="dg-b-body" role="tabpanel">
            {sections
              .filter(
                (section) => (TAB_OF[section.id] ?? section.id) === active,
              )
              .map((section) => (
                <div
                  className="dg-b-section"
                  key={section.id}
                  data-section={section.id}
                >
                  {TAB_OF[section.id] ? (
                    <h3 className="dg-b-subhead">{section.label}</h3>
                  ) : null}
                  {section.body}
                </div>
              ))}
          </div>
        </section>
        <DetailPane />
      </div>
      {features.diagnostics ? (
        <Diagnostics
          diagnostics={[...store.fileDiagnostics, ...character.diagnostics]}
          title="Notes"
        />
      ) : null}
    </BuilderNavProvider>
  );
}

function tabsFor(sections: SectionDef[]): TabSpec[] {
  return sections
    .filter((section) => !TAB_OF[section.id])
    .map((section) => ({
      id: section.id,
      label: section.label,
      icon: section.icon,
      attention: section.attention,
      body: () => null,
    }));
}

function BuilderHeader({
  character,
  onSheet,
}: {
  character: ResolvedCharacter;
  onSheet: () => void;
}): ReactNode {
  const session = useBuilderSession();
  const classLine = character.classes
    .map((c) => `${c.name} ${c.level}`)
    .join(" / ");
  const open = character.pendingChoices.filter((c) => !c.complete).length;

  const finish = useCallback(() => {
    session?.save();
    onSheet();
  }, [session, onSheet]);

  return (
    <header className="dg-b-header">
      <div className="dg-d-identity">
        <h2 className="dg-d-name">
          {session?.dirty ? (
            <span className="dg-b-dirty" title="Unsaved changes">
              ●
            </span>
          ) : null}
          {character.name}
        </h2>
        <p className="dg-d-subline">
          {[`Level ${character.level}`, classLine].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="dg-d-header-actions">
        {session?.dirty ? (
          <>
            <button
              type="button"
              className="dg-d-button"
              onClick={session.discard}
            >
              Discard
            </button>
            <button
              type="button"
              className="dg-d-button is-primary"
              onClick={finish}
            >
              <Icon name="save" />
              Save changes · {session.diff.count}
            </button>
          </>
        ) : null}
        <button type="button" className="dg-d-button" onClick={onSheet}>
          <Icon name="scroll-text" />
          {session?.dirty ? "Sheet" : open ? `Sheet · ${open} open` : "Sheet"}
        </button>
      </div>
    </header>
  );
}
