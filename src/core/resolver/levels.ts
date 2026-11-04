/**
 * Adding and removing class levels, and the queue of picks for levels not yet
 * taken (spec 7.3, 7.5, 7.6, 8.5).
 *
 * `levels` stays what it has always been: an ordered list of class ids, one per
 * character level. A class's class level is how many entries that class has, so
 * nothing here needs to renumber anything — removing a level renumbers by
 * construction. The planned queue is keyed by class and class level rather than
 * by character level for the same reason: taking a Fighter level must not move
 * the Wizard plans.
 */

import type { BuildFile, BuildLevel, HpChoice, PlannedLevel } from "../types";

export type { PlannedLevel };

/** Class levels taken, by class id. */
export function classLevels(build: BuildFile): Map<string, number> {
  const counts = new Map<string, number>();
  for (const level of build.levels ?? []) counts.set(level.class, (counts.get(level.class) ?? 0) + 1);
  return counts;
}

/** The class level a build level represents: the third Paladin entry is Paladin 3. */
export function classLevelAt(build: BuildFile, index: number): number {
  const target = build.levels?.[index]?.class;
  if (!target) return 0;
  let seen = 0;
  for (let i = 0; i <= index; i++) if (build.levels[i].class === target) seen += 1;
  return seen;
}

export function plannedFor(build: BuildFile, classId: string, classLevel: number): PlannedLevel | undefined {
  return build.planned?.find((entry) => entry.class === classId && entry.classLevel === classLevel);
}

/** Records a queued pick. Clearing one to nothing removes the entry entirely. */
export function setPlannedChoice(
  build: BuildFile,
  classId: string,
  classLevel: number,
  choiceId: string,
  chosen: string[],
): BuildFile {
  const planned = [...(build.planned ?? [])];
  const at = planned.findIndex((entry) => entry.class === classId && entry.classLevel === classLevel);
  const existing = at >= 0 ? planned[at] : { class: classId, classLevel, choices: {} };
  const choices = { ...existing.choices };
  if (chosen.length) choices[choiceId] = chosen;
  else delete choices[choiceId];

  const next: PlannedLevel = { ...existing, choices };
  if (Object.keys(choices).length === 0 && !existing.queued) {
    if (at >= 0) planned.splice(at, 1);
  } else if (at >= 0) planned[at] = next;
  else planned.push(next);

  return { ...build, planned: planned.length ? planned : undefined };
}

/**
 * Appends a level of a class, applying anything queued for that class level and
 * taking it out of the queue (spec 7.5).
 */
export function addLevel(build: BuildFile, classId: string, hp: HpChoice): BuildFile {
  const classLevel = (classLevels(build).get(classId) ?? 0) + 1;
  const queued = plannedFor(build, classId, classLevel);
  const level: BuildLevel = { class: classId, hp: queued?.hp ?? hp, choices: queued ? { ...queued.choices } : {} };
  const planned = (build.planned ?? []).filter((entry) => entry !== queued);

  return {
    ...build,
    levels: [...(build.levels ?? []), level],
    level: (build.levels?.length ?? 0) + 1,
    planned: planned.length ? planned : undefined,
  };
}

/**
 * Removes a level. Which entry of that class goes is not a meaningful question —
 * features follow from how many levels of a class you have — so the highest class
 * level of that class is the one whose picks are demoted, and the entry itself is
 * dropped where the player asked.
 *
 * The picks are demoted to the queue rather than deleted (spec 7.3), so a player
 * who removes a level to try something else and changes their mind back has not
 * lost the work.
 */
export function removeLevel(build: BuildFile, index: number): BuildFile {
  const level = build.levels?.[index];
  if (!level) return build;

  const highest = classLevels(build).get(level.class) ?? 0;
  const demoted = Object.keys(level.choices ?? {}).length
    ? [
        ...(build.planned ?? []).filter((entry) => !(entry.class === level.class && entry.classLevel === highest)),
        { class: level.class, classLevel: highest, choices: { ...(level.choices ?? {}) } },
      ]
    : (build.planned ?? []);

  const levels = build.levels.filter((_, i) => i !== index);
  return {
    ...build,
    levels,
    level: levels.length,
    planned: demoted.length ? demoted : undefined,
  };
}

/**
 * The planned queue as the Progression list reads it: in order, in ascending class
 * level within each class, with no gaps.
 *
 * A hand-edited or older file can hold entries in any order, leave out a level
 * between two that are planned, or still list one that has since been taken. All
 * three are repaired here rather than rejected: stale entries are dropped, the
 * entries of each class keep the places they have in the queue but are reordered
 * among them, and a missing level is made up (empty) just before the next one.
 */
export function normalisedQueue(build: BuildFile): PlannedLevel[] {
  const taken = classLevels(build);
  const stored = (build.planned ?? []).filter((entry) => entry.classLevel > (taken.get(entry.class) ?? 0));

  // Each class's entries, ascending, poured back into the slots that class held.
  const byClass = new Map<string, PlannedLevel[]>();
  for (const entry of stored) byClass.set(entry.class, [...(byClass.get(entry.class) ?? []), entry]);
  for (const [, list] of byClass) list.sort((a, b) => a.classLevel - b.classLevel);
  const used = new Map<string, number>();
  const ordered = stored.map((entry) => {
    const n = used.get(entry.class) ?? 0;
    used.set(entry.class, n + 1);
    return byClass.get(entry.class)![n];
  });

  // Any level missing below one that is planned, made up just ahead of it.
  const out: PlannedLevel[] = [];
  const have = new Map<string, number>(taken);
  for (const entry of ordered) {
    for (let level = (have.get(entry.class) ?? 0) + 1; level < entry.classLevel; level++)
      out.push({ class: entry.class, classLevel: level, choices: {}, queued: true });
    have.set(entry.class, entry.classLevel);
    out.push(entry);
  }
  return out;
}

