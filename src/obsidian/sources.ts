/**
 * Source loading. A source is a location: a vault folder, a path outside the vault
 * (desktop only), or a pinned GitHub repo. Every source resolves to a SourceBundle,
 * which the pure core turns into elements.
 *
 * GitHub sources are pinned to a tag or commit SHA, so a fix pushed upstream can't
 * silently change anyone's AC.
 */

import { Platform, requestUrl, normalizePath, type App, type DataAdapter } from "obsidian";
import type { Diagnostic, SourceRef } from "../core/types";
import { ContentIndex, type LoadedSource } from "../core/content";
import { contentHash } from "../core/export/hash";
import { bundleToLoadedSource, parseManifest, type SourceBundle, type SourceFile } from "../core/content/source-bundle";
import { CORE_ELEMENTS, CORE_SOURCE_ID, CORE_SOURCE_NAME } from "../generated/core-content";
import type { CacheTier } from "./settings";

/** vault and path sources are local files the plugin can write back to; github and url are fetched. */
export function isWritableSource(ref: Pick<SourceRef, "type">): boolean {
  return ref.type === "vault" || ref.type === "path";
}

export interface SourceStatus {
  ref: SourceRef;
  state: "loaded" | "error" | "loading" | "disabled" | "cached";
  elementCount: number;
  diagnostics: Diagnostic[];
  /** Where the bytes came from, for the sources panel. */
  origin?: string;
  /**
   * The id the content index actually filed this source's elements under — a
   * source's own `source.json` id wins over its `SourceRef.id` (so ids survive a
   * renamed settings entry), which means the two can differ. Browsing a source
   * has to filter by this one, not `ref.id`.
   */
  sourceId: string;
}

interface CacheEntry {
  /** Source id plus pin, so changing a pin is a cache miss rather than a silent reuse. */
  key: string;
  fetchedAt: string;
  manifest: SourceBundle["manifest"];
  files: SourceFile[];
}

const CACHE_FILE = "source-cache.json";

function error(subject: string, message: string): Diagnostic {
  return { severity: "error", code: "invalid-element", message, subject, source: subject };
}

/** The built-in core source: kind definitions and stat paths. Always highest priority. */
export function coreSource(): LoadedSource {
  return { id: CORE_SOURCE_ID, name: CORE_SOURCE_NAME, elements: CORE_ELEMENTS };
}

export class SourceManager {
  private cache = new Map<string, CacheEntry>();
  private loaded = new Map<string, LoadedSource>();
  private statuses = new Map<string, SourceStatus>();
  private cacheLoaded = false;

  constructor(
    private readonly app: App,
    private readonly pluginDir: string,
    private tier: CacheTier,
  ) {}

  setTier(tier: CacheTier): void {
    this.tier = tier;
  }

  statusList(): SourceStatus[] {
    return [...this.statuses.values()];
  }

  statusFor(id: string): SourceStatus | undefined {
    return this.statuses.get(id);
  }

  /** Forgets a source so the next build refetches it. */
  invalidate(id?: string): void {
    if (id) {
      this.loaded.delete(id);
      this.cache.delete(id);
    } else {
      this.loaded.clear();
      this.cache.clear();
    }
  }

  private get adapter(): DataAdapter {
    return this.app.vault.adapter;
  }

  private cachePath(): string {
    return normalizePath(`${this.pluginDir}/${CACHE_FILE}`);
  }

  private async loadCache(): Promise<void> {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    try {
      if (!(await this.adapter.exists(this.cachePath()))) return;
      const raw = JSON.parse(await this.adapter.read(this.cachePath())) as CacheEntry[];
      for (const entry of raw) this.cache.set(entry.key.split("@")[0], entry);
    } catch {
      // A corrupt cache is never fatal: refetch instead.
      this.cache.clear();
    }
  }

  private async saveCache(): Promise<void> {
    if (this.tier === "none") return;
    try {
      await this.adapter.write(this.cachePath(), JSON.stringify([...this.cache.values()]));
    } catch {
      // Caching is an optimisation; failing to write one is not worth an error.
    }
  }

  /**
   * Builds an index from vault-wide sources plus a character's own.
   * Per-character sources take priority, and can disable vault-wide ones.
   */
  async buildIndex(
    vaultSources: SourceRef[],
    characterSources: SourceRef[] = [],
    disabled: string[] = [],
  ): Promise<ContentIndex> {
    await this.loadCache();
    const off = new Set(disabled);
    const seen = new Set<string>();
    const ordered: SourceRef[] = [];

    // More specific always wins: the character's own list comes first, and the first
    // mention of an id settles its pin and settings.
    for (const ref of [...characterSources, ...vaultSources]) {
      if (!ref?.id || seen.has(ref.id)) continue;
      seen.add(ref.id);
      if (ref.enabled === false || off.has(ref.id)) {
        this.statuses.set(ref.id, { ref, state: "disabled", elementCount: 0, diagnostics: [], sourceId: ref.id });
        continue;
      }
      ordered.push(ref);
    }

    const sources: LoadedSource[] = [];
    for (const ref of ordered) sources.push(await this.load(ref));
    // Core sits at the bottom so any source can replace a kind definition.
    sources.push(coreSource());
    return ContentIndex.build(sources);
  }

