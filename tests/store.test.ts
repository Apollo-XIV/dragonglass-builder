/**
 * The character store, against an in-memory vault adapter. This covers the file
 * layer the plugin lives on: manifest mapping, parsing, debounced and batched
 * writes, and reloading when a file changes outside the plugin.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { CharacterStore, type StoreHost } from "../src/obsidian/character-store";
import { parseDetails, serialiseDetails, resolvePaths, detectKindFixture } from "./helpers-obsidian";
import { indexFromDisk } from "../src/node/load-source";
import type { ContentIndex } from "../src/core/content";
import { CONTENT_ROOT } from "./helpers";

const BUILD = {
  kind: "build",
  schemaVersion: 1,
  name: "Ilsa",
  level: 2,
  species: "srd:species:dwarf",
  background: "srd:background:acolyte",
  abilities: { method: "point-buy", base: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } },
  levels: [
    { class: "srd:class:paladin", hp: "max", choices: {} },
    { class: "srd:class:paladin", hp: "average", choices: { "srd:paladin:fighting-style": ["srd:fighting-style:defense"] } },
  ],
  choices: { "srd:species:dwarf:tool-proficiency": ["srd:tool:smiths-tools"] },
};

/** A vault adapter backed by a plain map. */
class MemoryAdapter {
  files = new Map<string, string>();
  writes: string[] = [];

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
  async read(path: string): Promise<string> {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`ENOENT ${path}`);
    return text;
  }
  async write(path: string, text: string): Promise<void> {
    this.files.set(path, text);
    this.writes.push(path);
  }
  async list(path: string): Promise<{ files: string[]; folders: string[] }> {
    const files = [...this.files.keys()].filter((f) => f.startsWith(`${path}/`));
    return { files, folders: [] };
  }
  getResourcePath(path: string): string {
    return `app://local/${path}`;
  }
}

function makeHost(adapter: MemoryAdapter, index: ContentIndex): { host: StoreHost; adapter: MemoryAdapter } {
  const vault = {
    adapter,
    on: () => ({}),
    offref: () => undefined,
  };
  return {
    adapter,
    host: {
      app: { vault } as never,
      indexFor: async () => index,
      enforceRequirements: () => false,
      writeDebounceMs: () => 0,
    },
  };
}

let index: ContentIndex;

beforeEach(() => {
  index = indexFromDisk(join(CONTENT_ROOT, "srd"), join(CONTENT_ROOT, "core"));
});

function seed(adapter: MemoryAdapter, extra: Record<string, string> = {}): void {
  adapter.files.set("Characters/Ilsa/sheet.5e", JSON.stringify({ kind: "sheet", schemaVersion: 1, name: "Ilsa" }));
  adapter.files.set("Characters/Ilsa/build.5e", JSON.stringify(BUILD));
  adapter.files.set(
    "Characters/Ilsa/state.5e",
    JSON.stringify({ kind: "state", schemaVersion: 1, checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] }, events: [] }),
  );
  adapter.files.set("Characters/Ilsa/inventory.5e", JSON.stringify({ kind: "inventory", schemaVersion: 1, items: [] }));
  adapter.files.set("Characters/Ilsa/spells.5e", JSON.stringify({ kind: "spells", schemaVersion: 1, spells: [] }));
  for (const [path, text] of Object.entries(extra)) adapter.files.set(path, text);
}

async function loadStore(extra: Record<string, string> = {}): Promise<{ store: CharacterStore; adapter: MemoryAdapter }> {
  const adapter = new MemoryAdapter();
  seed(adapter, extra);
  const { host } = makeHost(adapter, index);
  const store = new CharacterStore(host, "Characters/Ilsa");
  await store.load();
  return { store, adapter };
}

