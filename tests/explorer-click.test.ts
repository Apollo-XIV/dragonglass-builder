import { describe, expect, it } from "vitest";
import { characterFolders, characterSheetPath, clickedExplorerFolder } from "../src/obsidian/character-files";

const none = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };

/** A stand-in for an element: `closest` answers by selector. */
const el = (matches: Record<string, string | null>) => ({
  closest: (selector: string) =>
    selector.split(", ").some((s) => s in matches) ? { getAttribute: () => matches[selector] ?? null } : null,
});

describe("explorer folder clicks", () => {
  it("names the sheet inside a folder", () => {
    expect(characterSheetPath("Party/Mira")).toBe("Party/Mira/sheet.5e");
  });

  it("returns the folder for a click on its row", () => {
    expect(clickedExplorerFolder(el({ ".nav-folder-title": "Party/Mira" }), none)).toBe("Party/Mira");
  });

  it("leaves the chevron alone", () => {
    const target = el({ ".nav-folder-collapse-indicator": "", ".nav-folder-title": "Party/Mira" });
    expect(clickedExplorerFolder(target, none)).toBeNull();
  });

  it("leaves the chevron alone under either of its class names", () => {
    expect(clickedExplorerFolder(el({ ".collapse-icon": "", ".nav-folder-title": "Party/Mira" }), none)).toBeNull();
  });

  it("treats the margin around the chevron as the chevron", () => {
    const target = el({ ".nav-folder-title": "Party/Mira" });
    expect(clickedExplorerFolder(target, none, { x: 12, left: 16, right: 30 })).toBeNull();
    expect(clickedExplorerFolder(target, none, { x: 34, left: 16, right: 30 })).toBeNull();
    expect(clickedExplorerFolder(target, none, { x: 36, left: 16, right: 30 })).toBe("Party/Mira");
  });

  it("leaves modified clicks alone", () => {
    const target = el({ ".nav-folder-title": "Party/Mira" });
    expect(clickedExplorerFolder(target, { ...none, ctrlKey: true })).toBeNull();
    expect(clickedExplorerFolder(target, { ...none, shiftKey: true })).toBeNull();
  });

  it("ignores clicks outside a folder row", () => {
    expect(clickedExplorerFolder(el({}), none)).toBeNull();
    expect(clickedExplorerFolder(null, none)).toBeNull();
  });
});

describe("character folders", () => {
  it("are the folders with a sheet directly inside", () => {
    const folders = characterFolders(["Party/Mira/sheet.5e", "Party/Mira/build.5e", "Party/notes.md", "Old/sheet.5e.bak", "Solo/sheet.5e"]);
    expect([...folders].sort()).toEqual(["Party/Mira", "Solo"]);
  });
});
