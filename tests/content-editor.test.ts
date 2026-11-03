/**
 * Writing homebrew back into a vault source: new entries, edits in place, removal,
 * and scaffolding a brand-new source from scratch.
 */

import { describe, expect, it } from "vitest";
import { SourceManager } from "../src/obsidian/sources";
import { createSource, defaultFileFor, removeElement, upsertElement } from "../src/obsidian/content-editor";
import type { Element, SourceRef } from "../src/core/types";

/** A vault adapter backed by a plain map; folders are implicit in path prefixes. */
class MemoryAdapter {
  files = new Map<string, string>();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || [...this.files.keys()].some((f) => f.startsWith(`${path}/`));
  }
  async read(path: string): Promise<string> {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`ENOENT ${path}`);
    return text;
  }
  async write(path: string, text: string): Promise<void> {
    this.files.set(path, text);
  }
  async mkdir(_path: string): Promise<void> {
    // Folders are implicit in this stub; nothing to create.
  }
  async list(path: string): Promise<{ files: string[]; folders: string[] }> {
    const files = [...this.files.keys()].filter((f) => f.startsWith(`${path}/`));
    return { files, folders: [] };
  }
}

function makeManager(): { manager: SourceManager; adapter: MemoryAdapter } {
  const adapter = new MemoryAdapter();
  const app = { vault: { adapter } } as unknown as import("obsidian").App;
  return { manager: new SourceManager(app, ".obsidian/plugins/dragonglass", "none"), adapter };
}

const ref: SourceRef = { id: "homebrew", type: "vault", location: "Sources/homebrew", enabled: true };

const feat: Element = { id: "homebrew:feat:lucky-break", kind: "feat", name: "Lucky Break", source: "homebrew:book" };

describe("defaultFileFor", () => {
  it("pluralises a kind that doesn't already end in s", () => {
    expect(defaultFileFor("feat")).toBe("content/feats.json");
    expect(defaultFileFor("species")).toBe("content/species.json");
  });
});

describe("upsertElement", () => {
  it("creates the default file for a brand-new element", async () => {
    const { manager, adapter } = makeManager();
    const { file } = await upsertElement(manager, ref, feat);
    expect(file).toBe("content/feats.json");
    expect(JSON.parse(adapter.files.get("Sources/homebrew/content/feats.json")!)).toEqual([feat]);
  });

  it("appends to an existing file rather than overwriting it", async () => {
    const { manager, adapter } = makeManager();
    adapter.files.set(
      "Sources/homebrew/content/feats.json",
      JSON.stringify([{ id: "homebrew:feat:other", kind: "feat", name: "Other", source: "homebrew:book" }]),
    );
    await upsertElement(manager, ref, feat);
    const written = JSON.parse(adapter.files.get("Sources/homebrew/content/feats.json")!);
    expect(written).toHaveLength(2);
    expect(written.map((e: Element) => e.id)).toEqual(["homebrew:feat:other", "homebrew:feat:lucky-break"]);
  });

  it("edits an element in place at its known file, leaving siblings untouched", async () => {
    const { manager, adapter } = makeManager();
    const sibling = { id: "homebrew:feat:other", kind: "feat", name: "Other", source: "homebrew:book" };
    adapter.files.set("Sources/homebrew/content/feats.json", JSON.stringify([feat, sibling]));
    const edited = { ...feat, name: "Lucky Break (Revised)" };
    await upsertElement(manager, ref, edited, { file: "content/feats.json" });
    const written = JSON.parse(adapter.files.get("Sources/homebrew/content/feats.json")!);
    expect(written).toEqual([edited, sibling]);
  });

  it("relocates an element whose id changed, via previousId", async () => {
    const { manager, adapter } = makeManager();
    adapter.files.set("Sources/homebrew/content/feats.json", JSON.stringify([feat]));
    const renamed = { ...feat, id: "homebrew:feat:lucky-break-2" };
    await upsertElement(manager, ref, renamed, { file: "content/feats.json", previousId: feat.id });
    const written = JSON.parse(adapter.files.get("Sources/homebrew/content/feats.json")!);
    expect(written).toEqual([renamed]);
  });
});

describe("removeElement", () => {
  it("drops the element and keeps the rest of the file", async () => {
    const { manager, adapter } = makeManager();
    const sibling = { id: "homebrew:feat:other", kind: "feat", name: "Other", source: "homebrew:book" };
    adapter.files.set("Sources/homebrew/content/feats.json", JSON.stringify([feat, sibling]));
    await removeElement(manager, ref, feat.id, "content/feats.json");
    expect(JSON.parse(adapter.files.get("Sources/homebrew/content/feats.json")!)).toEqual([sibling]);
  });
});

describe("createSource", () => {
  it("scaffolds source.json and an empty content folder", async () => {
    const { manager, adapter } = makeManager();
    const created = await createSource(manager, {
      type: "vault",
      location: "Sources/new-homebrew",
      id: "new-homebrew",
      name: "My Homebrew",
    });
    expect(created).toEqual({ id: "new-homebrew", type: "vault", location: "Sources/new-homebrew", name: "My Homebrew", enabled: true });
    expect(JSON.parse(adapter.files.get("Sources/new-homebrew/source.json")!)).toEqual({
      id: "new-homebrew",
      name: "My Homebrew",
      description: undefined,
    });
  });

  it("refuses a github or url source", async () => {
    const { manager } = makeManager();
    await expect(
      upsertElement(manager, { id: "x", type: "github", location: "a/b", enabled: true }, feat),
    ).rejects.toThrow(/read-only/);
  });
});
