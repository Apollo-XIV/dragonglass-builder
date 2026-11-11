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
import {
  LOGIN_SECRET_ID,
  clearSessionLogin,
  forgetLogin,
  saveGithubToken,
  saveLogin,
  savedLoginExists,
  secretIdFor,
  sessionLoginToken,
  setSessionLogin,
  unlockLogin,
} from "../src/obsidian/github-auth";
import { WrongPasswordError } from "../src/obsidian/login-crypto";
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

  describe("session login", () => {
    const login = { type: "oauth" as const };
    const make = (tier: "none" | "smart" = "none") => {
      const adapter = new MemoryAdapter();
      const a = { vault: { adapter } } as unknown as import("obsidian").App;
      return { adapter, manager: new SourceManager(a, ".obsidian/plugins/dragonglass", tier) };
    };

    beforeEach(() => clearSessionLogin());

    it("fetches with the login, and caches the files even with caching off", async () => {
      setSessionLogin(" gho_login ");
      const { manager, adapter } = make("none");
      const index = await manager.buildIndex([ref(login)]);
      expect(index.get("p:feat:a")).toBeDefined();
      expect(calls.every((c) => c.headers?.Authorization === "Bearer gho_login")).toBe(true);
      await vi.waitFor(() => expect(adapter.files.has(".obsidian/plugins/dragonglass/source-cache.json")).toBe(true));
      expect(adapter.files.get(".obsidian/plugins/dragonglass/source-cache.json")).toContain('"private":true');
    });

    it("never writes the login anywhere", async () => {
      setSessionLogin("gho_login");
      const { manager, adapter } = make("smart");
      await manager.buildIndex([ref(login)]);
      expect(secrets.size).toBe(0);
      for (const text of adapter.files.values()) expect(text).not.toContain("gho_login");
    });

    it("then loads from the cache with no login and no request, across a reload", async () => {
      setSessionLogin("gho_login");
      const { manager } = make();
      await manager.buildIndex([ref(login)]);
      clearSessionLogin();
      calls.length = 0;
      manager.invalidate();
      const index = await manager.buildIndex([ref(login)]);
      expect(index.get("p:feat:a")).toBeDefined();
      expect(calls).toHaveLength(0);
      expect(manager.statusFor("p")).toMatchObject({ state: "loaded", diagnostics: [] });
      expect(manager.statusFor("p")?.origin).toMatch(/sign in to check for updates/);
    });

    it("survives a restart: a fresh manager reads the cache file", async () => {
      setSessionLogin("gho_login");
      const { manager, adapter } = make();
      await manager.buildIndex([ref(login)]);
      await vi.waitFor(() => expect(adapter.files.has(".obsidian/plugins/dragonglass/source-cache.json")).toBe(true));
      clearSessionLogin();
      calls.length = 0;
      const restarted = new SourceManager({ vault: { adapter } } as unknown as import("obsidian").App, ".obsidian/plugins/dragonglass", "none");
      expect((await restarted.buildIndex([ref(login)])).get("p:feat:a")).toBeDefined();
      expect(calls).toHaveLength(0);
    });

    it("asks to sign in when there is no login and nothing cached", async () => {
      const { manager } = make();
      await manager.buildIndex([ref(login)]);
      expect(manager.statusFor("p")?.state).toBe("error");
      expect(manager.statusFor("p")?.diagnostics[0].message).toMatch(/not signed in to GitHub/);
    });

    it("refreshes on request, and keeps the cached copy if that fails", async () => {
      setSessionLogin("gho_login");
      const { manager } = make();
      await manager.buildIndex([ref(login)]);
      calls.length = 0;

      manager.refresh("p");
      await manager.buildIndex([ref(login)]);
      expect(calls.length).toBeGreaterThan(0);

      clearSessionLogin();
      manager.refresh("p");
      const index = await manager.buildIndex([ref(login)]);
      expect(index.get("p:feat:a")).toBeDefined();
      expect(manager.statusFor("p")?.state).toBe("cached");
      expect(manager.statusFor("p")?.diagnostics[0].message).toMatch(/not signed in/);
    });

    it("treats a changed pin as a miss, and drops the copy on removal", async () => {
      setSessionLogin("gho_login");
      const { manager, adapter } = make();
      await manager.buildIndex([ref(login)]);
      clearSessionLogin();
      manager.invalidate();
      await manager.buildIndex([{ ...ref(login), pin: "v2" }]);
      expect(manager.statusFor("p")?.diagnostics[0].message).toMatch(/not signed in/);

      manager.invalidate("p");
      await vi.waitFor(() => expect(adapter.files.get(".obsidian/plugins/dragonglass/source-cache.json")).toBe("[]"));
    });
  });

  describe("saved login", () => {
    const login = { type: "oauth" as const };
    beforeEach(() => clearSessionLogin());

    it("is stored sealed, unlocks with the password, and is gone when forgotten", async () => {
      await saveLogin(app, "gho_login", "pw");
      expect(secrets.get(LOGIN_SECRET_ID)).not.toContain("gho_login");
      expect(savedLoginExists(app)).toBe(true);

      clearSessionLogin();
      expect(sessionLoginToken()).toBeUndefined();
      await expect(unlockLogin(app, "nope")).rejects.toBeInstanceOf(WrongPasswordError);
      expect(sessionLoginToken()).toBeUndefined();
      await unlockLogin(app, "pw");
      expect(sessionLoginToken()).toBe("gho_login");

      forgetLogin(app);
      expect(sessionLoginToken()).toBeUndefined();
      expect(savedLoginExists(app)).toBe(false);
    });

    it("tells a cached source to enter the password, and a locked refresh says the same", async () => {
      // Its own adapter, so another test's cache file can't stand in for the copy this one makes.
      const own = { ...app, vault: { adapter: new MemoryAdapter() } } as unknown as import("obsidian").App;
      await saveLogin(own, "gho_login", "pw");
      const manager = new SourceManager(own, ".obsidian/plugins/dragonglass", "none");
      await manager.buildIndex([ref(login)]);
      manager.invalidate();
      clearSessionLogin();
      await manager.buildIndex([ref(login)]);
      expect(manager.statusFor("p")?.origin).toMatch(/enter password to check for updates/);

      manager.refresh("p");
      await manager.buildIndex([ref(login)]);
      expect(manager.statusFor("p")?.diagnostics[0].message).toBe("enter your password to check for updates");
    });
  });

  it("gives a token source its own secret", () => {
    expect(saveGithubToken(app, "me/private", "ghp", { type: "oauth" })).toEqual({
      type: "token",
      secret: secretIdFor("me/private"),
    });
  });
});
