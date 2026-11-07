/**
 * Builds the export document from a character's files. It resolves the character
 * itself, in level state, so what leaves is always the active build: no live state,
 * no planned levels, no picks that stopped being valid.
 */

import type { ContentIndex } from "../content";
import { idProblems } from "../character-id";
import { resolve } from "../resolver/resolve";
import type { Contribution, NumericStat, PendingChoice, ResolvedCharacter, ResolvedElement } from "../resolver/resolved";
import type { BuildFile, Element, InventoryEntry, InventoryFile, SheetFile, SpellsFile } from "../types";
import {
  EXPORT_SCHEMA_VERSION,
  type ExportChoice,
  type ExportDocument,
  type ExportFeature,
  type ExportGrant,
  type ExportItem,
  type ExportPart,
  type ExportProficiencies,
  type ExportRating,
  type ExportSource,
} from "./schema";

export interface SourceRefInfo {
  ref: string;
  refType: "git" | "hash";
}

export interface BuildExportInput {
  characterId: string;
  content: ContentIndex;
  build: BuildFile;
  spells?: SpellsFile;
  inventory?: InventoryFile;
  /** Sections of details.5e with links and embeds already flattened. */
  details?: { heading: string; text: string }[];
  exportedAt: string;
  pluginVersion: string;
  /** The pin or content hash for a source, by the id its source.json gives it. */
  sourceRef: (sourceId: string) => Promise<SourceRefInfo | undefined>;
}

/** Sources that hold the plugin's own definitions rather than content. */
const INTERNAL_SOURCES = new Set(["core"]);

export async function buildExport(input: BuildExportInput): Promise<ExportDocument> {
  const { content, build } = input;
  const inventory = input.inventory;
  const bad = idProblems({ id: input.characterId } as SheetFile, inventory);
  if (bad.length) throw new Error(bad.join(" "));
  const r = resolve({
    content,
    build,
    spells: input.spells,
    inventory,
    details: { name: build.name },
  });

  const used = new Set<string>();
  const use = (id: string | undefined): string | undefined => {
    if (id) used.add(id);
    return id;
  };

  const isFeature = (e: ResolvedElement): boolean => content.kindDef(e.kind)?.tab === "features";
  const grantOf = (e: ResolvedElement): ExportGrant => ({ id: use(e.id)!, kind: e.kind, via: [...e.origin] });

  const origin = (el: ResolvedElement | undefined) =>
    el && {
      id: use(el.id)!,
      name: el.name,
      source: el.source,
      granted: r.elements.filter((e) => e.id !== el.id && e.origin[0] === el.id).map(grantOf),
    };

  const choiceOf = (c: PendingChoice): ExportChoice => {
    const picked = activePicks(c);
    for (const id of picked) if (content.has(id)) use(id);
    return {
      id: c.id,
      name: c.name,
      declaredBy: use(c.source)!,
      count: c.count,
      picked,
      pending: picked.length < c.count,
      ...(c.blocked ? { blocked: true } : {}),
    };
  };

  const progression = r.hp.levels.map((hp, i) => ({
    characterLevel: hp.characterLevel,
    class: use(hp.class)!,
    classLevel: hp.classLevel,
    hp: { method: hp.method, value: hp.value, die: hp.die, forced: hp.forced },
    choices: r.pendingChoices.filter((c) => c.scope === "level" && c.levelIndex === i).map(choiceOf),
    granted: r.elements
      .filter((e) => e.class === hp.class && e.level === hp.classLevel && e.id !== hp.class)
      .map(grantOf),
  }));

  const features = r.elements.filter(isFeature).map((e) => featureOf(e, use));

  const spells = (r.spellcasting?.spells ?? []).map((s) => ({
    id: use(s.id)!,
    name: s.name,
    level: s.spellLevel,
    ...(s.school ? { school: s.school } : {}),
    source: s.source,
    ...(s.class ? { class: s.class } : {}),
    known: s.entry.known === true,
    prepared: s.prepared,
    alwaysPrepared: s.alwaysPrepared,
    extra: s.extra,
    learned: s.learned,
    free: s.free,
    innateOnly: s.innateOnly,
    innate: s.innate.map((i) => ({
      source: use(i.source) ?? i.source,
      ...(i.ability ? { ability: i.ability } : {}),
      ...(i.dc !== undefined ? { dc: i.dc } : {}),
      ...(i.attack !== undefined ? { attack: i.attack } : {}),
      ...(i.resource ? { resource: i.resource } : {}),
      ...(i.text ? { text: i.text } : {}),
      ...(i.notes ? { notes: i.notes } : {}),
    })),
  }));

  const entryIds = new Set((inventory?.items ?? []).map((e) => e.uid));
  const items = (inventory?.items ?? []).map((entry, index) => itemOf(entry, index, r, content, use, entryIds));

  const doc: ExportDocument = {
    envelope: {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      characterId: input.characterId,
      exportedAt: input.exportedAt,
      pluginVersion: input.pluginVersion,
      sources: [],
    },
    identity: {
      name: r.name,
      level: r.level,
      ...(r.xp !== undefined ? { xp: r.xp } : {}),
      classes: r.classes.map((c) => ({
        id: use(c.id)!,
        name: c.name,
        level: c.level,
        hitDie: c.hitDie,
        ...(c.subclass ? { subclass: { id: use(c.subclass.id)!, name: c.subclass.name } } : {}),
      })),
      species: origin(r.species),
      background: origin(r.background),
      abilityMethod: build.abilities.method,
      abilityBase: { ...build.abilities.base },
      derived: {
        abilities: Object.fromEntries(Object.entries(r.abilities).map(([k, a]) => [k, a.score.value])),
        proficiencyBonus: r.proficiencyBonus.value,
        hpMax: r.hp.max.value,
        ac: r.ac.value,
        speed: Object.fromEntries(Object.entries(r.speed).map(([k, v]) => [k, v.value])),
      },
    },
    progression,
    choices: r.pendingChoices.filter((c) => c.scope === "build").map(choiceOf),
    proficiencies: proficienciesOf(r, use),
    features,
    resources: r.resources.map((x) => ({
      key: x.key,
      id: x.id,
      name: x.name,
      max: x.unlimited ? 0 : x.max,
      unlimited: x.unlimited,
      recharge: x.recharge.map((r) => ({ on: r.on, amount: r.amount })),
      ...(x.unit ? { unit: x.unit } : {}),
      ...(x.die ? { die: x.die } : {}),
      owner: x.source,
    })),
    spells,
    spellcasting: r.spellcasting && {
      classes: r.spellcasting.classes.map((c) => ({
        class: use(c.class)!,
        ability: c.ability,
        type: c.type,
        progression: c.progression,
        dc: c.dc.value,
        attack: c.attack.value,
        listAdditions: {
          spells: c.listAdditions.spells.map((id) => use(id) ?? id),
          lists: [...c.listAdditions.lists],
        },
      })),
      slots: r.spellcasting.slots.map((s) => ({ level: s.level, max: s.max })),
      ...(r.spellcasting.pact ? { pact: { level: r.spellcasting.pact.level, max: r.spellcasting.pact.max } } : {}),
    },
    inventory: {
      items,
      currency: {
        cp: r.currency.cp ?? 0,
        sp: r.currency.sp ?? 0,
        ep: r.currency.ep ?? 0,
        gp: r.currency.gp ?? 0,
        pp: r.currency.pp ?? 0,
      },
    },
    details: { sections: (input.details ?? []).map((s) => ({ heading: s.heading, text: s.text })) },
    diagnostics: r.diagnostics.map((d) => ({
      severity: d.severity,
      code: d.code,
      message: d.message,
      ...(d.subject !== undefined ? { subject: d.subject } : {}),
      ...(d.path !== undefined ? { path: d.path } : {}),
      ...(d.file !== undefined ? { file: d.file } : {}),
      ...(d.source !== undefined ? { source: d.source } : {}),
    })),
  };

  if (!doc.identity.species) delete doc.identity.species;
  if (!doc.identity.background) delete doc.identity.background;
  if (!doc.spellcasting) delete doc.spellcasting;

  doc.envelope.sources = await sourcesUsed(used, content, input.sourceRef);
  return doc;
}

