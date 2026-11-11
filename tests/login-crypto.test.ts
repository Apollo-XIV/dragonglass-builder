import { describe, expect, it } from "vitest";
import { WrongPasswordError, openToken, sealToken } from "../src/obsidian/login-crypto";

// Few iterations: these test the sealing, not the cost of guessing.
const FAST = 1000;

describe("sealing the GitHub login", () => {
  it("opens with the password it was sealed with", async () => {
    const blob = await sealToken("gho_secret", "correct horse", FAST);
    expect(await openToken(blob, "correct horse")).toBe("gho_secret");
  });

  it("never contains the token, and differs each time", async () => {
    const a = await sealToken("gho_secret", "pw", FAST);
    const b = await sealToken("gho_secret", "pw", FAST);
    expect(a).not.toContain("gho_secret");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.1000.")).toBe(true);
  });

  it("rejects a wrong password, and a blob that was altered", async () => {
    const blob = await sealToken("gho_secret", "right", FAST);
    await expect(openToken(blob, "wrong")).rejects.toBeInstanceOf(WrongPasswordError);
    const parts = blob.split(".");
    parts[4] = parts[4].replace(/.$/, parts[4].endsWith("A") ? "B" : "A");
    await expect(openToken(parts.join("."), "right")).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("says so when the blob isn't one of ours", async () => {
    await expect(openToken("nonsense", "pw")).rejects.toThrow(/unreadable/);
  });
});
