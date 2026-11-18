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
import { normalizeDir } from "../src/core/source-dir";
import { describeSource, parseSourceInput, suggestSourceId } from "../src/obsidian/settings";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

describe("a source in a subdirectory of its location", () => {
  const feat = (prefix: string) =>
    JSON.stringify([{ id: `${prefix}:feat:lucky`, kind: "feat", name: `Lucky ${prefix}`, source: `${prefix}:book` }]);

  /** What GitHub's tree API answers: `<pin>` is the whole repo, `<pin>:<dir>` is that folder, paths relative to it. */
  const REPO: Record<string, string> = {
    "srd/source.json": JSON.stringify({ id: "srd" }),
    "srd/content/feats.json": feat("srd"),
    "srd24/source.json": JSON.stringify({ id: "srd24" }),
    "srd24/content/feats.json": feat("srd24"),
    "srd24/content/more/spells.json": JSON.stringify([{ id: "srd24:feat:more", kind: "feat", name: "More", source: "srd24:book" }]),
  };
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.spyOn(obsidian as { requestUrl: unknown }, "requestUrl" as never).mockImplementation((async (req: { url: string }) => {
      calls.push(req.url);
      const trees = req.url.match(/\/git\/trees\/([^?]+)/);
      if (trees) {
        const [pin, dir] = decodeURIComponent(trees[1]).split(":");
        if (pin !== "v1") return { status: 404, json: {}, text: "" };
        const prefix = dir ? `${dir}/` : "";
        const tree = Object.keys(REPO)
          .filter((f) => f.startsWith(prefix))
          .map((f) => ({ path: f.slice(prefix.length), type: "blob" }));
        if (dir && !tree.length) return { status: 404, json: {}, text: "" };
        return { status: 200, json: { tree }, text: "" };
      }
      const raw = req.url.match(/raw\.githubusercontent\.com\/me\/repo\/v1\/(.+)$/);
      return { status: raw && REPO[raw[1]] ? 200 : 404, json: {}, text: raw ? (REPO[raw[1]] ?? "") : "" };
    }) as never);
  });

  const gh = (id: string, dir?: string): SourceRef => ({ id, type: "github", location: "me/repo", pin: "v1", enabled: true, ...(dir !== undefined ? { dir } : {}) });
  const treeCalls = () => calls.filter((c) => c.includes("/git/trees/"));

  it("loads only the folder's elements, with its own manifest id and paths relative to the source", async () => {
    const { manager } = makeManager();
    const index = await manager.buildIndex([gh("a", "srd24")]);
    expect(manager.statusFor("a")).toMatchObject({ state: "loaded", sourceId: "srd24", elementCount: 2 });
    expect(index.get("srd24:feat:lucky")).toBeDefined();
    expect(index.get("srd:feat:lucky")).toBeUndefined();
    expect(treeCalls()[0]).toContain("/git/trees/v1:srd24?recursive=1");
    expect(manager.statusFor("a")?.origin).toBe("github.com/me/repo/srd24@v1");
  });

  it("loads two folders of one repo and pin as two sources", async () => {
    const { manager } = makeManager();
    const index = await manager.buildIndex([gh("a", "srd"), gh("b", "srd24")]);
    expect(manager.statusFor("a")).toMatchObject({ state: "loaded", sourceId: "srd", elementCount: 1 });
    expect(manager.statusFor("b")).toMatchObject({ state: "loaded", sourceId: "srd24", elementCount: 2 });
    expect(index.get("srd:feat:lucky")).toBeDefined();
    // One listing per folder: a subtree is its own request, and the same folder is asked for once.
    expect(treeCalls()).toHaveLength(2);
    // The same folder under two ids is listed once in a build.
    calls.length = 0;
    await makeManager().manager.buildIndex([gh("a", "srd"), gh("c", "srd")]);
    expect(treeCalls()).toHaveLength(1);
  });

  it("names a folder that is not in the tree, and says a bad pin is a bad pin", async () => {
    const { manager } = makeManager();
    await manager.buildIndex([gh("a", "nope")]);
    expect(manager.statusFor("a")).toMatchObject({ state: "error" });
    expect(manager.statusFor("a")?.diagnostics[0].message).toBe('"nope" is not a folder in "me/repo@v1"');
    await manager.buildIndex([{ ...gh("b", "srd24"), pin: "v9" }]);
    expect(manager.statusFor("b")?.diagnostics[0].message).toContain("404");
  });

  it("rejects an absolute dir or one with . or .. before any request", async () => {
    const { manager } = makeManager();
    for (const dir of ["../x", "a/../b", "./a", "/etc", "C:\\x"]) {
      calls.length = 0;
      manager.invalidate();
      await manager.buildIndex([gh("a", dir)]);
      expect(manager.statusFor("a")?.state).toBe("error");
      expect(calls).toEqual([]);
    }
  });

  it("normalises backslashes and stray slashes", () => {
    expect(normalizeDir("srd24")).toEqual({ dir: "srd24" });
    expect(normalizeDir("srd24/")).toEqual({ dir: "srd24" });
    expect(normalizeDir("a\\b//c\\")).toEqual({ dir: "a/b/c" });
    expect(normalizeDir("")).toEqual({});
    expect(normalizeDir("/a").error).toBeDefined();
  });

  describe("vault and path sources", () => {
    it("reads, lists, reads a file, writes and creates inside the folder (vault)", async () => {
      const { manager, adapter } = makeManager();
      adapter.files.set("Repo/srd24/source.json", JSON.stringify({ id: "srd24" }));
      adapter.files.set("Repo/srd24/content/feats.json", feat("srd24"));
      adapter.files.set("Repo/srd/content/feats.json", feat("srd"));
      const ref: SourceRef = { id: "v", type: "vault", location: "Repo", dir: "srd24/", enabled: true };
      await manager.buildIndex([ref]);
      expect(manager.statusFor("v")).toMatchObject({ state: "loaded", sourceId: "srd24", elementCount: 1 });
      expect(await manager.listFiles(ref)).toEqual(["content/feats.json"]);
      expect(await manager.fileExists(ref, "source.json")).toBe(true);
      expect(JSON.parse(await manager.readFile(ref, "content/feats.json"))[0].id).toBe("srd24:feat:lucky");
      await manager.writeFile(ref, "content/new.json", "[]");
      expect(adapter.files.has("Repo/srd24/content/new.json")).toBe(true);
      const made: SourceRef = { id: "m", type: "vault", location: "Repo", dir: "mine", enabled: true };
      await manager.createSource(made, { id: "m" });
      expect(adapter.files.has("Repo/mine/source.json")).toBe(true);
      await expect(manager.createSource(made, { id: "m" })).rejects.toThrow("already exists");
    });

    it("does the same for a path outside the vault", async () => {
      const { manager } = makeManager();
      const root = mkdtempSync(join(tmpdir(), "dg-dir-"));
      const ref: SourceRef = { id: "p", type: "path", location: root, dir: "srd24", enabled: true };
      await manager.createSource(ref, { id: "srd24" });
      expect(existsSync(join(root, "srd24", "content"))).toBe(true);
      await manager.writeFile(ref, "content/feats.json", feat("srd24"));
      expect(readFileSync(join(root, "srd24", "content", "feats.json"), "utf8")).toBe(feat("srd24"));
      await manager.buildIndex([ref]);
      expect(manager.statusFor("p")).toMatchObject({ state: "loaded", sourceId: "srd24", elementCount: 1 });
      expect(await manager.listFiles(ref)).toEqual([join("content", "feats.json")]);
      expect(await manager.fileExists(ref, "source.json")).toBe(true);
      manager.invalidate("p");
      await manager.buildIndex([{ ...ref, dir: "missing" }]);
      expect(manager.statusFor("p")?.diagnostics[0].message).toContain('"missing" is not a folder');
    });
  });

  describe("the cache", () => {
    const seed = (adapter: MemoryAdapter, key: string) =>
      adapter.files.set(
        ".obsidian/plugins/dragonglass/source-cache.json",
        JSON.stringify([{ key, fetchedAt: "then", manifest: { id: "cached" }, files: [{ path: "content/c.json", text: feat("cached") }] }]),
      );
    const failing = () =>
      vi.spyOn(obsidian as { requestUrl: unknown }, "requestUrl" as never).mockImplementation((async () => ({ status: 500, json: {}, text: "" })) as never);

    it("serves an entry from before `dir` to a ref with none, and misses for a ref with one", async () => {
      const first = makeManager();
      seed(first.adapter, "a@v1");
      failing();
      await first.manager.buildIndex([gh("a")]);
      expect(first.manager.statusFor("a")).toMatchObject({ state: "cached", elementCount: 1 });

      const second = makeManager();
      seed(second.adapter, "a@v1");
      await second.manager.buildIndex([gh("a", "srd24")]);
      expect(second.manager.statusFor("a")?.state).toBe("error");
    });

    it("keys on the dir when it writes", async () => {
      const { adapter } = makeManager();
      const tiered = new SourceManager({ vault: { adapter } } as unknown as import("obsidian").App, ".obsidian/plugins/dragonglass", "all");
      await tiered.buildIndex([gh("a", "srd24")]);
      await new Promise((r) => setTimeout(r, 0));
      const saved = JSON.parse(adapter.files.get(".obsidian/plugins/dragonglass/source-cache.json") ?? "[]");
      expect(saved[0].key).toBe("a@v1#srd24");
    });
  });

  describe("settings", () => {
    it("reads a tree URL as a pin and a folder, and describes and names the source", () => {
      expect(parseSourceInput("https://github.com/o/r/tree/v1/srd24")).toMatchObject({ location: "o/r", pin: "v1", dir: "srd24" });
      expect(parseSourceInput("https://github.com/o/r/tree/v1/a/b/")).toMatchObject({ pin: "v1", dir: "a/b" });
      const main = parseSourceInput("https://github.com/o/r/tree/main");
      expect(main).toMatchObject({ location: "o/r", pin: "main" });
      expect(main).not.toHaveProperty("dir");
      expect(describeSource({ id: "x", type: "github", location: "me/repo", dir: "srd24", pin: "v1" })).toBe("GitHub me/repo/srd24@v1");
      expect(suggestSourceId({ type: "github", location: "me/repo", dir: "srd24" })).toBe("srd24");
      expect(suggestSourceId({ type: "github", location: "me/repo" })).toBe("repo");
    });

    it("keeps `dir` when a pin is updated the way the sources panel does it", () => {
      const ref = gh("a", "srd24");
      expect({ ...ref, pin: "v2" }.dir).toBe("srd24");
    });
  });

  describe("export", () => {
    it("carries the folder when the source had one and validates either way", async () => {
      const { manager } = makeManager();
      await manager.buildIndex([gh("a", "srd24")]);
      expect(await manager.exportRef("srd24")).toEqual({ ref: "v1", refType: "git", dir: "srd24" });
      const plain = makeManager();
      await plain.manager.buildIndex([gh("a", "srd")]);
      expect(await plain.manager.exportRef("srd")).toEqual({ ref: "v1", refType: "git", dir: "srd" });
      const root = makeManager();
      root.adapter.files.set("Repo/content/f.json", feat("r"));
      await root.manager.buildIndex([{ id: "r", type: "vault", location: "Repo", enabled: true }]);
      expect(await root.manager.exportRef("r")).not.toHaveProperty("dir");
    });
  });
});

