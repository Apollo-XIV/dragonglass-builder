import { describe, expect, it } from "vitest";
import { ContentIndex, type LoadedSource } from "../src/core/content";
import { validateElement } from "../src/core/content/validate";
import { checkRequirement, describeRequirement, type RequirementContext } from "../src/core/content/requirements";
import type { Element } from "../src/core/types";

const book = { id: "srd", kind: "sourcebook", name: "SRD", source: "srd", abbreviation: "SRD" };
const homebook = { id: "hb", kind: "sourcebook", name: "Homebrew", source: "hb", abbreviation: "HB" };

const kindDefs = [
  { id: "core:kind:species", kind: "kind", name: "Species", source: "core", key: "species", label: "Species", plural: "Species", aliases: ["race"] },
  { id: "core:kind:feat", kind: "kind", name: "Feat", source: "core", key: "feat", label: "Feat" },
  { id: "core:kind:fighting-style", kind: "kind", name: "Fighting Style", source: "core", key: "fighting-style", label: "Fighting Style" },
  { id: "core:book", kind: "sourcebook", name: "Core", source: "core", abbreviation: "CORE" },
  { id: "core:stat:ac", kind: "stat-path", name: "AC", source: "core", key: "ac", valueType: "number", base: 10 },
  { id: "core:stat:speed", kind: "stat-path", name: "Speed", source: "core", key: "speed.*", valueType: "number", base: 0 },
];

function source(id: string, elements: unknown[]): LoadedSource {
  return { id, elements };
}

describe("an action element declares what it costs", () => {
  const action = (activation?: unknown) => ({
    id: "srd:action:dash", kind: "action", name: "Dash", source: "srd",
    ...(activation === undefined ? {} : { activation }),
  });

  it("accepts a known activation", () => {
    const r = validateElement(action("action"));
    expect(r.usable).toBe(true);
    expect(r.diagnostics).toHaveLength(0);
  });

  it("rejects an action with no activation", () => {
    const r = validateElement(action());
    expect(r.usable).toBe(false);
    expect(r.diagnostics.map((d) => d.path)).toContain("activation");
  });

  it("warns about an activation it does not know, and keeps the element", () => {
    const r = validateElement(action("fortnight"));
    expect(r.usable).toBe(true);
    expect(r.diagnostics.map((d) => d.code)).toContain("unknown-activation");
  });

  it("treats a cost the rules leave open as special", () => {
    expect(validateElement(action("special")).diagnostics).toHaveLength(0);
  });

  it("does not ask an element that merely grants an action for one", () => {
    const r = validateElement({
      id: "srd:barbarian:rage", kind: "class-feature", name: "Rage", source: "srd",
      actions: [{ id: "rage", name: "Rage", activation: "bonus-action" }],
    });
    expect(r.usable).toBe(true);
    expect(r.diagnostics).toHaveLength(0);
  });
});

describe("skills are declared by content", () => {
  const skill = (id: string, name: string, ability: string, extra: Record<string, unknown> = {}) => ({
    id, kind: "skill", name, source: "srd", ability, ...extra,
  });

  it("rejects a skill with no ability, because nothing else knows what it rolls", () => {
    const r = validateElement({ id: "srd:skill:acrobatics", kind: "skill", name: "Acrobatics", source: "srd" });
    expect(r.usable).toBe(false);
    expect(r.diagnostics.map((d) => d.path)).toContain("ability");
  });

  it("rejects a skill whose ability is not one of the six", () => {
    const r = validateElement(skill("srd:skill:vibes", "Vibes", "luck"));
    expect(r.usable).toBe(false);
  });

  it("indexes a skill under its id's last segment", () => {
    const index = ContentIndex.build([
      source("srd", [book, skill("srd:skill:animal-handling", "Animal Handling", "wis")]),
    ]);
    expect(index.skillKeys()).toEqual(["animal-handling"]);
    expect(index.skillAbility("animal-handling")).toBe("wis");
    expect(index.skill("animal-handling")?.name).toBe("Animal Handling");
  });

  it("prefers an explicit key over the id, the way a class does", () => {
    const index = ContentIndex.build([
      source("srd", [book, skill("srd:skill:sleight", "Sleight of Hand", "dex", { key: "sleight-of-hand" })]),
    ]);
    expect(index.skillKeys()).toEqual(["sleight-of-hand"]);
    expect(index.skillAbility("sleight-of-hand")).toBe("dex");
  });

  it("knows no skills when no source declares any", () => {
    const index = ContentIndex.build([source("srd", [book])]);
    expect(index.skillKeys()).toEqual([]);
    expect(index.skillAbility("acrobatics")).toBeUndefined();
  });

  it("lets a later source add a skill of its own", () => {
    const index = ContentIndex.build([
      source("srd", [book, skill("srd:skill:arcana", "Arcana", "int")]),
      source("hb", [homebook, { ...skill("hb:skill:piloting", "Piloting", "dex"), source: "hb" }]),
    ]);
    expect(index.skillKeys().sort()).toEqual(["arcana", "piloting"]);
    expect(index.skillAbility("piloting")).toBe("dex");
  });
});

