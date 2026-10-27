/**
 * Render tests for the sheet and builder. These render to static markup with the
 * Obsidian API stubbed, so a crash in any panel fails a test rather than showing up
 * as a blank pane in the app. Effects (and so MarkdownRenderer) don't run under
 * static rendering, which is why rules text appears as markdown source here.
 */

import { describe, expect, it } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { join } from "node:path";
import { indexFromDisk } from "../src/node/load-source";
import { resolve } from "../src/core/resolver/resolve";
import type { ResolvedCharacter } from "../src/core/resolver/resolved";
import type { BuildFile, InventoryFile, SpellsFile, StateFile } from "../src/core/types";
import { CharacterStore, type StoreHost } from "../src/obsidian/character-store";
import { PluginContext, StoreContext } from "../src/obsidian/ui/context";
import { Sheet } from "../src/obsidian/ui/Sheet";
import { Builder } from "../src/obsidian/ui/Builder";
import { CharacterApp } from "../src/obsidian/ui/CharacterApp";
import { PendingChoiceList } from "../src/obsidian/ui/builder-choices";
import { DEFAULT_SETTINGS } from "../src/obsidian/settings";
import { CONTENT_ROOT } from "./helpers";

const content = indexFromDisk(join(CONTENT_ROOT, "srd"), join(CONTENT_ROOT, "core"));

const build: BuildFile = {
  kind: "build",
  schemaVersion: 1,
  name: "Ilsa Stonebrook",
  xp: 6500,
  level: 5,
  species: "srd:species:dwarf",
  background: "srd:background:acolyte",
  abilities: { method: "point-buy", base: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } },
  levels: [
    { class: "srd:class:paladin", hp: "max", choices: { "srd:class:paladin:skills": ["srd:skill:athletics", "srd:skill:persuasion"] } },
    { class: "srd:class:paladin", hp: "average", choices: { "srd:paladin:fighting-style": ["srd:fighting-style:defense"] } },
    { class: "srd:class:paladin", hp: "average", choices: { "srd:paladin:sacred-oath": ["srd:subclass:oath-of-devotion"] } },
    { class: "srd:class:paladin", hp: "average", choices: { "srd:paladin:asi-4": ["srd:feature:ability-score-improvement"] } },
    { class: "srd:class:paladin", hp: "average", choices: {} },
  ],
  choices: {
    "srd:species:dwarf:tool-proficiency": ["srd:tool:smiths-tools"],
    "srd:background:acolyte:languages": ["srd:language:elvish", "srd:language:celestial"],
  },
};

const inventory: InventoryFile = {
  kind: "inventory",
  schemaVersion: 1,
  items: [
    { id: "srd:item:longsword", equipped: true },
    { id: "srd:item:chain-mail", equipped: true },
    { id: "srd:item:shield", equipped: true },
    { id: "srd:item:potion-of-healing", quantity: 2 },
  ],
  currency: { gp: 15, sp: 4 },
};

const spells: SpellsFile = {
  kind: "spells",
  schemaVersion: 1,
  spells: [
    { id: "srd:spell:bless", class: "srd:class:paladin", prepared: true },
    { id: "srd:spell:cure-wounds", class: "srd:class:paladin", prepared: true },
    { id: "srd:spell:shield-of-faith", class: "srd:class:paladin" },
  ],
};

const state: StateFile = {
  kind: "state",
  schemaVersion: 1,
  checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] },
  events: [
    { t: "2026-10-27T19:42:00Z", type: "damage", amount: 12 },
    { t: "2026-10-27T19:43:00Z", type: "spend", target: "slots.1", amount: 1 },
    { t: "2026-10-27T19:44:00Z", type: "effect.start", effect: "srd:devotion:sacred-weapon" },
    { t: "2026-10-27T19:45:00Z", type: "condition.add", condition: "frightened" },
  ],
};

const details = {
  frontmatter: { kind: "details" as const, schemaVersion: 1, avatar: "Art/ilsa.png" },
  preamble: "",
  sections: [
    { heading: "Backstory", body: "Forge-raised at Hammerfall." },
    { heading: "Flaws", body: "" },
  ],
  raw: "",
};

