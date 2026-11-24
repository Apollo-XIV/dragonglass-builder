/**
 * How a spell row on the sheet says casting is paid for: a slot spent from the save's box,
 * the attack roll or a CAST button of its own, AT WILL for an innate spell that costs
 * nothing, and FREE for a cantrip's save.
 */

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolve } from "../src/core/resolver/resolve";
import type { ActionDef, Element, SpellEntry } from "../src/core/types";
import { CharacterStore, type StoreHost } from "../src/obsidian/character-store";
import { DEFAULT_SETTINGS } from "../src/obsidian/settings";
import { PluginContext, StoreContext } from "../src/obsidian/ui/context";
import { SpellsSection } from "../src/obsidian/ui/narrow/NarrowSheet";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const cast = (name: string, extra: Partial<ActionDef>): ActionDef => ({ id: "cast", name, activation: "action", ...extra });
const spell = (n: string, spellLevel: number, actions?: ActionDef[]): Element =>
  ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel, tags: ["wizard-spell"], ...(actions ? { actions } : {}) }) as Element;

const wizard: Element = {
  id: "test:class:wizard", kind: "class", name: "Wizardish", source: "test", key: "wizard", hitDie: "d6",
  spellcasting: { ability: "int", progression: "full", type: "spellbook", list: "wizard-spell", prepared: 6, spellbook: 6 },
  levels: { "1": { innateSpells: [{ spell: "test:spell:mage-armor" }] } },
} as Element;

const fey: Element = {
  id: "test:species:fey", kind: "species", name: "Fey", source: "test",
  innateSpells: [{ spell: "test:spell:misty-step", ability: "cha", uses: 1, recharge: [{ on: "long-rest", amount: "all" }] }],
} as Element;

const content = testIndex([
  TEST_BOOK, wizard, fey,
  spell("ray-of-frost", 0, [cast("Ray of Frost", { attack: { type: "ranged-spell" }, damage: "1d8", damageType: "cold" })]),
  spell("sleep", 1, [cast("Sleep", { save: { ability: "wis" } })]),
  spell("cure-wounds", 1, [cast("Cure Wounds", { heal: "1d8 + @spellcasting.mod" })]),
  spell("alarm", 1),
  spell("mage-armor", 1),
  spell("misty-step", 2),
]);

/** The row for one spell, from its title to the next row. */
function row(name: string): string {
  const spells: SpellEntry[] = ["ray-of-frost", "sleep", "cure-wounds", "alarm"].map((n) => ({ id: `test:spell:${n}`, class: wizard.id, prepared: true }));
  const buildFile = build({
    abilities: { method: "manual", base: scores({ int: 16 }) },
    species: fey.id,
    levels: [{ class: wizard.id, hp: "average", choices: {} }],
  });
  const host: StoreHost = {
    app: { vault: { adapter: { getResourcePath: (p: string) => p, exists: async () => false }, on: () => ({}), offref: () => undefined } } as never,
    indexFor: async () => content,
    enforceRequirements: () => false,
    writeDebounceMs: () => 0,
  };
  const store = new CharacterStore(host, "Characters/T");
  store.data = { sheet: { kind: "sheet", schemaVersion: 1, id: "id" }, build: buildFile, spells: { kind: "spells", schemaVersion: 1, spells } };
  store.index = content;
  store.loading = false;
  store.resolved = resolve({ content, build: buildFile, spells: store.data.spells });
  const html = renderToStaticMarkup(
    createElement(
      PluginContext.Provider,
      { value: { plugin: { settings: DEFAULT_SETTINGS } as never, app: {} as never, view: {} as never } },
      createElement(StoreContext.Provider, { value: store }, createElement(SpellsSection, { store, character: store.resolved! })),
    ),
  );
  const rows = html.split(/(?=<div[^>]*class="dg-read-row)/);
  const found = rows.find((r) => r.includes(`>${name}<`));
  expect(found, name).toBeDefined();
  return found!;
}

const words = (html: string): string[] => [...html.matchAll(/class="dg-save-cast"[^>]*>([^<]*)</g)].map((m) => m[1]);

describe("paying for a cast on the sheet", () => {
  it("spends the slot from the save's box", () => {
    expect(words(row("sleep"))).toEqual(["CAST"]);
    expect(row("sleep")).toContain("WIS");
  });

  it("gives a spell with no attack or save a CAST button of its own", () => {
    for (const name of ["alarm", "cure-wounds"]) {
      expect(words(row(name)), name).toEqual(["CAST"]);
      expect(row(name), name).toContain("dg-save-box is-bare");
    }
  });

  it("gives a cantrip no CAST, since it spends nothing", () => {
    expect(words(row("ray-of-frost"))).toEqual([]);
  });

  it("says AT WILL for an innate spell with no uses or cost, and offers no slot", () => {
    expect(words(row("mage-armor"))).toEqual(["AT WILL"]);
  });

  it("offers no slot for an innate spell with uses of its own", () => {
    expect(words(row("misty-step"))).toEqual([]);
  });
});
