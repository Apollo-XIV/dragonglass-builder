/**
 * The Progression list's engine side: the planned queue as one ordered list, what
 * a drop writes, and what a reorder costs.
 */

import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { indexFromDisk } from "../src/node/load-source";
import {
  activeRefs,
  addLevel,
  classLevelAt,
  normalisedQueue,
  removeLevel,
  reorderProgression,
  setPlannedChoice,
} from "../src/core/resolver/levels";
import { commitChange, previewChange } from "../src/core/resolver/validity";
import type { BuildFile } from "../src/core/types";
import { DIVIDER_KEY, activeCount, orderFromKeys, progressionRows } from "../src/obsidian/ui/builder/progression";
import { CONTENT_ROOT } from "./helpers";

const make = (levels: string[], planned: BuildFile["planned"] = undefined): BuildFile => ({
  kind: "build",
  schemaVersion: 1,
  level: levels.length,
  abilities: { method: "point-buy", base: { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 13 } },
  levels: levels.map((c) => ({ class: c, hp: "average", choices: {} })),
  planned,
});

const ref = (c: string, n: number) => ({ class: c, classLevel: n });

describe("the planned queue", () => {
  it("is read in the order it is stored, across classes", () => {
    const build = make(["p"], [
      { class: "w", classLevel: 1, choices: {}, queued: true },
      { class: "p", classLevel: 2, choices: {}, queued: true },
    ]);
    expect(normalisedQueue(build).map((e) => `${e.class}${e.classLevel}`)).toEqual(["w1", "p2"]);
  });

  it("keeps a class's levels ascending, among the places that class holds", () => {
    const build = make(["p"], [
      { class: "p", classLevel: 3, choices: {} },
      { class: "w", classLevel: 1, choices: {} },
      { class: "p", classLevel: 2, choices: {} },
    ]);
    expect(normalisedQueue(build).map((e) => `${e.class}${e.classLevel}`)).toEqual(["p2", "w1", "p3"]);
  });

  it("fills a level missing below one that is planned, and drops one already taken", () => {
    const build = make(["p", "p"], [
      { class: "p", classLevel: 5, choices: { a: ["x"] } },
      { class: "p", classLevel: 1, choices: {} },
    ]);
    expect(normalisedQueue(build).map((e) => e.classLevel)).toEqual([3, 4, 5]);
  });

  it("holds an empty entry's place when its last pick is cleared", () => {
    const placed = make(["p"], [
      { class: "w", classLevel: 1, choices: { a: ["x"] }, queued: true },
      { class: "p", classLevel: 2, choices: {}, queued: true },
    ]);
    const cleared = setPlannedChoice(placed, "w", 1, "a", []);
    expect(cleared.planned?.map((e) => e.class)).toEqual(["w", "p"]);
  });

  it("is consumed by an add for that class, picks and hit points included", () => {
    const build = make(["p"], [
      { class: "w", classLevel: 1, choices: { skills: ["arcana"] }, hp: 6, queued: true },
      { class: "p", classLevel: 2, choices: {}, queued: true },
    ]);
    const next = addLevel(build, "w", "average");
    expect(next.levels[1]).toEqual({ class: "w", hp: 6, choices: { skills: ["arcana"] } });
    expect(next.planned?.map((e) => e.class)).toEqual(["p"]);
  });

  it("gets a fresh level only when nothing for the class is queued", () => {
    const next = addLevel(make(["p"], []), "w", "max");
    expect(next.levels[1]).toEqual({ class: "w", hp: "max", choices: {} });
  });

  it("takes the first planned level of the class, whichever place it holds", () => {
    const build = make(["p"], [
      { class: "w", classLevel: 1, choices: {}, queued: true },
      { class: "p", classLevel: 2, choices: { f: ["y"] }, queued: true },
      { class: "p", classLevel: 3, choices: {}, queued: true },
    ]);
    const next = addLevel(build, "p", "average");
    expect(next.levels[1].choices).toEqual({ f: ["y"] });
    expect(next.planned?.map((e) => `${e.class}${e.classLevel}`)).toEqual(["w1", "p3"]);
  });
});

