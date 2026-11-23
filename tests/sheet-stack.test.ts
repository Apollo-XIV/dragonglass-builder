import { describe, expect, it } from "vitest";
import { closeLayer, pushLayer, type Layer } from "../src/obsidian/ui/narrow/sheet-stack";

const layer = (id: number): Layer<string> => ({ id, spec: `sheet ${id}` });
const ids = (stack: Layer<string>[]): number[] => stack.map((l) => l.id);

describe("the sheet stack", () => {
  const picker = layer(1);
  const detail = layer(2);

  it("stacks a sheet opened from inside one on top of it", () => {
    const { next, removed } = pushLayer([picker], 0, detail);
    expect(ids(next)).toEqual([1, 2]);
    expect(removed).toEqual([]);
  });

  it("replaces what was above the opener's own sheet", () => {
    const { next, removed } = pushLayer([picker, detail], 0, layer(3));
    expect(ids(next)).toEqual([1, 3]);
    expect(ids(removed)).toEqual([2]);
  });

  it("replaces the whole stack when the page opens one, top first", () => {
    const { next, removed } = pushLayer([picker, detail], -1, layer(3));
    expect(ids(next)).toEqual([3]);
    expect(ids(removed)).toEqual([2, 1]);
  });

  it("closing the top goes back to the sheet below", () => {
    const { next, removed } = closeLayer([picker, detail], 2);
    expect(ids(next)).toEqual([1]);
    expect(ids(removed)).toEqual([2]);
  });

  it("closing a lower sheet takes what is on top of it too", () => {
    expect(ids(closeLayer([picker, detail], 1).next)).toEqual([]);
  });

  // A single-choice pick opens its confirmation from the page, which replaces the
  // picker; the picker then closes itself, and must not take the confirmation.
  it("closing a sheet no longer open does nothing", () => {
    const confirm = pushLayer([picker], -1, layer(3)).next;
    const { next, removed } = closeLayer(confirm, 1);
    expect(ids(next)).toEqual([3]);
    expect(removed).toEqual([]);
  });
});