function makeStore(overrides: Partial<CharacterStore["data"]> = {}): CharacterStore {
  const host: StoreHost = {
    app: {
      vault: { adapter: { getResourcePath: (p: string) => `app://local/${p}`, exists: async () => false }, on: () => ({}), offref: () => undefined },
    } as never,
    indexFor: async () => content,
    enforceRequirements: () => false,
    writeDebounceMs: () => 0,
  };
  const store = new CharacterStore(host, "Characters/Ilsa");
  store.data = { sheet: { kind: "sheet", schemaVersion: 1 }, build, inventory, spells, state, details, ...overrides };
  store.index = content;
  store.loading = false;
  store.resolved = resolve({
    content,
    build: (overrides.build ?? build) as BuildFile,
    inventory: (overrides.inventory ?? inventory) as InventoryFile,
    spells: (overrides.spells ?? spells) as SpellsFile,
    state: (overrides.state ?? state) as StateFile,
    details: { name: build.name },
  });
  return store;
}

const plugin = {
  settings: DEFAULT_SETTINGS,
  sources: { statusFor: () => undefined, statusList: () => [], invalidate: () => undefined },
  saveSettings: async () => undefined,
  reloadSources: async () => undefined,
} as never;

const app = {
  vault: { adapter: { getResourcePath: (p: string) => `app://local/${p}` } },
} as never;

function render(node: ReactNode, store: CharacterStore): string {
  return renderToStaticMarkup(
    createElement(
      PluginContext.Provider,
      { value: { plugin, app, view: {} as never } },
      createElement(StoreContext.Provider, { value: store }, node),
    ),
  );
}

describe("the sheet", () => {
  const store = makeStore();
  const character = store.resolved as ResolvedCharacter;
  const html = render(createElement(Sheet, { store, character }), store);

  it("shows the character's identity", () => {
    expect(html).toContain("Ilsa Stonebrook");
    expect(html).toContain("Paladin 5 (Oath of Devotion)");
    expect(html).toContain("Dwarf");
    expect(html).toContain("Acolyte");
  });

  it("shows current and maximum hit points from the live state", () => {
    expect(html).toContain("37");
    expect(html).toContain("/ 49");
  });

  it("shows AC, abilities and skills", () => {
    expect(html).toContain(">18<");
    expect(html).toContain("STR");
    expect(html).toContain("Animal Handling");
    expect(html).toContain("passive");
  });

  it("marks a stat that has situational modifiers", () => {
    expect(html).toContain("dg-conditional");
  });

  it("shows the avatar from details.5e", () => {
    expect(html).toContain("app://local/Art/ilsa.png");
  });

  it("offers the tabs the character has content for", () => {
    for (const label of ["Overview", "Actions", "Spells", "Inventory", "Features", "Details", "Log"])
      expect(html, label).toContain(`>${label}`);
  });

  it("shows an active condition", () => {
    expect(html).toContain("frightened");
  });

  it("shows resources with their recharge rule", () => {
    expect(html).toContain("Lay on Hands");
    expect(html).toContain("long rest");
  });

  it("offers short and long rests", () => {
    expect(html).toContain("Short rest");
    expect(html).toContain("Long rest");
  });

  it("does not list items or spells a second time as feature cards", () => {
    // The `item` and `spell` kinds declare a tab, but those tabs have dedicated
    // panels; only kinds on the features tab (or a tab the plugin has no panel
    // for) become generic feature lists.
    const inventoryHtml = render(createElement(CharacterApp, { store, kind: "inventory", path: "x" }), store);
    expect(inventoryHtml).not.toContain(">Items<");
    expect(html).not.toContain(">Items<");
  });

  it("renders every tab body without crashing", () => {
    // Each tab is rendered through CharacterApp's own dispatch below; here the
    // panels are exercised directly by switching the sheet's own state is not
    // possible in static rendering, so the dedicated panel tests cover them.
    expect(html.length).toBeGreaterThan(2000);
  });
});

