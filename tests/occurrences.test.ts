/**
 * Occurrences: an element appearing in a character more than once.
 *
 * See docs/schema.md, "Occurrences". Two rules are under test, and they pull in
 * opposite directions, which is why they get their own file: an element reached
 * through two different picks must apply twice, and an element reached twice
 * under one pick must apply once, or every grant graph with a diamond in it
 * would double.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import { collect } from "../src/core/resolver/collect";
import { capBreaches, newBreaches } from "../src/core/resolver/caps";
import type { Element } from "../src/core/types";
import { cycle } from "../src/obsidian/ui/narrow/picker";
import { build, scores, testIndex, TEST_BOOK } from "./helpers";

/** A +1 to Strength, as a pickable element. */
const point: Element = {
  id: "test:point:str",
  kind: "feature",
  name: "Strength +1",
  source: "test",
  tags: ["ability-point"],
  modifiers: [{ target: "abilities.str.score", op: "add", value: 1 }],
};

/** Two points to spend, and the same option may take both. */
const asi: Element = {
  id: "test:asi",
  kind: "feature",
  name: "Ability Score Improvement",
  source: "test",
  tags: ["asi"],
  choices: [{ id: "test:asi:points", count: 2, repeatable: true, from: { tags: ["ability-point"] } }],
};

const klass: Element = {
  id: "test:class:hero",
  kind: "class",
  name: "Hero",
  source: "test",
  hitDie: "d8",
  levels: {
    "1": { choices: [{ id: "test:asi-1", count: 1, from: { tags: ["asi"] } }] },
    "2": { choices: [{ id: "test:asi-2", count: 1, from: { tags: ["asi"] } }] },
  },
};

const index = testIndex([TEST_BOOK, point, asi, klass]);

function hero(levelChoices: Record<string, string[]>[]): ReturnType<typeof resolve> {
  return resolve({
    content: index,
    build: build({
      abilities: { method: "manual", base: scores({ str: 10 }) },
      levels: levelChoices.map((choices) => ({ class: "test:class:hero", hp: "average" as const, choices })),
    }),
  });
}

describe("one option taken twice", () => {
  it("applies twice, so two points in one ability is +2", () => {
    const character = hero([
      { "test:asi-1": ["test:asi"], "test:asi:points": ["test:point:str", "test:point:str"] },
    ]);
    expect(character.abilities.str.score.value).toBe(12);
  });

  it("records both contributions separately, so the breakdown explains the number", () => {
    const character = hero([
      { "test:asi-1": ["test:asi"], "test:asi:points": ["test:point:str", "test:point:str"] },
    ]);
    const adds = character.abilities.str.score.breakdown.filter((line) => line.op === "add");
    expect(adds).toHaveLength(2);
    expect(adds.every((line) => line.source === "test:point:str")).toBe(true);
  });

  it("counts the repeat towards the choice being complete", () => {
    const character = hero([
      { "test:asi-1": ["test:asi"], "test:asi:points": ["test:point:str", "test:point:str"] },
    ]);
    const choice = character.pendingChoices.find((c) => c.id === "test:asi:points");
    expect(choice?.chosen).toEqual(["test:point:str", "test:point:str"]);
    expect(choice?.complete).toBe(true);
  });
});

describe("one element picked by two different choices", () => {
  it("is a separate occurrence each time, which is an ASI at two levels", () => {
    // Before occurrences this was the bug: the level-2 ASI was swallowed by the
    // level-1 one, and its nested question was never even asked.
    const character = hero([
      { "test:asi-1": ["test:asi"], "test:asi:points": ["test:point:str", "test:point:str"] },
      { "test:asi-2": ["test:asi"], "test:asi:points": ["test:point:str"] },
    ]);
    expect(character.abilities.str.score.value).toBe(13);
  });

  it("asks the nested choice once per occurrence, each answered where it was asked", () => {
    const character = hero([
      { "test:asi-1": ["test:asi"], "test:asi:points": ["test:point:str", "test:point:str"] },
      { "test:asi-2": ["test:asi"], "test:asi:points": ["test:point:str"] },
    ]);
    const nested = character.pendingChoices.filter((c) => c.id === "test:asi:points");
    expect(nested).toHaveLength(2);
    expect(nested.map((c) => c.chosen.length)).toEqual([2, 1]);
    // The second is incomplete: one point of its two is still unspent.
    expect(nested.map((c) => c.complete)).toEqual([true, false]);
  });
});

describe("the graph below one occurrence", () => {
  it("walks an element reached by two paths only once", () => {
    const shared: Element = {
      id: "test:shared",
      kind: "feature",
      name: "Shared",
      source: "test",
      modifiers: [{ target: "abilities.dex.score", op: "add", value: 1 }],
    };
    const left: Element = { id: "test:left", kind: "feature", name: "Left", source: "test", grants: ["test:shared"] };
    const right: Element = {
      id: "test:right",
      kind: "feature",
      name: "Right",
      source: "test",
      grants: ["test:shared"],
    };
    const diamond: Element = {
      id: "test:diamond",
      kind: "species",
      name: "Diamond",
      source: "test",
      grants: ["test:left", "test:right"],
    };
    const content = testIndex([TEST_BOOK, shared, left, right, diamond]);
    const character = resolve({
      content,
      build: build({ species: "test:diamond", abilities: { method: "manual", base: scores() } }),
    });
    expect(character.abilities.dex.score.value).toBe(11);
  });

  it("terminates when content grants its way back round to itself", () => {
    const a: Element = { id: "test:a", kind: "feature", name: "A", source: "test", grants: ["test:b"] };
    const b: Element = { id: "test:b", kind: "feature", name: "B", source: "test", grants: ["test:a"] };
    const loop: Element = { id: "test:loop", kind: "species", name: "Loop", source: "test", grants: ["test:a"] };
    const content = testIndex([TEST_BOOK, a, b, loop]);
    const collected = collect(content, build({ species: "test:loop" }));
    expect(collected.elements.map((c) => c.element.id)).toEqual(["test:loop", "test:a", "test:b"]);
  });
});

