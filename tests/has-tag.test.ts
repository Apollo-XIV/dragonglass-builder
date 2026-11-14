/**
 * A predicate over a tag (schema-gaps spec, item 8): "a Dragonmark feat" as a
 * prerequisite, and "no other Dragonmark feat" as an exclusion.
 */
import { describe, expect, it } from "vitest";
import { checkRequirement, describeRequirement, type RequirementContext } from "../src/core/content/requirements";
import { validateElement } from "../src/core/content/validate";
import { resolve } from "../src/core/resolver/resolve";
import type { Element, Requirement } from "../src/core/types";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const NO_OTHER: Requirement = { not: [{ type: "has-tag", tag: "dragonmark-feat", kind: "feat", text: "a Dragonmark feat" }] };
const mark = (n: string): Element => ({ id: `test:feat:${n}`, kind: "feat", name: `Mark of ${n}`, source: "test", tags: ["dragonmark-feat"], requires: NO_OTHER });
const GREATER: Element = {
  id: "test:feat:greater", kind: "feat", name: "Greater Dragonmark", source: "test",
  requires: { all: [{ type: "has-tag", tag: "dragonmark-feat", text: "a Dragonmark feat" }] },
};
const CLASS: Element = {
  id: "test:class:fighter", kind: "class", name: "Fighter", source: "test", key: "fighter", hitDie: "d10",
  levels: { "1": { choices: [{ id: "feat", count: 2, from: { kind: "feat" } }] } },
} as Element;
const content = testIndex([TEST_BOOK, CLASS, mark("warding"), mark("shadow"), GREATER]);

const character = (picked: string[], enforce: boolean) =>
  resolve({
    content,
    build: build({ abilities: { method: "manual", base: scores() }, levels: [{ class: "test:class:fighter", hp: "average", choices: { feat: picked } }] }),
    options: { enforceRequirements: enforce },
  }).pendingChoices[0];

describe("has-tag", () => {
  it("with enforcement on, a second mark is hidden and the first stays allowed", () => {
    const choice = character(["test:feat:warding"], true);
    expect(choice.options.map((o) => o.id)).toEqual(["test:feat:greater", "test:feat:warding"]);
    expect(choice.invalid).toEqual([]);
  });

  it("with enforcement off, a second mark is a warning on the option", () => {
    const choice = character(["test:feat:warding"], false);
    const shadow = choice.options.find((o) => o.id === "test:feat:shadow")!;
    expect(shadow.allowed).toBe(false);
    expect(shadow.warnings).toEqual(["must not have a Dragonmark feat"]);
    expect(choice.options.find((o) => o.id === "test:feat:warding")!.allowed).toBe(true);
  });

  it("a prerequisite on the tag is met only after taking one", () => {
    expect(character([], false).options.find((o) => o.id === "test:feat:greater")!.warnings).toEqual(["requires a Dragonmark feat"]);
    expect(character(["test:feat:warding"], false).options.find((o) => o.id === "test:feat:greater")!.allowed).toBe(true);
  });

  it("names the tag when no text is given, and respects kind", () => {
    const ctx: RequirementContext = {
      totalLevel: 1, classLevel: () => 0, abilityScore: () => 10, has: () => false, isSpellcaster: false, hasProficiency: () => false,
      hasTag: (tag, kind) => tag === "dragonmark-feat" && kind !== "species",
    };
    expect(checkRequirement({ all: [{ type: "has-tag", tag: "dragonmark-feat" }] }, ctx).met).toBe(true);
    expect(checkRequirement({ all: [{ type: "has-tag", tag: "dragonmark-feat", kind: "species" }] }, ctx)).toEqual({
      met: false, reasons: ['requires a species tagged "dragonmark-feat"'],
    });
    expect(describeRequirement({ all: [{ type: "has-tag", tag: "x" }] })).toBe('something tagged "x"');
  });

  it("validates the shape, and an unknown predicate type still only warns", () => {
    expect(validateElement(GREATER).diagnostics).toHaveLength(0);
    const bad = validateElement({ ...GREATER, requires: { all: [{ type: "has-tag" }] } });
    expect(bad.diagnostics[0].severity).toBe("error");
    expect(validateElement({ ...GREATER, requires: { all: [{ type: "has-rune", rune: "x" }] } }).diagnostics[0].severity).toBe("warning");
  });
});
