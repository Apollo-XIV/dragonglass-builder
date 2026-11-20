import { FileView, Notice, Platform, Plugin, TFile, TFolder, normalizePath } from "obsidian";
import type { ContentIndex } from "./core/content";
import type { FileKind, SourceRef, SourcesFile } from "./core/types";
import { exportAvatar } from "./obsidian/avatar-actions";
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
  characterSheetPath,
  clickedExplorerFolder,
  folderOf,
  serialiseJson,
} from "./obsidian/character-files";
import {
  EXPORT_EXTENSION,
  ExportError,
  embedReader,
  exportDocument,
  exportText,
  unsavedWarning,
  writeExport,
} from "./obsidian/export-character";
import { EXPORT_VIEW, ExportFileView } from "./obsidian/export-view";
import { registerGameIcons } from "./obsidian/icons";
import { DragonglassSettingTab } from "./obsidian/settings-tab";
import { DEFAULT_SETTINGS, withDefaults, type DragonglassSettings } from "./obsidian/settings";
import { SourceManager } from "./obsidian/sources";
import { UPDATE_CHECK_MS, UpdatesModal, applyUpdates, scanForUpdates, type UpdateOffer } from "./obsidian/source-updates";
import { DRAGONGLASS_VIEW, DragonglassFileView } from "./obsidian/view";
import type { Draft, DraftStore } from "./obsidian/ui/builder/drafts";
import { NewCharacterModal } from "./obsidian/modals/new-character";

export default class DragonglassPlugin extends Plugin {
  settings: DragonglassSettings = DEFAULT_SETTINGS;
  sources!: SourceManager;

  /**
   * Builder drafts, by character folder (spec 7.9). They live in the plugin's
   * own data rather than in the vault, because the whole point of a draft is
   * that the character's files still say what the character is.
   */
  private drafts: Record<string, Draft> = {};
  private draftTimer = 0;

  readonly draftStore: DraftStore = {
    get: (folder) => this.drafts[folder],
    set: (folder, draft) => {
      this.drafts[folder] = draft;
      this.scheduleDraftSave();
    },
    clear: (folder) => {
      if (!(folder in this.drafts)) return;
      delete this.drafts[folder];
      this.scheduleDraftSave();
    },
  };

  /** One store per character folder, shared by every view showing that character. */
  private stores = new Map<string, { store: CharacterStore; refs: number }>();
  private indexCache = new Map<string, ContentIndex>();
  /** Newer releases found by the last scan; empty until one has run. */
  updateOffers: UpdateOffer[] = [];
  /** Source id to why the last scan couldn't check it. */
  updateProblems = new Map<string, string>();
  private updateListeners = new Set<() => void>();
  private scanning = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    registerGameIcons();
    this.sources = new SourceManager(this.app, this.manifest.dir ?? "", this.settings.caching);

    // Obsidian binds one view type per extension, so the single view reads each
    // file's `kind` and renders the matching viewer.
    this.registerView(DRAGONGLASS_VIEW, (leaf) => new DragonglassFileView(leaf, this));
    this.registerExtensions(["5e"], DRAGONGLASS_VIEW);

    // Exports get an extension of their own: Obsidian lists no .json file, and
    // registering .json would take every other one in the vault.
    this.registerView(EXPORT_VIEW, (leaf) => new ExportFileView(leaf));
    this.registerExtensions([EXPORT_EXTENSION], EXPORT_VIEW);

    this.addSettingTab(new DragonglassSettingTab(this.app, this));

    const newCharacter = () =>
      new NewCharacterModal(this.app, this, (folder) => void this.openCharacter(folder, "build")).open();

    this.addRibbonIcon("dg-d20", "New character", newCharacter);

    this.addCommand({
      id: "new-character",
      name: "New character",
      callback: newCharacter,
    });

    this.addCommand({
      id: "scan-source-updates",
      name: "Scan sources for updates",
      callback: () => void this.checkForUpdates(true),
    });

    // Quietly, a little after start so it never competes with the first load, then every few hours.
    const scheduled = (): void => {
      if (this.settings.autoCheckUpdates) void this.checkForUpdates(false);
    };
    this.registerInterval(window.setTimeout(scheduled, 30_000));
    this.registerInterval(window.setInterval(scheduled, UPDATE_CHECK_MS));

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

