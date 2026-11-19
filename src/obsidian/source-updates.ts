/**
 * Finding and applying newer releases of pinned GitHub sources. A scan only reads tags;
 * nothing changes until the user confirms in `UpdatesModal`, because a pin is what keeps an
 * upstream change from silently shifting a character's numbers.
 */

import { Modal, Notice, Setting, type App } from "obsidian";
import type { SourceRef } from "../core/types";
import type { CharacterStore } from "./character-store";
import { blankSources } from "./character-files";
import type DragonglassPlugin from "../main";

/** Where a pin lives: the plugin's settings, or one character's `sources.5e`. */
export type UpdateOwner = { vault: true } | { folder: string };

export interface UpdateOffer {
  id: string;
  name: string;
  from: string;
  to: string;
  owner: UpdateOwner;
}

/** How often the plugin looks while Obsidian stays open. */
export const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;

export interface ScanResult {
  offers: UpdateOffer[];
  /** Source id to a short reason its releases couldn't be checked. */
  problems: Map<string, string>;
}

/** Scans the vault-wide sources and those of every character whose store is open. */
export async function scanForUpdates(
  plugin: DragonglassPlugin,
  stores: Iterable<[string, CharacterStore]>,
): Promise<ScanResult> {
  const problems = new Map<string, string>();
  const tags = new Map<string, Promise<string[]>>();
  const candidates: { ref: SourceRef; owner: UpdateOwner }[] = plugin.settings.sources.map((ref) => ({ ref, owner: { vault: true } }));
  for (const [folder, store] of stores)
    for (const ref of store.data.sources?.sources ?? []) candidates.push({ ref, owner: { folder } });

  const found = await Promise.all(
    candidates.map(async ({ ref, owner }): Promise<UpdateOffer | undefined> => {
      if (ref.enabled === false) return undefined;
      let to: string | undefined;
      try {
        to = await plugin.sources.latestTag(ref, tags);
      } catch (e) {
        problems.set(ref.id, e instanceof Error ? e.message : String(e));
      }
      return to && ref.pin ? { id: ref.id, name: ref.name ?? ref.id, from: ref.pin, to, owner } : undefined;
    }),
  );
  return { offers: found.filter((o): o is UpdateOffer => !!o), problems };
}

/** Moves each offer's pin to its new tag, then reloads once. */
export async function applyUpdates(
  plugin: DragonglassPlugin,
  offers: UpdateOffer[],
  storeFor: (folder: string) => CharacterStore | undefined,
): Promise<void> {
  const vault = offers.filter((o) => "vault" in o.owner);
  if (vault.length)
    plugin.settings.sources = plugin.settings.sources.map((s) => {
      const offer = vault.find((o) => o.id === s.id);
      return offer ? { ...s, pin: offer.to } : s;
    });
  for (const offer of offers) {
    plugin.sources.invalidate(offer.id);
    if (!("folder" in offer.owner)) continue;
    const store = storeFor(offer.owner.folder);
    if (!store) continue;
    const file = store.data.sources ?? blankSources();
    store.update("sources", {
      ...file,
      sources: (file.sources ?? []).map((s) => (s.id === offer.id ? { ...s, pin: offer.to } : s)),
    });
  }
  // Saving settings reloads every source; with no vault-wide change that still has to happen.
  if (vault.length) await plugin.saveSettings();
  else await plugin.reloadSources();
}

/** Lists what would change and waits for a click before changing it. */
export class UpdatesModal extends Modal {
  constructor(
    app: App,
    private readonly offers: UpdateOffer[],
    private readonly onConfirm: () => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(this.offers.length === 1 ? "Update 1 source" : `Update ${this.offers.length} sources`);
    this.contentEl.createEl("p", {
      text: "Each source's pin moves to the newer release and the source is fetched again. Characters that use it will see the new content.",
    });
    const list = this.contentEl.createEl("ul");
    for (const o of this.offers) {
      const owner = "folder" in o.owner ? ` (character ${o.owner.folder})` : "";
      list.createEl("li", { text: `${o.name}${owner}: ${o.from} → ${o.to}` });
    }
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText("Update")
          .setCta()
          .onClick(async () => {
            button.setDisabled(true);
            try {
              await this.onConfirm();
              new Notice(this.offers.length === 1 ? `Updated ${this.offers[0].name} to ${this.offers[0].to}` : `Updated ${this.offers.length} sources`);
              this.close();
            } catch (e) {
              new Notice(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
              button.setDisabled(false);
            }
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