describe("loading a character folder", () => {
  it("reads every default file and resolves", async () => {
    const { store } = await loadStore();
    expect(store.loading).toBe(false);
    expect(store.data.build?.name).toBe("Ilsa");
    expect(store.resolved?.level).toBe(2);
    expect(store.resolved?.ac.value).toBe(10);
    expect(store.fileDiagnostics).toEqual([]);
  });

  it("follows the manifest to a renamed file", async () => {
    const adapter = new MemoryAdapter();
    seed(adapter);
    adapter.files.delete("Characters/Ilsa/spells.5e");
    adapter.files.set(
      "Characters/Ilsa/sheet.5e",
      JSON.stringify({ kind: "sheet", schemaVersion: 1, files: { spells: "magic.5e" } }),
    );
    adapter.files.set(
      "Characters/Ilsa/magic.5e",
      JSON.stringify({ kind: "spells", schemaVersion: 1, spells: [{ id: "srd:spell:bless", prepared: true }] }),
    );
    const { host } = makeHost(adapter, index);
    const store = new CharacterStore(host, "Characters/Ilsa");
    await store.load();
    expect(store.paths.byKind.spells).toBe("Characters/Ilsa/magic.5e");
    expect(store.data.spells?.spells).toHaveLength(1);
  });

  it("takes a file's kind from the manifest when the file declares none", async () => {
    const adapter = new MemoryAdapter();
    seed(adapter);
    adapter.files.set(
      "Characters/Ilsa/sheet.5e",
      JSON.stringify({ kind: "sheet", schemaVersion: 1, files: { spells: "magic.5e" }, kinds: { "magic.5e": "spells" } }),
    );
    adapter.files.set("Characters/Ilsa/magic.5e", JSON.stringify({ schemaVersion: 1, spells: [] }));
    const { host } = makeHost(adapter, index);
    const store = new CharacterStore(host, "Characters/Ilsa");
    await store.load();
    expect(store.data.spells?.kind).toBe("spells");
    expect(store.fileDiagnostics).toEqual([]);
  });

  it("reports a malformed file without losing the rest of the character", async () => {
    const { store } = await loadStore({ "Characters/Ilsa/inventory.5e": "{ not json" });
    expect(store.fileDiagnostics).toHaveLength(1);
    expect(store.fileDiagnostics[0].subject).toContain("inventory.5e");
    expect(store.resolved?.level).toBe(2);
  });

  it("reads details.5e as markdown with frontmatter", async () => {
    const { store } = await loadStore({
      "Characters/Ilsa/details.5e": "---\nkind: details\nschemaVersion: 1\navatar: Art/ilsa.png\n---\n## Backstory\nForge-raised.\n\n## Flaws\n",
    });
    expect(store.data.details?.frontmatter.avatar).toBe("Art/ilsa.png");
    expect(store.data.details?.sections.map((s) => s.heading)).toEqual(["Backstory", "Flaws"]);
    expect(store.data.details?.sections[0].body).toBe("Forge-raised.");
  });
});

