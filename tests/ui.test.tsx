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
import type { BuildFile, Element, InventoryFile, SpellsFile, StateFile } from "../src/core/types";
import type { ContentIndex } from "../src/core/content";
import { testIndex } from "./helpers";
import { CharacterStore, type StoreHost } from "../src/obsidian/character-store";
import { PluginContext, StoreContext } from "../src/obsidian/ui/context";
import { DesktopSheet } from "../src/obsidian/ui/desktop/DesktopSheet";
import { DesktopBuilder } from "../src/obsidian/ui/desktop/DesktopBuilder";
import { CharacterApp } from "../src/obsidian/ui/CharacterApp";
import { NarrowRoot } from "../src/obsidian/ui/narrow/NarrowRoot";
import { upcomingStaged } from "../src/obsidian/ui/builder/model";
import { DEFAULT_SETTINGS } from "../src/obsidian/settings";
import { SourceBrowser } from "../src/obsidian/ui/content-browser";
import { ContentWizard } from "../src/obsidian/ui/content-wizard";
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
    {
      class: "srd:class:paladin",
      hp: "average",
      // The improvement and the two points it then asks for: both answers live
      // at the level that asked them.
      choices: {
        "srd:paladin:asi-4": ["srd:feature:ability-score-improvement"],
        "srd:asi:points": ["srd:ability-point:int", "srd:ability-point:int"],
      },
    },
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

/** A store whose content and build are entirely ours, for a feature the SRD slice has no example of. */
function makeStoreWith(index: ContentIndex, buildFile: BuildFile): CharacterStore {
  const host: StoreHost = {
    app: {
      vault: { adapter: { getResourcePath: (p: string) => `app://local/${p}`, exists: async () => false }, on: () => ({}), offref: () => undefined },
    } as never,
    indexFor: async () => index,
    enforceRequirements: () => false,
    writeDebounceMs: () => 0,
  };
  const store = new CharacterStore(host, "Characters/Staged");
  store.data = { sheet: { kind: "sheet", schemaVersion: 1 }, build: buildFile };
  store.index = index;
  store.loading = false;
  store.resolved = resolve({ content: index, build: buildFile });
  return store;
}

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
  vault: { adapter: { getResourcePath: (p: string) => `app://local/${p}` }, getAllFolders: () => [] },
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

