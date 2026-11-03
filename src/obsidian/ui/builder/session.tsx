/**
 * How the builder treats what you do to a character (spec 7.9).
 *
 * Two modes, and which one you are in depends on whether the character exists
 * yet. Making one for the first time saves as you go: there is nothing to
 * protect, and losing a half-made character to a closed pane would be worse
 * than any stray write. Editing one that already exists writes nothing until
 * you say so, because people open the builder to read what a feat does as often
 * as to change anything, and that should never cost them their character.
 *
 * Work in progress is kept as a draft either way, so leaving mid-rebuild and
 * coming back tomorrow works without the character on disk ever having been a
 * half-rebuilt mess.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { diffBuilds, type BuildDiff } from "../../../core/resolver/diff";
import type { BuildFile } from "../../../core/types";
import type { CharacterStore } from "../../character-store";
import { baseHasMoved, type Draft } from "./drafts";
import { useShell } from "../narrow/platform";

export interface BuilderSession {
  /** Live saves: this character is being made for the first time. */
  creating: boolean;
  /** Unsaved work exists. */
  dirty: boolean;
  diff: BuildDiff;
  /** A draft from a previous visit, not yet resumed or discarded. */
  pendingDraft?: Draft;
  /** The character changed under an open edit, or under the pending draft. */
  baseMoved: boolean;
  resumeDraft: () => void;
  discardDraft: () => void;
  /** Write the working copy. */
  save: () => void;
  /** Throw the working copy away. */
  discard: () => void;
}

const SessionContext = createContext<BuilderSession | undefined>(undefined);

export function useBuilderSession(): BuilderSession | undefined {
  return useContext(SessionContext);
}

export function BuilderSessionProvider({
  store,
  active,
  children,
}: {
  store: CharacterStore;
  /** False for the sheet, which has no session of its own. */
  active: boolean;
  children: ReactNode;
}): ReactNode {
  const session = useSession(store, active);
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** A character with no levels and no species has not been made yet. */
function isNew(build: BuildFile | undefined): boolean {
  return !build || ((build.levels?.length ?? 0) === 0 && !build.species);
}

function useSession(store: CharacterStore, active: boolean): BuilderSession | undefined {
  const shell = useShell();
  const folder = store.paths.folder;
  const build = store.data.build;

  // Decided once, when the builder opens: a character that gains its first
  // level mid-session should not have the rules change under it.
  const [creating] = useState(() => isNew(build));
  const [pendingDraft, setPendingDraft] = useState<Draft | undefined>(() =>
    creating ? undefined : shell.drafts.get(folder),
  );
  const base = useRef<BuildFile | undefined>(build);

  useEffect(() => {
    if (!active || creating) return;
    store.beginEdit(["build", "spells", "inventory"]);
    base.current = store.editBase?.build ?? build;

    return () => {
      // Leaving the builder puts the character back to its saved state, so a
      // sheet in another pane shows what is actually saved (spec 7.9). Nothing
      // is lost: the draft below already holds the work, and reopening the
      // builder offers it back.
      if (store.editing) store.discardEdit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, creating, store]);

  const working = store.data.build;
  const diff = useMemo(
    () =>
      base.current && working
        ? diffBuilds(base.current, working, (id) => store.index?.get(id)?.name ?? id)
        : { lines: [], count: 0 },
    [working, store.index, store.version],
  );

  const dirty = !creating && diff.count > 0;

  // The draft is written as you work, so closing the pane loses nothing.
  useEffect(() => {
    if (!active || creating || !dirty || !working || !base.current) return;
    shell.drafts.set(folder, { build: working, base: base.current, saved: new Date().toISOString() });
  }, [active, creating, dirty, working, folder, shell]);

  if (!active) return undefined;

  return {
    creating,
    dirty,
    diff,
    pendingDraft: pendingDraft && working && JSON.stringify(pendingDraft.build) !== JSON.stringify(working)
      ? pendingDraft
      : undefined,
    baseMoved: store.editBaseMoved || (pendingDraft ? baseHasMoved(pendingDraft, working) : false),
    resumeDraft: () => {
      if (!pendingDraft) return;
      store.restoreEdit({ build: pendingDraft.build });
      setPendingDraft(undefined);
    },
    discardDraft: () => {
      shell.drafts.clear(folder);
      setPendingDraft(undefined);
    },
    save: () => {
      store.commitEdit();
      shell.drafts.clear(folder);
      base.current = store.data.build;
      // Editing continues after a save, so the next change starts a new diff.
      store.beginEdit(["build", "spells", "inventory"]);
    },
    discard: () => {
      store.discardEdit();
      shell.drafts.clear(folder);
      base.current = store.data.build;
      store.beginEdit(["build", "spells", "inventory"]);
    },
  };
}
