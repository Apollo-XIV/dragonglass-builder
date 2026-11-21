/**
 * Holding a resource pill or an action row reads the feature it came from. A part rarely
 * carries text of its own, so a sheet that showed only the part's `text` or `notes` said
 * "No rules text" for Arcane Recovery while the element's text sat right there.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import { readingText } from "../src/core/resolver/resolved";
import type { Element } from "../src/core/types";
import { build, TEST_BOOK, testIndex } from "./helpers";

const RULES = "When you finish a short rest, you can choose expended spell slots to recover.";

const feature = (extra: Record<string, unknown> = {}): Element =>
  ({
    id: "test:wizard:arcane-recovery", kind: "class-feature", name: "Arcane Recovery", source: "test",
    text: RULES,
    resources: [{ id: "arcane-recovery", name: "Arcane Recovery", max: 1, recharge: [{ on: "long-rest", amount: "all" }] }],
    actions: [{ id: "arcane-recovery", name: "Arcane Recovery", activation: "special", cost: { "test:wizard:arcane-recovery:arcane-recovery": 1 }, ...extra }],
  }) as Element;

const wizard = { id: "test:class:wizard", kind: "class", name: "Wizard", source: "test", key: "wizard", hitDie: "d6", levels: { "1": { grants: ["test:wizard:arcane-recovery"] } } } as Element;

const resolved = (f: Element) =>
  resolve({
    content: testIndex([TEST_BOOK, wizard, f]),
    build: build({ levels: [{ class: "test:class:wizard", hp: "average", choices: {} }] }),
  });

describe("reading a resource or an action", () => {
  it("carries the owning element's rules text", () => {
    const c = resolved(feature());
    expect(c.resources[0].rulesText).toBe(RULES);
    expect(c.actions[0].rulesText).toBe(RULES);
    expect(readingText(c.resources[0])).toBe(RULES);
    expect(readingText(c.actions[0])).toBe(RULES);
  });

  it("puts the part's own words first, then the rules", () => {
    const c = resolved(feature({ text: "Recover slots.", notes: "Once a day." }));
    expect(readingText(c.actions[0])).toBe(`Recover slots.\n\nOnce a day.\n\n${RULES}`);
  });

  it("does not repeat a part's text that is the rules text", () => {
    expect(readingText({ text: RULES, rulesText: RULES })).toBe(RULES);
  });

  it("is empty when nothing has any", () => {
    expect(readingText({})).toBeUndefined();
  });
});