/** What the player picked that still counts: invalid picks come off, one occurrence each. */
function activePicks(c: PendingChoice): string[] {
  const drop = [...c.invalid];
  return c.chosen.filter((id) => {
    const at = drop.indexOf(id);
    if (at < 0) return true;
    drop.splice(at, 1);
    return false;
  });
}

const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"] as const;

/**
 * The elements whose applied contributions to a stat satisfy `pick`, each with the
 * chain that granted it. Contributions from something that is not a collected
 * element (the rules themselves) have no chain and are left out.
 */
function grantors(
  r: ResolvedCharacter,
  breakdown: Contribution[],
  pick: (c: Contribution) => boolean,
  use: (id: string) => string | undefined,
): ExportGrant[] {
  const out: ExportGrant[] = [];
  for (const c of breakdown) {
    if (!c.applied || !pick(c) || out.some((g) => g.id === c.source)) continue;
    const el = r.elements.find((e) => e.id === c.source);
    if (el) out.push({ id: use(el.id)!, kind: el.kind, via: [...el.origin] });
  }
  return out;
}

function proficienciesOf(r: ResolvedCharacter, use: (id: string) => string | undefined): ExportProficiencies {
  const rating = (
    key: string,
    ability: (typeof ABILITY_ORDER)[number],
    stat: NumericStat,
    extra: { name?: string; passive?: number },
  ): ExportRating => {
    const level = stat.proficiency ?? "none";
    return {
      key,
      ...(extra.name ? { name: extra.name } : {}),
      ability,
      level,
      bonus: stat.value,
      ...(extra.passive !== undefined ? { passive: extra.passive } : {}),
      by:
        level === "none"
          ? []
          : grantors(r, stat.breakdown, (c) => c.op === "proficiency" && c.value === level, use),
    };
  };
  const granted = (path: string): ExportProficiencies["tools"] => {
    const set = r.sets[path];
    return (set?.values ?? []).map((value) => ({
      value,
      by: grantors(
        r,
        set!.breakdown,
        (c) => Array.isArray(c.value) && c.value.includes(value),
        use,
      ),
    }));
  };
  return {
    saves: ABILITY_ORDER.map((a) => rating(a, a, r.abilities[a].save, {})),
    skills: r.skills.map((s) => rating(s.key, s.ability, s.stat, { name: s.name, passive: s.passive })),
    tools: granted("proficiencies.tool"),
    armor: granted("proficiencies.armor"),
    weapons: granted("proficiencies.weapon"),
    languages: granted("languages"),
  };
}

