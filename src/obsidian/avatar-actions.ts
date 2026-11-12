import { Notice, normalizePath, type App } from "obsidian";
import {
  EXPORT_MAX_BYTES,
  EXPORT_MAX_PX,
  extensionOf,
  fitImage,
  IMAGE_EXTENSIONS,
  mimeOf,
  STORED_MAX_PX,
  toDataUrl,
} from "./avatar-image";
import type { CharacterStore } from "./character-store";
import { ImagePickerModal } from "./modals/image-picker";

/** Lets the player pick an image already in the vault. */
export function chooseAvatar(app: App, store: CharacterStore): void {
  ImagePickerModal.open(app, (file) => store.setAvatar(file.path));
}

/**
 * Copies a picture from outside the vault into the character's folder as
 * `avatar.<ext>` and points the avatar at it. Importing again replaces the copy
 * made before, so a folder never collects a pile of old portraits.
 */
export async function importAvatar(app: App, store: CharacterStore, file: File): Promise<void> {
  const mime = file.type || mimeOf(file.name);
  if (!mime || !mime.startsWith("image/")) {
    new Notice("That file is not an image.");
    return;
  }
  try {
    const fitted = await fitImage(await file.arrayBuffer(), mime, STORED_MAX_PX);
    const adapter = app.vault.adapter;
    const path = normalizePath(`${store.folder}/avatar.${fitted.ext}`);
    for (const ext of IMAGE_EXTENSIONS) {
      const old = normalizePath(`${store.folder}/avatar.${ext}`);
      if (old !== path && extensionOf(old) === ext && (await adapter.exists(old))) await adapter.remove(old);
    }
    await adapter.writeBinary(path, fitted.bytes);
    store.setAvatar(path);
  } catch (e) {
    new Notice(`Could not import the image: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * The avatar as a data URL small enough to travel in an export, or nothing (with a
 * word to the player) when it is missing or will not fit. An export never fails
 * over its picture.
 */
export async function exportAvatar(app: App, path: string): Promise<string | undefined> {
  const mime = mimeOf(path);
  const file = normalizePath(path);
  try {
    if (!mime || !(await app.vault.adapter.exists(file))) throw new Error("the image is missing");
    const fitted = await fitImage(await app.vault.adapter.readBinary(file), mime, EXPORT_MAX_PX);
    if (fitted.bytes.byteLength > EXPORT_MAX_BYTES) throw new Error("the image is too large to include");
    return toDataUrl(fitted.mime, fitted.bytes);
  } catch (e) {
    new Notice(`Exporting without the avatar: ${e instanceof Error ? e.message : String(e)}`, 8000);
    return undefined;
  }
}
