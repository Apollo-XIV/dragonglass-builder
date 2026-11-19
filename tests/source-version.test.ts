import { describe, expect, it } from "vitest";
import { newerTag } from "../src/core/source-version";

describe("newerTag", () => {
  it("picks the highest tag above the pin, comparing numerically", () => {
    expect(newerTag("0.1.2", ["0.1.2", "0.1.10", "0.1.9", "0.0.1"])).toBe("0.1.10");
  });
  it("is undefined when the pin is current", () => {
    expect(newerTag("0.1.3", ["0.1.3", "0.1.2"])).toBeUndefined();
  });
  it("ignores tags that are not versions, and pins that are not", () => {
    expect(newerTag("0.1.0", ["nightly", "0.2.0-rc1"])).toBeUndefined();
    expect(newerTag("3d7aad5f", ["9.9.9"])).toBeUndefined();
    expect(newerTag(undefined, ["9.9.9"])).toBeUndefined();
  });
  it("accepts a v prefix", () => {
    expect(newerTag("v1.0", ["v1.1"])).toBe("v1.1");
  });
});

import { isVersionTag } from "../src/core/source-version";
describe("isVersionTag", () => {
  it("is true only for numeric tags", () => {
    expect(isVersionTag("0.1.3")).toBe(true);
    expect(isVersionTag("main")).toBe(false);
    expect(isVersionTag(undefined)).toBe(false);
  });
});
