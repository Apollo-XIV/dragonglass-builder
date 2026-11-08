/**
 * Part provenance: where a part came from and whether anyone has reviewed it. A note
 * for the reader, so every test here also checks that nothing about the numbers moves.
 */

import { describe, expect, it } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describeProvenance, isUnverified, noteFor, unverifiedNotes } from "../src/core/content/provenance";
import { validateElement } from "../src/core/content/validate";
import { resolve } from "../src/core/resolver/resolve";
import type { BuildFile, Element, PartProvenance } from "../src/core/types";
import { CharacterStore, type StoreHost } from "../src/obsidian/character-store";
import { DEFAULT_SETTINGS } from "../src/obsidian/settings";
import { PluginContext, StoreContext } from "../src/obsidian/ui/context";
import { ActionsSection, FeaturesSection } from "../src/obsidian/ui/narrow/NarrowSheet";
import { build, TEST_BOOK, testIndex } from "./helpers";

const pack: PartProvenance = { source: "pack:release-5.3.3", review: "auto" };
const prose: PartProvenance = { source: "prose", review: "unreviewed" };
const reviewed: PartProvenance = { source: "hand", review: "reviewed" };

const feature = (provenance?: PartProvenance, resourceProvenance?: PartProvenance): Element =>
  ({
    id: "test:feature:rage", kind: "class-feature", name: "Rage", source: "test",
    resources: [{ id: "rages", name: "Rages", max: 2, recharge: [{ on: "long-rest", amount: "all" }], ...(resourceProvenance ? { provenance: resourceProvenance } : {}) }],
    actions: [{ id: "rage", name: "Rage", activation: "bonus-action", cost: { rages: 1 }, ...(provenance ? { provenance } : {}) }],
  }) as Element;

const barbarian = { id: "test:class:barbarian", kind: "class", name: "Barbarian", source: "test", key: "barbarian", hitDie: "d12", levels: { "1": { grants: ["test:feature:rage"] } } } as Element;
const levelOne: BuildFile = build({ levels: [{ class: "test:class:barbarian", hp: "average", choices: {} }] });
const resolved = (el: Element) => resolve({ content: testIndex([TEST_BOOK, barbarian, el]), build: levelOne });

describe("what a note says", () => {
  it("names the source of anything not reviewed", () => {
    expect(describeProvenance(pack)).toBe("From Foundry's dnd5e data, not yet reviewed");
    expect(describeProvenance(prose)).toBe("Read from the feature's text, not yet reviewed");
    expect(describeProvenance({ source: "hand", review: "unreviewed" })).toBe("Written by hand, not yet reviewed");
    expect(describeProvenance({ source: "approved-match", review: "unreviewed" })).toMatch(/not yet reviewed/);
    expect(describeProvenance({ source: "elsewhere", review: "auto" })).toBe("From elsewhere, not yet reviewed");
  });

  it("is only for what is not reviewed", () => {
    expect(isUnverified(reviewed)).toBe(false);
    expect(isUnverified(undefined)).toBe(false);
    expect(isUnverified(pack)).toBe(true);
    expect(noteFor(reviewed)).toEqual([]);
    expect(noteFor(prose)).toEqual(["Read from the feature's text, not yet reviewed"]);
  });

  it("collects the distinct notes of every part of an element, level entries included", () => {
    const el = {
      id: "a", kind: "feat", name: "A", source: "x",
      resources: [{ id: "r", name: "R", max: 1, recharge: [], provenance: pack }],
      actions: [{ id: "x", activation: "action", provenance: pack }],
      levels: { "3": { modifiers: [{ target: "ac", op: "add", value: 1, provenance: prose }] } },
    } as unknown as Element;
    expect(unverifiedNotes(el)).toEqual(["From Foundry's dnd5e data, not yet reviewed", "Read from the feature's text, not yet reviewed"]);
  });
});

