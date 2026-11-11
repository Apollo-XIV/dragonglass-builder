/**
 * SourceManager against an in-memory vault adapter. Covers the one thing that bit
 * the sources panel in practice: a source's own `source.json` id can differ from
 * the `SourceRef.id` a character or the settings gave it (the manifest's id wins,
 * so ids survive a renamed settings entry) — anything that needs to find "this
 * source's elements" in the built index has to resolve through that, not assume
 * the two match.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { OAUTH_SECRET_ID, clearGithubLogin, saveGithubLogin, saveGithubToken, secretIdFor } from "../src/obsidian/github-auth";
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


describe("private GitHub sources", () => {
  const secrets = new Map<string, string>();
  const app = {
    vault: { adapter: new MemoryAdapter() },
    secretStorage: { getSecret: (id: string) => secrets.get(id) ?? null, setSecret: (id: string, v: string) => secrets.set(id, v) },
  } as unknown as import("obsidian").App;
  const calls: { url: string; headers?: Record<string, string> }[] = [];

  beforeEach(() => {
    secrets.clear();
    calls.length = 0;
    vi.spyOn(obsidian as { requestUrl: unknown }, "requestUrl" as never).mockImplementation((async (req: { url: string; headers?: Record<string, string> }) => {
      calls.push(req);
      const url = req.url;
      if (url.includes("/git/trees/"))
        return { status: 200, json: { tree: [{ path: "content/a.json", type: "blob" }] }, text: "" };
      return {
        status: 200,
        json: {},
        text: url.includes("a.json")
          ? JSON.stringify([{ id: "p:feat:a", kind: "feat", name: "A", source: "p:book" }])
          : "{}",
      };
    }) as never);
  });

  const ref = (auth: SourceRef["auth"]): SourceRef => ({ id: "p", type: "github", location: "me/private", pin: "v1", auth });

  it("sends the token to GitHub's API, and reads files through the contents API", async () => {
    const auth = saveGithubToken(app, "me/private", " ghp_secret ");
    expect(auth).toEqual({ type: "token", secret: secretIdFor("me/private") });
    const manager = new SourceManager(app, ".obsidian/plugins/dragonglass", "smart");
    const index = await manager.buildIndex([ref(auth)]);
    expect(index.get("p:feat:a")).toBeDefined();
    expect(calls.every((c) => c.url.startsWith("https://api.github.com/"))).toBe(true);
    expect(calls.every((c) => c.headers?.Authorization === "Bearer ghp_secret")).toBe(true);
  });

  it("replaces a token in place under the secret the source already names", () => {
    const custom = { type: "token" as const, secret: "my-own-name" };
    expect(saveGithubToken(app, "me/private", "new", custom)).toEqual(custom);
    expect(secrets.get("my-own-name")).toBe("new");
    expect(secrets.has(secretIdFor("me/private"))).toBe(false);
  });

  it("sends nothing and uses raw.githubusercontent.com for a public repo", async () => {
    const manager = new SourceManager(app, ".obsidian/plugins/dragonglass", "none");
    await manager.buildIndex([ref(undefined)]);
    expect(calls.some((c) => c.url.startsWith("https://raw.githubusercontent.com/"))).toBe(true);
    expect(calls.every((c) => !c.headers?.Authorization)).toBe(true);
  });

  it("says so when the stored token is missing, and when Obsidian is too old to hold one", async () => {
    const manager = new SourceManager(app, ".obsidian/plugins/dragonglass", "none");
    await manager.buildIndex([ref({ type: "token", secret: "gone" })]);
    expect(manager.statusFor("p")?.diagnostics[0].message).toMatch(/no token is stored/);

    const old = { vault: { adapter: new MemoryAdapter() } } as unknown as import("obsidian").App;
    expect(() => saveGithubToken(old, "me/private", "x")).toThrow(/Obsidian 1\.11\.4/);
  });

  it("reads an oauth source with the one login, shared by every source that names it", async () => {
    saveGithubLogin(app, " gho_login ");
    expect(secrets.get(OAUTH_SECRET_ID)).toBe("gho_login");
    const manager = new SourceManager(app, ".obsidian/plugins/dragonglass", "smart");
    const index = await manager.buildIndex([ref({ type: "oauth" })]);
    expect(index.get("p:feat:a")).toBeDefined();
    expect(calls.every((c) => c.headers?.Authorization === "Bearer gho_login")).toBe(true);
  });

  it("asks to sign in when an oauth source has no login on this device, and after signing out", async () => {
    const manager = new SourceManager(app, ".obsidian/plugins/dragonglass", "none");
    await manager.buildIndex([ref({ type: "oauth" })]);
    expect(manager.statusFor("p")?.diagnostics[0].message).toMatch(/not signed in to GitHub/);

    saveGithubLogin(app, "gho_login");
    clearGithubLogin(app);
    await manager.buildIndex([ref({ type: "oauth" })]);
    expect(manager.statusFor("p")?.diagnostics[0].message).toMatch(/not signed in to GitHub/);
  });

  it("gives a token source its own secret even after an oauth one has been saved", () => {
    saveGithubLogin(app, "gho_login");
    expect(saveGithubToken(app, "me/private", "ghp", { type: "oauth" })).toEqual({
      type: "token",
      secret: secretIdFor("me/private"),
    });
  });
});
