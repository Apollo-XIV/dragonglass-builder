/**
 * THROWAWAY (spike/foundry-integration). Not production code; nothing imports this.
 *
 * Resolves a vault character headlessly (plain Node, no Obsidian) and writes the
 * design's proposed "resolved export document" so we can see where the shape fits
 * the real data and where it doesn't.
 *
 *   npx tsx spikes/foundry/export.ts vault/Characters/Ilsa <srd-dir> [<srd24-dir>] > out.json
 *
 * Deliberately strips `fluff` (not all SRD) so the output is committable.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolve } from "../../src/core/resolver/resolve";
import { ContentIndex } from "../../src/core/content";
import { loadSourceFromDisk, readSourceBundle } from "../../src/node/load-source";
import type { BuildFile, InventoryFile, SpellsFile, Element } from "../../src/core/types";

const [charDir, ...sourceDirs] = process.argv.slice(2);
if (!charDir || !sourceDirs.length) throw new Error("usage: export.ts <character-dir> <source-dir>...");

const readJson = <T>(name: string): T | undefined => {
  const p = join(charDir, name);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : undefined;
};

const build = readJson<BuildFile>("build.5e")!;
const inventory = readJson<InventoryFile>("inventory.5e");
const spells = readJson<SpellsFile>("spells.5e");

const roots = ["content/core", ...sourceDirs];
const content = ContentIndex.build(roots.map(loadSourceFromDisk));
const r = resolve({ content, build, inventory, spells, details: { name: build.name } });

/** Hash of a source's files: stands in for the proposed `ref` on a zip/path source. */
function contentHash(root: string): string {
  const b = readSourceBundle(root);
  const h = createHash("sha256");
  for (const f of [...b.files].sort((a, c) => a.path.localeCompare(c.path))) h.update(f.path).update(f.text);
  return h.digest("hex").slice(0, 16);
}

const strip = (e: Element) => {
  const { fluff: _f, ...rest } = e;
  return rest;
};

type PartKind = "resource" | "toggle" | "passive" | "other" | "none";
function classify(e: Element): { kind: PartKind; reason: string } {
  const has = (k: string) => Array.isArray(e[k]) && (e[k] as unknown[]).length > 0;
  if (has("resources")) return { kind: "resource", reason: "resources" };
  if (has("effects")) return { kind: "toggle", reason: "effects" };
  if (has("actions") && (e.actions as { applies?: string }[]).some((a) => a.applies))
    return { kind: "toggle", reason: "action applies an effect" };
  if (has("actions")) return { kind: "other", reason: "actions without effect or resource" };
  if (has("modifiers")) return { kind: "passive", reason: "modifiers" };
  if (has("choices") || has("grants")) return { kind: "other", reason: "structural (choices/grants only)" };
  return { kind: "none", reason: "text only" };
}

const FEATURE_KINDS = new Set([
  "class-feature", "subclass-feature", "species-trait", "background-feature", "feat", "feature",
  "fighting-style", "metamagic", "eldritch-invocation", "pact-boon",
]);

const els = r.elements;
const classOf = (id?: string) => (id ? content.get(id)?.name : undefined);

// Progression: every taken level in order, active picks only.
const classLevelCount: Record<string, number> = {};
const progression = (build.levels ?? []).map((lvl, i) => {
  classLevelCount[lvl.class] = (classLevelCount[lvl.class] ?? 0) + 1;
  const classLevel = classLevelCount[lvl.class];
  const granted = els
    .filter((e) => e.class === lvl.class && e.level === classLevel && FEATURE_KINDS.has(e.kind))
    .map((e) => ({ id: e.id, via: e.origin }));
  const choices = r.pendingChoices
    .filter((c) => c.scope === "level" && c.levelIndex === i)
    .map((c) => ({
      choice: c.id, declaredBy: c.source, picked: c.chosen,
      // `invalid` picks are inactive: exported nowhere, per the design's "active picks only".
    }));
  return {
    characterLevel: i + 1, class: lvl.class, classLevel, hp: lvl.hp,
    choices, granted,
  };
});

