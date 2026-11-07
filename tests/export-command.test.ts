import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CharacterStore } from "../src/obsidian/character-store";
import {
  ExportError,
  embedReader,
  exportDocument,
  exportFileName,
  exportText,
  summariseExport,
  unsavedWarning,
  writeExport,
  type ExportDeps,
} from "../src/obsidian/export-character";
import { indexFromDisk } from "../src/node/load-source";
import { validateExport } from "../src/core/export";
import { appendInventoryEntry } from "../src/core/inventory";
import { CONTENT_ROOT } from "./helpers";

class MemoryAdapter {
  files = new Map<string, string>();
  folders = new Set<string>();
  async exists(p: string) {
    return this.files.has(p) || this.folders.has(p);
  }
  async read(p: string) {
    return this.files.get(p)!;
  }
  async write(p: string, t: string) {
    this.files.set(p, t);
  }
  async mkdir(p: string) {
    this.folders.add(p);
  }
  async list(p: string) {
    return { files: [...this.files.keys()].filter((f) => f.startsWith(`${p}/`)), folders: [] };
  }
  getResourcePath(p: string) {
    return p;
  }
}

const CHAR = join(__dirname, "fixtures", "characters", "paladin-3");
const HASH = `sha256:${"a".repeat(64)}`;

async function open(inventory?: string): Promise<{ store: CharacterStore; adapter: MemoryAdapter }> {
  const { readFileSync } = await import("node:fs");
  const adapter = new MemoryAdapter();
  for (const f of ["sheet", "build", "spells", "inventory", "details"])
    adapter.files.set(`Characters/B/${f}.5e`, readFileSync(join(CHAR, `${f}.5e`), "utf8"));
  if (inventory) adapter.files.set("Characters/B/inventory.5e", inventory);
  const index = indexFromDisk(join(CONTENT_ROOT, "srd"), join(CONTENT_ROOT, "core"));
  const host = {
    app: { vault: { adapter, on: () => ({}), offref: () => undefined } } as never,
    indexFor: async () => index,
    enforceRequirements: () => false,
    writeDebounceMs: () => 0,
  };
  const store = new CharacterStore(host, "Characters/B");
  await store.load();
  return { store, adapter };
}

const deps = (over: Partial<ExportDeps> = {}): ExportDeps => ({
  sources: { exportRef: async () => ({ ref: HASH, refType: "hash" as const }) },
  embed: async () => undefined,
  exportedAt: "2026-01-01T00:00:00.000Z",
  pluginVersion: "9.9.9",
  ...over,
});

