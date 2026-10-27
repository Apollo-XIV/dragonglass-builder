/**
 * The root component. One view type is registered for `.5e`, so this reads the
 * opened file's kind and renders the matching viewer: the unified sheet for
 * `sheet.5e`, the builder for `build.5e`, and a focused editor for the rest.
 */

import { useState, type ReactNode } from "react";
import type { FileKind } from "../../core/types";
import type { CharacterStore } from "../character-store";
import { StoreContext, useStoreVersion } from "./context";
import { Diagnostics, Empty, Section, Tabs } from "./components";
import { Sheet } from "./Sheet";
import { Builder } from "./Builder";
import { DetailsPanel, InventoryPanel, LogPanel, SpellsPanel } from "./sheet-panels";
import { SourcesPanel } from "./builder-sources";

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

  return (
    <StoreContext.Provider value={store}>
      <Viewer store={store} kind={kind} path={path} />
    </StoreContext.Provider>
  );
}

function Viewer({ store, kind, path }: { store: CharacterStore; kind: FileKind; path: string }): ReactNode {
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
      return character ? <Builder store={store} character={character} /> : null;
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
 * `sheet.5e` is the unified viewer. The builder lives behind a toggle rather than a
 * separate file, so levelling up and playing are one pane apart.
 */
function SheetWithBuilder({
  store,
  character,
}: {
  store: CharacterStore;
  character: NonNullable<CharacterStore["resolved"]>;
}): ReactNode {
  const outstanding = character.pendingChoices.filter((c) => !c.complete).length;
  const [mode, setMode] = useState<"sheet" | "builder">("sheet");

  return (
    <>
      <Tabs
        tabs={[
          { id: "sheet", label: "Sheet" },
          { id: "builder", label: "Builder", badge: outstanding },
        ]}
        active={mode}
        onChange={(id) => setMode(id as typeof mode)}
      />
      {mode === "sheet" ? (
        <Sheet store={store} character={character} />
      ) : (
        <Builder store={store} character={character} />
      )}
    </>
  );
}
