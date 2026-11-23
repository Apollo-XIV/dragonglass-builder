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
import { diffBuilds, diffInventory, diffSpells, type BuildDiff } from "../../../core/resolver/diff";
import type { BuildFile } from "../../../core/types";
import type { CharacterStore } from "../../character-store";
import { baseHasMoved, type Draft, type DraftFiles } from "./drafts";
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

/** The files a session holds, picked out of the character. */
function held(data: DraftFiles): DraftFiles {
  return { build: data.build, spells: data.spells, inventory: data.inventory };
}

/** Would resuming this draft change anything? */
function draftDiffers(draft: Draft, current: DraftFiles): boolean {
  const differs = (from: unknown, to: unknown): boolean => from !== undefined && JSON.stringify(from) !== JSON.stringify(to);
  return differs(draft.build, current.build) || differs(draft.spells, current.spells) || differs(draft.inventory, current.inventory);
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
  const base = useRef<DraftFiles>(held(store.data));

  useEffect(() => {
    if (!active || creating) return;
    store.beginEdit(["build", "spells", "inventory"]);
    base.current = held(store.editBase ?? store.data);

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
  const workingSpells = store.data.spells;
  const workingInventory = store.data.inventory;
  // Spells and inventory are held by the session as much as the build is, so a
  // change to only those is still something to save.
  const diff = useMemo(() => {
    const nameOf = (id: string): string => store.index?.get(id)?.name ?? id;
    const parts = [
      base.current.build && working ? diffBuilds(base.current.build, working, nameOf) : undefined,
      diffSpells(base.current.spells, workingSpells, nameOf),
      diffInventory(base.current.inventory, workingInventory, nameOf),
    ];
    const lines = parts.flatMap((part) => part?.lines ?? []);
    return { lines, count: lines.length };
  }, [working, workingSpells, workingInventory, store.index, store.version]);

  const dirty = !creating && diff.count > 0;

  // The draft is written as you work, so closing the pane loses nothing.
  useEffect(() => {
    if (!active || creating || !dirty || !working || !base.current.build) return;
    shell.drafts.set(folder, {
      build: working,
      spells: workingSpells,
      inventory: workingInventory,
      base: base.current.build,
      baseSpells: base.current.spells,
      baseInventory: base.current.inventory,
      saved: new Date().toISOString(),
    });
  }, [active, creating, dirty, working, workingSpells, workingInventory, folder, shell]);

  if (!active) return undefined;

  return {
    creating,
    dirty,
    diff,
    pendingDraft: pendingDraft && working && draftDiffers(pendingDraft, held(store.data)) ? pendingDraft : undefined,
    baseMoved: store.editBaseMoved || (pendingDraft ? baseHasMoved(pendingDraft, held(store.data)) : false),
    resumeDraft: () => {
      if (!pendingDraft) return;
      store.restoreEdit({
        build: pendingDraft.build,
        ...(pendingDraft.spells ? { spells: pendingDraft.spells } : {}),
        ...(pendingDraft.inventory ? { inventory: pendingDraft.inventory } : {}),
      });
      setPendingDraft(undefined);
    },
    discardDraft: () => {
      shell.drafts.clear(folder);
      setPendingDraft(undefined);
    },
    save: () => {
      store.commitEdit();
      shell.drafts.clear(folder);
      base.current = held(store.data);
      // Editing continues after a save, so the next change starts a new diff.
      store.beginEdit(["build", "spells", "inventory"]);
    },
    discard: () => {
      store.discardEdit();
      shell.drafts.clear(folder);
      base.current = held(store.data);
      store.beginEdit(["build", "spells", "inventory"]);
    },
  };
}
