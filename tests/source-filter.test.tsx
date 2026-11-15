/** The picker's ruleset and sourcebook filter: what each mode does, and that the pip appears. */

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PickerBody, type PickerSpec } from "../src/obsidian/ui/builder/picker";
import {
  cycleFilter,
  facetsOf,
  inheritedFilter,
  matchesFilter,
  type SourceRef,
} from "../src/obsidian/ui/builder/source-filter";

const srd: SourceRef = { id: "srd", label: "SRD", name: "SRD 5.1", ruleset: "2014" };
const srd24: SourceRef = { id: "srd24", label: "SRD24", name: "SRD 5.2", ruleset: "2024" };
const phb: SourceRef = { id: "phb", label: "PHB", name: "Player's Handbook", ruleset: "2014" };

describe("cycleFilter", () => {
  it("goes off, include, exclude, off", () => {
    let f = cycleFilter({}, "source:srd");
    expect(f).toEqual({ "source:srd": "include" });
    f = cycleFilter(f, "source:srd");
    expect(f).toEqual({ "source:srd": "exclude" });
    expect(cycleFilter(f, "source:srd")).toEqual({});
  });
});

describe("matchesFilter", () => {
  it("lets everything through with no filter", () => {
    expect(matchesFilter({}, srd)).toBe(true);
    expect(matchesFilter({}, undefined)).toBe(true);
  });

  it("treats includes in one facet as alternatives", () => {
    const f = { "source:srd": "include", "source:phb": "include" } as const;
    expect(matchesFilter(f, srd)).toBe(true);
    expect(matchesFilter(f, phb)).toBe(true);
    expect(matchesFilter(f, srd24)).toBe(false);
  });

  it("removes what is excluded and keeps the rest", () => {
    expect(matchesFilter({ "ruleset:2024": "exclude" }, srd24)).toBe(false);
    expect(matchesFilter({ "ruleset:2024": "exclude" }, srd)).toBe(true);
  });

  it("ANDs the facets, and an exclude beats an include", () => {
    const f = { "ruleset:2014": "include", "source:phb": "exclude" } as const;
    expect(matchesFilter(f, srd)).toBe(true);
    expect(matchesFilter(f, phb)).toBe(false);
    expect(matchesFilter(f, srd24)).toBe(false);
  });

  it("drops an option with no known source once a source is included", () => {
    expect(matchesFilter({ "source:srd": "include" }, undefined)).toBe(false);
    expect(matchesFilter({ "source:srd": "exclude" }, undefined)).toBe(true);
  });
});

describe("facetsOf", () => {
  it("lists each ruleset and book once", () => {
    const f = facetsOf([srd, phb, srd, srd24, undefined]);
    expect(f.rulesets.map((r) => r.label)).toEqual(["2014", "2024"]);
    expect(f.sources.map((s) => s.label)).toEqual(["PHB", "SRD", "SRD24"]);
  });
});

describe("the picker's filter pip", () => {
  const spec = (source?: SourceRef): PickerSpec => ({
    title: "Pick",
    search: true,
    options: [{ id: "a", name: "Alpha", source }],
    selected: [],
    count: 1,
    onCommit: () => {},
  });
  const html = (s: PickerSpec): string =>
    renderToStaticMarkup(createElement(PickerBody, { spec: s, close: () => {} }));

  it("appears when the options know their source", () => {
    expect(html(spec(srd))).toContain("dg-filter-pip");
  });

  it("is absent when they don't, and without search", () => {
    expect(html(spec())).not.toContain("dg-filter-pip");
    expect(html({ ...spec(srd), search: false })).not.toContain("dg-filter-pip");
  });
});

describe("inherited filters", () => {
  const options = [
    { id: "a", name: "Alpha", source: srd },
    { id: "b", name: "Beta", source: srd24 },
  ];
  const spec = (defaultFilter: PickerSpec["defaultFilter"]): PickerSpec => ({
    title: "Pick",
    search: true,
    options,
    defaultFilter,
    selected: [],
    count: 1,
    onCommit: () => {},
  });
  const html = (s: PickerSpec): string =>
    renderToStaticMarkup(createElement(PickerBody, { spec: s, close: () => {} }));

  it("takes the parent's ruleset, and nothing from a book with none", () => {
    expect(inheritedFilter(srd24)).toEqual({ "ruleset:2024": "include" });
    expect(inheritedFilter({ ...srd, ruleset: undefined })).toEqual({});
    expect(inheritedFilter(undefined)).toEqual({});
  });

  it("starts the picker narrowed to it", () => {
    const out = html(spec({ "ruleset:2024": "include" }));
    expect(out).toContain("Beta");
    expect(out).not.toContain("Alpha");
  });

  it("ignores a starting ruleset none of the options has", () => {
    const out = html(spec({ "ruleset:2030": "include" }));
    expect(out).toContain("Alpha");
    expect(out).toContain("Beta");
  });
});

describe("a book that names no ruleset", () => {
  const homebrew: SourceRef = { id: "hb", label: "HB", name: "Homebrew" };

  it("shows whatever the ruleset filter says", () => {
    expect(matchesFilter({ "ruleset:2024": "include" }, homebrew)).toBe(true);
    expect(matchesFilter({ "ruleset:2024": "exclude" }, homebrew)).toBe(true);
  });

  it("is still subject to a source filter", () => {
    expect(matchesFilter({ "source:srd": "include" }, homebrew)).toBe(false);
    expect(matchesFilter({ "source:hb": "exclude" }, homebrew)).toBe(false);
  });

  it("is not made a ruleset chip", () => {
    expect(facetsOf([homebrew]).rulesets).toEqual([]);
  });
});
