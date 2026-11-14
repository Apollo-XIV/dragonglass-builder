/**
 * `anyOf` on a filter (schema-gaps spec, item 9): the one place a filter unions, so
 * "a gaming set or thieves' tools" stays open to a homebrew gaming set.
 */
import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import type { Element, Filter } from "../src/core/types";
import { testIndex, TEST_BOOK } from "./helpers";

const tool = (n: string, tags: string[] = []): Element => ({ id: `test:tool:${n}`, kind: "tool", name: n, source: "test", tags });
const content = testIndex([
  TEST_BOOK,
  tool("dice-set", ["gaming-set"]), tool("dragonchess", ["gaming-set"]), tool("thieves-tools"), tool("smiths-tools"),
  { id: "test:feat:cards", kind: "feat", name: "Card Sharp", source: "test", tags: ["gaming-set"] },
]);
const EITHER: Filter = { anyOf: [{ kind: "tool", tags: ["gaming-set"] }, { ids: ["test:tool:thieves-tools"] }] };

describe("a filter with anyOf", () => {
  it("matches an element matching any alternative, once, in name order", () => {
    expect(content.query(EITHER).map((e) => e.id)).toEqual(["test:tool:dice-set", "test:tool:dragonchess", "test:tool:thieves-tools"]);
    expect(content.query({ anyOf: [{ ids: ["test:tool:smiths-tools"] }, { ids: ["test:tool:smiths-tools"] }] })).toHaveLength(1);
  });

  it("each alternative is an ordinary filter: criteria inside it still AND", () => {
    expect(content.query({ anyOf: [{ kind: "feat", ids: ["test:tool:dice-set"] }] })).toEqual([]);
  });

  it("reports unresolved ids inside the alternatives", () => {
    expect(content.unresolvedIn({ anyOf: [{ ids: ["test:tool:nope"] }, { kind: "tool", exclude: ["test:tool:gone"] }] })).toEqual(["test:tool:nope", "test:tool:gone"]);
  });

  it("validates: accepted alone, rejected beside another criterion, and alternatives are checked", () => {
    const bg = (from: unknown) => ({ id: "hb:bg:x", kind: "background", name: "X", source: "hb", choices: [{ id: "tool", count: 1, from }] });
    expect(validateElement(bg(EITHER)).diagnostics).toHaveLength(0);
    const beside = validateElement(bg({ kind: "tool", ...EITHER })).diagnostics;
    expect(beside[0].severity).toBe("error");
    expect(beside[0].message).toContain("carries nothing else");
    expect(validateElement(bg({ anyOf: [] })).diagnostics[0].path).toBe("choices[0].from.anyOf");
    expect(validateElement(bg({ anyOf: [{ exclude: ["x"] }] })).diagnostics[0].path).toBe("choices[0].from.anyOf[0]");
  });
});
