import { FileView, Notice, type WorkspaceLeaf } from "obsidian";
import { summariseExport } from "./export-character";

export const EXPORT_VIEW = "dragonglass-5echar-view";

/**
 * A small read-only look at an export file: whose it is, which schema, when. The
 * file is the point and is read elsewhere; this is only so it can be seen and copied.
 */
export class ExportFileView extends FileView {
  allowNoFile = false;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return EXPORT_VIEW;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Character export";
  }

  getIcon(): string {
    return "dg-d20";
  }

  async onLoadFile(file: NonNullable<FileView["file"]>): Promise<void> {
    const text = await this.app.vault.read(file);
    const summary = summariseExport(text);
    const root = this.contentEl;
    root.empty();
    root.addClass("dg-export-view");
    if (!summary.ok) {
      root.createEl("p", { text: summary.error });
      return;
    }
    root.createEl("h2", { text: summary.name });
    const list = root.createEl("dl");
    const row = (label: string, value: string) => {
      list.createEl("dt", { text: label });
      list.createEl("dd", { text: value });
    };
    row("Character id", summary.characterId);
    row("Schema version", summary.schemaVersion);
    row("Exported", summary.exportedAt ? new Date(summary.exportedAt).toLocaleString() : "");
    const button = root.createEl("button", { text: "Copy to clipboard" });
    button.addEventListener("click", () => {
      void navigator.clipboard.writeText(text).then(
        () => new Notice("Copied the export to the clipboard"),
        () => new Notice("Could not copy to the clipboard"),
      );
    });
  }

  async onUnloadFile(): Promise<void> {
    this.contentEl.empty();
  }
}