  private async readBundle(ref: SourceRef): Promise<{ bundle: SourceBundle; origin: string }> {
    switch (ref.type) {
      case "vault":
        return { bundle: await this.readVaultFolder(ref), origin: ref.location };
      case "path":
        return { bundle: await this.readLocalPath(ref), origin: `${ref.location} (outside the vault)` };
      case "github":
        return this.readGithub(ref);
      case "url":
        return { bundle: await this.readUrl(ref), origin: ref.location };
    }
  }

  /**
   * What pins a loaded source in an export: the git pin of a GitHub source,
   * otherwise a hash of its files read now. Never a location.
   */
  async exportRef(sourceId: string): Promise<{ ref: string; refType: "git" | "hash" } | undefined> {
    const loaded = [...this.loaded.values()].find((l) => l.id === sourceId);
    const ref = loaded?.ref;
    if (!loaded || !ref) return undefined;
    if (ref.type === "github" && ref.pin) return { ref: ref.pin, refType: "git" };
    let files: SourceFile[];
    try {
      files = (await this.readBundle(ref)).bundle.files;
    } catch {
      const cached = this.cache.get(ref.id);
      if (!cached) return undefined;
      files = cached.files;
    }
    return { ref: await contentHash(files), refType: "hash" };
  }

  private async load(ref: SourceRef): Promise<LoadedSource> {
    const cached = this.loaded.get(ref.id);
    if (cached) return cached;

    let bundle: SourceBundle | undefined;
    let diagnostics: Diagnostic[] = [];
    let origin = ref.location;

    try {
      ({ bundle, origin } = await this.readBundle(ref));
    } catch (e) {
      diagnostics = [error(ref.id, e instanceof Error ? e.message : String(e))];
    }

    if (!bundle) {
      const fallback = this.cache.get(ref.id);
      if (fallback) {
        // A cached copy keeps characters working offline, with the failure still shown.
        const loaded = bundleToLoadedSource({ manifest: fallback.manifest, files: fallback.files });
        loaded.id = fallback.manifest.id || ref.id;
        loaded.ref = ref;
        loaded.diagnostics = [...(loaded.diagnostics ?? []), ...diagnostics];
        this.loaded.set(ref.id, loaded);
        this.statuses.set(ref.id, {
          ref,
          state: "cached",
          elementCount: loaded.elements.length,
          diagnostics: loaded.diagnostics,
          origin: `cache from ${fallback.fetchedAt}`,
          sourceId: loaded.id,
        });
        return loaded;
      }
      const empty: LoadedSource = { id: ref.id, name: ref.name, elements: [], diagnostics };
      this.statuses.set(ref.id, { ref, state: "error", elementCount: 0, diagnostics, origin, sourceId: ref.id });
      return empty;
    }

    // The source's own id wins over the settings entry, so ids stay stable when a
    // user renames a folder.
    const loaded = bundleToLoadedSource(bundle);
    loaded.id = bundle.manifest.id || ref.id;
    loaded.name = bundle.manifest.name ?? ref.name;
    loaded.ref = ref;
    loaded.diagnostics = [...(loaded.diagnostics ?? []), ...diagnostics];

    this.loaded.set(ref.id, loaded);
    this.statuses.set(ref.id, {
      ref,
      state: "loaded",
      elementCount: loaded.elements.length,
      diagnostics: loaded.diagnostics,
      origin,
      sourceId: loaded.id,
    });
    if (this.tier !== "none") {
      this.cache.set(ref.id, {
        key: `${ref.id}@${ref.pin ?? ""}`,
        fetchedAt: new Date().toISOString(),
        manifest: bundle.manifest,
        files: bundle.files,
      });
      void this.saveCache();
    }
    return loaded;
  }

  // -- writers (vault and path sources only; github and url are read-only) --