describe("validateElement", () => {
  it("accepts a minimal element", () => {
    const r = validateElement({ id: "a", kind: "feat", name: "A", source: "srd" });
    expect(r.usable).toBe(true);
    expect(r.diagnostics).toHaveLength(0);
  });

  it("rejects an element missing required fields", () => {
    const r = validateElement({ kind: "feat", name: "A" });
    expect(r.usable).toBe(false);
    expect(r.diagnostics.map((d) => d.path)).toContain("id");
    expect(r.diagnostics.map((d) => d.path)).toContain("source");
  });

  it("warns but stays usable for an unknown op", () => {
    const r = validateElement({
      id: "a", kind: "feat", name: "A", source: "srd",
      modifiers: [{ target: "ac", op: "reticulate", value: 1 }],
    });
    expect(r.usable).toBe(true);
    expect(r.diagnostics[0].code).toBe("unknown-op");
  });

  it("warns on an unparseable expression without failing the element", () => {
    const r = validateElement({
      id: "a", kind: "feat", name: "A", source: "srd",
      modifiers: [{ target: "ac", op: "add", value: "floor(" }],
    });
    expect(r.usable).toBe(true);
    expect(r.diagnostics[0].code).toBe("expression-error");
  });

  it("requires a value for arithmetic ops but not for advantage", () => {
    expect(validateElement({ id: "a", kind: "feat", name: "A", source: "srd", modifiers: [{ target: "ac", op: "add" }] }).usable).toBe(false);
    expect(validateElement({ id: "a", kind: "feat", name: "A", source: "srd", modifiers: [{ target: "saves.str", op: "advantage" }] }).usable).toBe(true);
  });

  it("validates choices", () => {
    const bad = validateElement({ id: "a", kind: "feat", name: "A", source: "srd", choices: [{ id: "c", count: 1 }] });
    expect(bad.usable).toBe(false);
    const good = validateElement({ id: "a", kind: "feat", name: "A", source: "srd", choices: [{ id: "c", count: 1, from: { kind: "feat" } }] });
    expect(good.usable).toBe(true);
  });

  it("validates resources and actions", () => {
    const r = validateElement({
      id: "a", kind: "feat", name: "A", source: "srd",
      resources: [{ id: "r", name: "R", max: "@prof", recharge: "long-rest" }],
      actions: [{ id: "x", activation: "bonus-action", cost: { r: 1 } }],
    });
    expect(r.diagnostics).toHaveLength(0);
    const badCost = validateElement({
      id: "a", kind: "feat", name: "A", source: "srd",
      actions: [{ id: "x", activation: "action", cost: { r: "lots" } }],
    });
    expect(badCost.usable).toBe(false);
  });

  it("validates level entries and warns on unknown level parts", () => {
    const r = validateElement({
      id: "c", kind: "class", name: "C", source: "srd", hitDie: "d8",
      levels: { "1": { grants: ["x"] }, "2": { sparkles: [] } },
    });
    expect(r.usable).toBe(true);
    expect(r.diagnostics.map((d) => d.code)).toContain("unknown-part");
  });

  it("keeps x- extensions without complaint", () => {
    const r = validateElement({ id: "a", kind: "feat", name: "A", source: "srd", "x-foundry": { icon: "x.png" } });
    expect(r.diagnostics).toHaveLength(0);
  });
});

