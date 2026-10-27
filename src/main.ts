import { Notice, Plugin, TFile, TFolder, normalizePath } from "obsidian";
import type { ContentIndex } from "./core/content";
import type { FileKind, SourceRef, SourcesFile } from "./core/types";
import { CharacterStore } from "./obsidian/character-store";
import {
  DEFAULT_FILE_NAMES,
  blankBuild,
  blankDetails,
  blankInventory,
  blankSheet,
  blankSources,
  blankSpells,
  blankState,
  folderOf,
  serialiseJson,
} from "./obsidian/character-files";
import { DragonglassSettingTab } from "./obsidian/settings-tab";
import { DEFAULT_SETTINGS, withDefaults, type DragonglassSettings } from "./obsidian/settings";
import { SourceManager } from "./obsidian/sources";
import { DRAGONGLASS_VIEW, DragonglassFileView } from "./obsidian/view";
import { NewCharacterModal } from "./obsidian/modals/new-character";

export default class DragonglassPlugin extends Plugin {
  settings: DragonglassSettings = DEFAULT_SETTINGS;
  sources!: SourceManager;

  /** One store per character folder, shared by every view showing that character. */
  private stores = new Map<string, { store: CharacterStore; refs: number }>();
  private indexCache = new Map<string, ContentIndex>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.sources = new SourceManager(this.app, this.manifest.dir ?? "", this.settings.caching);

    // Obsidian binds one view type per extension, so the single view reads each
    // file's `kind` and renders the matching viewer.
    this.registerView(DRAGONGLASS_VIEW, (leaf) => new DragonglassFileView(leaf, this));
    this.registerExtensions(["5e"], DRAGONGLASS_VIEW);

    this.addSettingTab(new DragonglassSettingTab(this.app, this));

    this.addCommand({
      id: "new-character",
      name: "New character",
      callback: () => new NewCharacterModal(this.app, this, (folder) => void this.openCharacter(folder)).open(),
    });

    this.addCommand({
      id: "reload-sources",
      name: "Reload content sources",
      callback: () => void this.reloadSources(),
    });

    this.addCommand({
      id: "open-sheet",
      name: "Open character sheet for the active file",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "5e") return false;
        if (!checking) void this.openCharacter(folderOf(file.path));
        return true;
      },
    });

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        const entry = this.stores.get(folderOf(oldPath));
        // A renamed folder invalidates the store keyed by its old path.
        if (entry) void this.reloadSources();
        void file;
      }),
    );
  }

  onunload(): void {
    for (const { store } of this.stores.values()) void store.dispose();
    this.stores.clear();
  }

  // -- settings --------------------------------------------------------------

  async loadSettings(): Promise<void> {
    this.settings = withDefaults(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.sources.setTier(this.settings.caching);
    await this.reloadSources();
  }

  /** Drops every cached index so the next resolve picks up new content. */
  async reloadSources(): Promise<void> {
    this.sources.invalidate();
    this.indexCache.clear();
    for (const { store } of this.stores.values()) await store.reloadContent();
  }

  // -- content ---------------------------------------------------------------

  /**
   * An index for one character. Per-character sources take priority over vault-wide
   * ones and can switch vault-wide sources off, so each distinct override set gets
   * its own cached index.
   */
  async indexFor(characterSources?: SourcesFile): Promise<ContentIndex> {
    const own = characterSources?.sources ?? [];
    const disabled = characterSources?.disabled ?? [];
    const key = JSON.stringify([this.settings.sources, own, disabled]);
    const cached = this.indexCache.get(key);
    if (cached) return cached;
    const index = await this.sources.buildIndex(this.settings.sources, own, disabled);
    this.indexCache.set(key, index);
    return index;
  }

  // -- stores ----------------------------------------------------------------

  async acquireStore(folder: string): Promise<CharacterStore> {
    const existing = this.stores.get(folder);
    if (existing) {
      existing.refs += 1;
      return existing.store;
    }
    const store = new CharacterStore(
      {
        app: this.app,
        indexFor: (sources) => this.indexFor(sources),
        enforceRequirements: () => this.settings.enforceRequirements,
        writeDebounceMs: () => this.settings.writeDebounceMs,
      },
      folder,
    );
    this.stores.set(folder, { store, refs: 1 });
    store.watch();
    await store.load();
    return store;
  }

  releaseStore(folder: string): void {
    const entry = this.stores.get(folder);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    this.stores.delete(folder);
    void entry.store.dispose();
  }

  // -- character creation ----------------------------------------------------

  async createCharacter(name: string, parentFolder = this.settings.charactersFolder): Promise<string> {
    const safe = name.replace(/[\\/:*?"<>|]/g, "-").trim() || "New Character";
    const folder = await this.uniqueFolder(normalizePath(`${parentFolder}/${safe}`));
    await this.ensureFolder(folder);

    const files: Record<FileKind, string | undefined> = {
      sheet: serialiseJson(blankSheet(safe)),
      build: serialiseJson(blankBuild(safe)),
      state: serialiseJson(blankState()),
      spells: serialiseJson(blankSpells()),
      inventory: serialiseJson(blankInventory()),
      sources: serialiseJson(blankSources()),
      details: blankDetails(safe),
      layout: undefined,
      gallery: undefined,
    };

    for (const [kind, contents] of Object.entries(files)) {
      if (contents === undefined) continue;
      await this.app.vault.create(normalizePath(`${folder}/${DEFAULT_FILE_NAMES[kind as FileKind]}`), contents);
    }
    return folder;
  }

  async openCharacter(folder: string): Promise<void> {
    const path = normalizePath(`${folder}/${DEFAULT_FILE_NAMES.sheet}`);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`No sheet.5e in ${folder}`);
      return;
    }
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  private async ensureFolder(path: string): Promise<void> {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`"${current}" exists and is not a folder`);
      await this.app.vault.createFolder(current);
    }
  }

  private async uniqueFolder(base: string): Promise<string> {
    if (!this.app.vault.getAbstractFileByPath(base)) return base;
    for (let n = 2; n < 100; n++) {
      const candidate = `${base} ${n}`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    throw new Error(`too many folders named like "${base}"`);
  }

  /** Adds a source to the vault-wide list, keeping ids unique. */
  async addSource(ref: SourceRef): Promise<void> {
    const taken = new Set(this.settings.sources.map((s) => s.id));
    let id = ref.id;
    for (let n = 2; taken.has(id); n++) id = `${ref.id}-${n}`;
    this.settings.sources = [...this.settings.sources, { ...ref, id }];
    await this.saveSettings();
  }
}
