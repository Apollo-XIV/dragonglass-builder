/**
 * The drag state machine against the progression spec's own examples. Heights are
 * all 50 so a card's top is 50 × its index, and the pointer is placed in list
 * coordinates; `grab` is where in the card the thumb started.
 */

import { describe, expect, it } from "vitest";
import {
  groupOf,
  groupHeight,
  isCollapsed,
  proposedOrder,
  startDrag,
  step,
  type DragState,
  type Layout,
} from "../src/obsidian/ui/builder/reorder/machine";

const H = 50;

function layoutOf(keys: string[], extra: Partial<Layout> = {}): Layout {
  const classOf: Record<string, string | undefined> = {};
  const heights: Record<string, number> = {};
  for (const key of keys) {
    heights[key] = H;
    classOf[key] = key === "div" ? undefined : key[0];
  }
  return { heights, classOf, groupCard: H, collapseAt: 10_000, fan: 14, ...extra };
}

// Keys are class letter + level: P1 is Paladin 1.
const grabAt = (order: string[], key: string, grab = 25): { state: DragState; pointer: number } => ({
  state: startDrag(order, key, grab),
  pointer: order.indexOf(key) * H + grab,
});

describe("different classes", () => {
  const order = ["P1", "W1", "div"];
  const layout = layoutOf(order);

  it("swaps plainly in either direction", () => {
    const { state, pointer } = grabAt(order, "W1");
    // Up past P1: the card's top edge passes the middle of P1.
    const up = step(state, pointer - 30, layout);
    expect(proposedOrder(up)).toEqual(["W1", "P1", "div"]);
    // Down past the divider: the bottom edge passes its middle.
    const down = step(state, pointer + 40, layout);
    expect(proposedOrder(down)).toEqual(["P1", "div", "W1"]);
  });

  it("is reversible at the same line", () => {
    const { state, pointer } = grabAt(order, "W1");
    let s = step(state, pointer + 40, layout);
    expect(proposedOrder(s)).toEqual(["P1", "div", "W1"]);
    s = step(s, pointer + 10, layout);
    expect(proposedOrder(s)).toEqual(order);
  });

  it("does not move before a line is passed", () => {
    const { state, pointer } = grabAt(order, "W1");
    expect(proposedOrder(step(state, pointer + 20, layout))).toEqual(order);
    expect(proposedOrder(step(state, pointer - 20, layout))).toEqual(order);
  });
});

describe("dragging down past a higher level of the same class", () => {
  // Paladin 1, Wizard 1, Wizard 2, Paladin 2 — the spec's example.
  const order = ["P1", "W1", "W2", "P2"];
  const layout = layoutOf(order);

  it("pulls it into the group, and the pair drops below Paladin 2", () => {
    const { state, pointer } = grabAt(order, "W1");
    let s = step(state, pointer + 40, layout);
    expect(groupOf(s)).toEqual(["W1", "W2"]);
    expect(proposedOrder(s)).toEqual(["P1", "W1", "W2", "P2"]);
    s = step(s, pointer + 140, layout);
    expect(proposedOrder(s)).toEqual(["P1", "P2", "W1", "W2"]);
    expect(groupOf(s)).toEqual(["W1", "W2"]);
  });

  it("lets the tail go again when the thumb comes back", () => {
    const { state, pointer } = grabAt(order, "W1");
    let s = step(state, pointer + 140, layout);
    s = step(s, pointer + 10, layout);
    expect(groupOf(s)).toEqual(["W1"]);
    expect(proposedOrder(s)).toEqual(order);
  });

  it("counts the tail as part of the gap, not of the drop position", () => {
    const { state, pointer } = grabAt(order, "W1");
    const s = step(state, pointer + 40, layout);
    expect(groupHeight(s, layout)).toBe(2 * H);
    // The anchor has to pass Paladin 2 (which sits beyond the tail), not the tail.
    expect(proposedOrder(step(s, pointer + 70, layout))).toEqual(order);
    expect(proposedOrder(step(s, pointer + 80, layout))).toEqual(["P1", "P2", "W1", "W2"]);
  });
});