    this.addCommand({
      id: "export-character",
      name: "Export character",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "5e") return false;
        if (!checking) void this.exportCharacter(folderOf(file.path), file.path);
        return true;
      },
    });

    this.addCommand({
      id: "export-character-to-clipboard",
      name: "Export character to clipboard",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "5e") return false;
        if (!checking) void this.exportCharacter(folderOf(file.path), file.path, "clipboard");
        return true;
      },
    });

    // A click on a character's folder opens its sheet instead of toggling the folder; the
    // chevron still toggles. Capture phase, so it runs before the explorer's own handler.
    // A middle click always opens a new tab, as it does for a file.
    const onExplorerClick = (evt: MouseEvent, newTab: boolean): void => {
      const target = evt.target instanceof Element ? evt.target : null;
      const indicator = target
        ?.closest(".nav-folder-title")
        ?.querySelector(".nav-folder-collapse-indicator, .collapse-icon")
        ?.getBoundingClientRect();
      const chevron = indicator ? { x: evt.clientX, left: indicator.left, right: indicator.right } : undefined;
      const folder = clickedExplorerFolder(target, evt, chevron);
      if (folder === null) return;
      if (!(this.app.vault.getAbstractFileByPath(characterSheetPath(folder)) instanceof TFile)) return;
      evt.preventDefault();
      evt.stopPropagation();
      void this.openCharacter(folder, "sheet", newTab ? "tab" : "reuse");
    };
    this.registerDomEvent(document, "click", (evt) => onExplorerClick(evt, false), true);
    this.registerDomEvent(
      document,
      "auxclick",
      (evt) => {
        if (evt.button === 1) onExplorerClick(evt, true);
      },
      true,
    );

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
    // A draft that only exists in the debounce timer would be lost on reload.
    if (this.draftTimer) {
      window.clearTimeout(this.draftTimer);
      this.draftTimer = 0;
      void this.persist();
    }
  }

  // -- settings --------------------------------------------------------------

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as
      | (Partial<DragonglassSettings> & { drafts?: Record<string, Draft> })
      | null;
    this.drafts = stored?.drafts ?? {};
    const { drafts, ...settings } = stored ?? {};
    void drafts;
    this.settings = withDefaults(settings);
  }

  async saveSettings(): Promise<void> {
    await this.persist();
    this.sources.setTier(this.settings.caching);
    await this.reloadSources();
  }

  /** Settings and drafts share one data file, so both are written together. */
  private async persist(): Promise<void> {
    await this.saveData({ ...this.settings, drafts: this.drafts });
  }

  /** A draft is touched on every edit; the disk doesn't need to hear each one. */
  private scheduleDraftSave(): void {
    if (this.draftTimer) window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => {
      this.draftTimer = 0;
      void this.persist();
    }, 800);
  }

  /**
   * Builds the character's export and puts it in the configured folder or on the
   * clipboard. Both are the same validated document.
   */
  async exportCharacter(folder: string, fromPath: string, to: "file" | "clipboard" = "file"): Promise<void> {
    const store = await this.acquireStore(folder);
    try {
      const warning = unsavedWarning(store);
      if (warning) new Notice(warning, 8000);
      const doc = await exportDocument(store, {
        sources: this.sources,
        embed: embedReader(this.app, fromPath),
        avatar: (path) => exportAvatar(this.app, path),
        exportedAt: new Date().toISOString(),
        pluginVersion: this.manifest.version,
      });
      if (to === "clipboard") {
        await navigator.clipboard.writeText(exportText(doc));
        new Notice(`Copied ${doc.identity.name} to the clipboard`);
        return;
      }
      const path = await writeExport(this.app.vault.adapter, this.settings.exportFolder, doc);
      this.noticeExported(doc.identity.name, path);
    } catch (e) {
      const lines = e instanceof ExportError ? e.lines : [];
      new Notice([`Export failed: ${e instanceof Error ? e.message : String(e)}`, ...lines].join("\n"), 10000);
    } finally {
      this.releaseStore(folder);
    }
  }

  /**
   * "Show in folder" is Electron's, reached through an app method the public API does
   * not declare. So it is offered only on desktop and only where the method exists.
   */
  private noticeExported(name: string, path: string): void {
    const app = this.app as unknown as { showInFolder?: (path: string) => void };
    const notice = new Notice(`Exported ${name} to ${path}`, 10000);
    if (!Platform.isDesktopApp || typeof app.showInFolder !== "function") return;
    notice.messageEl.createEl("button", { text: "Show in folder" }).addEventListener("click", () => {
      try {
        app.showInFolder?.(path);
      } catch {
        new Notice("Could not open the folder");
      }
      notice.hide();
    });
  }

  /** Drops every cached index so the next resolve picks up new content. */
  async reloadSources(): Promise<void> {
    this.sources.invalidate();
    this.indexCache.clear();
    for (const { store } of this.stores.values()) await store.reloadContent();
  }

  // -- source updates --------------------------------------------------------

  /** Called whenever a scan finishes or an update is applied, so a menu can redraw its button. */
  onUpdates(listener: () => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  private setOffers(offers: UpdateOffer[]): void {
    this.updateOffers = offers;
    for (const listener of this.updateListeners) listener();
  }

  /** Looks for newer releases of pinned sources. `manual` says so when there is nothing to report. */
  async checkForUpdates(manual: boolean): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const { offers, problems } = await scanForUpdates(this, [...this.stores].map(([folder, { store }]) => [folder, store]));
      this.updateProblems = problems;
      this.setOffers(offers);
      if (manual)
        new Notice(
          offers.length
            ? `${offers.length} to update`
            : problems.size
              ? `Every source that could be checked is up to date; ${problems.size} couldn't be`
              : "Every source is up to date",
        );
    } finally {
      this.scanning = false;
    }
  }

  /** Asks first; the pins only move on the click. */
  confirmUpdates(): void {
    if (!this.updateOffers.length) return;
    const offers = this.updateOffers;
    new UpdatesModal(this.app, offers, async () => {
      await applyUpdates(this, offers, (folder) => this.stores.get(folder)?.store);
      this.setOffers([]);
      void this.checkForUpdates(false);
    }).open();
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
    if (cached) {
      cached.setRulesetOverrides(this.settings.rulesets);
      return cached;
    }
    const index = await this.sources.buildIndex(this.settings.sources, own, disabled);
    index.setRulesetOverrides(this.settings.rulesets);
    this.indexCache.set(key, index);
    return index;
  }

  /**
   * Says what ruleset a sourcebook that declares none belongs to. The indexes already
   * built are told too: pickers read the ruleset when they open, so nothing reloads.
   */
  async setRuleset(sourcebookId: string, ruleset: string | undefined): Promise<void> {
    const { [sourcebookId]: _gone, ...rest } = this.settings.rulesets;
    this.settings.rulesets = ruleset ? { ...rest, [sourcebookId]: ruleset } : rest;
    for (const index of this.indexCache.values()) index.setRulesetOverrides(this.settings.rulesets);
    await this.saveSettings();
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

  /**
   * Opens one of a character's files in a tab. A brand new character opens in
   * the builder, because there is nothing to play yet; everything else opens
   * the sheet. Moving between the two afterwards happens in place, from the
   * view's own pane menu.
   */
  /**
   * `reuse` brings forward a pane already showing this character (its sheet or its
   * builder, the sheet first) and only opens a tab if there is none.
   */
  async openCharacter(folder: string, kind: FileKind = "sheet", mode: "tab" | "reuse" = "tab"): Promise<void> {
    const path = normalizePath(`${folder}/${DEFAULT_FILE_NAMES[kind]}`);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`No ${DEFAULT_FILE_NAMES[kind]} in ${folder}`);
      return;
    }
    if (mode === "reuse") {
      const open = this.app.workspace
        .getLeavesOfType(DRAGONGLASS_VIEW)
        .filter((leaf) => leaf.view instanceof FileView && leaf.view.file && folderOf(leaf.view.file.path) === folder);
      const onSheet = open.find((leaf) => leaf.view instanceof FileView && leaf.view.file?.path === path);
      const leaf = onSheet ?? open[0];
      if (leaf) {
        await this.app.workspace.revealLeaf(leaf);
        return;
      }
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
