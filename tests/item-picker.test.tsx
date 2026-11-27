/** The facet picker: what it draws, and the inventory writes behind a tap and a step. */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FacetPicker, WINDOW, type FacetPickerProps } from "../src/obsidian/ui/builder/facet-picker";
import { ITEM_FACETS, type ItemRow } from "../src/obsidian/ui/builder/item-adapter";
import { addInventoryItem, takeInventoryItem } from "../src/core/inventory";
import type { InventoryFile } from "../src/core/types";

const row = (n: number, over: Partial<ItemRow["element"]> = {}): ItemRow => ({
  id: `i:${n}`,
  name: `Item ${n}`,
  tags: [],
  weight: 1,
  value: 100,
  element: { id: `i:${n}`, kind: "item", name: `Item ${n}`, source: "s", itemType: "gear", ...over } as ItemRow["element"],
  source: { id: "srd", label: "SRD", name: "SRD", ruleset: "2014" },
});

const html = (over: Partial<FacetPickerProps<ItemRow>> = {}): string =>
  renderToStaticMarkup(
    createElement(FacetPicker<ItemRow>, {
      rows: Array.from({ length: 300 }, (_, i) => row(i)),
      idOf: (r) => r.id,
      nameOf: (r) => r.name,
      facets: ITEM_FACETS,
      added: {},
      onAdd: () => {},
      onStep: () => {},
      close: () => {},
      ...over,
    }),
  );

describe("the facet picker", () => {
  it("draws a window of a long list, with a way to see the rest", () => {
    const out = html();
    expect(out.match(/dg-fp-row/g)).toHaveLength(WINDOW);
    expect(out).toContain(`Show more (${300 - WINDOW})`);
  });

  it("has no count header and no Done", () => {
    const out = html();
    expect(out).not.toMatch(/chosen|Done/);
    expect(out).toContain("Close");
  });

  it("shows a chip only for a facet some row has values for", () => {
    const out = html();
    expect(out).toContain(">Type<");
    expect(out).not.toContain(">Rarity<");
  });

  it("reveals a stepper on an added row and lists it in the strip", () => {
    const out = html({ added: { "i:1": 2 } });
    expect(out).toContain("dg-fp-stepper");
    expect(out).toContain("Item 1 ×2");
  });

  it("shows neither stepper nor strip when choosing one", () => {
    const out = html({ added: { "i:1": 2 }, single: true });
    expect(out).not.toContain("dg-fp-stepper");
    expect(out).not.toContain("dg-fp-strip");
    expect(out).toContain("Cancel");
  });

  it("starts from a seeded filter", () => {
    const rows = [row(1, { itemType: "weapon" }), row(2, { itemType: "armor" })];
    const out = html({ rows, initialFilter: { "type:weapon": "include" } });
    expect(out).toContain("Item 1");
    expect(out).not.toContain("Item 2");
  });

  it("keeps the facet chips on one scrolling line", () => {
    const css = readFileSync("styles.css", "utf8");
    expect(css).toMatch(/\.dg-fp-facets \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto/s);
  });
});

describe("what a tap and a step write", () => {
  const file = (items: InventoryFile["items"] = []): InventoryFile => ({ kind: "inventory", schemaVersion: 1, items });
  const next = (() => {
    let n = 0;
    return () => `u${++n}`;
  })();

  it("adds on tap and removes at zero", () => {
    let f = addInventoryItem(file(), "i:rope", () => true, next);
    f = addInventoryItem(f, "i:rope", () => true, next);
    expect(f.items).toHaveLength(1);
    expect(f.items[0].quantity).toBe(2);
    f = takeInventoryItem(f, "i:rope");
    expect(f.items[0].quantity).toBe(1);
    expect(takeInventoryItem(f, "i:rope").items).toEqual([]);
  });

  it("never takes an entry the player has set up", () => {
    const f = file([{ uid: "a", id: "i:sword", equipped: true }]);
    expect(takeInventoryItem(f, "i:sword")).toBe(f);
  });
});
