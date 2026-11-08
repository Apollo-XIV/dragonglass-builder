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
import { partsOf } from "../src/core/export/build";
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

  it("exports innate spells, their pools and the recharge rules", async () => {
    const spell: Element = { id: "test:spell:misty-step", kind: "spell", name: "Misty Step", source: "test", spellLevel: 2 };
    const imp: Element = {
      id: "test:species:imp",
      kind: "species",
      name: "Imp",
      source: "test",
      innateSpells: [
        { spell: spell.id, ability: "cha", uses: 1, recharge: [{ on: "long-rest", amount: "all" }] },
        { spell: "test:spell:light", ability: "cha" },
      ],
      resources: [
        { id: "gift", name: "Gift", max: 3, recharge: [{ on: "short-rest", amount: 1 }, { on: "long-rest", amount: "all" }] },
      ],
    };
    const doc = await buildExport({
      characterId: "x",
      content: testIndex([TEST_BOOK, imp, spell, { ...spell, id: "test:spell:light", name: "Light", spellLevel: 0 }]),
      build: build({ species: imp.id, levels: [], abilities: { method: "manual", base: scores({ cha: 16 }) } }),
      exportedAt: AT,
      pluginVersion: "t",
      sourceRef: async () => ({ ref: `sha256:${"b".repeat(64)}`, refType: "hash" }),
    });
    expect(validateExport(clone(doc)).errors).toEqual([]);

    const misty = doc.spells.find((s) => s.id === spell.id)!;
    expect(misty).toMatchObject({ innateOnly: true, prepared: false, alwaysPrepared: false });
    expect(misty.innate).toEqual([
      { source: imp.id, ability: "cha", dc: 13, attack: 5, resource: "test:species:imp:innate-misty-step" },
    ]);
    expect(doc.spells.find((s) => s.id === "test:spell:light")!.innate[0]).not.toHaveProperty("resource");

    // The uses are an ordinary resource, found by the key the spell names.
    expect(doc.resources.find((r) => r.key === misty.innate[0]!.resource)).toMatchObject({
      max: 1,
      recharge: [{ on: "long-rest", amount: "all" }],
      owner: imp.id,
    });
    expect(doc.resources.find((r) => r.id === "gift")!.recharge).toEqual([
      { on: "short-rest", amount: 1 },
      { on: "long-rest", amount: "all" },
    ]);
    expect(doc.resources.every((r) => !("rechargeAmount" in r))).toBe(true);

    // A species is not on the features tab, so its parts are read straight off the element.
    expect(partsOf(imp).filter((p) => p.kind === "innate-spell")).toEqual([
      { kind: "innate-spell", from: "innateSpells", definition: imp.innateSpells![0] },
      { kind: "innate-spell", from: "innateSpells", definition: imp.innateSpells![1] },
    ]);
  });

  it("carries unlimited resources, learned spells, list additions and chosen innate spells (2.1)", async () => {
    const mk = (n: string, spellLevel: number, tags: string[] = []): Element =>
      ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel, tags }) as Element;
    const abilityEl: Element = { id: "test:casting-ability:int", kind: "casting-ability", name: "Intelligence", source: "test", ability: "int" } as Element;
    const initiate: Element = {
      id: "test:feat:initiate", kind: "feat", name: "Initiate", source: "test",
      choices: [
        { id: "ability", count: 1, from: { kind: "casting-ability" } },
        { id: "spell", count: 1, from: { kind: "spell", tags: ["wizard-spell"] } },
      ],
      innateSpells: [{ spell: { choice: "spell" }, ability: { choice: "ability" }, uses: 1, recharge: [{ on: "long-rest", amount: "all" }] }],
    } as Element;
    const bard: Element = {
      id: "test:class:bard", kind: "class", name: "Bardish", source: "test", key: "bard", hitDie: "d8",
      spellcasting: { ability: "cha", progression: "full", type: "known", list: "bard-spell", known: 4 },
      tables: { rages: [...Array.from({ length: 19 }, () => 3), "Unlimited"] },
      resources: [{ id: "rages", name: "Rages", max: "@table(bard, rages)", recharge: [{ on: "long-rest", amount: "all" }] }],
      levels: {
        "1": {
          grants: [{ id: "test:spell:secret", mode: "learned", counts: false }],
          spellListAdditions: [{ spells: ["test:spell:fireball"], fromClasses: ["test:class:wiz"] }],
        },
      },
    } as Element;
    const wiz: Element = {
      id: "test:class:wiz", kind: "class", name: "Wiz", source: "test", key: "wiz", hitDie: "d6",
      spellcasting: { ability: "int", progression: "full", type: "prepared", list: "wizard-spell", prepared: 4 },
    } as Element;
    const doc = await buildExport({
      characterId: "x",
      content: testIndex([TEST_BOOK, initiate, bard, wiz, abilityEl, mk("secret", 2), mk("fireball", 3), mk("sleep", 1, ["wizard-spell"])]),
      build: build({
        background: initiate.id,
        choices: { ability: [abilityEl.id], spell: ["test:spell:sleep"] },
        abilities: { method: "manual", base: scores({ int: 14 }) },
        levels: Array.from({ length: 20 }, () => ({ class: bard.id, hp: "average" as const, choices: {} })),
      }),
      exportedAt: AT,
      pluginVersion: "t",
      sourceRef: async () => ({ ref: `sha256:${"b".repeat(64)}`, refType: "hash" }),
    });
    expect(validateExport(clone(doc)).errors).toEqual([]);
    expect(doc.envelope.schemaVersion).toBe("2.2");

    // JSON has no infinity, so the document says so in words.
    const rages = doc.resources.find((r) => r.id === "rages")!;
    expect(rages).toMatchObject({ max: 0, unlimited: true });
    expect(JSON.stringify(doc)).not.toContain("null,\"unlimited\"");
    expect(doc.resources.filter((r) => r.id !== "rages").every((r) => r.unlimited === false)).toBe(true);

    expect(doc.spells.find((s) => s.id === "test:spell:secret")).toMatchObject({ learned: true, free: true, prepared: false, alwaysPrepared: false });
    expect(doc.spells.find((s) => s.id === "test:spell:sleep")).toMatchObject({ learned: false, free: false, alwaysPrepared: true });

    // The part is as authored, with its references; the spell carries what they resolved to.
    expect(partsOf(initiate).find((p) => p.kind === "innate-spell")!.definition).toMatchObject({ spell: { choice: "spell" }, ability: { choice: "ability" } });
    expect(doc.spells.find((s) => s.id === "test:spell:sleep")!.innate).toEqual([
      expect.objectContaining({ source: initiate.id, ability: "int", dc: expect.any(Number), resource: "test:feat:initiate:innate-sleep" }),
    ]);

    expect(doc.spellcasting!.classes.find((c) => c.class === bard.id)!.listAdditions).toEqual({
      spells: ["test:spell:fireball"],
      lists: ["wizard-spell"],
    });
    expect(doc.spellcasting!.classes.find((c) => c.class === wiz.id)).toBeUndefined();
    expect(partsOf(bard).length).toBeGreaterThan(0);
  });

  it("carries a learned choice, and an innate reference with several picks (2.2)", async () => {
    const mk = (n: string, spellLevel: number, tags: string[] = []): Element =>
      ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel, tags }) as Element;
    const abilityEl: Element = { id: "test:casting-ability:wis", kind: "casting-ability", name: "Wisdom", source: "test", ability: "wis" } as Element;
    const initiate: Element = {
      id: "test:feat:initiate", kind: "feat", name: "Initiate", source: "test",
      choices: [
        { id: "ability", count: 1, from: { kind: "casting-ability" } },
        { id: "cantrips", count: 2, from: { kind: "spell" } },
      ],
      innateSpells: [{ spell: { choice: "cantrips" }, ability: { choice: "ability" } }],
    } as Element;
    const wiz: Element = {
      id: "test:class:wiz", kind: "class", name: "Wiz", source: "test", key: "wiz", hitDie: "d6",
      spellcasting: { ability: "int", progression: "full", type: "spellbook", list: "wizard-spell", prepared: 4, spellbook: 6 },
      levels: { "1": { choices: [{ id: "free", count: 1, from: { kind: "spell" }, mode: "learned", counts: false }] } },
    } as Element;
    const doc = await buildExport({
      characterId: "x",
      content: testIndex([TEST_BOOK, initiate, wiz, abilityEl, mk("light", 0), mk("mending", 0), mk("sleep", 1)]),
      build: build({
        background: initiate.id,
        choices: { ability: [abilityEl.id], cantrips: ["test:spell:light", "test:spell:mending"] },
        levels: [{ class: wiz.id, hp: "average", choices: { free: ["test:spell:sleep"] } }],
      }),
      exportedAt: AT,
      pluginVersion: "t",
      sourceRef: async () => ({ ref: `sha256:${"b".repeat(64)}`, refType: "hash" }),
    });
    expect(validateExport(clone(doc)).errors).toEqual([]);
    expect(doc.envelope.schemaVersion).toBe("2.2");

    const free = doc.progression[0]!.choices.find((c) => c.id === "free")!;
    expect(free).toMatchObject({ mode: "learned", counts: false });
    expect(doc.choices.find((c) => c.id === "cantrips")).not.toHaveProperty("mode");
    expect(doc.spells.find((s) => s.id === "test:spell:sleep")).toMatchObject({ learned: true, free: true });

    for (const id of ["light", "mending"])
      expect(doc.spells.find((s) => s.id === `test:spell:${id}`)!.innate).toEqual([
        expect.objectContaining({ source: initiate.id, ability: "wis" }),
      ]);
  });

  it("exports a weapon mastery pick as a feature with its property's text", async () => {
    const sap: Element = { id: "test:mastery-property:sap", kind: "mastery-property", name: "Sap", source: "test", key: "sap", text: "Disadvantage on its next attack." };
    const pickEl: Element = {
      id: "test:mastery:longsword", kind: "weapon-mastery", name: "Longsword", source: "test",
      weapon: "test:item:longsword", mastery: sap.id, tags: ["martial-weapon", "mastery:sap"],
    };
    const fighter: Element = {
      id: "test:class:fighter", kind: "class", name: "Fighter", source: "test", key: "fighter", hitDie: "d10",
      levels: { "1": { choices: [{ id: "test:fighter:mastery", count: 1, from: { kind: "weapon-mastery" } }] } },
    };
    const doc = await buildExport({
      characterId: "x",
      content: testIndex([TEST_BOOK, fighter, sap, pickEl]),
      build: build({ levels: [{ class: fighter.id, hp: "average", choices: { "test:fighter:mastery": [pickEl.id] } }] }),
      exportedAt: AT,
      pluginVersion: "t",
      sourceRef: async () => ({ ref: `sha256:${"b".repeat(64)}`, refType: "hash" }),
    });
    expect(validateExport(clone(doc)).errors).toEqual([]);
    expect(doc.features.find((f) => f.id === pickEl.id)).toMatchObject({
      kind: "weapon-mastery", name: "Longsword", text: "**Sap.** Disadvantage on its next attack.",
    });
    expect(doc.inventory.items).toEqual([]);
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
    doc.envelope.schemaVersion = "3.0";
    expect(validateExport(doc).errors[0].message).toContain("not readable");
  });

  it("accepts a later minor version and fields it does not know", async () => {
    const doc = clone(await base()) as ExportDocument & { extra?: number };
    doc.envelope.schemaVersion = "2.7";
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
