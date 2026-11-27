/**
 * Editing the inventory from the sheet, shared by both layouts so they behave as
 * siblings: the "+" actions, the detail view of one entry, and the coin fields. Every
 * write is `inventory.5e` through the store, which already logs and undoes it.
 *
 * The detail view reads the entry from the store, not from props: it is shown in a
 * sheet that sits above whatever opened it, so a prop would be one update behind.
 */

import { useState, type ReactNode } from "react";
import {
  containerChoices,
  removeInventoryEntry,
  setContainer,
  spendOneInventoryItem,
} from "../../core/index";
import type { ResolvedItem } from "../../core/resolver/resolved";
import type { InventoryEntry, InventoryFile } from "../../core/types";
import type { CharacterStore } from "../character-store";
import { ItemPickerSheet } from "./builder/sections/collections";
import { CustomItemForm } from "./builder/sections/extras";
import { useStoreVersion } from "./context";
import { useSheet } from "./narrow/sheet";

export const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;

const emptyFile = (): InventoryFile => ({
  kind: "inventory",
  schemaVersion: 1,
  items: [],
});

/** Whether an item can hold others: tagged as a container, or already holding something. */
export function isContainerEntry(
  store: CharacterStore,
  file: InventoryFile,
  entry: InventoryEntry,
): boolean {
  const element = entry.id ? store.index?.get(entry.id) : entry.item;
  const tags = (element?.tags as string[] | undefined) ?? [];
  return (
    tags.includes("container") ||
    (element as { itemType?: string } | undefined)?.itemType === "container" ||
    file.items.some((e) => e.container === entry.uid)
  );
}

/** Whether tapping an item should toggle equipped: it is gear that is worn or wielded. */
export function canEquip(item: ResolvedItem): boolean {
  const el = item.element as {
    itemType?: string;
    armor?: unknown;
    weapon?: unknown;
    requiresEquipped?: boolean;
  };
  return Boolean(
    el.armor || el.weapon || el.requiresEquipped || el.itemType === "shield",
  );
}

export interface InventoryEditor {
  patch: (index: number, change: Partial<InventoryEntry>) => void;
  remove: (index: number) => void;
  put: (index: number, container: string | undefined) => void;
  useOne: (index: number) => void;
  setCurrency: (coin: string, value: number) => void;
  openPicker: () => void;
  openCustom: () => void;
  /** Opens the detail view of one entry, by uid. */
  openDetail: (uid: string) => void;
}

export function useInventoryEditor(store: CharacterStore): InventoryEditor {
  const sheet = useSheet();
  const file = (): InventoryFile => store.data.inventory ?? emptyFile();
  const write = (next: InventoryFile): void => store.update("inventory", next);
  return {
    patch: (index, change) =>
      write({
        ...file(),
        items: file().items.map((e, i) =>
          i === index ? { ...e, ...change } : e,
        ),
      }),
    remove: (index) => write(removeInventoryEntry(file(), index)),
    put: (index, container) => write(setContainer(file(), index, container)),
    useOne: (index) => write(spendOneInventoryItem(file(), index)),
    setCurrency: (coin, value) =>
      write({
        ...file(),
        currency: {
          ...file().currency,
          [coin]: Math.max(0, Math.floor(value) || 0),
        },
      }),
    openPicker: () =>
      sheet.open({
        title: "Add items",
        body: () => <ItemPickerSheet store={store} close={sheet.close} />,
      }),
    openCustom: () =>
      sheet.open({
        title: "Custom item",
        body: () => <CustomItemForm store={store} close={sheet.close} />,
      }),
    openDetail: (uid) =>
      sheet.open({
        title:
          store.resolved?.inventory.find((i) => i.entry.uid === uid)?.name ??
          "Item",
        body: () => <ItemDetail store={store} uid={uid} close={sheet.close} />,
      }),
  };
}

/** The "+" and "+ Custom Item" buttons that sit with the list. */
export function AddButtons({ editor }: { editor: InventoryEditor }): ReactNode {
  return (
    <div className="dg-inv-add">
      <button
        className="dg-level-button is-multiclass"
        onClick={editor.openPicker}
      >
        + Add items
      </button>
      <button
        className="dg-level-button is-multiclass"
        onClick={editor.openCustom}
      >
        + Custom Item
      </button>
    </div>
  );
}

/** The origin chip on a row that starting equipment added. */
export function OriginChip({ entry }: { entry: InventoryEntry }): ReactNode {
  return entry.origin ? (
    <span className="dg-pill dg-inv-origin">starting</span>
  ) : null;
}

