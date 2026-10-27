import { FileView, Platform, TFile, type WorkspaceLeaf } from "obsidian";
import { StrictMode, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type DragonglassPlugin from "../main";
import type { FileKind, SheetFile } from "../core/types";
import { DEFAULT_FILE_NAMES, fileName, folderOf } from "./character-files";
import type { CharacterStore } from "./character-store";
import { CharacterApp } from "./ui/CharacterApp";
import { PluginContext } from "./ui/context";

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
    if (!this.file) return "Character";
    const name = this.store?.data.sheet?.name ?? this.store?.data.build?.name;
    const label = this.kind === "sheet" ? "" : ` · ${this.kind}`;
    return name ? `${name}${label}` : this.file.basename;
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
    if (this.plugin.settings.layout.accent)
      this.contentEl.style.setProperty("--dg-accent", this.plugin.settings.layout.accent);

    const mount = this.contentEl.createDiv({ cls: "dg-root" });
    this.root = createRoot(mount);
    this.root.render(
      createElement(
        StrictMode,
        null,
        createElement(
          PluginContext.Provider,
          { value: { plugin: this.plugin, app: this.app, view: this } },
          createElement(CharacterApp, { store: this.store, kind: this.kind, path: file.path }),
        ),
      ),
    );
  }

  async onUnloadFile(file: TFile): Promise<void> {
    void file;
    // React is unmounted before the store is released, so no render outlives its data.
    this.root?.unmount();
    this.root = undefined;
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
