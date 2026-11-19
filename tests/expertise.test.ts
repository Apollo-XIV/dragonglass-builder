/**
 * Expertise as a choice over `expertise` elements: what the picker lists, what it marks
 * as already doubled, and which picks count. Validity is never stored, so a pick whose
 * proficiency goes away is inert until the proficiency returns.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import type { BuildFile, Element, Modifier } from "../src/core/types";
import { build, testIndex, TEST_BOOK } from "./helpers";

const skill = (key: string): Element => ({
  id: `test:skill:${key}`, kind: "skill", name: key, source: "test", ability: "dex",
  modifiers: [{ target: `skills.${key}`, op: "proficiency", value: "proficient" }],
});
const KEYS = ["stealth", "arcana", "athletics"];
const skillExpertise = (key: string): Element => ({
  id: `test:expertise:${key}`, kind: "expertise", name: key, source: "test", tags: ["expertise-skill"],
  modifiers: [{ target: `skills.${key}`, op: "proficiency", value: "expertise" }],
  requires: { all: [{ type: "proficiency", proficiency: key }] },
});
const thievesTools: Element = { id: "test:tool:thieves-tools", kind: "tool", name: "Thieves' Tools", source: "test",
  modifiers: [{ target: "proficiencies.tool", op: "include", value: ["test:tool:thieves-tools"] }],
};
const toolExpertise: Element = {
  id: "test:expertise:thieves-tools", kind: "expertise", name: "Thieves' Tools", source: "test", tags: ["expertise-tool"],
  modifiers: [{ target: "proficiencies.tool-expertise", op: "include", value: [thievesTools.id] }],
  requires: { all: [{ type: "proficiency", proficiency: thievesTools.id }] },
};

const species = (id: string, grants: string[], modifiers: Modifier[] = []): Element => ({
  id, kind: "species", name: id, source: "test", grants, modifiers,
});

const rogue: Element = {
  id: "test:class:rogue", kind: "class", name: "Rogue", source: "test", hitDie: 8,
  levels: {
    1: { choices: [{ id: "rogue:expertise-1", count: 2, from: { kind: "expertise" } }] },
    2: { choices: [{ id: "rogue:expertise-2", count: 1, from: { kind: "expertise", tags: ["expertise-skill"] } }] },
  },
} as Element;

const plain = species("test:species:plain", KEYS.map((k) => `test:skill:${k}`));
const jack = species("test:species:jack", [], [{ target: "skills.stealth", op: "proficiency", value: "half" }]);
const dwarf = species("test:species:dwarf", [...KEYS.slice(0, 2).map((k) => `test:skill:${k}`), thievesTools.id],
  [{ target: "skills.arcana", op: "proficiency", value: "expertise" }]);

const index = testIndex([
  TEST_BOOK, ...KEYS.map(skill), ...KEYS.map(skillExpertise), thievesTools, toolExpertise, rogue, plain, jack, dwarf,
]);

const lvl = (choices: Record<string, string[]> = {}) => ({ class: rogue.id, hp: "average" as const, choices });
const ex = (k: string) => `test:expertise:${k}`;

function run(b: Partial<BuildFile>, enforceRequirements = false) {
  return resolve({ content: index, build: build({ species: plain.id, ...b }), options: { enforceRequirements } });
}
const choiceOf = (r: ReturnType<typeof run>, id: string) => r.pendingChoices.find((c) => c.id === id)!;

describe("expertise picker", () => {
  it("does not list a skill the character is not proficient in, with enforcement off", () => {
    const r = run({ species: dwarf.id, levels: [lvl()] });
    const names = choiceOf(r, "rogue:expertise-1").options.map((o) => o.name);
    expect(names).toEqual(expect.arrayContaining(["stealth", "arcana", "Thieves' Tools"]));
    expect(names).not.toContain("athletics");
  });

  it("does not count half proficiency as proficiency", () => {
    const r = run({ species: jack.id, levels: [lvl()] });
    expect(choiceOf(r, "rogue:expertise-1").options).toHaveLength(0);
  });

  it("marks a skill already doubled by the species, with where from, and leaves it listed", () => {
    const r = run({ species: dwarf.id, levels: [lvl()] });
    const opts = Object.fromEntries(choiceOf(r, "rogue:expertise-1").options.map((o) => [o.name, o.heldBy]));
    expect(opts.arcana).toBe("test:species:dwarf");
    expect(opts.stealth).toBeUndefined();
  });

  it("marks a tool doubled elsewhere", () => {
    const withTool = species("test:species:tooled", [thievesTools.id], [toolExpertise.modifiers![0]]);
    const idx = testIndex([TEST_BOOK, ...KEYS.map(skill), ...KEYS.map(skillExpertise), thievesTools, toolExpertise, rogue, withTool]);
    const r = resolve({ content: idx, build: build({ species: withTool.id, levels: [lvl()] }) });
    expect(choiceOf(r, "rogue:expertise-1").options.find((o) => o.id === toolExpertise.id)!.heldBy).toBe("test:species:tooled");
  });

  it("does not count a choice's own picks against it, nor another choice's as held for the same pick", () => {
    const r = run({ levels: [lvl({ "rogue:expertise-1": [ex("stealth")] })] });
    expect(choiceOf(r, "rogue:expertise-1").options.find((o) => o.name === "stealth")!.heldBy).toBeUndefined();
  });
});

describe("expertise picks", () => {
  it("double the skill", () => {
    const r = run({ levels: [lvl({ "rogue:expertise-1": [ex("stealth"), ex("arcana")] })] });
    expect(r.skills.find((s) => s.key === "stealth")!.stat.value).toBeGreaterThan(
      run({ levels: [lvl()] }).skills.find((s) => s.key === "stealth")!.stat.value,
    );
  });

  it("cannot double the same skill twice: the earlier choice wins and the later goes inert", () => {
    const r = run({
      levels: [lvl({ "rogue:expertise-1": [ex("stealth"), ex("arcana")] }), lvl({ "rogue:expertise-2": [ex("stealth")] })],
    });
    expect(choiceOf(r, "rogue:expertise-1").invalid).toEqual([]);
    expect(choiceOf(r, "rogue:expertise-2").invalid).toEqual([ex("stealth")]);
    const once = run({ levels: [lvl({ "rogue:expertise-1": [ex("stealth"), ex("arcana")] })] });
    expect(r.skills.find((s) => s.key === "stealth")!.stat.value).toBe(once.skills.find((s) => s.key === "stealth")!.stat.value);
  });

  it("is inert when the skill is already doubled by the species, and does not raise it further", () => {
    const r = run({ species: dwarf.id, levels: [lvl({ "rogue:expertise-1": [ex("arcana")] })] });
    expect(choiceOf(r, "rogue:expertise-1").invalid).toEqual([ex("arcana")]);
  });

  it("goes inert with the proficiency, stays in the file, and comes back with it", () => {
    const picks = { "rogue:expertise-1": [ex("athletics")] };
    const lost = run({ species: dwarf.id, levels: [lvl(picks)] });
    expect(choiceOf(lost, "rogue:expertise-1").invalid).toEqual([ex("athletics")]);
    const lostValue = lost.skills.find((s) => s.key === "athletics")!.stat.value;

    const back = run({ species: plain.id, levels: [lvl(picks)] });
    expect(choiceOf(back, "rogue:expertise-1").invalid).toEqual([]);
    expect(back.skills.find((s) => s.key === "athletics")!.stat.value).toBeGreaterThan(lostValue);
  });

  it("does not let a pick vouch for itself: without proficiency it adds nothing", () => {
    const r = run({ species: dwarf.id, levels: [lvl({ "rogue:expertise-1": [ex("athletics")] })] });
    const base = run({ species: dwarf.id, levels: [lvl()] });
    expect(r.skills.find((s) => s.key === "athletics")!.stat.value).toBe(base.skills.find((s) => s.key === "athletics")!.stat.value);
  });

  it("leaves another choice's live pick alone when a pick offered is taken", () => {
    const r = run({ levels: [lvl({ "rogue:expertise-1": [ex("stealth"), ex("arcana")] }), lvl({ "rogue:expertise-2": [ex("athletics")] })] });
    expect(choiceOf(r, "rogue:expertise-1").invalid).toEqual([]);
    expect(choiceOf(r, "rogue:expertise-2").invalid).toEqual([]);
  });
});