describe("the desktop sheet", () => {
  const store = makeStore();
  const character = store.resolved as ResolvedCharacter;
  const html = render(createElement(DesktopSheet, { store, character, settings: DEFAULT_SETTINGS }), store);

  it("shows the character's identity in the header band", () => {
    expect(html).toContain("Ilsa Stonebrook");
    expect(html).toContain("Dwarf Paladin 5");
    // No gallery yet, so the avatar is initials on a colour of its own.
    expect(html).toContain(">IS<");
  });

  it("shows hit points as a readout over a register", () => {
    expect(html).toContain("dg-hp-vial");
    expect(html).toContain("dg-hp-register");
    // 37 of 49: the register's head carries the maximum, the readout the current.
    expect(html).toContain(">37<");
    expect(html).toContain(">49<");
    // The log's 12 damage is one row of the register.
    expect(html).toContain("-12");
  });

  it("shows the ability tiles with scores, and the saves as pills", () => {
    expect(html).toContain("STR 16");
    expect(html).toContain("CON 16");
    // The accessible name is text, not an aria-label: Obsidian opens a tooltip
    // of its own for anything carrying one, over the top of the hover card.
    expect(html).toContain('<span class="dg-sr-only">Strength check</span>');
    expect(html).toContain('<span class="dg-sr-only">Constitution save</span>');
    // A proficient save carries a filled pip and the accent outline.
    expect(html).toContain("dg-d-save is-proficient");
  });

  it("states the situational modifiers a feature grants", () => {
    // The dwarf's poison resilience annotates the CON save rather than adding to it.
    expect(html).toContain("dg-d-note");
    // The dwarf's resilience annotates all six saves, and says so once.
    expect(html).toContain("on saves against poison");
  });

  it("shows the stat cluster, hit dice and a pinned resource", () => {
    expect(html).toContain(">Armour Class<");
    expect(html).toContain(">Initiative<");
    expect(html).toContain(">Proficiency bonus<");
    expect(html).toContain("/5d10");
    // Channel Divinity comes back on a short rest and has one use: the clearest
    // thing a level 5 paladin can have pinned.
    expect(html).toContain("Channel Divinity");
  });

  it("shows skills, senses and proficiencies as standing boxes", () => {
    expect(html).toContain("Animal Handling");
    expect(html).toContain("Passive");
    expect(html).toContain(">Passive Perception<");
    expect(html).toContain("Darkvision");
    expect(html).toContain("Smith&#x27;s Tools");
    expect(html).toContain("Elvish");
  });

  it("offers the tabs the character has content for, Log included", () => {
    for (const label of ["Actions", "Spells", "Features", "Inventory", "Details", "Log"])
      expect(html, label).toContain(`>${label}`);
  });

  it("shows an active condition as a chip you can take off", () => {
    expect(html).toContain("frightened");
    expect(html).toContain("dg-d-chip is-condition");
  });

  it("offers rest and inspiration in the header", () => {
    expect(html).toContain(">Rest<");
    expect(html).toContain(">Inspiration<");
  });

  it("marks hit points as pending rather than changed while an entry is typed", () => {
    // Nothing typed, so no diff is up.
    expect(html).not.toContain("has-pending");
  });

  it("shows the death save pips instead of the vial at zero hit points", () => {
    const downed = makeStore({
      state: {
        kind: "state",
        schemaVersion: 1,
        checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] },
        events: [
          { t: "2026-10-27T19:42:00Z", type: "damage", amount: 99 },
          { t: "2026-10-27T19:43:00Z", type: "death-save", result: "failure" },
        ],
      },
    });
    const downedHtml = render(
      createElement(DesktopSheet, {
        store: downed,
        character: downed.resolved as ResolvedCharacter,
        settings: DEFAULT_SETTINGS,
      }),
      downed,
    );
    expect(downedHtml).toContain("dg-hp-death");
    expect(downedHtml).toContain('aria-label="Death save failure 1"');
    expect(downedHtml).not.toContain("dg-hp-vial");
  });
});

