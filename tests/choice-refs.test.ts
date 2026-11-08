/**
 * What a choice reference can do: reach a choice declared anywhere in its owning element,
 * apply to every pick of a multi-pick choice, and make picks learned.
 */

import { describe, expect, it } from "vitest";
import { collect } from "../src/core/resolver/collect";
import type { Element } from "../src/core/types";
import { build, TEST_BOOK, testIndex } from "./helpers";

describe("a subclass's first level entry", () => {
  const sub = {
    id: "test:subclass:path", kind: "subclass", name: "Path", source: "test", class: "test:class:hero",
    levels: { "3": { choices: [{ id: "path-skill", count: 1, from: { kind: "skill" } }] } },
  } as Element;
  const hero = {
    id: "test:class:hero", kind: "class", name: "Hero", source: "test", hitDie: "d8",
    levels: { "3": { choices: [{ id: "path", count: 1, from: { kind: "subclass" } }] } },
  } as Element;
  const content = testIndex([TEST_BOOK, hero, sub]);
  const levels = (n: number) => Array.from({ length: n }, () => ({ class: hero.id }));

  it("declares its choice once, at the level the subclass is gained", () => {
    const c = collect(content, build({ levels: levels(3), choices: { path: [sub.id] } }));
    expect(c.choices.filter((x) => x.definition.id === "path-skill")).toHaveLength(1);
  });

  it("declares it once at later levels too", () => {
    const c = collect(content, build({ levels: levels(5), choices: { path: [sub.id] } }));
    expect(c.choices.filter((x) => x.definition.id === "path-skill")).toHaveLength(1);
  });
});
