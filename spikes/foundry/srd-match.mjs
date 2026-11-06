// THROWAWAY (spike/foundry-integration). Compares our converted SRD trees to dnd5e's pack sources.
//   NODE_PATH=<dir with yaml> node spikes/foundry/srd-match.mjs <dnd5e/packs/_source> <srd-dir>=<2014|2024> ...
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(process.env.NODE_PATH + "/");
const YAML = require("yaml");

const [packRoot, ...trees] = process.argv.slice(2);

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") || p.endsWith(".yml") ? [p] : [];
});
const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const packs = {};
for (const pack of readdirSync(packRoot)) {
  packs[pack] = walk(join(packRoot, pack))
    .filter((p) => !p.endsWith("_folder.yml") && p.endsWith(".yml"))
    .map((p) => {
      const y = YAML.parse(readFileSync(p, "utf8"));
      return {
        pack, path: relative(join(packRoot, pack), p), name: y.name, type: y.type, _id: y._id,
        identifier: y.system?.identifier, rules: y.system?.source?.rules, book: y.system?.source?.book,
      };
    });
}
const idStats = {};
for (const [k, v] of Object.entries(packs)) {
  idStats[k] = { n: v.length, withId: v.filter((e) => e._id).length, withIdentifier: v.filter((e) => e.identifier).length };
}
console.log("pack inventory", JSON.stringify(idStats));

// Which packs each of our kinds is compared against, per ruleset.
const MAP = {
  "2014": {
    class: ["classes"], subclass: ["subclasses"],
    "class-feature": ["classfeatures"], "subclass-feature": ["classfeatures"], "fighting-style": ["classfeatures"],
    metamagic: ["classfeatures"], "eldritch-invocation": ["classfeatures"], "pact-boon": ["classfeatures"],
    species: ["races"], subspecies: ["races"], "species-trait": ["races"], background: ["backgrounds"],
    "background-feature": ["backgrounds"], spell: ["spells"], item: ["items", "tradegoods"], feat: ["classfeatures"],
  },
  "2024": {
    class: ["classes24"], subclass: ["classes24"],
    "class-feature": ["classes24"], "subclass-feature": ["classes24"], "fighting-style": ["feats24"],
    metamagic: ["classes24"], "eldritch-invocation": ["classes24"],
    species: ["origins24"], subspecies: ["origins24"], "species-trait": ["origins24"], background: ["origins24"],
    spell: ["spells24"], item: ["equipment24"], feat: ["feats24"],
  },
};

for (const spec of trees) {
  const [dir, ruleset] = spec.split("=");
  const els = walk(join(dir, "content")).filter((p) => p.endsWith(".json"))
    .flatMap((p) => { const d = JSON.parse(readFileSync(p, "utf8")); return Array.isArray(d) ? d : [d]; });
  console.log(`\n=== ${dir} (${ruleset}) ===`);
  const byKind = {};
  const misses = {};
  for (const e of els) {
    const packNames = MAP[ruleset][e.kind];
    if (!packNames) continue;
    const pool = packNames.flatMap((n) => packs[n] ?? []);
    const hits = pool.filter((x) => norm(x.name) === norm(e.name));
    const tail = e.id.split(":").pop().replace(/-\d+$/, "");
    const byIdent = pool.filter((x) => x.identifier && x.identifier === tail);
    // Owner = middle id segment; used to disambiguate ("unarmored-defense" of barbarian vs monk).
    const owner = e.id.split(":")[1];
    const scoped = hits.filter((x) => x.path.toLowerCase().includes(owner) || (x.identifier ?? "").includes(owner));
    const s = (byKind[e.kind] ??= { total: 0, name0: 0, name1: 0, nameN: 0, scoped1: 0, ident: 0 });
    s.total++;
    if (hits.length === 0) { s.name0++; (misses[e.kind] ??= []).push(e.name); }
    else if (hits.length === 1) s.name1++;
    else { s.nameN++; if (scoped.length === 1) s.scoped1++; }
    if (byIdent.length) s.ident++;
  }
  for (const [k, s] of Object.entries(byKind)) {
    console.log(k.padEnd(22), JSON.stringify(s), `matchRate=${(((s.name1 + s.nameN) / s.total) * 100).toFixed(0)}%`);
  }
  for (const [k, m] of Object.entries(misses)) console.log("  unmatched", k, m.length, JSON.stringify(m.slice(0, 14)));
}
