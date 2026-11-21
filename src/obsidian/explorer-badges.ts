/**
 * A d20 at the end of a character folder's row in the file explorer, so it is
 * clear which folders open a sheet when clicked.
 *
 * The explorer has no API for decorating a row and builds rows lazily as folders
 * expand, so this watches each explorer's DOM and marks the `.nav-folder-title`
 * rows whose path is a character folder. Marking is idempotent: a pass that finds
 * every row already right changes nothing, so its own edits never retrigger it.
 */

import { setIcon, type App, type Plugin } from "obsidian";
import { characterFolders } from "./character-files";

const ROW_CLASS = "dg-character-folder";
const BADGE_CLASS = "dg-character-folder-badge";

export function registerExplorerBadges(plugin: Plugin, app: App): void {
  let folders = new Set<string>();
  let frame = 0;
  const observers = new Map<HTMLElement, MutationObserver>();

  const mark = (): void => {
    frame = 0;
    for (const root of observers.keys())
      for (const row of Array.from(root.querySelectorAll<HTMLElement>(".nav-folder-title[data-path]"))) {
        const wanted = folders.has(row.getAttribute("data-path") ?? "");
        const badge = row.querySelector(`:scope > .${BADGE_CLASS}`);
        if (wanted && !badge) {
          row.classList.add(ROW_CLASS);
          setIcon(row.createSpan({ cls: BADGE_CLASS }), "dg-d20");
        } else if (!wanted && badge) {
          row.classList.remove(ROW_CLASS);
          badge.remove();
        }
      }
  };
  const schedule = (): void => {
    if (!frame) frame = window.requestAnimationFrame(mark);
  };

  const refreshFolders = (): void => {
    folders = characterFolders(app.vault.getFiles().map((f) => f.path));
    schedule();
  };

  /** Starts watching any explorer opened since the last call, and lets go of closed ones. */
  const watchExplorers = (): void => {
    const roots = new Set(app.workspace.getLeavesOfType("file-explorer").map((leaf) => leaf.view.containerEl));
    for (const [root, observer] of observers)
      if (!roots.has(root)) {
        observer.disconnect();
        observers.delete(root);
      }
    for (const root of roots) {
      if (observers.has(root)) continue;
      const observer = new MutationObserver(schedule);
      observer.observe(root, { childList: true, subtree: true });
      observers.set(root, observer);
    }
    schedule();
  };

  app.workspace.onLayoutReady(() => {
    refreshFolders();
    watchExplorers();
    plugin.registerEvent(app.workspace.on("layout-change", watchExplorers));
    plugin.registerEvent(app.vault.on("create", refreshFolders));
    plugin.registerEvent(app.vault.on("delete", refreshFolders));
    plugin.registerEvent(app.vault.on("rename", refreshFolders));
  });

  plugin.register(() => {
    if (frame) window.cancelAnimationFrame(frame);
    for (const [root, observer] of observers) {
      observer.disconnect();
      root.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
      root.querySelectorAll(`.${ROW_CLASS}`).forEach((row) => row.classList.remove(ROW_CLASS));
    }
    observers.clear();
  });
}
