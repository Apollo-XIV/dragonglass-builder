/**
 * The desktop character sheet (docs/specs/desktop-sheet-spec.md).
 *
 * A header band and two columns. The left column carries the abilities and the
 * standing lists — skills, senses, proficiencies — and the right the stats, the
 * hit points and the tabs panel, which takes the rest of the height. The columns
 * are independent stacks, so a short column's boxes fill the space instead of
 * leaving a gap beside the other column's taller content.
 *
 * It is a sibling of the narrow layout, not a separate design: the hosts below
 * are the narrow layout's own, so the sheet bodies, toasts, roll boxes and
 * resource menus a phone uses are the same objects here. What changes between
 * the two is arrangement and the gesture that opens things, never behaviour.
 */

import { type ReactNode } from "react";
import type { ResolvedCharacter } from "../../../core/resolver/resolved";
import type { CharacterStore } from "../../character-store";
import { resolveNarrow, resolvePins, type DragonglassSettings } from "../../settings";
import { Diagnostics } from "../components";
import { NarrowSettingsContext } from "../narrow/context";
import { SheetHost } from "../narrow/sheet";
import { ToastHost } from "../narrow/toast";
import { HpPanel } from "../hp-panel";
import { ProficienciesBox, SensesBox, SkillsBox } from "./boxes";
import { DeskHeader } from "./header";
import { IdentityColumn } from "./identity";
import { StatCluster } from "./stats";
import { TabsPanel } from "./tabs";

export function DesktopSheet({
  store,
  character,
  settings,
  onBuilder,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  settings: DragonglassSettings;
  /** The builder is a pane away, not a mode of the sheet; this is the way in. */
  onBuilder?: () => void;
}): ReactNode {
  const layout = store.data.layout;
  // The hold-and-sheet machinery the reused components expect. On desktop the
  // gestures differ, but the settings behind them (hold time, info buttons) are
  // resolved the same way: the character's layout.5e, then the plugin's.
  const narrow = resolveNarrow(settings.narrow, layout);
  const pins = resolvePins(settings, layout);

  return (
    <NarrowSettingsContext.Provider value={narrow}>
      <ToastHost>
        <SheetHost>
          <div className="dg-desk">
            <DeskHeader store={store} character={character} onBuilder={onBuilder} />

            <div className="dg-desk-grid">
              <div className="dg-desk-left">
                <div className="dg-desk-identity">
                  <IdentityColumn character={character} />
                </div>
                <div className="dg-desk-skills">
                  <SkillsBox character={character} />
                </div>
                <div className="dg-desk-stack">
                  <SensesBox character={character} />
                  <ProficienciesBox character={character} store={store} />
                </div>
              </div>

              <div className="dg-desk-right">
                <div className="dg-desk-vitals">
                  <StatCluster store={store} character={character} pins={pins} />
                  <HpPanel store={store} character={character} />
                </div>
                <div className="dg-desk-tabs">
                  <TabsPanel store={store} character={character} />
                </div>
              </div>
            </div>

            <Diagnostics diagnostics={[...store.fileDiagnostics, ...character.diagnostics]} title="Notes" />
          </div>
        </SheetHost>
      </ToastHost>
    </NarrowSettingsContext.Provider>
  );
}