describe("fetching a GitHub source", () => {
  const FILES = Array.from({ length: 30 }, (_, i) => `content/f${i}.json`);
  let inFlight = 0;
  let peak = 0;
  let failOn: string | undefined;

  beforeEach(() => {
    inFlight = 0;
    peak = 0;
    failOn = undefined;
    vi.spyOn(obsidian as { requestUrl: unknown }, "requestUrl" as never).mockImplementation((async (req: { url: string }) => {
      if (req.url.includes("/git/trees/"))
        return { status: 200, json: { tree: FILES.map((path) => ({ path, type: "blob" })) }, text: "" };
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight--;
      const file = req.url.split("/v1/")[1];
      if (file === failOn) return { status: 500, json: {}, text: "" };
      const n = file?.match(/f(\d+)/)?.[1];
      return { status: 200, json: {}, text: n ? JSON.stringify([{ id: `s:feat:f${n}`, kind: "feat", name: `F${n}`, source: "s:book" }]) : "{}" };
    }) as never);
  });

  const ref = (id: string): SourceRef => ({ id, type: "github", location: "me/repo", pin: "v1", enabled: true });

  it("fetches files in parallel, but never more than the limit at once, across sources", async () => {
    const { manager } = makeManager();
    const index = await manager.buildIndex([ref("a"), ref("b")]);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
    expect(manager.statusFor("a")).toMatchObject({ state: "loaded", elementCount: 30 });
    expect(index.get("s:feat:f29")).toBeDefined();
  });

  it("reports progress while loading, ending with every source loaded", async () => {
    const { manager } = makeManager();
    const seen: string[] = [];
    manager.onProgress(() => {
      const s = manager.statusFor("a");
      if (s) seen.push(s.state === "loading" ? `${s.progress?.done ?? "-"}/${s.progress?.total ?? "-"}` : s.state);
    });
    await manager.buildIndex([ref("a")]);
    expect(seen).toContain("-/-");
    expect(seen).toContain("30/30");
    expect(seen.at(-1)).toBe("loaded");
  });

  it("marks the source as failed when one file fails", async () => {
    failOn = "content/f7.json";
    const { manager } = makeManager();
    await manager.buildIndex([ref("a")]);
    expect(manager.statusFor("a")?.state).toBe("error");
    expect(manager.statusFor("a")?.diagnostics[0].message).toContain("500");
  });
});