describe("ContentIndex", () => {
  it("indexes by id, kind and tag", () => {
    const index = ContentIndex.build([
      source("core", kindDefs),
      source("srd", [book, { id: "srd:feat:alert", kind: "feat", name: "Alert", source: "srd", tags: ["general-feat"] }]),
    ]);
    expect(index.get("srd:feat:alert")?.name).toBe("Alert");
    expect(index.byKind("feat")).toHaveLength(1);
    expect(index.query({ tags: ["general-feat"] })).toHaveLength(1);
  });

  it("translates legacy kinds through aliases", () => {
    const index = ContentIndex.build([
      source("core", kindDefs),
      source("srd", [book, { id: "srd:race:dwarf", kind: "race", name: "Dwarf", source: "srd" }]),
    ]);
    expect(index.get("srd:race:dwarf")?.kind).toBe("species");
    expect(index.byKind("species")).toHaveLength(1);
    expect(index.byKind("race")).toHaveLength(0);
  });

  it("resolves collisions by source priority and records the override", () => {
    const srdFeat = { id: "srd:feat:alert", kind: "feat", name: "Alert", source: "srd" };
    const hbFeat = { id: "srd:feat:alert", kind: "feat", name: "Alert (buffed)", source: "hb" };
    const index = ContentIndex.build([
      source("hb", [homebook, hbFeat]),
      source("core", kindDefs),
      source("srd", [book, srdFeat]),
    ]);
    expect(index.get("srd:feat:alert")?.name).toBe("Alert (buffed)");
    expect(index.overrideFor("srd:feat:alert")).toEqual({ id: "srd:feat:alert", winner: "hb", shadowed: ["srd"] });
  });

  it("flags duplicate ids inside one source", () => {
    const index = ContentIndex.build([
      source("core", kindDefs),
      source("srd", [book, { id: "x", kind: "feat", name: "A", source: "srd" }, { id: "x", kind: "feat", name: "B", source: "srd" }]),
    ]);
    expect(index.diagnostics.some((d) => d.code === "duplicate-id")).toBe(true);
    expect(index.get("x")?.name).toBe("A");
  });

  it("reports missing sourcebooks, unknown kinds and unresolved grants", () => {
    const index = ContentIndex.build([
      source("core", kindDefs),
      source("srd", [
        book,
        { id: "a", kind: "mystery", name: "A", source: "nope", grants: ["b"] },
      ]),
    ]);
    const codes = index.diagnostics.map((d) => d.code);
    expect(codes).toContain("missing-source");
    expect(codes).toContain("unknown-kind");
    expect(codes).toContain("unresolved-reference");
  });

  it("matches stat paths including wildcards", () => {
    const index = ContentIndex.build([source("core", kindDefs)]);
    expect(index.statPath("ac")?.key).toBe("ac");
    expect(index.statPath("speed.walk")?.key).toBe("speed.*");
    expect(index.statPath("speed.fly.hover")).toBeUndefined();
    expect(index.statPath("nonsense")).toBeUndefined();
  });

  it("treats every filter criterion as a constraint, not a union", () => {
    const styles: Element[] = [
      { id: "fs:defense", kind: "fighting-style", name: "Defense", source: "srd", tags: ["paladin-fighting-style", "fighter-fighting-style"] },
      { id: "fs:archery", kind: "fighting-style", name: "Archery", source: "srd", tags: ["fighter-fighting-style"] },
      { id: "feat:alert", kind: "feat", name: "Alert", source: "srd" },
    ];
    const index = ContentIndex.build([source("core", kindDefs), source("srd", [book, ...styles])]);
    expect(index.query({ kind: "fighting-style", tags: ["paladin-fighting-style"] }).map((e) => e.id)).toEqual(["fs:defense"]);
    expect(index.query({ kind: "fighting-style" })).toHaveLength(2);
    // ids narrow the set rather than widening it, so "these six skills" means six.
    expect(index.query({ kind: "fighting-style", ids: ["fs:defense", "feat:alert"] }).map((e) => e.id)).toEqual(["fs:defense"]);
    expect(index.query({ ids: ["fs:defense", "feat:alert"] }).map((e) => e.id).sort()).toEqual(["feat:alert", "fs:defense"]);
    expect(index.query({ kind: "fighting-style", exclude: ["fs:archery"] }).map((e) => e.id)).toEqual(["fs:defense"]);
    expect(index.query({ ids: ["fs:defense"], exclude: ["fs:defense"] })).toEqual([]);
  });

  it("resolves classes by short key and full id", () => {
    const index = ContentIndex.build([
      source("core", [...kindDefs, { id: "core:kind:class", kind: "kind", name: "Class", source: "core", key: "class", label: "Class" }]),
      source("srd", [book, { id: "srd:class:monk", kind: "class", name: "Monk", source: "srd", hitDie: "d8" }]),
    ]);
    expect(index.classByRef("monk")?.id).toBe("srd:class:monk");
    expect(index.classByRef("srd:class:monk")?.id).toBe("srd:class:monk");
    expect(index.classByRef("bard")).toBeUndefined();
  });
});