describe("writing", () => {
  it("writes a changed file and re-resolves immediately", async () => {
    const { store, adapter } = await loadStore();
    store.mutateBuild((build) => ({ ...build, name: "Ilsa Stonebrook" }));
    expect(store.resolved?.name).toBe("Ilsa Stonebrook");
    await store.flush();
    expect(JSON.parse(adapter.files.get("Characters/Ilsa/build.5e")!).name).toBe("Ilsa Stonebrook");
  });

  it("stages a multi-file change and writes it in one batch", async () => {
    const { store, adapter } = await loadStore();
    adapter.writes.length = 0;
    store.updateMany({
      build: { ...store.data.build!, xp: 900 },
      spells: { ...store.data.spells!, spells: [{ id: "srd:spell:bless" }] },
    });
    await store.flush();
    expect(adapter.writes.sort()).toEqual(["Characters/Ilsa/build.5e", "Characters/Ilsa/spells.5e"]);
  });

  it("debounces repeated state changes into one write", async () => {
    const adapter = new MemoryAdapter();
    seed(adapter);
    const { host } = makeHost(adapter, index);
    const slowHost: StoreHost = { ...host, writeDebounceMs: () => 50 };
    const store = new CharacterStore(slowHost, "Characters/Ilsa");
    await store.load();
    adapter.writes.length = 0;

    for (let i = 0; i < 5; i++) store.appendEvents({ t: new Date().toISOString(), type: "damage", amount: 1 });
    expect(adapter.writes).toHaveLength(0);
    expect(store.dirty).toBe(true);
    await store.flush();
    expect(adapter.writes).toEqual(["Characters/Ilsa/state.5e"]);
    expect(store.resolved?.hp.damage).toBe(5);
    expect(store.dirty).toBe(false);
  });

  it("undoes the last event", async () => {
    const { store } = await loadStore();
    store.appendEvents({ t: "t1", type: "damage", amount: 4 });
    store.appendEvents({ t: "t2", type: "damage", amount: 3 });
    expect(store.resolved?.hp.damage).toBe(7);
    const undone = store.undoLastEvent();
    expect(undone?.type).toBe("damage");
    expect(store.resolved?.hp.damage).toBe(4);
  });

  it("checkpoints and archives on a rest", async () => {
    const { store } = await loadStore();
    store.appendEvents({ t: "t1", type: "damage", amount: 6 });
    store.appendEvents({ t: "t2", type: "spend", target: "slots.1", amount: 1 });
    store.rest("short");
    const state = store.data.state!;
    expect(state.events).toHaveLength(0);
    expect(state.archive?.[0].events.map((e) => e.type)).toEqual(["damage", "spend", "rest.short"]);
    // A short rest does not heal, so the damage survives the checkpoint.
    expect(store.resolved?.hp.damage).toBe(6);
  });

  it("restores everything on a long rest", async () => {
    const { store } = await loadStore();
    store.appendEvents({ t: "t1", type: "damage", amount: 6 });
    store.appendEvents({ t: "t2", type: "spend", target: "srd:paladin:lay-on-hands", amount: 5 });
    store.rest("long");
    expect(store.resolved?.hp.damage).toBe(0);
    expect(store.resolved?.resources.find((r) => r.key === "srd:paladin:lay-on-hands")?.remaining).toBe(10);
  });

  it("notifies subscribers and bumps the version", async () => {
    const { store } = await loadStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.version;
    store.appendEvents({ t: "t", type: "heal", amount: 1 });
    expect(listener).toHaveBeenCalled();
    expect(store.version).toBeGreaterThan(before);
    unsubscribe();
    store.appendEvents({ t: "t", type: "heal", amount: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("details documents", () => {
  it("round-trips through parse and serialise", () => {
    const text = "---\nkind: details\nschemaVersion: 1\navatar: Art/x.png\n---\n## Backstory\nOne line.\n\n## Flaws\n";
    const doc = parseDetails(text);
    const out = parseDetails(serialiseDetails(doc));
    expect(out.frontmatter).toEqual(doc.frontmatter);
    expect(out.sections).toEqual(doc.sections);
  });

  it("keeps a section the file did not have when one is set", () => {
    const doc = parseDetails("---\nkind: details\nschemaVersion: 1\n---\n## Backstory\nHello.\n");
    const text = serialiseDetails({ ...doc, sections: [...doc.sections, { heading: "Bonds", body: "The temple." }] });
    expect(text).toContain("## Bonds");
    expect(text).toContain("The temple.");
  });
});

describe("file paths and kind detection", () => {
  it("falls back to the default names", () => {
    const paths = resolvePaths("Characters/Ilsa");
    expect(paths.byKind.build).toBe("Characters/Ilsa/build.5e");
    expect(paths.byKind.spells).toBe("Characters/Ilsa/spells.5e");
  });

  it("reads the kind from a file's own contents", () => {
    expect(detectKindFixture("Characters/Ilsa/magic.5e", '{"kind":"spells"}')).toBe("spells");
    expect(detectKindFixture("Characters/Ilsa/details.5e", "---\nkind: details\n---\n")).toBe("details");
  });

  it("falls back to the filename when a file declares no kind", () => {
    expect(detectKindFixture("Characters/Ilsa/inventory.5e", "{}")).toBe("inventory");
    expect(detectKindFixture("Characters/Ilsa/sheet.5e", "{}")).toBe("sheet");
  });

  it("lets the manifest override a file's kind", () => {
    expect(
      detectKindFixture("Characters/Ilsa/magic.5e", "{}", {
        kind: "sheet",
        schemaVersion: 1,
        kinds: { "magic.5e": "spells" },
      }),
    ).toBe("spells");
  });
});
