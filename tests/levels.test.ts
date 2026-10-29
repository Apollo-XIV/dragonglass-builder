/**
 * Adding and removing class levels, and the planned queue.
 *
 * The interesting property is that nothing renumbers: a class's class level is
 * how many entries it has, so removing a level in the middle is the same
 * operation as removing the last one.
 */

import { describe, expect, it } from "vitest";
import {
  addLevel,
  changesStartingClass,
  classLevelAt,
  classLevels,
  nextClassLevels,
  plannedFor,
  removeLevel,
  setPlannedChoice,
} from "../src/core/resolver/levels";
import type { BuildFile } from "../src/core/types";

const base: BuildFile = {
  kind: "build",
  schemaVersion: 1,
  level: 3,
  abilities: { method: "point-buy", base: { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 13 } },
  levels: [
    { class: "wizard", hp: "max", choices: { "wizard:skills": ["arcana"] } },
    { class: "wizard", hp: "average", choices: {} },
    { class: "fighter", hp: "average", choices: { "fighter:style": ["defense"] } },
  ],
};

describe("counting class levels", () => {
  it("counts entries per class, not character levels", () => {
    expect([...classLevels(base).entries()]).toEqual([
      ["wizard", 2],
      ["fighter", 1],
    ]);
  });

  it("reports the class level a given entry represents", () => {
    expect(classLevelAt(base, 0)).toBe(1);
    expect(classLevelAt(base, 1)).toBe(2);
    expect(classLevelAt(base, 2)).toBe(1);
  });

  it("knows which class level each class is next in line for", () => {
    expect(nextClassLevels(base)).toEqual([
      { class: "wizard", classLevel: 3 },
      { class: "fighter", classLevel: 2 },
    ]);
  });
});

describe("the planned queue", () => {
  it("stores a pick against a class level the character hasn't reached", () => {
    const planned = setPlannedChoice(base, "wizard", 4, "wizard:asi-4", ["resilient"]);
    expect(plannedFor(planned, "wizard", 4)?.choices).toEqual({ "wizard:asi-4": ["resilient"] });
    // The character is untouched until the level is taken.
    expect(planned.levels).toEqual(base.levels);
  });

  it("drops the entry entirely when its last pick is cleared", () => {
    const planned = setPlannedChoice(base, "wizard", 4, "wizard:asi-4", ["resilient"]);
    const cleared = setPlannedChoice(planned, "wizard", 4, "wizard:asi-4", []);
    expect(cleared.planned).toBeUndefined();
  });

  it("keeps each class's plans separate", () => {
    let build = setPlannedChoice(base, "wizard", 3, "wizard:cantrip", ["firebolt"]);
    build = setPlannedChoice(build, "fighter", 2, "fighter:style-2", ["archery"]);
    // Taking a fighter level must not consume the wizard's plan.
    const levelled = addLevel(build, "fighter", "average");
    expect(plannedFor(levelled, "wizard", 3)?.choices).toEqual({ "wizard:cantrip": ["firebolt"] });
    expect(plannedFor(levelled, "fighter", 2)).toBeUndefined();
    expect(levelled.levels[3].choices).toEqual({ "fighter:style-2": ["archery"] });
  });
});

describe("adding a level", () => {
  it("appends the class and keeps the level count in step", () => {
    const next = addLevel(base, "wizard", "average");
    expect(next.levels).toHaveLength(4);
    expect(next.levels[3]).toEqual({ class: "wizard", hp: "average", choices: {} });
    expect(next.level).toBe(4);
  });
});

describe("removing a level", () => {
  it("renumbers by construction and keeps the count in step", () => {
    const next = removeLevel(base, 0);
    expect(next.levels.map((l) => l.class)).toEqual(["wizard", "fighter"]);
    // The remaining wizard entry is now Wizard 1.
    expect(classLevelAt(next, 0)).toBe(1);
    expect(next.level).toBe(2);
  });

  it("demotes the removed level's picks to that class's queue rather than deleting them", () => {
    const next = removeLevel(base, 0);
    // Wizard had two levels, so the picks are queued against Wizard 2 — the
    // class level that no longer exists.
    expect(plannedFor(next, "wizard", 2)?.choices).toEqual({ "wizard:skills": ["arcana"] });
  });

  it("restores the demoted picks when the level is taken again", () => {
    const removed = removeLevel(base, 0);
    const again = addLevel(removed, "wizard", "average");
    expect(again.levels[2].choices).toEqual({ "wizard:skills": ["arcana"] });
    expect(again.planned).toBeUndefined();
  });

  it("leaves no queue entry for a level that had no picks", () => {
    const next = removeLevel(base, 1);
    expect(next.planned).toBeUndefined();
  });

  it("flags a removal that changes the starting class", () => {
    expect(changesStartingClass(base, 0)).toBe(false);
    expect(changesStartingClass(base, 2)).toBe(false);
    // Removing level 1 of a build that starts wizard and continues fighter does
    // change where the character came from.
    const fighterFirst: BuildFile = { ...base, levels: [base.levels[0], base.levels[2]] };
    expect(changesStartingClass(fighterFirst, 0)).toBe(true);
  });

  it("ignores an index that isn't there", () => {
    expect(removeLevel(base, 9)).toBe(base);
  });
});
