/** The Spells header and source chips as the sheet renders them. */

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceChips, SpellHeader } from "../src/obsidian/ui/spell-header";
import { ALL_SOURCES, spellsView } from "../src/core/resolver/spell-sources";
import { resolve } from "../src/core/resolver/resolve";
import type { Element } from "../src/core/types";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const wizard = {
  id: "test:class:wizard", kind: "class", name: "Wizard", source: "test", key: "wizard", hitDie: "d6",
  spellcasting: { ability: "int", progression: "full", type: "prepared", list: "wizard-spell" },
  levels: { "1": {}, "2": {} },
} as Element;
const initiate = {
  id: "test:feat:mi", kind: "feat", name: "Magic Initiate", source: "test",
  choices: [{ id: "ability", count: 1, from: { kind: "casting-ability" } }, { id: "spell", count: 1, from: { kind: "spell" } }],
  innateSpells: [{ spell: { choice: "spell" }, ability: { choice: "ability" } }],
} as Element;
const content = testIndex([
  TEST_BOOK, wizard, initiate,
  { id: "test:casting-ability:int", kind: "casting-ability", name: "INT", source: "test", ability: "int" } as Element,
  { id: "test:spell:sleep", kind: "spell", name: "Sleep", source: "test", spellLevel: 1 } as Element,
]);

function casting(withInitiate: boolean) {
  return resolve({
    content,
    build: build({
      abilities: { method: "manual", base: scores({ int: 16 }) },
      levels: [1, 2].map(() => ({ class: wizard.id, hp: "average" as const, choices: {} })),
      ...(withInitiate
        ? { background: initiate.id, choices: { ability: ["test:casting-ability:int"], spell: ["test:spell:sleep"] } }
        : {}),
    }),
  }).spellcasting!;
}

describe("the stat set header", () => {
  it("reads a merged set as one card, with its sources and ability in the label", () => {
    const view = spellsView(casting(true), ALL_SOURCES);
    const html = renderToStaticMarkup(createElement(SpellHeader, { sets: view.sets, proficiency: 2 }));
    expect(html.match(/dg-sp-set"/g)).toHaveLength(1);
    // Names and separators are separate parts, never one concatenated string.
    expect(html).toContain('<span class="dg-sp-set-name">Wizard</span><span class="dg-sp-sep"> + </span><span class="dg-sp-set-name">Magic Initiate</span><span class="dg-sp-sep"> · </span><span class="dg-sp-set-ability">INT</span>');
    expect(html).toContain("Save DC");
    expect(html).toContain("Attack");
    expect(html).toContain("dg-roll-box");
  });
});

describe("the source chips", () => {
  const render = (withInitiate: boolean, active: string) => {
    const view = spellsView(casting(withInitiate), active);
    return renderToStaticMarkup(createElement(SourceChips, { sources: view.sources, active: view.selected, onPick: () => undefined }));
  };

  it("is absent with one source", () => {
    expect(render(false, ALL_SOURCES)).toBe("");
  });

  it("offers All and one chip per source, even when the sources merge into one set", () => {
    const html = render(true, ALL_SOURCES);
    for (const label of ["All", "Wizard", "Magic Initiate"]) expect(html, label).toContain(`>${label}<`);
    expect(html).toMatch(/is-active">All</);
  });

  it("marks the chosen source", () => {
    expect(render(true, "test:feat:mi")).toMatch(/is-active">Magic Initiate</);
  });
});
