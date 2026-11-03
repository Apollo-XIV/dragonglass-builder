/** The spell picker's allowances: what the header says, and that a class's limits reach it. */

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PickerBody, type PickerSpec } from "../src/obsidian/ui/builder/picker";

const spec = (over: Partial<PickerSpec> = {}): PickerSpec => ({
  title: "Add spells",
  options: [
    { id: "a", name: "Light", group: "Cantrip", bucket: "cantrips" },
    { id: "b", name: "Bless", group: "Level 1", bucket: "leveled" },
    { id: "c", name: "Wish", group: "Level 9", bucket: "leveled", allowed: false, warnings: ["Level 9"] },
  ],
  buckets: {
    cantrips: { label: "cantrips", used: 1, cap: 3 },
    leveled: { label: "spells known", used: 2, cap: 6 },
  },
  selected: [],
  count: 99,
  onCommit: () => {},
  ...over,
});

const html = (s: PickerSpec): string => renderToStaticMarkup(createElement(PickerBody, { spec: s, close: () => {} }));

describe("the picker's allowances", () => {
  it("counts what is already held against each cap", () => {
    expect(html(spec())).toContain("cantrips 1/3 · spells known 2/6");
  });

  it("says nothing for a bucket whose class states no cap", () => {
    const out = html(spec({ buckets: { cantrips: { label: "cantrips", used: 1 }, leveled: { label: "spells known", used: 2, cap: 6 } } }));
    expect(out).toContain("spells known 2/6");
    expect(out).not.toContain("cantrips 1");
  });

  it("flags a bucket that is already over", () => {
    expect(html(spec({ buckets: { cantrips: { label: "cantrips", used: 4, cap: 3 }, leveled: { label: "spells known", used: 0 } } }))).toContain("cantrips 4/3 (over)");
  });

  it("shows no header for a pick with no buckets", () => {
    expect(html(spec({ buckets: undefined }))).not.toContain("/3");
  });
});
