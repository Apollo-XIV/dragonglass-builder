import { Modal, Notice, Setting, type App } from "obsidian";
import type DragonglassPlugin from "../../main";

export class NewCharacterModal extends Modal {
  private name = "";
  private folder: string;

  constructor(
    app: App,
    private readonly plugin: DragonglassPlugin,
    private readonly onCreated: (folder: string) => void,
  ) {
    super(app);
    this.folder = plugin.settings.charactersFolder;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "New character" });

    new Setting(contentEl)
      .setName("Name")
      .setDesc("Used for the folder and the character's name.")
      .addText((text) =>
        text.setPlaceholder("Ilsa").onChange((value) => {
          this.name = value;
        }),
      );

    new Setting(contentEl)
      .setName("Folder")
      .setDesc("Where the character's folder of .5e files is created.")
      .addText((text) => text.setValue(this.folder).onChange((value) => (this.folder = value)));

    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText("Create")
        .setCta()
        .onClick(async () => {
          const name = this.name.trim();
          if (!name) {
            new Notice("Give the character a name.");
            return;
          }
          try {
            const folder = await this.plugin.createCharacter(name, this.folder.trim() || "Characters");
            this.close();
            this.onCreated(folder);
          } catch (e) {
            new Notice(`Could not create the character: ${e instanceof Error ? e.message : String(e)}`);
          }
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
