/**
 * The root component. One view type is registered for `.5e`, so this reads the
 * opened file's kind and renders the matching viewer: the unified sheet for
 * `sheet.5e`, the builder for `build.5e`, and a focused editor for the rest.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FileKind } from "../../core/types";
import type { CharacterStore } from "../character-store";
import { StoreContext, usePlugin, useStoreVersion } from "./context";
import { resolveNarrow } from "../settings";
import { useLayoutMode } from "./narrow/layout-mode";
import { NarrowRoot } from "./narrow/NarrowRoot";
import { useShell } from "./narrow/platform";
import { Diagnostics, Empty, Section } from "./components";
import { DesktopSheet } from "./desktop/DesktopSheet";
import { DesktopBuilder } from "./desktop/DesktopBuilder";
import { DetailsPanel, InventoryPanel, LogPanel, SpellsPanel } from "./sheet-panels";
import { SourcesPanel } from "./builder/sections/sources";

export function CharacterApp({
  store,
  kind,
  path,
}: {
  store: CharacterStore;
  kind: FileKind;
  path: string;
}): ReactNode {
  useStoreVersion(store);
  const { plugin } = usePlugin();
  const shell = useShell();
  const ref = useRef<HTMLDivElement>(null);
  // A character's own layout.5e wins over the plugin's settings, which win over
  // the defaults.
  const narrow = resolveNarrow(plugin.settings.narrow, store.data.layout);
  // The decision is made from this element's width, not the window's, so the
  // same character in a side pane gets the narrow layout (spec 1.2).
  const mode = useLayoutMode(ref, narrow);

  useEffect(() => shell.setLayout(mode), [shell, mode]);

  // The narrow layout only replaces the sheet and the builder; everything else
  // (sources, spells, state, details...) is the same `<Viewer>` either way, and
  // it has to stay the same element at this position across a mode flip — a
  // resize mid-edit (a native file dialog opening, say) must not unmount a form
  // the user is in the middle of filling in. Swapping through an intermediate
  // `NarrowViewer` component used to do exactly that, even though its own first
  // branch rendered the identical `<Viewer>`.
  const character = store.resolved;
  const showNarrowRoot = mode === "narrow" && !store.loading && !!character && (kind === "sheet" || kind === "build");

  return (
    <StoreContext.Provider value={store}>
      <div className="dg-layout" data-layout={mode} ref={ref}>
        {showNarrowRoot ? (
          <NarrowRoot
            store={store}
            character={character!}
            settings={narrow}
            mode={kind === "build" ? "builder" : "sheet"}
          />
        ) : (
          <Viewer store={store} kind={kind} path={path} />
        )}
      </div>
    </StoreContext.Provider>
  );
}

function Viewer({ store, kind, path }: { store: CharacterStore; kind: FileKind; path: string }): ReactNode {
  const { plugin } = usePlugin();
  if (store.loading) return <p className="dg-loading">Loading {path}…</p>;

  const character = store.resolved;

  if (!character && kind !== "sources" && kind !== "details")
    return (
      <div className="dg-empty-state">
        <h2>Nothing to resolve yet</h2>
        <p>
          This folder has no readable <code>build.5e</code>, or no content source is loaded. Add a source in the
          plugin settings, then pick a species and a class.
        </p>
        <Diagnostics diagnostics={store.fileDiagnostics} title="File problems" />
      </div>
    );

  switch (kind) {
    case "sheet":
      return character ? <SheetWithBuilder store={store} character={character} /> : null;
    case "build":
      return character ? <DesktopBuilder store={store} character={character} settings={plugin.settings} /> : null;
    case "spells":
      return character ? <SpellsPanel character={character} store={store} /> : null;
    case "inventory":
      return character ? <InventoryPanel character={character} store={store} /> : null;
    case "state":
      return <LogPanel store={store} />;
    case "details":
      return <DetailsPanel store={store} />;
    case "sources":
      return <SourcesPanel store={store} />;
    default:
      return (
        <Section title={`${kind} files`}>
          <Empty>
            There is no viewer for <code>{kind}</code> yet. The file is untouched.
          </Empty>
        </Section>
      );
  }
}

/**
 * `sheet.5e` is the unified viewer. The builder lives behind a toggle rather than
 * a separate file, so levelling up and playing are one pane apart. The sheet
 * reaches it through the header band's Builder button rather than a tab strip
 * above the band, which would cost the header its place at the top of the pane.
 */
function SheetWithBuilder({
  store,
  character,
}: {
  store: CharacterStore;
  character: NonNullable<CharacterStore["resolved"]>;
}): ReactNode {
  const { plugin } = usePlugin();
  const [mode, setMode] = useState<"sheet" | "builder">("sheet");

  if (mode === "sheet")
    return (
      <DesktopSheet
        store={store}
        character={character}
        settings={plugin.settings}
        onBuilder={() => setMode("builder")}
      />
    );

  return (
    <DesktopBuilder
      store={store}
      character={character}
      settings={plugin.settings}
      onSheet={() => setMode("sheet")}
    />
  );
}