describe("requirements", () => {
  const ctx: RequirementContext = {
    totalLevel: 5,
    classLevel: (c) => ({ paladin: 5, "srd:class:paladin": 5 })[c] ?? 0,
    abilityScore: (a) => ({ str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 13 })[a],
    has: (id) => id === "srd:paladin:rage",
    hasProficiency: (p) => p === "stealth",
    isSpellcaster: true,
    nameOf: (id) => (id === "srd:paladin:rage" ? "Rage" : undefined),
  };

  it("passes an `all` requirement that is met", () => {
    expect(checkRequirement({ all: [{ type: "ability", ability: "str", min: 13 }] }, ctx).met).toBe(true);
  });

  it("explains an unmet requirement", () => {
    const r = checkRequirement({ all: [{ type: "ability", ability: "dex", min: 13 }] }, ctx);
    expect(r.met).toBe(false);
    expect(r.reasons[0]).toBe("DEX 13 (you have 10)");
  });

  it("handles any and not", () => {
    expect(checkRequirement({ any: [{ type: "ability", ability: "dex", min: 13 }, { type: "ability", ability: "str", min: 13 }] }, ctx).met).toBe(true);
    expect(checkRequirement({ not: [{ type: "has", id: "srd:paladin:rage" }] }, ctx).met).toBe(false);
  });

  it("checks class level, total level, has, proficiency and spellcaster", () => {
    expect(checkRequirement({ all: [{ type: "class-level", class: "paladin", min: 5 }] }, ctx).met).toBe(true);
    expect(checkRequirement({ all: [{ type: "class-level", class: "monk", min: 1 }] }, ctx).met).toBe(false);
    expect(checkRequirement({ all: [{ type: "level", min: 6 }] }, ctx).met).toBe(false);
    expect(checkRequirement({ all: [{ type: "has", id: "srd:paladin:rage" }] }, ctx).met).toBe(true);
    expect(checkRequirement({ all: [{ type: "proficiency", proficiency: "stealth" }] }, ctx).met).toBe(true);
    expect(checkRequirement({ all: [{ type: "spellcaster" }] }, ctx).met).toBe(true);
  });

  it("ignores unknown predicate types rather than blocking", () => {
    expect(checkRequirement({ all: [{ type: "vibes", min: 3 } as never] }, ctx).met).toBe(true);
  });

  it("prefers authored text when given", () => {
    const r = checkRequirement({ text: "Oath of Devotion only", all: [{ type: "level", min: 99 }] }, ctx);
    expect(r.reasons).toEqual(["Oath of Devotion only"]);
    expect(describeRequirement({ text: "Oath of Devotion only" })).toBe("Oath of Devotion only");
  });

  it("describes requirements for the info panel", () => {
    expect(describeRequirement({ all: [{ type: "ability", ability: "str", min: 13 }, { type: "has", id: "srd:paladin:rage" }] }, ctx)).toBe("STR 13, Rage");
  });

  it("treats no requirement as met", () => {
    expect(checkRequirement(undefined, ctx).met).toBe(true);
  });
});

describe("fluff is an optional enhancement", () => {
  const species = (fluff?: unknown) => ({
    id: "srd:species:dwarf", kind: "species", name: "Dwarf", source: "srd",
    ...(fluff === undefined ? {} : { fluff }),
  });

  it("is not required", () => {
    const r = validateElement(species());
    expect(r.usable).toBe(true);
    expect(r.diagnostics).toHaveLength(0);
  });

  it("accepts a string", () => {
    expect(validateElement(species("Kingdoms rich in ancient grandeur.")).diagnostics).toHaveLength(0);
  });

  it("warns about anything else and keeps the element", () => {
    const r = validateElement(species(["not", "markdown"]));
    expect(r.usable).toBe(true);
    expect(r.diagnostics.map((d) => d.path)).toContain("fluff");
  });
});