describe("dragging up past a lower level of the same class", () => {
  const order = ["W1", "W2", "W3", "P1"];
  const layout = layoutOf(order);

  it("freezes the dragged card and anticipates the lower level", () => {
    const { state, pointer } = grabAt(order, "W2");
    const s = step(state, pointer - 10, layout);
    expect(proposedOrder(s)).toEqual(order);
    expect(s.anticipating?.target).toBe("W1");
    expect(s.anticipating?.progress).toBeGreaterThan(0);
    expect(s.anticipating?.progress).toBeLessThan(1);
  });

  it("hands the anchor over when the thumb reaches the lower level", () => {
    const { state, pointer } = grabAt(order, "W2");
    const s = step(state, pointer - 51, layout);
    expect(s.anchor).toBe("W1");
    expect(s.tail).toEqual(["W2"]);
    expect(proposedOrder(s)).toEqual(order);
  });

  it("hands it back at the same line", () => {
    const { state, pointer } = grabAt(order, "W2");
    let s = step(state, pointer - 51, layout);
    expect(s.anchor).toBe("W1");
    s = step(s, pointer - 50, layout);
    expect(s.anchor).toBe("W2");
    expect(s.tail).toEqual([]);
    expect(s.anticipating?.target).toBe("W1");
  });

  it("chains one level at a time", () => {
    const three = ["P1", "W1", "W2", "W3"];
    const l = layoutOf(three);
    const { state, pointer } = grabAt(three, "W3");
    let s = step(state, pointer - 51, l);
    expect(s.anchor).toBe("W2");
    expect(s.tail).toEqual(["W3"]);
    s = step(s, pointer - 101, l);
    expect(s.anchor).toBe("W1");
    expect(s.tail).toEqual(["W2", "W3"]);
    // And on past Paladin 1 as a plain swap.
    s = step(s, pointer - 160, l);
    expect(proposedOrder(s)).toEqual(["W1", "W2", "W3", "P1"]);
  });

  it("swaps with an intervening class first, then anticipates (non-adjacent)", () => {
    // Paladin 1, Wizard 1, Paladin 2, Wizard 2.
    const four = ["P1", "W1", "P2", "W2"];
    const l = layoutOf(four);
    const { state, pointer } = grabAt(four, "W2");
    let s = step(state, pointer - 40, l);
    expect(proposedOrder(s)).toEqual(["P1", "W1", "W2", "P2"]);
    s = step(s, pointer - 101, l);
    expect(s.anchor).toBe("W1");
    expect(s.tail).toEqual(["W2"]);
    s = step(s, pointer - 170, l);
    expect(proposedOrder(s)).toEqual(["W1", "W2", "P1", "P2"]);
  });
});

describe("the divider", () => {
  const order = ["P1", "P2", "div", "W1"];
  const layout = layoutOf(order);

  it("swaps with every level it passes, whatever the class", () => {
    const { state, pointer } = grabAt(order, "div");
    const s = step(state, pointer + 40, layout);
    expect(proposedOrder(s)).toEqual(["P1", "P2", "W1", "div"]);
    const up = step(state, pointer - 40, layout);
    expect(proposedOrder(up)).toEqual(["P1", "div", "P2", "W1"]);
  });

  it("cannot rise above the first level", () => {
    const { state, pointer } = grabAt(order, "div");
    const s = step(state, pointer - 400, layout);
    expect(proposedOrder(s)).toEqual(["P1", "div", "P2", "W1"]);
  });

  it("is not passed by the only active level", () => {
    const one = ["P1", "div", "P2"];
    const l = layoutOf(one);
    const { state, pointer } = grabAt(one, "P1");
    expect(proposedOrder(step(state, pointer + 200, l))).toEqual(one);
  });

  it("carries a class's group across it together", () => {
    const o = ["P1", "W1", "W2", "div", "P2"];
    const l = layoutOf(o);
    const { state, pointer } = grabAt(o, "W1");
    const s = step(state, pointer + 140, l);
    expect(proposedOrder(s).slice(0, 2)).toEqual(["P1", "div"]);
    expect(groupOf(s)).toEqual(["W1", "W2"]);
  });
});

describe("where cards do not fold", () => {
  it("leaves a gap the size of the group's headers, not of the whole cards", () => {
    const order = ["P1", "W1", "W2", "P2"];
    const tall = layoutOf(order);
    for (const key of order) tall.heights[key] = 300;
    tall.groupCard = H;
    const { state } = grabAt(order, "W1");
    expect(groupHeight(state, tall)).toBe(H);
    // And the line to pass the next card is half of it, measured from the header.
    expect(proposedOrder(step(state, 300 + 25 + 20, tall))).toEqual(order);
  });
});

describe("the group's display", () => {
  it("collapses the tail into one fanned stack when it is too tall", () => {
    const order = ["W1", "W2", "W3", "W4", "P1"];
    const layout = layoutOf(order, { collapseAt: 120 });
    const { state, pointer } = grabAt(order, "W1");
    const s = step(state, pointer + 400, layout);
    expect(groupOf(s)).toEqual(["W1", "W2", "W3", "W4"]);
    expect(isCollapsed(s, layout)).toBe(true);
    expect(groupHeight(s, layout)).toBe(H + 14);
  });
});