describe("a reorder", () => {
  const build = make(["p", "w", "w", "p"]);
  const refsOf = (b: BuildFile): string[] => activeRefs(b).map((r) => `${r.class}${r.classLevel}`);

  it("writes the order, and moves every level across the divider with its picks and hit points", () => {
    const rich: BuildFile = {
      ...build,
      levels: build.levels.map((l, i) => ({ ...l, hp: i + 1, choices: { [`c${i}`]: ["v"] } })),
    };
    const next = reorderProgression(
      rich,
      [ref("p", 1), ref("p", 2), ref("w", 1), ref("w", 2)],
      2,
      () => "average",
    );
    expect(refsOf(next)).toEqual(["p1", "p2"]);
    expect(next.level).toBe(2);
    expect(next.planned).toEqual([
      { class: "w", classLevel: 1, choices: { c1: ["v"] }, hp: 2, queued: true },
      { class: "w", classLevel: 2, choices: { c2: ["v"] }, hp: 3, queued: true },
    ]);
  });

  it("brings them back from the queue with nothing lost", () => {
    const down = reorderProgression(build, [ref("p", 1), ref("p", 2), ref("w", 1), ref("w", 2)], 2, () => "average");
    const up = reorderProgression(down, [ref("p", 1), ref("w", 1), ref("w", 2), ref("p", 2)], 4, () => "average");
    expect(up.levels).toEqual(build.levels);
    expect(up.planned).toBeUndefined();
  });

  it("lets go of trailing look-ahead that is already in default order, and keeps the rest", () => {
    const next = reorderProgression(
      make(["p", "w"]),
      [ref("p", 1), ref("w", 1), ref("w", 2), ref("p", 2), ref("p", 3), ref("w", 3)],
      2,
      () => "average",
    );
    // Wizard 2 is out of default order (Paladin comes first), so it stays; what follows
    // it is exactly what the look-ahead would show, and goes.
    expect(next.planned?.map((e) => `${e.class}${e.classLevel}`)).toEqual(["w2"]);
    const ordered = reorderProgression(
      make(["p", "w"]),
      [ref("p", 1), ref("w", 1), ref("p", 2), ref("p", 3), ref("w", 2), ref("w", 3)],
      2,
      () => "average",
    );
    expect(ordered.planned).toBeUndefined();
  });

  it("makes a look-ahead level up empty, with the default hit points", () => {
    const next = reorderProgression(make(["p"]), [ref("p", 1), ref("p", 2)], 2, (c) => (c === "p" ? 7 : "max"));
    expect(next.levels[1]).toEqual({ class: "p", hp: 7, choices: {} });
    expect(next.planned).toBeUndefined();
  });

  it("will not take a class level before a lower one, whatever it is asked", () => {
    const next = reorderProgression(build, [ref("w", 2), ref("w", 1), ref("p", 1), ref("p", 2)], 4, () => "average");
    expect(refsOf(next)).toEqual(["w1", "w2", "p1", "p2"]);
    expect(classLevelAt(next, 3)).toBe(2);
  });

  it("does not disturb a removed level's picks being demoted", () => {
    const next = removeLevel(build, 1);
    expect(next.levels).toHaveLength(3);
  });
});

describe("what a reorder costs", () => {
  const content = indexFromDisk(join(CONTENT_ROOT, "srd"), join(CONTENT_ROOT, "core"));
  const paladin = "srd:class:paladin";
  const build: BuildFile = {
    kind: "build",
    schemaVersion: 1,
    level: 3,
    species: "srd:species:dwarf",
    background: "srd:background:acolyte",
    abilities: { method: "point-buy", base: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } },
    levels: [
      { class: paladin, hp: "max", choices: { "srd:class:paladin:skills": ["srd:skill:athletics", "srd:skill:persuasion"] } },
      { class: paladin, hp: "average", choices: { "srd:paladin:fighting-style": ["srd:fighting-style:defense"] } },
      { class: paladin, hp: "average", choices: { "srd:paladin:sacred-oath": ["srd:subclass:oath-of-devotion"] } },
    ],
    choices: {
      "srd:species:dwarf:tool-proficiency": ["srd:tool:smiths-tools"],
      "srd:background:acolyte:languages": ["srd:language:elvish", "srd:language:celestial"],
    },
  };
  const refs = (n: number) => Array.from({ length: n }, (_, i) => ref(paladin, i + 1));

  it("is free when it changes nothing that anything hangs off", () => {
    expect(previewChange(content, build, { type: "reorder", order: refs(3), active: 3, hp: {} })).toEqual({
      invalidated: [],
      removed: [],
    });
  });

  it("invalidates, reversibly, what hung off a level that went below the divider", () => {
    const change = { type: "reorder" as const, order: refs(3), active: 2, hp: {} };
    const report = previewChange(content, build, change);
    expect(report.removed).toEqual([]);
    const { build: after } = commitChange(content, build, change);
    expect(after.levels).toHaveLength(2);
    expect(after.planned?.[0].choices).toEqual({ "srd:paladin:sacred-oath": ["srd:subclass:oath-of-devotion"] });
    // And back: nothing was remembered, and nothing is missing.
    const { build: back } = commitChange(content, after, { type: "reorder", order: refs(3), active: 3, hp: {} });
    expect(back.levels).toEqual(build.levels);
  });
});

describe("the list's rows", () => {
  const paladin = "srd:class:paladin";
  const build = make([paladin, paladin], [{ class: paladin, classLevel: 3, choices: { a: ["b"] } }]);

  it("puts the active levels, the divider, the queue, then the look-ahead", () => {
    const rows = progressionRows(build, 2);
    expect(rows.map((r) => r.kind)).toEqual(["level", "level", "divider", "planned", "planned", "planned"]);
    expect(rows.filter((r) => r.kind === "planned").map((r) => [r.classLevel, r.stored ?? false])).toEqual([
      [3, true],
      [4, false],
      [5, false],
    ]);
  });

  it("turns a list of keys back into an order and a divider position", () => {
    const rows = progressionRows(build, 2);
    const keys = rows.map((r) => r.key);
    const moved = [keys[0], keys[1], keys[3], DIVIDER_KEY, keys[4], keys[5]];
    const { order, active } = orderFromKeys(moved, rows);
    expect(active).toBe(3);
    expect(order.map((r) => r.classLevel)).toEqual([1, 2, 3, 4, 5]);
    expect(activeCount(moved)).toBe(3);
  });
});
