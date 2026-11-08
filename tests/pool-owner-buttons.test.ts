/**
 * A feature that owns a pool and has a bare action that only spends it (2014 Channel
 * Divinity) shows no such button while other actions spend that pool.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import type { Element } from "../src/core/types";
import { build, TEST_BOOK, testIndex } from "./helpers";

const POOL = "test:cleric:channel-divinity";

const owner = (action: Record<string, unknown> | undefined, grants: string[] = []): Element =>
  ({
    id: "test:feature:channel-divinity", kind: "class-feature", name: "Channel Divinity", source: "test",
    grants,
    resources: [{ id: POOL, name: "Channel Divinity", max: 1, recharge: [{ on: "short-rest", amount: "all" }] }],
    actions: action ? [{ id: "channel-divinity", name: "Channel Divinity", activation: "special", cost: { [POOL]: 1 }, ...action }] : [],
  }) as Element;

const spender = (id: string, extra: Record<string, unknown> = {}): Element =>
  ({
    id: `test:feature:${id}`, kind: "class-feature", name: id, source: "test",
    actions: [{ id, name: id, activation: "action", cost: { [POOL]: 1 }, ...extra }],
  }) as Element;

const cleric = (grants: string[]) =>
  ({ id: "test:class:cleric", kind: "class", name: "Cleric", source: "test", key: "cleric", hitDie: "d8", levels: { "1": { grants } } }) as Element;

const actionsOf = (features: Element[]) => {
  const c = resolve({
    content: testIndex([TEST_BOOK, cleric(features.map((f) => f.id)), ...features]),
    build: build({ levels: [{ class: "test:class:cleric", hp: "average", choices: {} }] }),
  });
  return c.actions.map((a) => a.id);
};

describe("a pool owner's bare action", () => {
  it("is left out when other actions spend the pool", () => {
    expect(actionsOf([owner({}), spender("turn-undead"), spender("preserve-life")])).toEqual(["turn-undead", "preserve-life"]);
  });

  it("is left out when the spenders are on the owner's own feature", () => {
    const own = owner({});
    (own.actions as unknown[]).push({ id: "turn-undead", name: "Turn Undead", activation: "action", cost: { [POOL]: 1 } });
    expect(actionsOf([own])).toEqual(["turn-undead"]);
  });

  it("is kept when nothing else spends the pool", () => {
    expect(actionsOf([owner({})])).toEqual(["channel-divinity"]);
  });

  it("is kept when it does something of its own", () => {
    for (const extra of [{ applies: "raging" }, { damage: "1d6" }, { save: { ability: "wis" } }, { text: "Do a thing." }, { range: "30 feet" }])
      expect(actionsOf([owner(extra), spender("turn-undead")]), JSON.stringify(extra)).toContain("channel-divinity");
  });

  it("is kept when the pool belongs to another feature", () => {
    const user = spender("borrowed");
    const pool = owner(undefined);
    expect(actionsOf([pool, user])).toEqual(["borrowed"]);
    const other = { ...spender("other"), id: "test:feature:other" } as Element;
    // An action that spends a pool someone else owns is not that feature's button for it.
    expect(actionsOf([pool, other, spender("third")])).toEqual(["other", "third"]);
  });

  it("is kept when it is named for something it does", () => {
    expect(actionsOf([owner({ name: "Smite" }), spender("turn-undead")])).toEqual(["channel-divinity", "turn-undead"]);
  });

  it("leaves a pool with no actions at all alone", () => {
    expect(actionsOf([owner(undefined)])).toEqual([]);
  });
});
