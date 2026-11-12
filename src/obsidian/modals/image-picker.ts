import { FuzzySuggestModal, type App, type TFile } from "obsidian";
import { isImagePath } from "../avatar-image";

/** Picks one image from the vault, by fuzzy search on its path. */
export class ImagePickerModal extends FuzzySuggestModal<TFile> {
  private constructor(
    app: App,
    private readonly choose: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder("Search the vault for an image");
  }

  static open(app: App, choose: (file: TFile) => void): void {
    new ImagePickerModal(app, choose).open();
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((file) => isImagePath(file.path));
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.choose(file);
  }
}