/** An item in the Progression list, named by class and class level, which a reorder never changes. */
export interface ProgressionRef {
  class: string;
  classLevel: number;
}

export function progressionKey(ref: ProgressionRef): string {
  return `${ref.class}#${ref.classLevel}`;
}

/** Every active level, in order, as a ref. */
export function activeRefs(build: BuildFile): ProgressionRef[] {
  return (build.levels ?? []).map((level, i) => ({ class: level.class, classLevel: classLevelAt(build, i) }));
}

/**
 * Writes a reorder: `order` is every item of the list, top to bottom, and the first
 * `active` of them are the levels taken, the rest the queue.
 *
 * The UI hands over an order that already obeys the conflict rule, and this keeps
 * it honest anyway: within a class the items are put back in ascending class level
 * (so no class level can ever be taken before a lower one), and an item the build
 * has never heard of — a look-ahead level, shown but never stored — is made up empty.
 * Hit points follow a level in both directions; one that has none yet gets `hp`.
 */
export function reorderProgression(
  build: BuildFile,
  order: ProgressionRef[],
  active: number,
  hp: (classId: string) => HpChoice,
): BuildFile {
  const levelOf = new Map<string, BuildLevel>();
  activeRefs(build).forEach((ref, i) => levelOf.set(progressionKey(ref), build.levels[i]));
  const queued = new Map<string, PlannedLevel>();
  for (const entry of normalisedQueue(build)) queued.set(progressionKey(entry), entry);

  // Class-level order within each class, whatever order the caller asked for.
  const byClass = new Map<string, number[]>();
  for (const ref of order) byClass.set(ref.class, [...(byClass.get(ref.class) ?? []), ref.classLevel]);
  for (const [, levels] of byClass) levels.sort((a, b) => a - b);
  const used = new Map<string, number>();
  const sequence = order.map((ref) => {
    const n = used.get(ref.class) ?? 0;
    used.set(ref.class, n + 1);
    return { class: ref.class, classLevel: byClass.get(ref.class)![n] };
  });

  const levels: BuildLevel[] = [];
  const planned: PlannedLevel[] = [];
  sequence.forEach((ref, i) => {
    const key = progressionKey(ref);
    const was = levelOf.get(key);
    const waiting = queued.get(key);
    const choices = { ...(was?.choices ?? waiting?.choices ?? {}) };
    const hit = was?.hp ?? waiting?.hp;
    if (i < active) levels.push({ class: ref.class, hp: hit ?? hp(ref.class), choices });
    else planned.push({ class: ref.class, classLevel: ref.classLevel, choices, ...(hit !== undefined ? { hp: hit } : {}), queued: true });
  });

  const kept = trimQueue(build, levels, planned);
  return { ...build, levels, level: levels.length, planned: kept.length ? kept : undefined };
}

/**
 * The look-ahead the UI shows is written into the queue the moment anything is
 * dragged, because only then does it have a place. Most of it is still exactly where
 * it would be by default, so the trailing entries that carry nothing and are already
 * in default order — class by class, in the order the classes were taken — are let
 * go again; the list shows them anyway, and the file is not left with thirty empty
 * levels for one drag.
 */
function trimQueue(build: BuildFile, levels: BuildLevel[], planned: PlannedLevel[]): PlannedLevel[] {
  const rank = new Map<string, number>();
  for (const level of [...(build.levels ?? []), ...levels]) if (!rank.has(level.class)) rank.set(level.class, rank.size);
  for (const entry of planned) if (!rank.has(entry.class)) rank.set(entry.class, rank.size);
  const before = (a: PlannedLevel, b: PlannedLevel): boolean =>
    rank.get(a.class)! < rank.get(b.class)! || (a.class === b.class && a.classLevel < b.classLevel);
  const empty = (entry: PlannedLevel): boolean => Object.keys(entry.choices).length === 0 && entry.hp === undefined;

  let start = planned.length;
  while (start > 0 && empty(planned[start - 1]) && (start === planned.length || before(planned[start - 1], planned[start])))
    start -= 1;
  return planned.slice(0, start);
}

/** True when removing this level changes the starting class (spec 7.3). */
export function changesStartingClass(build: BuildFile, index: number): boolean {
  if (index !== 0) return false;
  const first = build.levels?.[0]?.class;
  return Boolean(first && build.levels[1] && build.levels[1].class !== first);
}

/** The next unfilled class level for each class taken, for the Planned queue. */
export function nextClassLevels(build: BuildFile): { class: string; classLevel: number }[] {
  return [...classLevels(build).entries()].map(([classId, taken]) => ({ class: classId, classLevel: taken + 1 }));
}

/** Experience needed to reach each character level, 1 to 20. */
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000,
  265000, 305000, 355000,
];

/** The level this much experience is enough for. It only ever prompts; nothing forces a level-up. */
export function levelForXp(xp: number): number {
  return XP_THRESHOLDS.filter((threshold) => xp >= threshold).length;
}

/** Sets one level's hit points. Not a validity change: nothing depends on it. */
export function setLevelHp(build: BuildFile, index: number, hp: HpChoice): BuildFile {
  return { ...build, levels: build.levels.map((level, i) => (i === index ? { ...level, hp } : level)) };
}
