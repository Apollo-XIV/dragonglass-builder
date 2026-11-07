/**
 * How a granted spell is held: always prepared and free (the default), or learned into the
 * spells known or the spellbook, counting against the class's limits or not.
 */

import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import { resolve } from "../src/core/resolver/resolve";
import type { Element, Grant, SpellEntry } from "../src/core/types";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const spell = (n: string, spellLevel: number, tags = ["wizard-spell"]): Element =>
  ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel, tags }) as Element;

const wizard = (grants: Grant[]): Element =>
  ({
    id: "test:class:wizard", kind: "class", name: "Wizardish", source: "test", key: "wizard", hitDie: "d6",
    spellcasting: { ability: "int", progression: "full", type: "spellbook", list: "wizard-spell", prepared: 4, spellbook: 6 },
    levels: { "1": { grants } },
  }) as Element;

const content = (grants: Grant[]) =>
  testIndex([TEST_BOOK, wizard(grants), spell("sleep", 1), spell("shield", 1), spell("cure-wounds", 1, ["cleric-spell"]), spell("light", 0)]);

function character(grants: Grant[], spells: SpellEntry[] = []) {
  return resolve({
    content: content(grants),
    build: build({ abilities: { method: "manual", base: scores({ int: 16 }) }, levels: [{ class: "test:class:wizard", hp: "average", choices: {} }] }),
    spells: { kind: "spells", schemaVersion: 1, spells },
  });
}
const find = (c: ReturnType<typeof character>, n: string) => c.spellcasting!.spells.find((s) => s.id === `test:spell:${n}`);
const codes = (c: ReturnType<typeof character>) => c.diagnostics.map((d) => d.code);

describe("a spell grant with no mode", () => {
  it("is always prepared and free, as before", () => {
    const c = character(["test:spell:cure-wounds"]);
    expect(find(c, "cure-wounds")).toMatchObject({ alwaysPrepared: true, prepared: true, learned: false, free: false });
    expect(c.spellcasting!.limits[0]!.spellbook.used).toBe(0);
  });

  it("is the same with the mode spelled out", () => {
    const c = character([{ id: "test:spell:cure-wounds", mode: "always-prepared" }]);
    expect(find(c, "cure-wounds")).toMatchObject({ alwaysPrepared: true, learned: false });
  });
});

describe("a learned spell grant", () => {
  const learned = (counts?: boolean): Grant => ({ id: "test:spell:cure-wounds", mode: "learned", ...(counts === undefined ? {} : { counts }) });

  it("is held but not prepared, and is not checked against the class list", () => {
    const c = character([learned()]);
    expect(find(c, "cure-wounds")).toMatchObject({ learned: true, free: false, alwaysPrepared: false, prepared: false, class: "test:class:wizard" });
    expect(codes(c)).not.toContain("spell-mismatch");
  });

  it("counts against the book and the preparation cap by default", () => {
    const c = character([learned()], [{ id: "test:spell:cure-wounds", prepared: true }]);
    const limits = c.spellcasting!.limits[0]!;
    expect(limits.spellbook.used).toBe(1);
    expect(limits.prepared.used).toBe(1);
    expect(find(c, "cure-wounds")!.prepared).toBe(true);
  });

  it("takes the player's preparation from the spells file, and does not list it twice", () => {
    const c = character([learned()], [{ id: "test:spell:cure-wounds", prepared: true }]);
    expect(c.spellcasting!.spells.filter((s) => s.id === "test:spell:cure-wounds")).toHaveLength(1);
  });

  it("takes no room with counts: false, but can still be prepared (and that counts)", () => {
    const free = character([learned(false)]);
    expect(find(free, "cure-wounds")).toMatchObject({ learned: true, free: true });
    expect(free.spellcasting!.limits[0]!.spellbook.used).toBe(0);
    const prepared = character([learned(false)], [{ id: "test:spell:cure-wounds", prepared: true }]);
    expect(prepared.spellcasting!.limits[0]!.spellbook.used).toBe(0);
  });

  it("counts a cantrip as a cantrip known", () => {
    const c = character([{ id: "test:spell:light", mode: "learned" }]);
    expect(c.spellcasting!.limits[0]!.cantrips.used).toBe(1);
  });
});

describe("validating a grant's mode", () => {
  const check = (grants: unknown) => validateElement({ id: "a", kind: "feature", name: "A", source: "srd", grants });

  it("accepts the modes", () => {
    expect(check([{ id: "x", mode: "learned", counts: false }, { id: "y", mode: "always-prepared" }, "z"]).diagnostics).toEqual([]);
  });

  it("warns on an unknown mode, and on counts without learned", () => {
    const r = check([{ id: "x", mode: "owned" }, { id: "y", counts: false }]);
    expect(r.usable).toBe(true);
    expect(r.diagnostics.map((d) => d.path)).toEqual(["grants[0].mode", "grants[1].counts"]);
  });

  it("is read in a level entry too", () => {
    const r = validateElement({ id: "c", kind: "class", name: "C", source: "srd", hitDie: "d8", levels: { "1": { grants: [{ id: "x", mode: "owned" }] } } });
    expect(r.diagnostics.map((d) => d.path)).toEqual(["levels.1.grants[0].mode"]);
  });
});
