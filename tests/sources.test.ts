/**
 * SourceManager against an in-memory vault adapter. Covers the one thing that bit
 * the sources panel in practice: a source's own `source.json` id can differ from
 * the `SourceRef.id` a character or the settings gave it (the manifest's id wins,
 * so ids survive a renamed settings entry) — anything that needs to find "this
 * source's elements" in the built index has to resolve through that, not assume
 * the two match.
 */

import { describe, expect, it } from "vitest";
import { SourceManager } from "../src/obsidian/sources";
import type { SourceRef } from "../src/core/types";

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
  async mkdir(): Promise<void> {}
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

describe("SourceStatus.sourceId", () => {
  it("is the manifest's id when it differs from the SourceRef's own id", async () => {
    const { manager, adapter } = makeManager();
    adapter.files.set(
      "Sources/renamed-copy/source.json",
      JSON.stringify({ id: "srd", name: "System Reference Document" }),
    );
    adapter.files.set(
      "Sources/renamed-copy/content/feats.json",
      JSON.stringify([{ id: "srd:feat:lucky", kind: "feat", name: "Lucky", source: "srd:book" }]),
    );
    const ref: SourceRef = { id: "srd-2", type: "vault", location: "Sources/renamed-copy", enabled: true };

    await manager.buildIndex([ref]);

    const status = manager.statusFor("srd-2");
    expect(status?.state).toBe("loaded");
    expect(status?.sourceId).toBe("srd");
  });

  it("falls back to the SourceRef's id when the source has no manifest id", async () => {
    const { manager, adapter } = makeManager();
    adapter.files.set(
      "Sources/homebrew/content/feats.json",
      JSON.stringify([{ id: "homebrew:feat:lucky", kind: "feat", name: "Lucky", source: "homebrew:book" }]),
    );
    const ref: SourceRef = { id: "homebrew", type: "vault", location: "Sources/homebrew", enabled: true };

    await manager.buildIndex([ref]);

    expect(manager.statusFor("homebrew")?.sourceId).toBe("homebrew");
  });
});
