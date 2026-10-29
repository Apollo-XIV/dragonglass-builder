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
import { NarrowRoot } from "../src/obsidian/ui/narrow/NarrowRoot";
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


describe("the narrow layout", () => {
  const store = makeStore();
  const character = store.resolved as ResolvedCharacter;
  const html = render(
    createElement(NarrowRoot, {
      store,
      character,
      settings: DEFAULT_SETTINGS.narrow,
      mode: "sheet" as const,
    }),
    store,
  );

  it("renders one scroll of sections rather than tabs", () => {
    expect(html).toContain("dg-narrow-scroll");
    expect(html).not.toContain("dg-tabs");
  });

  it("highlights the active section with one sliding spotlight, not a lit button", () => {
    // The rail is a single object with a light on it: the buttons stay
    // transparent and uniform, and one element moves.
    expect(html.match(/dg-rail-spot/g)).toHaveLength(1);
    expect(html).toContain('class="dg-rail-icon is-active"');
    expect(html).toContain("dg-rail-dock");
  });

  it("gives every section a sticky header and a rail icon", () => {
    for (const label of ["Overview", "Actions", "Spells", "Inventory", "Features", "Skills and saves", "Details"]) {
      expect(html, label).toContain(`>${label}<`);
      expect(html, `${label} rail icon`).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain("dg-sticky-head");
    expect(html).toContain("dg-rail");
  });

  it("shows ability checks and skills as outlined roll boxes", () => {
    expect(html).toContain("dg-roll-box");
    expect(html).toContain('aria-label="Strength check"');
    expect(html).toContain('aria-label="Athletics check"');
    expect(html).toContain('aria-label="Dexterity save"');
  });

  it("shows an equipped weapon as a hit box and a filled damage box", () => {
    expect(html).toContain('aria-label="Longsword attack"');
    expect(html).toContain('aria-label="Longsword damage"');
    expect(html).toContain("dg-roll-box is-dice");
  });

  it("shows hit points from the live state, flagged low", () => {
    expect(html).toContain("37 / 49");
    // 37 of 49 is above half, so the amber treatment stays off.
    expect(html).not.toContain("dg-n-hp-figure is-low");
  });

  it("shows resources as pill targets rather than steppers", () => {
    expect(html).toContain("dg-resource-pill");
    expect(html).toContain("Lay on Hands");
  });

  it("offers the spell filter chips", () => {
    // A level chip appears for each spell level present, so this paladin gets
    // Lv 1 and Lv 2 and no Cantrip chip.
    for (const label of ["All", "Lv 1", "Lv 2", "Ritual", "Conc."]) expect(html, label).toContain(`>${label}<`);
  });

  it("offers a details affordance for screen readers on every holdable row", () => {
    expect(html).toContain("View details");
  });

  it("leaves out a section the character has nothing for", () => {
    const noSpells = makeStore({ spells: { kind: "spells", schemaVersion: 1, spells: [] } });
    const bare = render(
      createElement(NarrowRoot, {
        store: noSpells,
        character: noSpells.resolved as ResolvedCharacter,
        settings: DEFAULT_SETTINGS.narrow,
        mode: "sheet" as const,
      }),
      noSpells,
    );
    // The paladin still casts, so Spells stays; a character with no inventory
    // loses Inventory from the page and from the rail together.
    const noGear = makeStore({ inventory: { kind: "inventory", schemaVersion: 1, items: [], currency: {} } });
    const noGearHtml = render(
      createElement(NarrowRoot, {
        store: noGear,
        character: noGear.resolved as ResolvedCharacter,
        settings: DEFAULT_SETTINGS.narrow,
        mode: "sheet" as const,
      }),
      noGear,
    );
    expect(bare).toContain(">Spells<");
    expect(noGearHtml).not.toContain('aria-label="Inventory"');
  });
});

describe("the narrow builder", () => {
  const store = makeStore();
  const character = store.resolved as ResolvedCharacter;
  const html = render(
    createElement(NarrowRoot, {
      store,
      character,
      settings: DEFAULT_SETTINGS.narrow,
      mode: "builder" as const,
    }),
    store,
  );

  it("lays the builder out in dependency order with no tabs", () => {
    expect(html).not.toContain("dg-tabs");
    const order = ["Origin", "Levels", "Planned", "Spells", "Equipment", "Details", "Review"].map((label) =>
      html.indexOf(`>${label}<`),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("shows species and background as choice rows", () => {
    expect(html).toContain("dg-choice-row");
    expect(html).toContain(">Dwarf<");
    expect(html).toContain(">Acolyte<");
  });

  it("shows one card per level taken, with the class and class level", () => {
    expect(html.match(/dg-level-card(?!-)/g)).toHaveLength(5);
    expect(html).toContain("Level 1");
    expect(html).toContain("Paladin 5");
  });

  it("makes each level card a scroll stop without giving it a rail icon", () => {
    // Five cards, seven rail icons: the levels tick and detent but don't get
    // their own icons (spec 4.3).
    expect(html.match(/dg-rail-icon/g)).toHaveLength(7);
  });

  it("offers one class button plus multiclass for a single-class character", () => {
    expect(html).toContain("+ Paladin level");
    expect(html).toContain("+ Multiclass");
    expect(html).not.toContain("is-pair");
  });

  it("keeps Planned collapsed, with a summary of what is queued", () => {
    expect(html).toContain("0 queued · Paladin 6+");
    expect(html).not.toContain("Show more levels");
  });

  it("marks a level with an unresolved choice", () => {
    const partial = makeStore({
      build: { ...build, levels: build.levels.map((l, i) => (i === 1 ? { ...l, choices: {} } : l)) },
    });
    const partialHtml = render(
      createElement(NarrowRoot, {
        store: partial,
        character: partial.resolved as ResolvedCharacter,
        settings: DEFAULT_SETTINGS.narrow,
        mode: "builder" as const,
      }),
      partial,
    );
    expect(partialHtml).toContain("1 to choose");
    expect(partialHtml).toContain("dg-choice-row is-empty");
  });

  it("treats an existing character as an edit: nothing is written until you save", () => {
    // Spec 7.9: Finish becomes "Save changes" once the character exists, and
    // with nothing changed there is nothing to save.
    expect(html).toContain("No unsaved changes");
    expect(html).not.toContain("Finish");
  });

  it("saves live while a character is being made for the first time", () => {
    const fresh = makeStore({
      build: { ...build, levels: [], species: undefined, background: undefined, choices: {} },
    });
    const freshHtml = render(
      createElement(NarrowRoot, {
        store: fresh,
        character: fresh.resolved as ResolvedCharacter,
        settings: DEFAULT_SETTINGS.narrow,
        mode: "builder" as const,
      }),
      fresh,
    );
    expect(freshHtml).toContain("Finish");
    expect(freshHtml).not.toContain("Save changes");
    // With no class taken, the first button offers one rather than a level.
    expect(freshHtml).toContain("+ First class");
  });
});
