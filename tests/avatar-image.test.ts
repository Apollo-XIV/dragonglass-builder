import { describe, expect, it } from "vitest";
import { extensionOf, fitImage, fitWithin, isImagePath, mimeOf, toDataUrl } from "../src/obsidian/avatar-image";

describe("avatar images", () => {
  it("recognises images by extension, case-insensitively", () => {
    expect(isImagePath("Art/ilsa.PNG")).toBe(true);
    expect(isImagePath("Art/ilsa.webp")).toBe(true);
    expect(isImagePath("Notes/ilsa.md")).toBe(false);
    expect(isImagePath("Art/noextension")).toBe(false);
    expect(extensionOf("a.b/c.jpeg")).toBe("jpeg");
    expect(mimeOf("x.jpg")).toBe("image/jpeg");
  });

  it("fits a picture inside a square without enlarging it", () => {
    expect(fitWithin(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
    expect(fitWithin(300, 400, 500)).toEqual({ width: 300, height: 400 });
  });

  it("hands bytes back untouched where there is no canvas", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const out = await fitImage(bytes, "image/png", 100);
    expect(out.bytes).toBe(bytes);
    expect(out.ext).toBe("png");
  });

  it("encodes a data URL", () => {
    expect(toDataUrl("image/png", new Uint8Array([104, 105]).buffer)).toBe("data:image/png;base64,aGk=");
  });
});