function featureOf(e: ResolvedElement, use: (id: string) => string | undefined): ExportFeature {
  use(e.id);
  return {
    id: e.id,
    kind: e.kind,
    name: e.name,
    source: e.source,
    ...(e.page !== undefined ? { page: e.page } : {}),
    ...(e.text !== undefined ? { text: e.text } : {}),
    provenance: {
      ...(e.class ? { class: e.class } : {}),
      ...(e.level !== undefined && e.class ? { classLevel: e.level } : {}),
      via: [...e.origin],
    },
    parts: partsOf(e.element),
  };
}

type PartList = "modifiers" | "resources" | "actions" | "effects" | "innateSpells" | "spellListAdditions";

/** Reads an element's parts and gives each a kind the reader can switch on. */
export function partsOf(el: Element): ExportPart[] {
  const out: ExportPart[] = [];
  const add = (from: PartList, kind: ExportPart["kind"], defs: unknown): void => {
    if (!Array.isArray(defs)) return;
    for (const definition of defs) out.push({ kind, from, definition: definition as Record<string, unknown> });
  };
  add("resources", "resource", el.resources);
  add("effects", "toggle", el.effects);
  for (const a of Array.isArray(el.actions) ? el.actions : [])
    out.push({
      kind: (a as { applies?: unknown }).applies ? "toggle" : "action",
      from: "actions",
      definition: a as unknown as Record<string, unknown>,
    });
  add("modifiers", "passive", el.modifiers);
  add("innateSpells", "innate-spell", el.innateSpells);
  add("spellListAdditions", "spell-list", el.spellListAdditions);
  return out;
}

function itemOf(
  entry: InventoryEntry,
  index: number,
  r: ResolvedCharacter,
  content: ContentIndex,
  use: (id: string) => string | undefined,
  entryIds: Set<string | undefined>,
): ExportItem {
  const held = entry.container && entry.container !== entry.uid && entryIds.has(entry.container);
  const common = {
    uid: entry.uid,
    quantity: entry.quantity ?? 1,
    equipped: entry.equipped === true,
    attuned: entry.attuned === true,
    ...(held ? { container: entry.container } : {}),
    ...(entry.notes ? { notes: entry.notes } : {}),
  };
  // A container that is not an entry is carried as loose, and the entry says so.
  const caveat =
    entry.container && !held ? `Held by "${entry.container}", which is not an entry; exported as loose` : undefined;
  const resolved = r.inventory.find((i) => i.index === index);

  if (entry.item) {
    const custom = JSON.parse(JSON.stringify(entry.item)) as Record<string, unknown>;
    return {
      ...common,
      custom,
      name: resolved?.name ?? String(custom.name ?? "Custom item"),
      kind: String(custom.kind ?? "item"),
      resolved: true,
      ...(caveat ? { reason: caveat } : {}),
    };
  }
  if (!entry.id) return { ...common, name: "Unknown item", resolved: false, reason: "The entry has neither an id nor an inline item" };

  if (resolved && content.has(entry.id)) {
    use(entry.id);
    return {
      ...common,
      ref: entry.id,
      name: resolved.name,
      kind: resolved.element.kind,
      source: resolved.element.source,
      resolved: true,
      ...(caveat ? { reason: caveat } : {}),
    };
  }
  return {
    ...common,
    ref: entry.id,
    name: entry.id,
    resolved: false,
    reason: `"${entry.id}" is not in any loaded source${caveat ? `. ${caveat}` : ""}`,
  };
}

async function sourcesUsed(
  ids: Set<string>,
  content: ContentIndex,
  sourceRef: BuildExportInput["sourceRef"],
): Promise<ExportSource[]> {
  const bySource = new Map<string, string | undefined>();
  for (const id of ids) {
    const o = content.origin(id);
    if (o && !INTERNAL_SOURCES.has(o.source)) bySource.set(o.source, o.sourceName);
  }
  const out: ExportSource[] = [];
  for (const sourceId of [...bySource.keys()].sort()) {
    const books = content.allSourcebooks().filter((b) => content.origin(b.id)?.source === sourceId);
    const version = books.find((b) => b.version)?.version;
    const pin = await sourceRef(sourceId);
    if (!pin) throw new Error(`Cannot pin source "${sourceId}": no reference for it`);
    const name = bySource.get(sourceId);
    out.push({
      id: sourceId,
      ...(name ? { name } : {}),
      ...(version ? { version } : {}),
      ref: pin.ref,
      refType: pin.refType,
      sourcebooks: books.map((b) => b.id),
    });
  }
  return out;
}
