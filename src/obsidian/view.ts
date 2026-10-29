import { FileView, Menu, Notice, Platform, TFile, type WorkspaceLeaf } from "obsidian";
import { StrictMode, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type DragonglassPlugin from "../main";
import type { FileKind, SheetFile } from "../core/types";
import { DEFAULT_FILE_NAMES, counterpartKind, fileName, folderOf, switchLabel } from "./character-files";
import type { CharacterStore } from "./character-store";
import { CharacterApp } from "./ui/CharacterApp";
import { PluginContext } from "./ui/context";
import { ShellContext, createHaptics, type Shell } from "./ui/narrow/platform";
import { resolveAccent } from "./settings";

export const DRAGONGLASS_VIEW = "dragonglass-5e-view";

/** Reverse of DEFAULT_FILE_NAMES, for files that declare no kind of their own. */
const KIND_BY_FILENAME = new Map<string, FileKind>(
  Object.entries(DEFAULT_FILE_NAMES).map(([kind, name]) => [name, kind as FileKind]),
);

/**
 * Works out which viewer a `.5e` file wants. A file's own `kind` wins; failing that
 * the manifest's mapping, then its default filename.
 */
export function detectKind(path: string, text: string, manifest?: SheetFile): FileKind {
  const name = fileName(path);
  const override = manifest?.kinds?.[name] ?? manifest?.kinds?.[path];
  if (override) return override;

  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    const match = trimmed.match(/"kind"\s*:\s*"([a-z]+)"/);
    if (match && isFileKind(match[1])) return match[1];
  } else if (trimmed.startsWith("---")) {
    const match = trimmed.match(/^---[\s\S]*?\bkind:\s*([a-z]+)/);
    if (match && isFileKind(match[1])) return match[1];
  }

  if (manifest?.files)
    for (const [kind, mapped] of Object.entries(manifest.files))
      if (mapped === name && isFileKind(kind)) return kind;

  return KIND_BY_FILENAME.get(name) ?? "sheet";
}

function isFileKind(value: string): value is FileKind {
  return value in DEFAULT_FILE_NAMES;
}

export class DragonglassFileView extends FileView {
  allowNoFile = false;
  private root?: Root;
  private store?: CharacterStore;
  private storeFolder?: string;
  private kind: FileKind = "sheet";
  /** The HUD the narrow layout writes into the title (spec 2.2). */
  private hud?: string;
  private shell: Shell = {
    haptics: createHaptics(() => this.plugin.settings.narrow.haptics),
    drafts: {
      get: (folder) => this.plugin.draftStore.get(folder),
      set: (folder, draft) => this.plugin.draftStore.set(folder, draft),
      clear: (folder) => this.plugin.draftStore.clear(folder),
    },
    setTitle: (text) => {
      if (this.hud === text) return;
      this.hud = text;
      // Not in the public API, but it is how a view asks for its own tab header
      // to be redrawn; without it the HUD would only update on a tab switch.
      (this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
    },
    openSheet: () => void this.switchTo("sheet"),
    setLayout: (mode) => {
      // The narrow layout owns its scrolling so that sticky headers work, which
      // means the view's own element must stop scrolling (spec 5).
      this.contentEl.toggleClass("is-narrow", mode === "narrow");
      this.contentEl.toggleClass("is-desktop", mode === "desktop");
    },
  };

  constructor(leaf: WorkspaceLeaf, private readonly plugin: DragonglassPlugin) {
    super(leaf);
    this.navigation = true;
  }

  getViewType(): string {
    return DRAGONGLASS_VIEW;
  }

  getIcon(): string {
    return this.kind === "inventory" ? "backpack" : this.kind === "spells" ? "sparkles" : "shield";
  }

  getDisplayText(): string {
    if (this.hud) return this.hud;
    if (!this.file) return "Character";
    const name = this.store?.data.sheet?.name ?? this.store?.data.build?.name;
    const label = this.kind === "sheet" ? "" : ` · ${this.kind}`;
    return name ? `${name}${label}` : this.file.basename;
  }

  /**
   * Sheet and builder are two files, so moving between them is opening the
   * other one. It goes in the pane menu rather than on screen: Obsidian already
   * gives every view a ⋮, and the narrow layout's whole premise is that it adds
   * no chrome of its own (spec 2.1).
   */
  onPaneMenu(menu: Menu, source: string): void {
    super.onPaneMenu(menu, source);
    const counterpart = counterpartKind(this.kind);
    if (!counterpart) return;

    menu.addItem((item) =>
      item
        .setTitle(switchLabel(counterpart))
        .setIcon(counterpart === "build" ? "wrench" : "shield")
        .setSection("pane")
        .onClick(() => void this.switchTo(counterpart)),
    );
  }

  /**
   * Switches in the same tab. The view already rebuilds itself around whatever
   * file it is given, and the store is per character folder rather than per
   * file, so the two viewers are one `openFile` apart and nothing is reloaded
   * that doesn't have to be. Leaving the builder this way unmounts it, which is
   * what hands its unsaved work to the draft (spec 7.9).
   */
  private async switchTo(kind: FileKind): Promise<void> {
    if (!this.file) return;
    const folder = folderOf(this.file.path);
    // The manifest decides which file supplies each kind, so a character whose
    // build lives in `levels.5e` still switches correctly.
    const path = this.store?.paths.byKind[kind] ?? `${folder}/${DEFAULT_FILE_NAMES[kind]}`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`No ${DEFAULT_FILE_NAMES[kind]} in ${folder}`);
      return;
    }
    await this.leaf.openFile(file);
  }

  async onLoadFile(file: TFile): Promise<void> {
    const folder = folderOf(file.path);
    this.store = await this.plugin.acquireStore(folder);
    this.storeFolder = folder;

    const text = await this.app.vault.cachedRead(file);
    this.kind = detectKind(file.path, text, this.store.data.sheet);

    this.contentEl.empty();
    this.contentEl.addClass("dragonglass");
    if (this.plugin.settings.layout.compact || Platform.isPhone) this.contentEl.addClass("is-compact");
    const accent = resolveAccent(this.plugin.settings, this.store.data.layout);
    if (accent) this.contentEl.style.setProperty("--dg-accent", accent);

    const mount = this.contentEl.createDiv({ cls: "dg-root" });
    this.root = createRoot(mount);
    this.root.render(
      createElement(
        StrictMode,
        null,
        createElement(
          PluginContext.Provider,
          { value: { plugin: this.plugin, app: this.app, view: this } },
          createElement(
            ShellContext.Provider,
            { value: this.shell },
            createElement(CharacterApp, { store: this.store, kind: this.kind, path: file.path }),
          ),
        ),
      ),
    );
  }

  async onUnloadFile(file: TFile): Promise<void> {
    void file;
    // React is unmounted before the store is released, so no render outlives its data.
    this.root?.unmount();
    this.root = undefined;
    this.hud = undefined;
    this.contentEl.empty();
    if (this.store) await this.store.flush();
    if (this.storeFolder) this.plugin.releaseStore(this.storeFolder);
    this.store = undefined;
    this.storeFolder = undefined;
  }

  async onClose(): Promise<void> {
    if (this.file) await this.onUnloadFile(this.file);
  }
}