describe("spending a repeatable choice in the picker", () => {
  const COUNT = 2;
  const str = "test:point:str";
  const dex = "test:point:dex";

  it("adds another of the option that was tapped", () => {
    expect(cycle([], str, COUNT)).toEqual([str]);
    expect(cycle([str], str, COUNT)).toEqual([str, str]);
  });

  it("wraps to none when there is no room for another", () => {
    // Both points already in Strength: the only thing left to say is "not that".
    expect(cycle([str, str], str, COUNT)).toEqual([]);
  });

  it("never disturbs a row that wasn't tapped", () => {
    // One point each. Tapping Strength cannot take a second without spending
    // Dexterity's, so it clears its own instead and leaves Dexterity alone.
    expect(cycle([str, dex], str, COUNT)).toEqual([dex]);
    expect(cycle([dex], str, COUNT)).toEqual([dex, str]);
  });

  it("keeps duplicates adjacent, so the answer reads as a count", () => {
    // Three points to spend, so there is room for a second Strength beside
    // Dexterity's one.
    expect(cycle([dex, str], str, 3)).toEqual([dex, str, str]);
  });
});

describe("a per-option cap", () => {
  const str = "test:point:str";
  const dex = "test:point:dex";

  it("stops a third point going into one option", () => {
    // Three points, at most two in any one: the 2024 background rule.
    expect(cycle([str], str, 3, 2)).toEqual([str, str]);
    expect(cycle([str, str], str, 3, 2)).toEqual([]);
  });

  it("still spends the whole budget across options", () => {
    expect(cycle([str, str], dex, 3, 2)).toEqual([str, str, dex]);
  });

  it("defaults to the budget, so an uncapped choice is unchanged", () => {
    expect(cycle([str], str, 2)).toEqual([str, str]);
    expect(cycle([str], str, 2, 2)).toEqual([str, str]);
  });

  it("reports an over-cap answer rather than obeying or rewriting it", () => {
    const capped: Element = {
      id: "test:capped",
      kind: "feature",
      name: "Capped",
      source: "test",
      tags: ["asi"],
      choices: [
        { id: "test:capped:points", count: 3, repeatable: true, maxPer: 2, from: { tags: ["ability-point"] } },
      ],
    };
    const content = testIndex([TEST_BOOK, point, capped, klass]);
    const character = resolve({
      content,
      build: build({
        abilities: { method: "manual", base: scores({ str: 10 }) },
        levels: [
          {
            class: "test:class:hero",
            hp: "average",
            choices: {
              "test:asi-1": ["test:capped"],
              // Hand-edited: three points into one ability, which the cap forbids.
              "test:capped:points": [point.id, point.id, point.id],
            },
          },
        ],
      }),
    });
    const choice = character.pendingChoices.find((c) => c.id === "test:capped:points");
    expect(choice?.complete).toBe(false);
    // The excess is flagged, and the picks are all still in the file.
    expect(choice?.chosen).toHaveLength(3);
    expect(choice?.invalid).toEqual([point.id]);
    expect(
      character.diagnostics.some((d) => d.code === "choice-invalid" && d.message.includes("allows at most 2")),
    ).toBe(true);
  });
});

describe("the soft cap on a stat", () => {
  // Nine points of Strength available, so the cap can actually be crossed.
  const generous: Element = {
    id: "test:generous",
    kind: "feature",
    name: "Generous",
    source: "test",
    tags: ["asi"],
    choices: [{ id: "test:generous:points", count: 9, repeatable: true, from: { tags: ["ability-point"] } }],
  };
  const content = testIndex([TEST_BOOK, point, generous, klass]);

  function at(score: number, spent: number): ReturnType<typeof resolve> {
    return resolve({
      content,
      build: build({
        abilities: { method: "manual", base: scores({ str: score }) },
        levels: [
          {
            class: "test:class:hero",
            hp: "average",
            choices: {
              "test:asi-1": [generous.id],
              "test:generous:points": Array<string>(spent).fill(point.id),
            },
          },
        ],
      }),
    });
  }

  it("says nothing while the score is at the cap", () => {
    const character = at(18, 2);
    expect(character.abilities.str.score.value).toBe(20);
    expect(capBreaches(character, content)).toEqual([]);
  });

  it("reports the stat, its value and the cap once it is over", () => {
    const character = at(18, 3);
    expect(character.abilities.str.score.value).toBe(21);
    expect(capBreaches(character, content)).toEqual([
      { path: "abilities.str.score", label: "Strength", value: 21, softMax: 20 },
    ]);
  });

  it("never clamps: the resolver reports the real number", () => {
    expect(at(18, 5).abilities.str.score.value).toBe(23);
  });

  it("only asks about what a change newly crosses", () => {
    const already = capBreaches(at(18, 3), content);
    // Still 21: nothing new to confirm, so an unrelated later edit stays quiet.
    expect(newBreaches(already, capBreaches(at(18, 3), content))).toEqual([]);
    // 22 is further over than it was, so it is asked about.
    expect(newBreaches(already, capBreaches(at(18, 4), content)).map((b) => b.value)).toEqual([22]);
  });

  it("is content, not code: the cap comes from the stat path", () => {
    expect(content.statPath("abilities.str.score")?.softMax).toBe(20);
    // Nothing caps a skill, so nothing is reported however high it goes.
    expect(content.statPath("skills.athletics")?.softMax).toBeUndefined();
  });
});