/** Everything about one entry that a row does not show. */
export function ItemDetail({
  store,
  uid,
  close,
  compact,
}: {
  store: CharacterStore;
  uid: string;
  close: () => void;
  /** Leave out the fields a table row already edits: quantity, equipped, attuned. */
  compact?: boolean;
}): ReactNode {
  useStoreVersion(store);
  const editor = useInventoryEditor(store);
  const file = store.data.inventory ?? emptyFile();
  const index = file.items.findIndex((e) => e.uid === uid);
  const item = store.resolved?.inventory.find((i) => i.entry.uid === uid);
  if (index < 0 || !item) return <p className="dg-muted">This item is gone.</p>;
  const entry = file.items[index];
  const element = item.element as {
    itemType?: string;
    attunement?: boolean;
    text?: unknown;
  };
  const bags = containerChoices(file, index, (e) =>
    isContainerEntry(store, file, e),
  );
  const nameOf = (e: InventoryEntry): string =>
    store.resolved?.inventory.find((i) => i.entry.uid === e.uid)?.name ??
    e.id ??
    "Item";
  const charges = store.resolved?.resources.find(
    (r) => r.source === item.element.id,
  );

  return (
    <div className="dg-inv-detail">
      {!compact && typeof element.text === "string" ? (
        <p>{element.text}</p>
      ) : null}
      {compact ? null : (
        <>
          <label className="dg-field">
            <span>Quantity</span>
            <input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) =>
                editor.patch(index, {
                  quantity: Math.max(
                    1,
                    Math.floor(Number(e.currentTarget.value)) || 1,
                  ),
                })
              }
            />
          </label>
          <label className="dg-field dg-inv-check">
            <input
              type="checkbox"
              checked={item.equipped}
              onChange={(e) =>
                editor.patch(index, { equipped: e.currentTarget.checked })
              }
            />
            <span>Equipped</span>
          </label>
          {element.attunement ? (
            <label className="dg-field dg-inv-check">
              <input
                type="checkbox"
                checked={item.attuned}
                onChange={(e) =>
                  editor.patch(index, { attuned: e.currentTarget.checked })
                }
              />
              <span>Attuned</span>
            </label>
          ) : null}
        </>
      )}
      <label className="dg-field">
        <span>Put in</span>
        <select
          value={entry.container ?? ""}
          onChange={(e) =>
            editor.put(index, e.currentTarget.value || undefined)
          }
        >
          <option value="">Carried loose</option>
          {bags.map((b) => (
            <option key={b.uid} value={b.uid}>
              {nameOf(b)}
            </option>
          ))}
        </select>
      </label>
      {charges ? (
        <p className="dg-muted">
          Charges: {charges.remaining} / {charges.max}
        </p>
      ) : null}
      <label className="dg-field">
        <span>Notes</span>
        <textarea
          key={entry.uid}
          defaultValue={entry.notes ?? ""}
          onBlur={(e) =>
            editor.patch(index, { notes: e.currentTarget.value || undefined })
          }
        />
      </label>
      <div className="dg-sheet-actions">
        {element.itemType === "consumable" ? (
          <button
            className="dg-sheet-button is-primary"
            onClick={() => {
              editor.useOne(index);
              if (item.quantity <= 1) close();
            }}
          >
            Use one
          </button>
        ) : null}
        <button
          className="dg-sheet-button is-destructive"
          onClick={() => {
            editor.remove(index);
            close();
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

/** The five coin fields, for the narrow sheet; the desktop panel has its own. */
export function CurrencyFields({
  store,
}: {
  store: CharacterStore;
}): ReactNode {
  useStoreVersion(store);
  const editor = useInventoryEditor(store);
  const currency = store.data.inventory?.currency ?? {};
  const [draft, setDraft] = useState<Record<string, string>>({});
  return (
    <div className="dg-currency">
      {COINS.map((coin) => (
        <label key={coin}>
          <span>{coin.toUpperCase()}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={draft[coin] ?? String(currency[coin] ?? 0)}
            onChange={(e) =>
              setDraft({ ...draft, [coin]: e.currentTarget.value })
            }
            onBlur={(e) => {
              editor.setCurrency(coin, Number(e.currentTarget.value));
              setDraft(({ [coin]: _gone, ...rest }) => rest);
            }}
          />
        </label>
      ))}
    </div>
  );
}
