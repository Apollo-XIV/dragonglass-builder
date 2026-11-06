import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildExport,
  contentHash,
  EXPORT_SCHEMA_VERSION,
  splitDetails,
  toPlainText,
  validateExport,
  type ExportDocument,
} from "../src/core/export";
import { exportFromDisk } from "../src/node/export-character";
import { schemaJson } from "../scripts/export-schema";
import type { Element } from "../src/core/types";
import { CONTENT_ROOT, build, scores, testIndex, TEST_BOOK } from "./helpers";

const FIXTURES = join(__dirname, "fixtures");
const AT = "2026-01-01T00:00:00.000Z";
const NOTES = { "Hall description": "A low hall of **black stone**, warmed by one forge.\n\n![[Hall description]]" };

const run = (character: string, pins?: Record<string, string>): Promise<ExportDocument> =>
  exportFromDisk({
    characterDir: join(FIXTURES, "characters", character),
    sourceDirs: [join(CONTENT_ROOT, "srd")],
    coreDir: join(CONTENT_ROOT, "core"),
    exportedAt: AT,
    pluginVersion: "test",
    notes: NOTES,
    pins,
  });

/** Goldens are regenerated with UPDATE_GOLDEN=1 and reviewed in the diff. */
function golden(name: string, doc: ExportDocument): void {
  const path = join(FIXTURES, "exports", `${name}.json`);
  const text = JSON.stringify(doc, null, 2) + "\n";
  if (process.env.UPDATE_GOLDEN || !existsSync(path)) writeFileSync(path, text);
  expect(JSON.parse(text)).toEqual(JSON.parse(readFileSync(path, "utf8")));
}

const clone = (d: ExportDocument): ExportDocument => JSON.parse(JSON.stringify(d));

describe("the schema file", () => {
  it("is the one generated from the types", () => {
    expect(readFileSync(join(__dirname, "..", "docs", "export-schema.json"), "utf8")).toBe(schemaJson());
  });
});

describe("golden exports", () => {
  it("a level-one paladin from the test vault", async () => {
    const doc = await run("teste-character");
    expect(validateExport(clone(doc)).ok).toBe(true);
    golden("teste-character", doc);
  });

  it("a level-three paladin with containers, unresolved items and pending choices", async () => {
    const doc = await run("paladin-3");
    const result = validateExport(clone(doc));
    expect(result.errors).toEqual([]);
    golden("paladin-3", doc);
  });
});

