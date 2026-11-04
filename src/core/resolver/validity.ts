/**
 * Which stored picks still count, and what an edit will cost (spec 7.8).
 *
 * Validity is never stored. A pick is live if the current selections lead the
 * collector to the choice it answers, and dead if they don't — so putting a
 * cleared option back brings its dependants back with it, without anything
 * having been remembered. That is the whole trick, and it is why the two
 * functions below are the only ones that need to exist: everything else is a
 * question about two collector runs, before and after.
 *
 * The one rule worth stating plainly: a change that puts something new in place
 * of the old option **removes** what depended on it, permanently; a change that
 * merely takes an option away **invalidates** it, reversibly. The app never
 * keeps every build a player ever considered, but it never throws away a build
 * they are halfway through either.
 */

import type { ContentIndex } from "../content";
import type { BuildFile, ChoiceDef, Element, HpChoice, LevelEntry } from "../types";
import { collect } from "./collect";
import { addLevel, removeLevel, reorderProgression, type ProgressionRef } from "./levels";

/** A stored answer, wherever it lives in the build file. */
export interface PickRef {
  choiceId: string;
  scope: "build" | "level";
  /** Index into build.levels, when the answer is stored at a level. */
  levelIndex?: number;
  chosen: string[];
}

export interface InactivePick extends PickRef {
  /** The element that declares this choice, when it can be found. */
  owner?: { id: string; name: string };
  /** The choice's own name, for the UI. */
  name: string;
  /** "Oath of Devotion is no longer chosen". */
  reason: string;
}

export interface ChangeReport {
  /** Kept in the file and inert; they come back if the option goes back. */
  invalidated: InactivePick[];
  /** Cannot be valid under the new selection, and are forgotten on commit. */
  removed: InactivePick[];
}

export const EMPTY_REPORT: ChangeReport = { invalidated: [], removed: [] };

export function isEmptyReport(report: ChangeReport): boolean {
  return report.invalidated.length === 0 && report.removed.length === 0;
}

/** Everything a change can be. All three go through the same two calls (spec 8.4). */
export type BuildChange =
  | { type: "choice"; choiceId: string; scope: "build" | "level"; levelIndex?: number; chosen: string[] }
  | { type: "add-level"; class: string; hp: HpChoice }
  | { type: "remove-level"; index: number }
  /** A drag in the Progression list: the whole order, and how many of it are taken. */
  | { type: "reorder"; order: ProgressionRef[]; active: number; hp: Record<string, HpChoice> }
  | { type: "species"; id?: string }
  | { type: "background"; id?: string };

// ---------------------------------------------------------------------------
// Reading what is stored and what is live
// ---------------------------------------------------------------------------

export function storedPicks(build: BuildFile): PickRef[] {
  const picks: PickRef[] = [];
  for (const [choiceId, chosen] of Object.entries(build.choices ?? {}))
    if (chosen.length) picks.push({ choiceId, scope: "build", chosen });
  (build.levels ?? []).forEach((level, levelIndex) => {
    for (const [choiceId, chosen] of Object.entries(level.choices ?? {}))
      if (chosen.length) picks.push({ choiceId, scope: "level", levelIndex, chosen });
  });
  return picks;
}

/**
 * The choice ids the collector actually asked about.
 *
 * Keyed by id alone, because that is how `answerFor` reads them: an answer
 * stored at one level still satisfies the same choice declared at another, and
 * flagging it as invalid because it sat in the wrong place would be a lie.
 */
export function liveChoiceIds(index: ContentIndex, build: BuildFile): Set<string> {
  return new Set(collect(index, build).choices.map((choice) => choice.definition.id));
}

/** Every choice any loaded element declares, by id, for naming a dead pick. */
function declarations(index: ContentIndex): Map<string, { def: ChoiceDef; owner: Element }> {
  const found = new Map<string, { def: ChoiceDef; owner: Element }>();
  const add = (def: ChoiceDef, owner: Element): void => {
    if (!found.has(def.id)) found.set(def.id, { def, owner });
  };
  for (const element of index.all()) {
    for (const def of (element as { choices?: ChoiceDef[] }).choices ?? []) add(def, element);
    const levels = (element as { levels?: Record<string, LevelEntry> }).levels ?? {};
    for (const entry of Object.values(levels)) for (const def of entry.choices ?? []) add(def, element);
  }
  return found;
}

function describe(
  pick: PickRef,
  declared: Map<string, { def: ChoiceDef; owner: Element }>,
  reason: string,
): InactivePick {
  const declaration = declared.get(pick.choiceId);
  return {
    ...pick,
    name: declaration?.def.name ?? pick.choiceId,
    owner: declaration ? { id: declaration.owner.id, name: declaration.owner.name } : undefined,
    reason: declaration ? `${declaration.owner.name} ${reason}` : reason,
  };
}

/**
 * Stored picks that aren't contributing. They are kept, shown muted, and start
 * counting again the moment whatever they hang off is selected again (spec
 * 7.8.2, 7.8.5).
 */
