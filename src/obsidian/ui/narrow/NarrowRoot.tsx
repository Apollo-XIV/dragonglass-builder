/**
 * The narrow layout's root: the hosts every narrow component expects (sheets,
 * toasts, settings, the shell) wrapped around whichever viewer the file wants.
 *
 * It also writes the HUD into the view's title (spec 2.2), because Obsidian
 * already gives us a title bar and adding a second one would cost a line of
 * screen for nothing.
 */

import { useEffect, type ReactNode } from "react";
import type { ResolvedCharacter } from "../../../core/resolver/resolved";
import type { NarrowSettings } from "../../settings";
import type { CharacterStore } from "../../character-store";
import { NarrowSettingsContext } from "./context";
import { NarrowBuilder } from "./NarrowBuilder";
import { NarrowSheet } from "./NarrowSheet";
import { SheetHost } from "./sheet";
import { useShell } from "./platform";
import { BuilderSessionProvider, useBuilderSession } from "./session";
import { ToastHost } from "./toast";

export function NarrowRoot({
  store,
  character,
  settings,
  mode,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  settings: NarrowSettings;
  mode: "sheet" | "builder";
}): ReactNode {
  return (
    <NarrowSettingsContext.Provider value={settings}>
      <ToastHost>
        <SheetHost>
          <BuilderSessionProvider store={store} active={mode === "builder"}>
            <Hud character={character} mode={mode} />
            {mode === "sheet" ? (
              <NarrowSheet store={store} character={character} />
            ) : (
              <NarrowBuilder store={store} character={character} />
            )}
          </BuilderSessionProvider>
        </SheetHost>
      </ToastHost>
    </NarrowSettingsContext.Provider>
  );
}

/**
 * The title carries what a sticky header would otherwise have to: the name, the
 * level, and either current HP (sheet) or the class line (builder).
 */
function Hud({ character, mode }: { character: ResolvedCharacter; mode: "sheet" | "builder" }): ReactNode {
  const shell = useShell();
  const session = useBuilderSession();
  const max = character.hp.max.value + character.hp.tempMax;
  const tail =
    mode === "sheet"
      ? `${character.hp.current}/${max} HP`
      : character.classes.map((c) => `${c.name} ${c.level}`).join(" / ");
  // A leading amber dot is the whole of the unsaved-work indicator: the title
  // is the only chrome the narrow layout has (spec 2.3, 7.9).
  const mark = session?.dirty ? "● " : "";

  useEffect(() => {
    shell.setTitle(mark + [character.name, `Lv. ${character.level}`, tail].filter(Boolean).join(" · "));
  }, [shell, mark, character.name, character.level, tail]);

  return null;
}
