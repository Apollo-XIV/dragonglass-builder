/** The grant tree: what a species or background brought, set out under it. */

import { describe, expect, it } from "vitest";
import { choiceKey, choicesIn, grantChildren, levelChildren, type GrantNode } from "../src/core/resolver/grant-tree";
import { resolve } from "../src/core/resolver/resolve";
import type { Element } from "../src/core/types";
import { build, testIndex, TEST_BOOK } from "./helpers";

const el = (id: string, kind: string, extra: Partial<Element> = {}): Element => ({
  id,
  kind,
  name: id.split(":").pop()!,
  source: "test",
  ...extra,
});

const elements: Element[] = [
  TEST_BOOK,
  el("test:species:elf", "species", {
    grants: ["test:elf:darkvision"],
    choices: [{ id: "test:elf:cantrip", name: "Cantrip", count: 1, from: { kind: "spell" } }],
  }),
  el("test:elf:darkvision", "species-trait"),
  el("test:spell:light", "spell"),
  el("test:background:sage", "background", {
    grants: ["test:skill:arcana"],
    choices: [{ id: "test:sage:feat", name: "Origin feat", count: 1, from: { kind: "feat" } }],
  }),
  el("test:skill:arcana", "skill", { ability: "int" }),
  el("test:feat:initiate", "feat", {
    grants: ["test:initiate:note"],
    choices: [{ id: "test:initiate:list", name: "Spell list", count: 1, from: { kind: "spell" } }],
  }),
  el("test:initiate:note", "feature"),
  el("test:species:tiefling", "species", {
    innateSpells: [{ spell: "test:spell:light" }],
    levelsBy: "character",
    levels: {
      "3": { innateSpells: [{ spell: "test:spell:rebuke" }] },
      "5": {
        grants: ["test:tiefling:horns"],
        choices: [{ id: "test:tiefling:boon", name: "Boon", count: 1, from: { kind: "feat" }, text: "Pick a boon." }],
      },
    },
  }),
  el("test:spell:rebuke", "spell"),
  el("test:tiefling:horns", "species-trait"),
  { ...el("test:class:hero", "class"), hitDie: "d8" } as Element,
];

const index = testIndex(elements);
const get = (id: string): Element | undefined => index.get(id);

function character(choices: Record<string, string[]> = {}): ReturnType<typeof resolve> {
  return resolve({
    content: index,
    build: build({ species: "test:species:elf", background: "test:background:sage", choices }),
  });
}

/** A tree as nested labels, so the shape reads at a glance in an assertion. */
function shape(nodes: GrantNode[]): unknown[] {
  return nodes.map((node) => {
    const label =
      node.type === "element"
        ? node.element.id
        : node.type === "choice"
          ? `? ${node.choice.id}`
          : node.type === "spell"
            ? `spell ${node.spell.id}${node.level ? ` @${node.level}` : ""}`
            : `later ${node.name} @${node.level}`;
    return node.children.length ? [label, shape(node.children)] : label;
  });
}

describe("grantChildren", () => {
  it("lists grants, then choices, under the element that brought them", () => {
    const c = character();
    expect(shape(grantChildren(c, "test:species:elf", get))).toEqual(["test:elf:darkvision", "? test:elf:cantrip"]);
    expect(shape(grantChildren(c, "test:background:sage", get))).toEqual(["test:skill:arcana", "? test:sage:feat"]);
  });

  it("leaves a pick to its choice rather than listing it as a grant", () => {
    const c = character({ "test:elf:cantrip": ["test:spell:light"] });
    expect(shape(grantChildren(c, "test:species:elf", get))).toEqual(["test:elf:darkvision", "? test:elf:cantrip"]);
  });

  it("nests what a pick brought under the choice that made it", () => {
    const c = character({ "test:sage:feat": ["test:feat:initiate"] });
    expect(shape(grantChildren(c, "test:background:sage", get))).toEqual([
      "test:skill:arcana",
      ["? test:sage:feat", ["test:initiate:note", "? test:initiate:list"]],
    ]);
  });

  it("finds every choice in a tree, however deep", () => {
    const c = character({ "test:sage:feat": ["test:feat:initiate"] });
    const keys = choicesIn(grantChildren(c, "test:background:sage", get)).map(choiceKey);
    const expected = c.pendingChoices
      .filter((choice) => choice.id === "test:sage:feat" || choice.id === "test:initiate:list")
      .map(choiceKey);
    expect(keys).toEqual(expected);
  });

  it("lists innate spells, and greys what a character level not yet reached brings", () => {
    const at = (level: number) =>
      resolve({
        content: index,
        build: build({
          species: "test:species:tiefling",
          levels: Array.from({ length: level }, () => ({ class: "test:class:hero", hp: "average" as const })),
        }),
      });
    expect(shape(grantChildren(at(1), "test:species:tiefling", get))).toEqual([
      "spell test:spell:light",
      "later rebuke @3",
      "later horns @5",
      "later Boon @5",
    ]);
    expect(shape(grantChildren(at(5), "test:species:tiefling", get))).toEqual([
      "test:tiefling:horns",
      "spell test:spell:light",
      "spell test:spell:rebuke @3",
      "? test:tiefling:boon",
    ]);
  });
});

describe("levelChildren", () => {
  const patron = [
    TEST_BOOK,
    {
      ...el("test:class:warlock", "class"),
      hitDie: "d8",
      levels: {
        "1": {
          grants: ["test:warlock:pact-magic"],
          choices: [{ id: "test:warlock:patron", name: "Patron", count: 1, from: { kind: "subclass" } }],
        },
        "2": { grants: ["test:warlock:invocations"] },
      },
    } as Element,
    el("test:warlock:pact-magic", "class-feature"),
    el("test:warlock:invocations", "class-feature"),
    el("test:subclass:fiend", "subclass", {
      levels: {
        "1": { grants: ["test:fiend:blessing"] },
        "2": { grants: ["test:fiend:luck"] },
      },
    }),
    el("test:fiend:blessing", "subclass-feature"),
    el("test:fiend:luck", "subclass-feature"),
  ];
  const content = testIndex(patron);
  const warlock = resolve({
    content,
    build: build({
      levels: [
        { class: "test:class:warlock", hp: "average", choices: { "test:warlock:patron": ["test:subclass:fiend"] } },
        { class: "test:class:warlock", hp: "average" },
      ],
    }),
  });
  const at = (classLevel: number): GrantNode[] =>
    levelChildren(warlock, "test:class:warlock", classLevel, classLevel - 1, (id) => content.get(id));
  const names = (nodes: GrantNode[]): string[] =>
    nodes.map((n) => (n.type === "element" ? n.element.id : n.type === "choice" ? n.choice.id : n.type));

  it("hangs what a patron brought under the choice that picked it", () => {
    const first = at(1);
    expect(names(first)).toEqual(["test:warlock:pact-magic", "test:warlock:patron"]);
    // The choice's row names the patron; what the patron brought is under it.
    expect(names(first[1].children)).toEqual(["test:fiend:blessing"]);
  });

  it("stands a later subclass feature as a root on its own level, and nothing from another", () => {
    expect(names(at(2))).toEqual(["test:warlock:invocations", "test:fiend:luck"]);
  });
});