describe("exportDocument", () => {
  it("builds a document that passes validation", async () => {
    const { store } = await open();
    const doc = await exportDocument(store, deps());
    expect(doc.envelope).toMatchObject({ characterId: "6f1d7c52-0d0e-4a39-9f6b-3a1f0c7b9e11", pluginVersion: "9.9.9" });
    expect(validateExport(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
  });

  it("refuses a character without its ids, with the loader's message, and writes nothing", async () => {
    const legacy = JSON.stringify({ kind: "inventory", schemaVersion: 1, items: [{ id: "srd:item:longsword" }] });
    const { store, adapter } = await open(legacy);
    const err = await exportDocument(store, deps()).catch((e) => e);
    expect(err).toBeInstanceOf(ExportError);
    expect(err.message).toBe("inventory.5e has 1 entry with no uid.");
    expect(err.lines[0]).toContain("Rebuild this character in the builder");
    await store.flush();
    expect(adapter.files.get("Characters/B/inventory.5e")).toBe(legacy);
  });

  it("refuses a character with no id", async () => {
    const { store, adapter } = await open();
    adapter.files.set("Characters/B/sheet.5e", JSON.stringify({ kind: "sheet", schemaVersion: 1, name: "B" }));
    await store.load();
    const err = await exportDocument(store, deps()).catch((e) => e);
    expect(err.message).toBe("sheet.5e has no character id.");
  });

  it("does not touch an inventory that already has ids", async () => {
    const { store, adapter } = await open();
    const before = adapter.files.get("Characters/B/inventory.5e");
    await exportDocument(store, deps());
    await store.flush();
    expect(adapter.files.get("Characters/B/inventory.5e")).toBe(before);
  });

  it("refuses to write, with readable lines, when the document fails its checks", async () => {
    const { store } = await open();
    const bad = deps({ sources: { exportRef: async () => ({ ref: "/home/me/srd", refType: "git" as const }) } });
    const err = await exportDocument(store, bad).catch((e) => e);
    expect(err).toBeInstanceOf(ExportError);
    expect(err.lines[0]).toContain("/envelope/sources/0/ref");
  });

  it("says so when a source cannot be pinned", async () => {
    const { store } = await open();
    const err = await exportDocument(store, deps({ sources: { exportRef: async () => undefined } })).catch((e) => e);
    expect(err).toBeInstanceOf(ExportError);
    expect(err.message).toContain('Cannot pin source "srd"');
  });
});

describe("exporting while the builder is open", () => {
  it("exports the saved build, not the working copy, and says so", async () => {
    const { store, adapter } = await open();
    const before = adapter.files.get("Characters/B/build.5e");
    store.beginEdit();
    store.mutateBuild((b) => ({ ...b, name: "Unsaved Name", xp: 5000 }));
    expect(store.hasUnsavedEdits).toBe(true);
    expect(unsavedWarning(store)).toContain("unsaved changes");

    const doc = await exportDocument(store, deps());
    expect(doc.identity.name).toBe("Brann Ironvow");
    expect(doc.identity.xp).toBe(900);
    await store.flush();
    expect(adapter.files.get("Characters/B/build.5e")).toBe(before);
    // The working copy is still the builder's.
    expect(store.data.build?.name).toBe("Unsaved Name");
  });

  it("has nothing to warn about when the session has changed nothing, or there is none", async () => {
    const { store } = await open();
    expect(unsavedWarning(store)).toBeUndefined();
    store.beginEdit();
    expect(unsavedWarning(store)).toBeUndefined();
  });

  it("exports the saved inventory and spells too", async () => {
    const { store } = await open();
    store.beginEdit();
    store.update("inventory", { ...store.data.inventory!, items: [] });
    store.update("spells", { ...store.data.spells!, spells: [] });
    const doc = await exportDocument(store, deps());
    expect(doc.inventory.items).toHaveLength(8);
    expect(doc.spells.length).toBeGreaterThan(0);
  });

  it("keeps an entry's id between the export and the saved session", async () => {
    const { store, adapter } = await open();
    store.beginEdit();
    store.update("inventory", appendInventoryEntry(store.data.inventory!, { id: "srd:item:torch" }));
    const doc = await exportDocument(store, deps());
    const ids = doc.inventory.items.map((i) => i.uid);
    store.commitEdit();
    await store.flush();
    const saved = JSON.parse(adapter.files.get("Characters/B/inventory.5e")!).items.map((e: { uid: string }) => e.uid);
    expect(saved.slice(0, ids.length)).toEqual(ids);
    expect(saved).toHaveLength(ids.length + 1);
  });
});

describe("writeExport", () => {
  it("creates the folder and names the file after the character", async () => {
    const { store } = await open();
    const doc = await exportDocument(store, deps());
    const adapter = new MemoryAdapter();
    const path = await writeExport(adapter as never, "Exports", doc);
    expect(path).toBe("Exports/Brann Ironvow.5echar");
    expect(adapter.folders.has("Exports")).toBe(true);
    expect(JSON.parse(adapter.files.get(path)!).identity.name).toBe("Brann Ironvow");
  });

  it("writes into a nested folder and replaces an earlier export", async () => {
    const { store } = await open();
    const doc = await exportDocument(store, deps());
    const adapter = new MemoryAdapter();
    await writeExport(adapter as never, "Game/Out", doc);
    const again = await writeExport(adapter as never, "Game/Out", { ...doc, envelope: { ...doc.envelope, pluginVersion: "2" } });
    expect([...adapter.folders]).toEqual(["Game", "Game/Out"]);
    expect(JSON.parse(adapter.files.get(again)!).envelope.pluginVersion).toBe("2");
  });

  it("keeps a name safe as a file name", () => {
    expect(exportFileName('A/B: "C"?')).toBe("A-B- -C--.5echar");
    expect(exportFileName("  ")).toBe("Character.5echar");
    expect(exportFileName("../x")).toBe("-x.5echar");
  });
});

describe("embedReader", () => {
  const note = "# One\nfirst\n\n## Sub\nnested\n\n# Two\nsecond ^blk\n";
  const at = (s: string) => note.indexOf(s);
  const file = { extension: "md" };
  const app = {
    metadataCache: {
      getFirstLinkpathDest: (p: string) => (p === "Note" ? file : p === "pic.png" ? { extension: "png" } : null),
      getFileCache: () => ({
        headings: [
          { heading: "One", level: 1, position: { start: { offset: at("# One") }, end: { offset: at("# One") + 5 } } },
          { heading: "Sub", level: 2, position: { start: { offset: at("## Sub") }, end: { offset: at("## Sub") + 6 } } },
          { heading: "Two", level: 1, position: { start: { offset: at("# Two") }, end: { offset: at("# Two") + 5 } } },
        ],
        blocks: { blk: { position: { start: { offset: at("second") }, end: { offset: at("second ^blk") + 11 } } } },
      }),
    },
    vault: { cachedRead: async () => note },
  } as never;
  const read = embedReader(app, "Characters/B/details.5e");

  it("reads a whole note, a heading including its subsections, and a block", async () => {
    expect(await read("Note")).toBe(note);
    expect((await read("Note#One"))?.trim()).toBe("first\n\n## Sub\nnested");
    expect((await read("Note#Sub"))?.trim()).toBe("nested");
    expect(await read("Note^blk")).toBe("second ^blk");
  });

  it("reads nothing for a missing note, a missing heading or a picture", async () => {
    expect(await read("Nope")).toBeUndefined();
    expect(await read("Note#Absent")).toBeUndefined();
    expect(await read("pic.png")).toBeUndefined();
  });
});

describe("summariseExport", () => {
  it("reads the name, id, version and time", () => {
    const text = exportText(JSON.parse(readFileSync(join(__dirname, "fixtures/exports/paladin-3.json"), "utf8")));
    const s = summariseExport(text);
    expect(s).toMatchObject({ ok: true, name: "Brann Ironvow", schemaVersion: "2.0" });
    expect(s.ok && s.characterId).toBeTruthy();
  });
  it("says so for text that is not an export", () => {
    expect(summariseExport("nope").ok).toBe(false);
    expect(summariseExport("{}").ok).toBe(false);
  });
});