describe("validating provenance", () => {
  const check = (provenance: unknown) =>
    validateElement({ id: "a", kind: "feat", name: "A", source: "srd", actions: [{ id: "x", activation: "action", provenance }] });

  it("accepts the shape the converter writes", () => {
    expect(check(pack).diagnostics).toEqual([]);
  });

  it("warns on a malformed one without refusing the element", () => {
    for (const bad of ["pack", { source: "pack:x" }, { source: "", review: "auto" }, []]) {
      const r = check(bad);
      expect(r.usable, JSON.stringify(bad)).toBe(true);
      expect(r.diagnostics.map((d) => d.code)).toContain("invalid-element");
    }
  });
});

describe("resolving a character with provenance", () => {
  it("changes nothing about the numbers or the diagnostics", () => {
    const plain = resolved(feature());
    const marked = resolved(feature(pack, prose));
    expect(marked.resources.map(({ provenance: _p, ...r }) => r)).toEqual(plain.resources.map(({ provenance: _p, ...r }) => r));
    expect(marked.actions.map((a) => [a.key, a.available, a.resolvedCost])).toEqual(plain.actions.map((a) => [a.key, a.available, a.resolvedCost]));
    expect(marked.diagnostics).toEqual(plain.diagnostics);
  });

  it("carries a resource's provenance to the resolved resource", () => {
    expect(resolved(feature(undefined, prose)).resources[0].provenance).toEqual(prose);
    expect(resolved(feature()).resources[0]).not.toHaveProperty("provenance");
  });
});

function renderWith(body: (store: CharacterStore) => ReactNode, el: Element, hide = false): string {
  const index = testIndex([TEST_BOOK, barbarian, el]);
  const host: StoreHost = {
    app: { vault: { adapter: { getResourcePath: (p: string) => p, exists: async () => false }, on: () => ({}), offref: () => undefined } } as never,
    indexFor: async () => index,
    enforceRequirements: () => false,
    writeDebounceMs: () => 0,
  };
  const store = new CharacterStore(host, "Characters/T");
  store.data = { sheet: { kind: "sheet", schemaVersion: 1, id: "id" }, build: levelOne };
  store.index = index;
  store.loading = false;
  store.resolved = resolve({ content: index, build: levelOne });
  const plugin = { settings: { ...DEFAULT_SETTINGS, layout: { ...DEFAULT_SETTINGS.layout, hideUnverifiedMarkers: hide } } } as never;
  return renderToStaticMarkup(
    createElement(PluginContext.Provider, { value: { plugin, app: {} as never, view: {} as never } }, createElement(StoreContext.Provider, { value: store }, body(store))),
  );
}

describe("the marker on the sheet", () => {
  const actions = (el: Element, hide = false) => renderWith((s) => createElement(ActionsSection, { store: s, character: s.resolved! }), el, hide);
  const features = (el: Element, hide = false) => renderWith((s) => createElement(FeaturesSection, { store: s, character: s.resolved! }), el, hide);

  it("marks an action whose provenance is not reviewed, with a tooltip naming the source", () => {
    const out = actions(feature(pack));
    expect(out).toContain("dg-unverified");
    expect(out).toContain("From Foundry&#x27;s dnd5e data, not yet reviewed");
  });

  it("says where prose came from", () => {
    expect(actions(feature(prose))).toContain("Read from the feature&#x27;s text, not yet reviewed");
  });

  it("leaves a reviewed part and one without provenance unmarked", () => {
    expect(actions(feature(reviewed))).not.toContain("dg-unverified");
    expect(actions(feature())).not.toContain("dg-unverified");
  });

  it("marks the feature row too", () => {
    expect(features(feature(pack))).toContain("dg-unverified");
  });

  it("hides the markers on request and leaves the rest of the row alone", () => {
    const shown = actions(feature(pack));
    const hidden = actions(feature(pack), true);
    expect(hidden).not.toContain("dg-unverified");
    expect(hidden).toBe(shown.replace(/<span class="dg-unverified"[^>]*>.*?<\/span><\/span>/, ""));
  });
});