describe("what the export contains", () => {
  it("states the version, the character and a hash for a source with no pin", async () => {
    const { envelope } = await run("paladin-3");
    expect(envelope).toMatchObject({ schemaVersion: EXPORT_SCHEMA_VERSION, characterId: "6f1d7c52-0d0e-4a39-9f6b-3a1f0c7b9e11", exportedAt: AT });
    expect(envelope.sources).toHaveLength(1);
    expect(envelope.sources[0]).toMatchObject({ id: "srd", refType: "hash", sourcebooks: ["srd"] });
    expect(envelope.sources[0].ref).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("uses a pin as the ref when the source has one", async () => {
    const { envelope } = await run("paladin-3", { srd: "v1.2.0" });
    expect(envelope.sources[0]).toMatchObject({ ref: "v1.2.0", refType: "git" });
  });

  it("uses the sheet's id, not the folder name", async () => {
    const { envelope } = await run("paladin-3");
    expect(envelope.characterId).not.toBe("paladin-3");
  });

  it("never carries a path, whatever the source's location", async () => {
    const text = JSON.stringify(await run("paladin-3"));
    expect(text).not.toContain(CONTENT_ROOT);
    expect(text).not.toMatch(/\/home\//);
  });

  it("gives hit points for each level with the first-level rule", async () => {
    const { progression } = await run("paladin-3");
    expect(progression.map((l) => l.hp)).toEqual([
      { method: "max", value: 10, die: "d10", forced: true },
      { method: 7, value: 7, die: "d10", forced: false },
      { method: "max", value: 10, die: "d10", forced: false },
    ]);
    expect(progression.map((l) => [l.characterLevel, l.classLevel])).toEqual([[1, 1], [2, 2], [3, 3]]);
  });

  it("flags a choice that is not answered instead of leaving it out", async () => {
    const doc = await run("paladin-3");
    const skills = doc.progression[0].choices.find((c) => c.id === "srd:class:paladin:skills");
    expect(skills).toMatchObject({ pending: true, picked: [] });
    const style = doc.progression[1].choices.find((c) => c.id === "srd:paladin:fighting-style");
    expect(style).toMatchObject({ pending: false, picked: ["srd:fighting-style:defense"] });
  });

  it("leaves out picks that are not active and levels that are only planned", async () => {
    const doc = await run("paladin-3");
    const { diagnostics: _kept, ...rest } = doc;
    const text = JSON.stringify(rest);
    expect(text).not.toContain("gone-from-the-book");
    expect(doc.progression).toHaveLength(3);
    expect(text).not.toContain("asi-4");
    // The engine's own warning about the bad pick is carried through, not fixed.
    expect(doc.diagnostics.some((d) => d.code === "choice-invalid")).toBe(true);
  });

  it("carries species and background grants with their chain", async () => {
    const { identity } = await run("paladin-3");
    expect(identity.species?.id).toBe("srd:species:dwarf");
    expect(identity.species?.granted.length).toBeGreaterThan(0);
    for (const g of identity.species!.granted) expect(g.via[0]).toBe("srd:species:dwarf");
    expect(identity.background?.granted.every((g) => g.via[0] === "srd:background:acolyte")).toBe(true);
  });

  it("lists features with a kind on each part", async () => {
    const doc = await run("paladin-3");
    const aura = doc.features.find((f) => f.provenance.class === "srd:class:paladin" && f.parts.length);
    expect(aura).toBeDefined();
    expect(doc.features.every((f) => f.parts.every((p) => ["resource", "toggle", "passive", "action"].includes(p.kind)))).toBe(true);
    expect(doc.resources.length).toBeGreaterThan(0);
    expect(doc.resources.every((r) => typeof r.max === "number")).toBe(true);
  });

  it("resolves saves, skills, tools, armour, weapons and languages, with who granted them", async () => {
    const { proficiencies: p } = await run("paladin-3");
    const ids = (by: { id: string }[]) => by.map((g) => g.id);
    expect(p.saves.map((s) => s.key)).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
    // +1 from the equipped Oath Token, 2 for proficiency.
    expect(p.saves.find((s) => s.key === "wis")).toMatchObject({ level: "proficient", bonus: 4 });
    expect(ids(p.saves.find((s) => s.key === "wis")!.by)).toEqual(["srd:class:paladin"]);
    expect(p.saves.find((s) => s.key === "str")).toMatchObject({ level: "none", bonus: 3, by: [] });
    expect(p.skills).toHaveLength(18);
    const insight = p.skills.find((s) => s.key === "insight")!;
    expect(insight).toMatchObject({ name: "Insight", ability: "wis", level: "proficient", bonus: 3, passive: 13 });
    // The skill element is what carries the proficiency; the chain says the background granted it.
    expect(insight.by).toEqual([{ id: "srd:skill:insight", kind: "skill", via: ["srd:background:acolyte"] }]);
    expect(p.skills.find((s) => s.key === "athletics")).toMatchObject({ level: "none", bonus: 2, by: [] });
    expect(p.tools).toEqual([
      { value: "srd:tool:smiths-tools", by: [{ id: "srd:tool:smiths-tools", kind: "tool", via: ["srd:species:dwarf"] }] },
    ]);
    expect(p.armor.map((a) => a.value)).toEqual(["light", "medium", "heavy", "shields"]);
    expect(ids(p.armor[0].by)).toEqual(["srd:class:paladin"]);
    expect(ids(p.weapons.find((w) => w.value === "srd:item:handaxe")!.by)).toEqual(["srd:dwarf:dwarven-combat-training"]);
    expect(ids(p.weapons.find((w) => w.value === "martial")!.by)).toEqual(["srd:class:paladin"]);
    expect(p.languages.map((l) => l.value)).toEqual(["Common", "Dwarvish"]);
    expect(ids(p.languages[0].by)).toEqual(["srd:species:dwarf"]);
  });

  it("carries expertise as a level, with the proficiency bonus doubled", async () => {
    const skill: Element = { id: "test:skill:stealth", kind: "skill", key: "stealth", name: "Stealth", source: "test", ability: "dex" };
    const rogueish: Element = {
      id: "test:species:sneak",
      kind: "species",
      name: "Sneak",
      source: "test",
      modifiers: [{ target: "skills.stealth", op: "proficiency", value: "expertise" }],
    };
    const doc = await buildExport({
      characterId: "x",
      content: testIndex([TEST_BOOK, skill, rogueish]),
      build: build({ species: rogueish.id, levels: [], abilities: { method: "manual", base: scores({ dex: 14 }) } }),
      exportedAt: AT,
      pluginVersion: "t",
      sourceRef: async () => ({ ref: `sha256:${"b".repeat(64)}`, refType: "hash" }),
    });
    expect(doc.proficiencies.skills).toEqual([
      expect.objectContaining({
        key: "stealth", level: "expertise", bonus: 6, // DEX +2, and the proficiency bonus of 2 counted twice
        by: [{ id: rogueish.id, kind: "species", via: [] }],
      }),
    ]);
  });

  it("lists every set even when nothing grants it", async () => {
    const doc = await run("teste-character");
    expect(doc.proficiencies.skills).toHaveLength(18);
    expect(doc.proficiencies.tools.map((t) => t.value)).toEqual(["srd:tool:brewers-supplies"]);
  });

  it("exports spells with their class and preparation", async () => {
    const { spells } = await run("paladin-3");
    expect(spells.find((s) => s.id === "srd:spell:bless")).toMatchObject({ class: "srd:class:paladin", prepared: true });
    expect(spells.find((s) => s.id === "srd:spell:shield-of-faith")).toMatchObject({ extra: true, prepared: false });
  });

  it("keeps entries that do not resolve, by reference, with a reason", async () => {
    const { inventory } = await run("paladin-3");
    const book = inventory.items.find((i) => i.uid === "inv-book")!;
    expect(book).toMatchObject({ ref: "srd:item:prayer-book-of-the-lost", resolved: false, container: "inv-pack" });
    expect(book.reason).toContain("not in any loaded source");
    expect(inventory.items).toHaveLength(8);
    const loose = inventory.items.find((i) => i.uid === "inv-loose")!;
    expect(loose.container).toBeUndefined();
    expect(loose.reason).toContain("not an entry");
    expect(inventory.items.find((i) => i.uid === "inv-rope")).toMatchObject({ quantity: 2, container: "inv-pack", resolved: true });
    expect(inventory.items.find((i) => i.uid === "inv-token")).toMatchObject({ attuned: true, resolved: true });
    expect(inventory.items.find((i) => i.uid === "inv-token")?.custom?.name).toBe("Oath Token");
  });

  it("flattens links and embeds in details", async () => {
    const { details } = await run("paladin-3");
    const backstory = details.sections.find((s) => s.heading === "Backstory")!.text;
    expect(backstory).toContain("Brann swore the oath on the forge floor.");
    expect(backstory).toContain("his journal and Ironvow Hall.");
    expect(backstory).toContain("A low hall of black stone, warmed by one forge.");
    expect(backstory).not.toMatch(/\[\[|\]\]|\*\*/);
    expect(details.sections.find((s) => s.heading === "Bonds")!.text).toBe("Creed\nAn oath is a weight carried gladly.");
  });

  it("carries the engine's diagnostics unchanged", async () => {
    const { diagnostics } = await run("paladin-3");
    expect(diagnostics.some((d) => d.code === "unresolved-reference" && d.subject === "srd:item:prayer-book-of-the-lost")).toBe(true);
  });

  it("holds no live state", async () => {
    const doc = await run("paladin-3");
    expect(Object.keys(doc).sort()).toEqual(
      ["choices", "details", "diagnostics", "envelope", "features", "identity", "inventory", "proficiencies", "progression", "resources", "spellcasting", "spells"],
    );
    for (const r of doc.resources) expect(Object.keys(r)).not.toContain("spent");
  });

  it("refuses a character missing its ids, naming the folder and what to do", async () => {
    const copy = mkdtempSync(join(tmpdir(), "dg-export-"));
    cpSync(join(FIXTURES, "characters", "paladin-3"), copy, { recursive: true });
    const read = (f: string) => JSON.parse(readFileSync(join(copy, f), "utf8"));
    const go = () =>
      exportFromDisk({
        characterDir: copy,
        sourceDirs: [join(CONTENT_ROOT, "srd")],
        coreDir: join(CONTENT_ROOT, "core"),
        exportedAt: AT,
        pluginVersion: "test",
      });

    const sheet = read("sheet.5e");
    delete sheet.id;
    writeFileSync(join(copy, "sheet.5e"), JSON.stringify(sheet));
    await expect(go()).rejects.toThrow(/no character id.*Rebuild this character in the builder/);

    writeFileSync(join(copy, "sheet.5e"), JSON.stringify({ ...sheet, id: "x" }));
    const inventory = read("inventory.5e");
    delete inventory.items[0].uid;
    writeFileSync(join(copy, "inventory.5e"), JSON.stringify(inventory));
    await expect(go()).rejects.toThrow(`${copy}: inventory.5e has 1 entry with no uid.`);
    rmSync(copy, { recursive: true });
  });
});

describe("validateExport", () => {
  const base = () => run("paladin-3");

  it("accepts a document that went through JSON", async () => {
    expect(validateExport(clone(await base()))).toMatchObject({ ok: true });
  });

  it("names the field that is wrong", async () => {
    const doc = clone(await base());
    (doc.identity as { name: unknown }).name = 5;
    const r = validateExport(doc);
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.path)).toContain("/identity/name");
  });

  it("refuses something that is not a document", () => {
    expect(validateExport(null).ok).toBe(false);
    expect(validateExport({}).ok).toBe(false);
  });

  it("refuses a major version it does not read", async () => {
    const doc = clone(await base());
    doc.envelope.schemaVersion = "2.0";
    expect(validateExport(doc).errors[0].message).toContain("not readable");
  });

  it("accepts a later minor version and fields it does not know", async () => {
    const doc = clone(await base()) as ExportDocument & { extra?: number };
    doc.envelope.schemaVersion = "1.7";
    doc.extra = 1;
    expect(validateExport(doc).ok).toBe(true);
  });

  it("refuses an unresolved entry with no reason, and a container that is not an entry", async () => {
    const doc = clone(await base());
    delete doc.inventory.items.find((i) => i.uid === "inv-book")!.reason;
    const r = validateExport(doc);
    expect(r.errors.map((e) => e.path)).toContain("/inventory/items/5/reason");
  });

  it("refuses duplicate entry ids and a ref that is a path", async () => {
    const doc = clone(await base());
    doc.inventory.items[1].uid = doc.inventory.items[0].uid;
    doc.envelope.sources[0].ref = "/home/me/srd";
    doc.envelope.sources[0].refType = "git";
    const paths = validateExport(doc).errors.map((e) => e.path);
    expect(paths).toContain("/inventory/items/1/uid");
    expect(paths).toContain("/envelope/sources/0/ref");
  });
});

describe("toPlainText", () => {
  it("shows a link's alias, or its note name without heading or folder", async () => {
    expect(await toPlainText("[[a/b/Note#Part]] and [[Note|shown]] and [[#Local]]")).toBe("Note and shown and Local");
  });

  it("flattens embeds, stops at cycles and depth, and drops what cannot be read", async () => {
    const notes: Record<string, string> = { A: "a1 ![[B]]", B: "b1 ![[A]]", D1: "![[D2]]", D2: "![[D3]]", D3: "![[D4]]", D4: "deep" };
    const embed = (t: string) => notes[t];
    expect(await toPlainText("![[A]]", { embed })).toBe("a1 b1");
    expect(await toPlainText("![[D1]]", { embed, maxDepth: 3 })).toBe("");
    expect(await toPlainText("x ![[pic.png]] y", { embed })).toBe("x  y");
    expect(await toPlainText("x ![[A]] y")).toBe("x  y");
  });

  it("strips markdown but leaves ordinary punctuation alone", async () => {
    const text = "# Title\n**bold** _it_ snake_case_name 2 * 3 * 4 [site](http://x) `code` ~~gone~~ %%hidden%%\n- item";
    expect(await toPlainText(text)).toBe("Title\nbold it snake_case_name 2 * 3 * 4 site code gone\n- item");
  });

  it("splits details into sections, keeping text before the first heading", () => {
    const raw = "---\nkind: details\n---\nIntro\n\n## One\nx\n\n### Two\ny\n";
    expect(splitDetails(raw)).toEqual([
      { heading: "", body: "Intro" },
      { heading: "One", body: "x" },
      { heading: "Two", body: "y" },
    ]);
  });
});

describe("contentHash", () => {
  const f = (path: string, text: string) => ({ path, text });
  it("does not depend on file order", async () => {
    expect(await contentHash([f("a", "1"), f("b", "2")])).toBe(await contentHash([f("b", "2"), f("a", "1")]));
  });
  it("changes with a file's text or name", async () => {
    const base = await contentHash([f("a", "1")]);
    expect(await contentHash([f("a", "2")])).not.toBe(base);
    expect(await contentHash([f("b", "1")])).not.toBe(base);
    expect(base).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
