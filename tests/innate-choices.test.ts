/**
 * Innate spells whose ability or spell is a player's choice: a 2024 lineage picks one
 * casting ability for all its spells, Magic Initiate picks the spell itself.
 */

import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import { resolve } from "../src/core/resolver/resolve";
import type { Element } from "../src/core/types";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const spell = (n: string, spellLevel: number, tags: string[] = []): Element =>
  ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel, tags }) as Element;

const ability = (a: string): Element =>
  ({ id: `test:casting-ability:${a}`, kind: "casting-ability", name: a, source: "test", ability: a }) as Element;

const LINEAGE: Element = {
  id: "test:species:lineage", kind: "species", name: "Lineage", source: "test",
  choices: [{ id: "lineage-ability", count: 1, from: { kind: "casting-ability" } }],
  innateSpells: [
    { spell: "test:spell:light", ability: { choice: "lineage-ability" } },
    { spell: "test:spell:misty-step", ability: { choice: "lineage-ability" }, uses: 1,
      recharge: [{ on: "long-rest", amount: "all" }] },
  ],
} as Element;

const INITIATE: Element = {
  id: "test:feat:initiate", kind: "feat", name: "Initiate", source: "test",
  choices: [
    { id: "initiate-ability", count: 1, from: { kind: "casting-ability" } },
    { id: "initiate-spell", count: 1, from: { kind: "spell", tags: ["wizard-spell"] } },
  ],
  innateSpells: [
    { spell: { choice: "initiate-spell" }, ability: { choice: "initiate-ability" }, uses: 1,
      recharge: [{ on: "long-rest", amount: "all" }] },
  ],
} as Element;

const content = testIndex([
  TEST_BOOK, LINEAGE, INITIATE, ability("int"), ability("wis"), ability("cha"),
  spell("light", 0), spell("misty-step", 2), spell("sleep", 1, ["wizard-spell"]), spell("shield", 1, ["wizard-spell"]),
]);

const make = (over: Parameters<typeof build>[0]) =>
  resolve({ content, build: build({ abilities: { method: "manual", base: scores({ int: 14, wis: 12, cha: 16 }) }, ...over }) });
const find = (c: ReturnType<typeof make>, n: string) => c.spellcasting?.spells.find((s) => s.id === `test:spell:${n}`);

describe("an ability chosen once for a lineage", () => {
  it("is used by every innate spell that names the choice", () => {
    const c = make({ species: LINEAGE.id, choices: { "lineage-ability": ["test:casting-ability:wis"] } });
    expect(find(c, "light")!.innate[0]).toMatchObject({ ability: "wis", dc: 11 });
    expect(find(c, "misty-step")!.innate[0]).toMatchObject({ ability: "wis", dc: 11 });
  });

  it("follows the answer when it changes", () => {
    const c = make({ species: LINEAGE.id, choices: { "lineage-ability": ["test:casting-ability:cha"] } });
    expect(find(c, "light")!.innate[0]).toMatchObject({ ability: "cha", dc: 13 });
  });

  it("leaves the ability unset until the choice is answered", () => {
    const c = make({ species: LINEAGE.id });
    expect(find(c, "light")!.innate[0]!.ability).toBeUndefined();
    expect(find(c, "light")!.innate[0]!.dc).toBeUndefined();
  });
});

describe("a spell chosen by the player", () => {
  const picked = { "initiate-ability": ["test:casting-ability:int"], "initiate-spell": ["test:spell:sleep"] };

  it("is prepared and free as a pick, and casts once without a slot", () => {
    const c = make({ background: INITIATE.id, choices: picked });
    const sleep = find(c, "sleep")!;
    expect(sleep).toMatchObject({ prepared: true, alwaysPrepared: true, innateOnly: false });
    expect(sleep.innate).toHaveLength(1);
    expect(sleep.innate[0]).toMatchObject({ ability: "int", dc: 12, resource: "test:feat:initiate:innate-sleep" });
    expect(c.resources.find((r) => r.key === "test:feat:initiate:innate-sleep")).toMatchObject({ max: 1, remaining: 1 });
  });

  it("does nothing, and owns no pool, until it is answered", () => {
    const c = make({ background: INITIATE.id });
    expect(c.spellcasting?.spells ?? []).toEqual([]);
    expect(c.resources.some((r) => r.key.includes("innate-"))).toBe(false);
  });

  it("moves its pool with a different pick", () => {
    const c = make({ background: INITIATE.id, choices: { ...picked, "initiate-spell": ["test:spell:shield"] } });
    expect(find(c, "sleep")).toBeUndefined();
    expect(find(c, "shield")!.innate[0]!.resource).toBe("test:feat:initiate:innate-shield");
  });
});

describe("validating a choice reference", () => {
  const el = (innateSpells: unknown, choices: unknown = [{ id: "a", count: 1, from: { kind: "spell" } }]) =>
    validateElement({ id: "x", kind: "feat", name: "X", source: "srd", choices, innateSpells });

  it("accepts a reference to a sibling choice", () => {
    expect(el([{ spell: { choice: "a" }, ability: { choice: "a" } }]).diagnostics).toEqual([]);
  });

  it("warns about a choice nothing declares", () => {
    const r = el([{ spell: { choice: "nope" } }]);
    expect(r.usable).toBe(true);
    expect(r.diagnostics.map((d) => d.code)).toContain("unresolved-reference");
  });

  it("refuses a reference with no choice id", () => {
    expect(el([{ spell: {} }]).usable).toBe(false);
  });

  it("looks beside the part in a level entry, not at the element", () => {
    const r = validateElement({
      id: "c", kind: "class", name: "C", source: "srd", hitDie: "d8",
      levels: { "1": { choices: [{ id: "a", count: 1, from: { kind: "spell" } }], innateSpells: [{ spell: { choice: "a" } }] } },
    });
    expect(r.diagnostics).toEqual([]);
  });
});

describe("the save DC of an innate spell's own action", () => {
  const withAction = (n: string): Element =>
    ({ ...spell(n, 0), actions: [{ id: "cast", name: n, activation: "action", save: { ability: "dex" } }] }) as Element;
  const lineage = { ...LINEAGE, grants: ["test:spell:light"] } as Element;
  const index = testIndex([TEST_BOOK, lineage, ability("int"), ability("wis"), ability("cha"), withAction("light"), spell("misty-step", 2)]);

  it("uses the casting ability the grant chose, not the bare 8 + proficiency", () => {
    const c = resolve({
      content: index,
      build: build({ abilities: { method: "manual", base: scores({ wis: 12, cha: 16 }) }, species: LINEAGE.id, choices: { "lineage-ability": ["test:casting-ability:cha"] } }),
    });
    const action = c.actions.find((a) => a.name === "light");
    expect(action?.save?.dc).toBe(8 + c.proficiencyBonus.value + 3);
    expect(action?.save?.dc).toBe(c.spellcasting!.spells.find((s) => s.id === "test:spell:light")!.innate[0]!.dc);
  });
});
