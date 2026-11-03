/**
 * A native folder picker for "a local path" source, desktop only.
 *
 * `@electron/remote`'s dialog is tried first, because it can return an empty
 * folder (useful when picking where a brand-new source should live) and gives a
 * proper OS folder picker. Whether it's reachable depends on what the installed
 * Obsidian build wires up for plugins, so it's wrapped in a try/catch rather than
 * assumed. The fallback is a plain `<input type="file" webkitdirectory>`: Chromium
 * opens the same native picker, and Electron's node-integrated renderer (the same
 * thing that lets `readLocalPath` in sources.ts use `require("node:fs")`) exposes
 * the chosen file's real filesystem path on the `File` object. It can't resolve an
 * empty folder — Chromium never hands back a `File` for one — so an empty folder
 * picked this way looks identical to a cancelled dialog; the caller treats both as
 * "nothing chosen" rather than an error.
 */

import { Platform } from "obsidian";

interface OpenDialog {
  showOpenDialog: (opts: unknown) => Promise<{ canceled: boolean; filePaths: string[] }>;
}

export function nativeDialogAvailable(): boolean {
  return Platform.isDesktopApp;
}

async function viaRemoteDialog(defaultPath?: string): Promise<string | undefined> {
  let dialog: OpenDialog | undefined;
  try {
    dialog = (require("@electron/remote") as { dialog: OpenDialog }).dialog;
  } catch {
    try {
      dialog = (require("electron") as { remote?: { dialog: OpenDialog } }).remote?.dialog;
    } catch {
      dialog = undefined;
    }
  }
  if (!dialog) return undefined;
  const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"], defaultPath });
  return result.canceled || !result.filePaths.length ? undefined : result.filePaths[0];
}

function viaDirectoryInput(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.style.display = "none";
    document.body.appendChild(input);

    const finish = (path: string | undefined): void => {
      input.remove();
      resolve(path);
    };

    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0] as (File & { path?: string }) | undefined;
        if (!file?.path) {
          finish(undefined);
          return;
        }
        const relative = file.webkitRelativePath;
        const root = relative ? file.path.slice(0, file.path.length - relative.length) : file.path;
        finish(root.replace(/[\\/]+$/, "") || undefined);
      },
      { once: true },
    );
    // No "cancel" event exists for <input type="file">; a dialog closed without a
    // choice just never fires "change", so `finish` never runs and the promise
    // stays pending. The caller times this out.
    input.click();
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/**
 * Opens a native "choose a folder" dialog. Resolves to undefined if the dialog was
 * unavailable, cancelled, or the user picked an empty folder — the caller can't tell
 * these apart and shouldn't need to; it just means nothing came back to fill in.
 */
export async function pickFolder(defaultPath?: string): Promise<string | undefined> {
  if (!Platform.isDesktopApp) return undefined;
  const fromRemote = await viaRemoteDialog(defaultPath).catch(() => undefined);
  if (fromRemote) return fromRemote;
  // A cancelled file-input dialog never fires "change", so this would otherwise
  // hang forever; two minutes is generous for someone actually browsing.
  return withTimeout(viaDirectoryInput(), 120_000, undefined);
}