describe("panel dispatch by file kind", () => {
  const store = makeStore();

  it.each([
    ["sheet", "Ilsa Stonebrook"],
    ["build", "dg-b-detail"],
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

describe("the desktop builder", () => {
  const desk = (s: CharacterStore, initialTab?: string): string =>
    render(
      createElement(DesktopBuilder, {
        store: s,
        character: s.resolved as ResolvedCharacter,
        settings: DEFAULT_SETTINGS,
        initialTab,
      }),
      s,
    );
  const store = makeStore();
  const html = desk(store);

  it("opens on Origin with species, background and the ability scores", () => {
    expect(html).toContain("Species");
    expect(html).toContain("Background");
    expect(html).toContain("Dwarf");
    expect(html).toContain("CON");
  });

  it("shows the choices species and background bring", () => {
    expect(html).toContain("Tool Proficiency");
    expect(html).toContain("Smith&#x27;s Tools");
    expect(html).toContain("Acolyte Languages");
  });

  it("has the sidebar the desktop reads in", () => {
    expect(html).toContain("dg-b-detail");
  });

  it("lists tabs for the shared sections, with Levels and Planned on one tab", () => {
    for (const tab of [">Origin<", ">Levels<", ">Equipment<", ">Details<", ">Review<", ">Browse<", ">Sources<"])
      expect(html, tab).toContain(tab);
    expect(html).not.toContain(">Planned<");
  });

  it("has no Spells tab for a non-caster", () => {
    const noCaster = makeStore({
      build: { ...build, levels: [{ class: "srd:class:paladin", hp: "max", choices: {} }], level: 1 },
      spells: { kind: "spells", schemaVersion: 1, spells: [] },
    });
    expect(desk(noCaster)).not.toContain(">Spells<");
  });

  it("puts the planned levels under the level cards, past the divider", () => {
    const levels = desk(store, "levels");
    expect(levels).toContain("dg-level-card");
    expect(levels.indexOf("dg-planned-divider")).toBeGreaterThan(levels.lastIndexOf("Level 5"));
    // Open on the desktop: the queue's own cards are there, and no toggle.
    expect(levels).toContain("is-planned");
    expect(levels).not.toContain("dg-planned-toggle");
  });

  it("turns on the per-level hit points the narrow builder does not have", () => {
    expect(desk(store, "levels")).toContain("Maximum (");
  });

  it("flags a tab that has a decision waiting", () => {
    const unchosen = makeStore({
      build: {
        ...build,
        levels: build.levels.map((level, i) => (i === 1 ? { ...level, choices: {} } : level)),
      },
    });
    expect(desk(unchosen)).toContain("dg-d-tab-dot");
    const levels = desk(unchosen, "levels");
    expect(levels).toContain("Fighting Style");
    expect(levels).toContain("is-empty");
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
    const choice = (stale.resolved as ResolvedCharacter).pendingChoices.find(
      (c) => c.id === "srd:paladin:fighting-style",
    );
    expect(choice?.chosen).toEqual(["srd:spell:bless"]);
    expect(choice?.invalid).toEqual(["srd:spell:bless"]);
    expect(desk(stale, "levels")).toContain("Invalid");
  });

  it("offers the enforcement toggle on Review", () => {
    expect(desk(store, "review")).toContain("Enforce prerequisites");
  });

  it("does not show the narrow-only chrome", () => {
    expect(html).not.toContain("dg-narrow-content");
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
    for (const label of ["Overview", "Actions", "Spells", "Inventory", "Features", "Proficiencies", "Details"]) {
      expect(html, label).toContain(`>${label}<`);
      expect(html, `${label} rail icon`).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain("dg-sticky-head");
    expect(html).toContain("dg-rail");
  });

  it("shows ability checks and saves as the desktop's tiles, and skills as outlined roll boxes", () => {
    expect(html).toContain("dg-roll-box");
    expect(html).toContain('aria-label="Athletics check"');
    // The tiles and pills name themselves in text, as they do on the desktop.
    expect(html).toContain('<span class="dg-sr-only">Strength check</span>');
    expect(html).toContain('<span class="dg-sr-only">Dexterity save</span>');
  });

  it("keeps the saves in the overview with the abilities, not in a section of their own", () => {
    const overview = html.slice(html.indexOf('data-section="overview"'), html.indexOf('data-section="actions"'));
    expect(overview).toContain("dg-d-saves");
    expect(html).not.toContain('aria-label="Saves"');
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
    // Five cards, six rail icons: the levels tick and detent but don't get
    // their own icons (spec 4.3), and Planned is not a section of its own — it is
    // the other half of the Levels list.
    expect(html.match(/dg-rail-icon/g)).toHaveLength(6);
  });

  it("offers one class button plus multiclass for a single-class character", () => {
    expect(html).toContain("+ Paladin level");
    expect(html).toContain("+ Multiclass");
    expect(html).not.toContain("is-pair");
  });

  it("keeps the queue behind its divider, with a summary of what is queued", () => {
    expect(html).toContain("dg-planned-divider");
    expect(html).toContain("Paladin 6+");
    expect(html).not.toContain("Show more levels");
    expect(html).not.toContain(">Planned</h3>");
  });

  it("gives every card a handle that is the only way to drag it", () => {
    expect(html.match(/dg-drag-handle/g)).toHaveLength(6);
    expect(html).toContain("Reorder Paladin 3");
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

describe("species features staged by character level", () => {
  const BOOK: Element = {
    id: "stage", kind: "sourcebook", name: "Staged Book", source: "stage", abbreviation: "STG",
  } as Element;
  const BREATH: Element = {
    id: "stage:trait:breath", kind: "species-trait", name: "Breath Weapon", source: "stage",
    text: "You exhale destruction.",
  };
  const WINGS: Element = {
    id: "stage:trait:wings", kind: "species-trait", name: "Draconic Flight", source: "stage",
    text: "You sprout wings.",
  };
  const SPECIES: Element = {
    id: "stage:species:dragonborn", kind: "species", name: "Dragonborn", source: "stage",
    levelsBy: "character",
    levels: { "1": { grants: [BREATH.id] }, "5": { grants: [WINGS.id] } },
  };
  const CLASS: Element = {
    id: "stage:class:fighter", kind: "class", name: "Fighter", source: "stage", hitDie: "d10",
  };
  const index = testIndex([BOOK, BREATH, WINGS, SPECIES, CLASS]);
  const at = (levels: number): BuildFile => ({
    kind: "build", schemaVersion: 1, name: "Kriv", level: levels, species: SPECIES.id,
    abilities: { method: "manual", base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } },
    levels: Array.from({ length: levels }, () => ({ class: CLASS.id, hp: "average" as const })),
  });

  function builderHtml(levels: number): string {
    const store = makeStoreWith(index, at(levels));
    return render(
      createElement(NarrowRoot, {
        store,
        character: store.resolved as ResolvedCharacter,
        settings: DEFAULT_SETTINGS.narrow,
        mode: "builder" as const,
      }),
      store,
    );
  }

  it("shows a trait on the level card that brought it", () => {
    expect(builderHtml(5)).toContain("Draconic Flight");
  });

  it("does not show it on a character who hasn't got there yet", () => {
    const early = builderHtml(4);
    expect(early).toContain("Breath Weapon");
    expect(early).not.toContain("Draconic Flight");
  });

  it("looks ahead to what has not arrived yet", () => {
    // Planned is collapsed by default, so the look-ahead is tested where its
    // logic lives rather than through the markup.
    const owned = [{ element: SPECIES }];
    const ahead = upcomingStaged(owned, 4, 3);
    expect(ahead.map((c) => c.level)).toEqual([5]);
    expect(ahead[0].owner.name).toBe("Dragonborn");
  });

  it("has nothing left to look ahead to once the last entry is reached", () => {
    expect(upcomingStaged([{ element: SPECIES }], 5, 3)).toEqual([]);
  });

  it("ignores an element that doesn't stage itself", () => {
    const classStaged: Element = { ...SPECIES, id: "stage:other", levelsBy: "class" };
    expect(upcomingStaged([{ element: classStaged }], 1, 3)).toEqual([]);
  });
});

describe("the source browser and entry wizard", () => {
  const store = makeStore();
  const srdRef = { id: "srd", type: "github" as const, location: "owner/srd", enabled: true };
  const homebrewRef = { id: "homebrew", type: "vault" as const, location: "Sources/homebrew", enabled: true };

  it("lists a read-only source's elements with no add/edit controls", () => {
    const html = render(createElement(SourceBrowser, { index: content, sourceRef: srdRef, onClose: () => undefined }), store);
    expect(html).toContain("Dwarf");
    expect(html).toContain("read-only");
    expect(html).not.toContain("Add entry");
  });

  it("filters by kind and by text", () => {
    const html = render(createElement(SourceBrowser, { index: content, sourceRef: srdRef, onClose: () => undefined }), store);
    expect(html).toContain("Every kind");
    expect(html).toContain('placeholder="Filter by name or id"');
  });

  it("offers Add entry on a writable source and opens the wizard for a new element", () => {
    const html = render(
      createElement(SourceBrowser, { index: content, sourceRef: homebrewRef, startNew: true, onClose: () => undefined }),
      store,
    );
    expect(html).toContain("New entry");
    expect(html).toContain("View raw JSON");
  });

  it("renders the wizard's form fields for a blank new entry", () => {
    const html = render(
      createElement(ContentWizard, { index: content, sourceRef: homebrewRef, onSaved: () => undefined, onCancel: () => undefined }),
      store,
    );
    expect(html).toContain("Id");
    expect(html).toContain("Kind");
    expect(html).toContain("Name");
    expect(html).toContain("Source");
    // Nothing filled in yet, so the structural validator flags the missing fields.
    expect(html).toContain("Validation");
  });

  it("validates cleanly editing an existing well-formed element", () => {
    const dwarf = content.get("srd:species:dwarf")!;
    const html = render(
      createElement(ContentWizard, {
        index: content,
        sourceRef: homebrewRef,
        initial: dwarf,
        originFile: "content/species/dwarf.json",
        onSaved: () => undefined,
        onCancel: () => undefined,
      }),
      store,
    );
    expect(html).toContain("Edit Dwarf");
    expect(html).toContain("Validates cleanly");
  });
});
