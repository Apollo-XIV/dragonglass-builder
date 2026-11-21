import { describe, expect, it } from "vitest";
import { nestedControl } from "../src/obsidian/ui/narrow/hold";

/** Just enough of an element for `closest` and `contains`, since the tests run without a DOM. */
function el(tag: string, parent?: FakeEl): FakeEl {
  return new FakeEl(tag, parent);
}

class FakeEl {
  constructor(
    readonly tag: string,
    readonly parent?: FakeEl,
  ) {}
  closest(selector: string): FakeEl | null {
    const tags = selector.split(",").map((s) => s.trim().split(/[[.]/)[0]);
    for (let node: FakeEl | undefined = this; node; node = node.parent) if (tags.includes(node.tag)) return node;
    return null;
  }
  contains(other: FakeEl): boolean {
    for (let node: FakeEl | undefined = other; node; node = node.parent) if (node === this) return true;
    return false;
  }
}

describe("nestedControl", () => {
  const row = el("div");
  const use = el("button", row);
  const label = el("span", use);
  const title = el("span", row);

  it("hands a press on a button inside a read row to the button", () => {
    // Capturing the pointer on the row would send the Use button's click to the row.
    expect(nestedControl(use as never, row as never)).toBe(true);
    expect(nestedControl(label as never, row as never)).toBe(true);
  });

  it("keeps a press on the row's own text for the row", () => {
    expect(nestedControl(title as never, row as never)).toBe(false);
  });

  it("keeps a press on a hold target that is itself a button", () => {
    const box = el("button", row);
    expect(nestedControl(el("span", box) as never, box as never)).toBe(false);
  });
});