  /** Every content JSON file in a source, as paths relative to the source root. */
  async listFiles(ref: SourceRef): Promise<string[]> {
    if (ref.type === "vault") {
      const root = normalizePath(ref.location);
      const out: string[] = [];
      const walk = async (dir: string): Promise<void> => {
        if (!(await this.adapter.exists(dir))) return;
        const listing = await this.adapter.list(dir);
        for (const file of listing.files)
          if (file.endsWith(".json") && !file.endsWith("source.json")) out.push(file.slice(root.length + 1));
        for (const folder of listing.folders) await walk(folder);
      };
      await walk(normalizePath(`${root}/content`));
      return out;
    }
    if (ref.type === "path") {
      if (!Platform.isDesktopApp) return [];
      const fs: typeof import("node:fs") = require("node:fs");
      const path: typeof import("node:path") = require("node:path");
      const root = ref.location;
      const out: string[] = [];
      const walk = (dir: string): void => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir).sort()) {
          const full = path.join(dir, entry);
          if (fs.statSync(full).isDirectory()) walk(full);
          else if (entry.endsWith(".json") && entry !== "source.json") out.push(path.relative(root, full));
        }
      };
      walk(path.join(root, "content"));
      return out;
    }
    return [];
  }

  /** Whether a file exists, by path relative to the source root. */
  async fileExists(ref: SourceRef, relPath: string): Promise<boolean> {
    if (ref.type === "vault") return this.adapter.exists(normalizePath(`${ref.location}/${relPath}`));
    if (ref.type === "path") {
      const fs: typeof import("node:fs") = require("node:fs");
      const path: typeof import("node:path") = require("node:path");
      return fs.existsSync(path.join(ref.location, relPath));
    }
    return false;
  }

  /** Reads one file's raw text, by path relative to the source root. */
  async readFile(ref: SourceRef, relPath: string): Promise<string> {
    if (ref.type === "vault") return this.adapter.read(normalizePath(`${ref.location}/${relPath}`));
    if (ref.type === "path") {
      const fs: typeof import("node:fs") = require("node:fs");
      const path: typeof import("node:path") = require("node:path");
      return fs.readFileSync(path.join(ref.location, relPath), "utf8");
    }
    throw new Error(`"${ref.id}" is read-only`);
  }

  /** Writes one file's raw text, creating parent folders as needed. */
  async writeFile(ref: SourceRef, relPath: string, text: string): Promise<void> {
    if (ref.type === "vault") {
      const full = normalizePath(`${ref.location}/${relPath}`);
      await this.ensureVaultFolder(full.slice(0, full.lastIndexOf("/")));
      await this.adapter.write(full, text);
      return;
    }
    if (ref.type === "path") {
      const fs: typeof import("node:fs") = require("node:fs");
      const path: typeof import("node:path") = require("node:path");
      const full = path.join(ref.location, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text, "utf8");
      return;
    }
    throw new Error(`"${ref.id}" is read-only; only a vault folder or a local path can be edited`);
  }

  private async ensureVaultFolder(dir: string): Promise<void> {
    if (!dir || (await this.adapter.exists(dir))) return;
    const parts = dir.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.adapter.exists(current))) await this.adapter.mkdir(current);
    }
  }

  /**
   * Scaffolds a brand-new source: `source.json` plus an empty `content/` folder,
   * for "create a source from scratch" to then populate through the wizard.
   */
  async createSource(ref: Omit<SourceRef, "id"> & { id: string }, manifest: SourceBundle["manifest"]): Promise<void> {
    if (!isWritableSource(ref)) throw new Error("only a vault folder or a local path can be created this way");
    if (ref.type === "path" && !Platform.isDesktopApp)
      throw new Error("paths outside the vault need the desktop app; use a vault folder instead");

    if (ref.type === "vault") {
      const root = normalizePath(ref.location);
      if (await this.adapter.exists(root)) throw new Error(`"${ref.location}" already exists`);
      await this.ensureVaultFolder(root);
      await this.ensureVaultFolder(normalizePath(`${root}/content`));
      await this.adapter.write(normalizePath(`${root}/source.json`), `${JSON.stringify(manifest, null, 2)}\n`);
    } else {
      const fs: typeof import("node:fs") = require("node:fs");
      const path: typeof import("node:path") = require("node:path");
      if (fs.existsSync(ref.location)) throw new Error(`"${ref.location}" already exists`);
      fs.mkdirSync(path.join(ref.location, "content"), { recursive: true });
      fs.writeFileSync(path.join(ref.location, "source.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }
  }

  // -- readers ---------------------------------------------------------------

  private async readVaultFolder(ref: SourceRef): Promise<SourceBundle> {
    const root = normalizePath(ref.location);
    const manifestPath = normalizePath(`${root}/source.json`);
    const manifestText = (await this.adapter.exists(manifestPath))
      ? await this.adapter.read(manifestPath)
      : "{}";
    const { manifest } = parseManifest(manifestText, ref.id);

    const files: SourceFile[] = [];
    const walk = async (dir: string): Promise<void> => {
      const listing = await this.adapter.list(dir);
      for (const file of listing.files)
        if (file.endsWith(".json") && !file.endsWith("source.json"))
          files.push({ path: file.slice(root.length + 1), text: await this.adapter.read(file) });
      for (const folder of listing.folders) await walk(folder);
    };

    const contentRoot = normalizePath(`${root}/content`);
    if (await this.adapter.exists(contentRoot)) await walk(contentRoot);
    else if (await this.adapter.exists(root)) await walk(root);
    else throw new Error(`vault folder "${ref.location}" does not exist`);

    return { manifest: { ...manifest, id: manifest.id || ref.id }, files };
  }

  private async readLocalPath(ref: SourceRef): Promise<SourceBundle> {
    if (!Platform.isDesktopApp)
      throw new Error("paths outside the vault need the desktop app; use a vault folder or a GitHub source");
    // Required lazily so the mobile bundle never reaches for node builtins.
    const fs: typeof import("node:fs") = require("node:fs");
    const path: typeof import("node:path") = require("node:path");

    const root = ref.location;
    if (!fs.existsSync(root)) throw new Error(`"${root}" does not exist`);
    const manifestPath = path.join(root, "source.json");
    const { manifest } = parseManifest(
      fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "{}",
      ref.id,
    );

    const files: SourceFile[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir).sort()) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith(".json"))
          files.push({ path: path.relative(root, full), text: fs.readFileSync(full, "utf8") });
      }
    };
    const contentRoot = path.join(root, "content");
    walk(fs.existsSync(contentRoot) ? contentRoot : root);

    return { manifest: { ...manifest, id: manifest.id || ref.id }, files };
  }

  private async readGithub(ref: SourceRef): Promise<{ bundle: SourceBundle; origin: string }> {
    const [owner, repo] = ref.location.split("/");
    if (!owner || !repo) throw new Error(`"${ref.location}" is not an owner/repo pair`);
    const pin = ref.pin ?? (await this.defaultBranch(owner, repo));
    if (!ref.pin) {
      // Not fatal, but worth saying: an unpinned source can change under the user.
      this.statuses.set(ref.id, {
        ref,
        state: "loading",
        elementCount: 0,
        diagnostics: [
          {
            severity: "warning",
            code: "invalid-element",
            message: `"${ref.id}" is not pinned; it follows ${pin} and can change without warning`,
            subject: ref.id,
            source: ref.id,
          },
        ],
        sourceId: ref.id,
      });
    }

    const tree = await this.json<{ tree: { path: string; type: string }[]; truncated?: boolean }>(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(pin)}?recursive=1`,
    );
    if (tree.truncated)
      throw new Error(`"${ref.location}" is too large to list in one request; split the source`);

    const raw = (file: string) =>
      `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(pin)}/${file}`;

    const manifestEntry = tree.tree.find((e) => e.path === "source.json");
    const { manifest } = parseManifest(
      manifestEntry ? await this.text(raw("source.json")) : "{}",
      ref.id,
    );

    const contentFiles = tree.tree.filter(
      (e) => e.type === "blob" && e.path.startsWith("content/") && e.path.endsWith(".json"),
    );
    const files: SourceFile[] = [];
    for (const entry of contentFiles) files.push({ path: entry.path, text: await this.text(raw(entry.path)) });

    return {
      bundle: { manifest: { ...manifest, id: manifest.id || ref.id }, files },
      origin: `github.com/${ref.location}@${pin}`,
    };
  }

  private async readUrl(ref: SourceRef): Promise<SourceBundle> {
    // A single JSON file, for sharing one homebrew element or a small bundle.
    const text = await this.text(ref.location);
    return {
      manifest: { id: ref.id, name: ref.name },
      files: [{ path: ref.location.split("/").pop() ?? "content.json", text }],
    };
  }

  private async defaultBranch(owner: string, repo: string): Promise<string> {
    const info = await this.json<{ default_branch?: string }>(`https://api.github.com/repos/${owner}/${repo}`);
    return info.default_branch ?? "main";
  }

  /** Obsidian's requestUrl works on mobile and avoids CORS. */
  private async text(url: string): Promise<string> {
    const response = await requestUrl({ url, throw: false });
    if (response.status >= 400) throw new Error(`${response.status} fetching ${url}`);
    return response.text;
  }

  private async json<T>(url: string): Promise<T> {
    const response = await requestUrl({ url, throw: false, headers: { Accept: "application/vnd.github+json" } });
    if (response.status >= 400) {
      const hint = response.status === 403 ? " (GitHub rate limit, most likely)" : "";
      throw new Error(`${response.status} fetching ${url}${hint}`);
    }
    return response.json as T;
  }
}