const out = {
  envelope: {
    schemaVersion: "0.1",
    characterId: charDir.split("/").pop(),
    exportedAt: "2026-11-05T00:00:00Z", // fixed so the sample is diffable
    pluginVersion: "0.1.0",
    sources: sourceDirs.map((d) => {
      const m = JSON.parse(readFileSync(join(d, "source.json"), "utf8"));
      const sb = content.sourcebook(m.sourcebooks?.[0] ?? m.id);
      return { id: m.id, name: m.name, sourcebooks: m.sourcebooks, version: sb?.version ?? null, ref: `sha256:${contentHash(d)}`, license: sb?.license, attribution: sb?.attribution };
    }),
  },
  identity: {
    name: r.name, xp: r.xp, level: r.level,
    classes: r.classes.map((c) => ({ id: c.id, name: c.name, level: c.level, hitDie: c.hitDie, subclass: c.subclass ?? null })),
    species: r.species ? { id: r.species.id, name: r.species.name } : null,
    background: r.background ? { id: r.background.id, name: r.background.name } : null,
    abilityBase: build.abilities.base,
    abilityMethod: build.abilities.method,
    // Derived values the module may want to cross-check, not to recompute:
    derived: {
      abilities: Object.fromEntries(Object.entries(r.abilities).map(([k, a]) => [k, a.score.value])),
      proficiencyBonus: r.proficiencyBonus.value, hpMax: r.hp.max.value, ac: r.ac.value,
      speed: Object.fromEntries(Object.entries(r.speed).map(([k, v]) => [k, v.value])),
    },
    currency: r.currency,
  },
  progression,
  features: els.filter((e) => FEATURE_KINDS.has(e.kind)).map((e) => ({
    id: e.id, source: e.source, kind: e.kind, name: e.name, text: e.text, page: e.page,
    provenance: { class: e.class ?? null, classLevel: e.level ?? null, via: e.origin },
    part: classify(e.element),
    parts: {
      resources: (e.element.resources as unknown[]) ?? [],
      actions: (e.element.actions as unknown[]) ?? [],
      effects: (e.element.effects as unknown[]) ?? [],
      modifiers: (e.element.modifiers as unknown[]) ?? [],
    },
  })),
  // Resolved resources live on the resolver output, not on the feature: Lay on Hands'
  // max is an expression over class level, which only the resolver can evaluate.
  resources: r.resources.map((x) => ({ key: x.key, id: x.id, name: x.name, max: x.max, recharge: x.recharge, owner: x.source })),
  spells: (r.spellcasting?.spells ?? []).map((s) => ({
    id: s.id, name: s.name, level: s.spellLevel, school: s.school, class: s.class ?? null,
    prepared: s.prepared, alwaysPrepared: s.alwaysPrepared, extra: s.extra, source: s.source,
  })),
  spellcasting: r.spellcasting && {
    classes: r.spellcasting.classes.map((c) => ({ class: c.class, ability: c.ability, dc: c.dc.value, attack: c.attack.value, progression: c.progression })),
    slots: r.spellcasting.slots.map((s) => ({ level: s.level, max: s.max })),
    pact: r.spellcasting.pact ? { level: r.spellcasting.pact.level, max: r.spellcasting.pact.max } : null,
  },
  inventory: r.inventory.map((i) => ({
    ref: i.entry.id ?? null,
    custom: i.entry.item ? strip(i.entry.item as Element) : null,
    name: i.name, quantity: i.quantity, equipped: i.equipped, attuned: i.attuned,
    container: i.entry.container ?? null, resolved: i.resolvedRef,
  })),
  details: (() => {
    const p = join(charDir, "details.5e");
    if (!existsSync(p)) return {};
    const text = readFileSync(p, "utf8").replace(/^---[\s\S]*?---\n/, "");
    const sections: Record<string, string> = {};
    for (const m of text.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |\s*$(?![\s\S]))/gm)) sections[m[1].trim()] = m[2].trim();
    return sections;
  })(),
  diagnostics: r.diagnostics.map((d) => ({ severity: d.severity, code: d.code, message: d.message })),
};

void classOf;
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
