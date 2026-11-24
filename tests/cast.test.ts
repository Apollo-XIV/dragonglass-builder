import { describe, expect, it } from "vitest";
import { slotFor } from "../src/core/state/cast";

const slot = (level: number, remaining: number) => ({ level, max: 4, spent: 4 - remaining, remaining });

describe("slotFor", () => {
  it("spends a slot of the spell's own level", () => {
    expect(slotFor({ slots: [slot(1, 2), slot(2, 1)] }, 1)).toMatchObject({ target: "slots.1", level: 1, remainingAfter: 1 });
  });

  it("falls back to the lowest higher slot", () => {
    expect(slotFor({ slots: [slot(1, 0), slot(2, 0), slot(3, 2)] }, 1)).toMatchObject({ target: "slots.3", remainingAfter: 1 });
  });

  it("uses pact magic when the exact level is empty and the pact is high enough", () => {
    const casting = { slots: [slot(1, 0), slot(3, 1)], pact: { level: 2, max: 2, spent: 0, remaining: 2 } };
    expect(slotFor(casting, 1)).toMatchObject({ target: "pact", pact: true, remainingAfter: 1 });
  });

  it("says so when nothing is left", () => {
    expect(slotFor({ slots: [slot(1, 0)] }, 1)).toBeUndefined();
    expect(slotFor({ slots: [slot(1, 3)] }, 2)).toBeUndefined();
    expect(slotFor(undefined, 1)).toBeUndefined();
  });
});
