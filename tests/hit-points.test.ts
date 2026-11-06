import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import type { Element } from "../src/core/types";
import { build, scores, testIndex, TEST_BOOK } from "./helpers";

const cls = (key: string, hitDie: string): Element => ({
  id: `test:class:${key}`,
  kind: "class",
  name: key,
  source: "test",
  key,
  hitDie,
});
const FIGHTER = cls("fighter", "d10");
const WIZARD = cls("wizard", "d6");
const index = testIndex([TEST_BOOK, FIGHTER, WIZARD]);

const run = (levels: { class: string; hp: "max" | "average" | number }[], con = 10) =>
  resolve({ content: index, build: build({ levels, abilities: { method: "manual", base: scores({ con }) } }) });

describe("hit points per level", () => {
  it("applies the first-level rule and reports that it overrode the stored choice", () => {
    const r = run([
      { class: FIGHTER.id, hp: "average" },
      { class: FIGHTER.id, hp: "average" },
    ]);
    const [one, two] = r.hp.levels;
    expect(one).toMatchObject({ characterLevel: 1, classLevel: 1, die: "d10", method: "max", value: 10, forced: true });
    expect(two).toMatchObject({ characterLevel: 2, classLevel: 2, method: "average", value: 6, forced: false });
  });

  it("does not call a first level forced when it already was max", () => {
    expect(run([{ class: FIGHTER.id, hp: "max" }]).hp.levels[0].forced).toBe(false);
  });

  it("counts class levels per class and uses each class's die", () => {
    const r = run([
      { class: FIGHTER.id, hp: "max" },
      { class: WIZARD.id, hp: "average" },
      { class: FIGHTER.id, hp: "max" },
      { class: WIZARD.id, hp: "max" },
    ]);
    expect(r.hp.levels.map((l) => [l.class, l.classLevel, l.value])).toEqual([
      [FIGHTER.id, 1, 10],
      [WIZARD.id, 1, 4],
      [FIGHTER.id, 2, 10],
      [WIZARD.id, 2, 6],
    ]);
  });

  it("carries a fixed number as the method and the value", () => {
    const r = run([
      { class: FIGHTER.id, hp: "max" },
      { class: FIGHTER.id, hp: 8 },
    ]);
    expect(r.hp.levels[1]).toMatchObject({ method: 8, value: 8 });
  });

  it("sums, with CON per level, to the hit point maximum", () => {
    const r = run(
      [
        { class: FIGHTER.id, hp: "max" },
        { class: WIZARD.id, hp: "average" },
        { class: FIGHTER.id, hp: 3 },
      ],
      14,
    );
    expect(r.hp.levels.reduce((n, l) => n + Math.max(1, l.value + 2), 0)).toBe(r.hp.max.value);
    expect(r.hp.max.value).toBe(12 + 6 + 5);
  });

  it("is empty for a character with no levels", () => {
    expect(run([]).hp.levels).toEqual([]);
  });
});