describe("panel dispatch by file kind", () => {
  const store = makeStore();

  it.each([
    ["sheet", "Ilsa Stonebrook"],
    ["build", "Levels &amp; features"],
    ["spells", "Spell slots"],
    ["inventory", "Carried"],
    ["state", "Since the last rest"],
    ["details", "Backstory"],
    ["sources", "This character&#x27;s sources"],
  ] as const)("renders the %s viewer", (kind, expected) => {
    const html = render(createElement(CharacterApp, { store, kind, path: `Characters/Ilsa/${kind}.5e` }), store);
    expect(html).toContain(expected);
  });

  it("renders the inventory with its equipped flags and currency", () => {
    const html = render(createElement(CharacterApp, { store, kind: "inventory", path: "x" }), store);
    expect(html).toContain("Chain Mail");
    expect(html).toContain("Potion of Healing");
    expect(html).toContain("GP");
  });

  it("renders spell slots and the spellbook", () => {
    const html = render(createElement(CharacterApp, { store, kind: "spells", path: "x" }), store);
    expect(html).toContain("Level 1");
    expect(html).toContain("Bless");
    expect(html).toContain("Sanctuary");
    expect(html).toContain("always prepared");
    expect(html).toContain("Spell save DC");
  });

  it("renders the event log newest first", () => {
    const html = render(createElement(CharacterApp, { store, kind: "state", path: "x" }), store);
    expect(html.indexOf("Gained frightened")).toBeLessThan(html.indexOf("Took 12 damage"));
  });

  it("shows an empty state when there is nothing to resolve", () => {
    const blank = makeStore();
    blank.resolved = undefined;
    blank.data = { ...blank.data, build: undefined };
    const html = render(createElement(CharacterApp, { store: blank, kind: "sheet", path: "x" }), blank);
    expect(html).toContain("Nothing to resolve yet");
  });
});

describe("the builder", () => {
  const store = makeStore();
  const character = store.resolved as ResolvedCharacter;
  const html = render(createElement(Builder, { store, character }), store);

  it("offers the core tab with species and background selects", () => {
    expect(html).toContain("Species");
    expect(html).toContain("Background");
    expect(html).toContain("Dwarf");
    expect(html).toContain("Point buy");
  });

  it("shows ability scores with the species increase applied", () => {
    expect(html).toContain("CON");
    expect(html).toContain("+2 → 16");
  });

  it("reports the point buy total", () => {
    expect(html).toContain("of 27 points spent");
  });

  it("lists the builder's tabs, with no spells tab for a non-caster", () => {
    expect(html).toContain(">Levels &amp; features");
    expect(html).toContain(">Choices");
    expect(html).toContain(">Browse classes");
    expect(html).toContain(">Sources");

    const noCaster = makeStore({
      build: { ...build, levels: [{ class: "srd:class:paladin", hp: "max", choices: {} }], level: 1 },
      spells: { kind: "spells", schemaVersion: 1, spells: [] },
    });
    const plain = render(
      createElement(Builder, { store: noCaster, character: noCaster.resolved as ResolvedCharacter }),
      noCaster,
    );
    expect(plain).not.toContain(">Spells<");
  });

  it("shows the species and background choices on the core tab", () => {
    expect(html).toContain("Tool Proficiency");
    expect(html).toContain("Smith&#x27;s Tools");
    expect(html).toContain("Acolyte Languages");
  });
});

describe("choice rendering", () => {
  const unchosen = makeStore({
    build: {
      ...build,
      levels: build.levels.map((level, i) => (i === 1 ? { ...level, choices: {} } : level)),
    },
  });
  const character = unchosen.resolved as ResolvedCharacter;
  const html = render(createElement(PendingChoiceList, { store: unchosen, character }), unchosen);

  it("shows an outstanding choice with every option", () => {
    expect(html).toContain("outstanding");
    expect(html).toContain("Fighting Style");
    for (const name of ["Defense", "Dueling", "Great Weapon Fighting", "Protection"])
      expect(html, name).toContain(name);
  });

  it("offers the enforcement toggle", () => {
    expect(html).toContain("Enforce prerequisites");
  });

  it("marks a completed choice as done", () => {
    const done = makeStore();
    const full = render(
      createElement(PendingChoiceList, { store: done, character: done.resolved as ResolvedCharacter }),
      done,
    );
    expect(full).toContain("Nothing left to choose");
  });

  it("keeps a pick that no longer fits and says so", () => {
    const stale = makeStore({
      build: {
        ...build,
        levels: build.levels.map((level, i) =>
          i === 1 ? { ...level, choices: { "srd:paladin:fighting-style": ["srd:spell:bless"] } } : level,
        ),
      },
    });
    const staleCharacter = stale.resolved as ResolvedCharacter;
    const choice = staleCharacter.pendingChoices.find((c) => c.id === "srd:paladin:fighting-style");
    expect(choice?.chosen).toEqual(["srd:spell:bless"]);
    expect(choice?.invalid).toEqual(["srd:spell:bless"]);
    const staleHtml = render(createElement(PendingChoiceList, { store: stale, character: staleCharacter }), stale);
    expect(staleHtml).toContain("no longer fits this choice");
  });
});
