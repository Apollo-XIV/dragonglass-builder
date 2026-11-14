/**
 * A feature-owned save DC (schema-gaps spec, item 6): an explicit `save.dc` expression
 * resolves with the character's numbers, with no spellcasting behind it.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import type { Element } from "../src/core/types";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const STUN: Element = {
  id: "test:feature:stunning-strike", kind: "class-feature", name: "Stunning Strike", source: "test",
  actions: [{ id: "stun", activation: "free", save: { ability: "con", dc: "8 + @prof + @abilities.wis.mod" } }],
};
const MONK: Element = {
  id: "test:class:monk", kind: "class", name: "Monk", source: "test", key: "monk", hitDie: "d8",
  levels: { "1": {}, "2": {}, "3": {}, "4": {}, "5": { grants: ["test:feature:stunning-strike"] } },
} as Element;

describe("a feature's own save DC", () => {
  it("resolves an explicit expression on a non-caster", () => {
    const c = resolve({
      content: testIndex([TEST_BOOK, MONK, STUN]),
      build: build({
        abilities: { method: "manual", base: scores({ wis: 16 }) },
        levels: Array.from({ length: 5 }, () => ({ class: "test:class:monk", hp: "average", choices: {} })),
      }),
    });
    expect(c.actions.find((a) => a.id === "stun")!.save).toEqual({ ability: "con", dc: 14 });
    expect(c.diagnostics.filter((d) => d.code === "expression-error")).toEqual([]);
  });
});