export function inactivePicks(index: ContentIndex, build: BuildFile): InactivePick[] {
  const live = liveChoiceIds(index, build);
  const declared = declarations(index);
  return storedPicks(build)
    .filter((pick) => !live.has(pick.choiceId))
    .map((pick) => describe(pick, declared, "is not part of this character"));
}

// ---------------------------------------------------------------------------
// Applying a change
// ---------------------------------------------------------------------------

function pruned(choices: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, picks] of Object.entries(choices)) if (picks.length) out[id] = picks;
  return out;
}

/** The change itself, with no pruning of what it breaks. */
export function applyChange(build: BuildFile, change: BuildChange): BuildFile {
  switch (change.type) {
    case "species":
      return { ...build, species: change.id };
    case "background":
      return { ...build, background: change.id };
    case "add-level":
      return addLevel(build, change.class, change.hp);
    case "remove-level":
      return removeLevel(build, change.index);
    case "reorder":
      return reorderProgression(build, change.order, change.active, (id) => change.hp[id] ?? "average");
    case "choice": {
      if (change.scope === "level" && change.levelIndex !== undefined) {
        const levels = build.levels.map((level, i) =>
          i === change.levelIndex
            ? { ...level, choices: pruned({ ...(level.choices ?? {}), [change.choiceId]: change.chosen }) }
            : level,
        );
        // A pick that used to live in the global map moves with it, so it is
        // not applied twice from two places.
        const choices = { ...(build.choices ?? {}) };
        delete choices[change.choiceId];
        return { ...build, levels, choices };
      }
      return { ...build, choices: pruned({ ...(build.choices ?? {}), [change.choiceId]: change.chosen }) };
    }
  }
}

/**
 * Does this change put something new in place of what was there?
 *
 * That is the whole of the invalidate-or-remove distinction. Clearing a choice,
 * deselecting one of several, or removing a level all take something away and
 * can be undone by putting it back. Choosing a different option, or a different
 * species, replaces the branch of the build those picks hung off, and there is
 * no sense in which the old picks are waiting to come back.
 */
function isReplacement(build: BuildFile, change: BuildChange): boolean {
  switch (change.type) {
    case "species":
      return Boolean(change.id) && change.id !== build.species;
    case "background":
      return Boolean(change.id) && change.id !== build.background;
    case "choice": {
      const before = new Set(currentAnswer(build, change));
      return change.chosen.some((id) => !before.has(id));
    }
    case "add-level":
      // Adding a level only ever grants; it cannot cost anything.
      return false;
    case "remove-level":
      return false;
    case "reorder":
      // Moving a level never puts a different option in place of another: what
      // depended on it is invalidated, and comes back if the order does.
      return false;
  }
}

function currentAnswer(
  build: BuildFile,
  change: Extract<BuildChange, { type: "choice" }>,
): string[] {
  if (change.scope === "level" && change.levelIndex !== undefined) {
    const atLevel = build.levels?.[change.levelIndex]?.choices?.[change.choiceId];
    if (atLevel) return atLevel;
  }
  return build.choices?.[change.choiceId] ?? [];
}

/**
 * What a change will cost, without making it (spec 8.4). The builder shows this
 * as a confirmation before committing an edit that reaches later choices.
 */
export function previewChange(index: ContentIndex, build: BuildFile, change: BuildChange): ChangeReport {
  const before = liveChoiceIds(index, build);
  const next = applyChange(build, change);
  const after = liveChoiceIds(index, next);
  const declared = declarations(index);

  const changedId = change.type === "choice" ? change.choiceId : undefined;
  const lost = storedPicks(next).filter(
    (pick) => pick.choiceId !== changedId && before.has(pick.choiceId) && !after.has(pick.choiceId),
  );
  if (lost.length === 0) return EMPTY_REPORT;

  if (isReplacement(build, change))
    return { invalidated: [], removed: lost.map((pick) => describe(pick, declared, "is no longer chosen")) };
  return {
    invalidated: lost.map((pick) => describe(pick, declared, "is not chosen at the moment")),
    removed: [],
  };
}

/**
 * Makes the change, forgetting what cannot come back and leaving what can
 * (spec 7.8.4). Adding a level, removing a level and editing a choice all come
 * through here, so the rules are applied in one place.
 */
export function commitChange(
  index: ContentIndex,
  build: BuildFile,
  change: BuildChange,
): { build: BuildFile; report: ChangeReport } {
  const report = previewChange(index, build, change);
  let next = applyChange(build, change);
  for (const pick of report.removed) next = forget(next, pick);
  return { build: next, report };
}

function forget(build: BuildFile, pick: PickRef): BuildFile {
  if (pick.scope === "level" && pick.levelIndex !== undefined) {
    const levels = build.levels.map((level, i) => {
      if (i !== pick.levelIndex) return level;
      const choices = { ...(level.choices ?? {}) };
      delete choices[pick.choiceId];
      return { ...level, choices };
    });
    return { ...build, levels };
  }
  const choices = { ...(build.choices ?? {}) };
  delete choices[pick.choiceId];
  return { ...build, choices };
}
