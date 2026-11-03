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
  if (Object.keys(choices).length === 0) {
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
  const level: BuildLevel = { class: classId, hp, choices: queued ? { ...queued.choices } : {} };
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
