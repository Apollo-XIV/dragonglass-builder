import { Modal, Setting, type App } from "obsidian";

/**
 * A yes/no modal, for the one confirmation the sources panel needs: saving an
 * element the validator flagged. Resolves `false` on Escape or the backdrop too,
 * since a dropped confirmation should never be read as consent.
 */
export class ConfirmModal extends Modal {
  private resolve!: (ok: boolean) => void;
  private resolved = false;

  private constructor(
    app: App,
    private readonly title: string,
    private readonly body: string,
    private readonly confirmLabel: string,
  ) {
    super(app);
  }

  static ask(app: App, title: string, body: string, confirmLabel = "Save anyway"): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new ConfirmModal(app, title, body, confirmLabel);
      modal.resolve = resolve;
      modal.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.title });
    contentEl.createEl("p", { text: this.body });

    new Setting(contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.finish(false)))
      .addButton((button) =>
        button
          .setButtonText(this.confirmLabel)
          .setWarning()
          .onClick(() => this.finish(true)),
      );
  }

  onClose(): void {
    this.contentEl.empty();
    this.finish(false);
  }

  private finish(ok: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolve(ok);
    this.close();
  }
}
