/**
 * Phase 1 and 2 of the resolver: walk the content graph from the build's selections,
 * following grants recursively and declaring every choice the content asks for.
 *
 * Nothing here computes a number. It produces the element set and the part lists
 * that the stat engine then folds together.
 */

import type {
  ActionDef,
  BuildFile,
  ChoiceDef,
  Diagnostic,
  EffectDef,
  Element,
  Grant,
  InventoryEntry,
  InventoryFile,
  ItemElement,
  LevelEntry,
  Modifier,
  ResourceDef,
} from "../types";
import type { ContentIndex } from "../content";

/** Where a part came from, for attribution in breakdowns. */
export interface PartSource {
  element: Element;
  /** Class level the part was gained at. */
  level?: number;
  /** Class element id, when the part came from a class or subclass progression. */
  class?: string;
  /** Inventory entry index, when the part came from an item. */
  itemIndex?: number;
}

export interface CollectedElement extends PartSource {
  origin: string[];
  /** Where an answer to this element's choices is written. */
  scope: "build" | "level";
  levelIndex?: number;
}

export interface DeclaredChoice {
  definition: ChoiceDef;
  owner: Element;
  scope: "build" | "level";
  levelIndex?: number;
  level?: number;
  class?: string;
  /** Answers read from the build. */
  chosen: string[];
}

export interface Part<T> {
  def: T;
  from: PartSource;
}

export interface CollectResult {
  elements: CollectedElement[];
  byId: Map<string, CollectedElement>;
  modifiers: Part<Modifier>[];
  resources: Part<ResourceDef>[];
  actions: Part<ActionDef>[];
  effects: Part<EffectDef>[];
  choices: DeclaredChoice[];
  /** Class element id -> level taken, in build order. */
  classLevels: { element: Element; id: string; level: number; subclasses: Element[] }[];
  /** Equipped and attuned items whose parts applied. */
  items: { entry: InventoryEntry; index: number; element: Element; applies: boolean }[];
  diagnostics: Diagnostic[];
}

const LEVEL_PART_KEYS = ["modifiers", "resources", "actions", "effects"] as const;

export function grantId(grant: Grant): string {
  return typeof grant === "string" ? grant : grant.id;
}

/** Reads a choice's answer, preferring the level it was declared at. */
export function answerFor(
  build: BuildFile,
  choiceId: string,
  scope: "build" | "level",
  levelIndex?: number,
): string[] {
  if (scope === "level" && levelIndex !== undefined) {
    const atLevel = build.levels?.[levelIndex]?.choices?.[choiceId];
    if (atLevel) return atLevel;
  }
  const global = build.choices?.[choiceId];
  if (global) return global;
  // A choice may have been answered at a different level by an earlier edit; honour it
  // rather than silently losing the pick.
  for (const lvl of build.levels ?? []) {
    const found = lvl.choices?.[choiceId];
    if (found) return found;
  }
  return [];
}

export function collect(index: ContentIndex, build: BuildFile, inventory?: InventoryFile): CollectResult {
  const result: CollectResult = {
    elements: [],
    byId: new Map(),
    modifiers: [],
    resources: [],
    actions: [],
    effects: [],
    choices: [],
    classLevels: [],
    items: [],
    diagnostics: [],
  };

  /**
   * Keyed by occurrence, not by element id. An element can legitimately appear in
   * a character more than once — the same Ability Score Improvement taken at
   * class levels 4, 8 and 12, or one `repeatable` option answered twice — and
   * each appearance owns its own subtree. Keying on the id alone swallowed every
   * appearance after the first, which is why an ASI at level 8 used to go
   * missing entirely. Within one occurrence the graph is still walked once, so a
   * grant cycle terminates. See docs/schema.md, "Occurrences".
   */
  const visited = new Set<string>();
  /** Class element id -> build level index for each class level, 1-based. */
  const levelIndexOf = new Map<string, number[]>();
  /** Elements with their own `levels` map, grouped by the class that governs them. */
  const progressionsByClass = new Map<string, Element[]>();
  /**
   * Elements whose `levels` map is keyed by total character level: a 2024
   * species staging its traits. Gathered as they are met and walked afterwards,
   * because total level is only known once the build's levels have been counted.
   */
  const characterProgressions: Element[] = [];

  interface Ctx {
    origin: string[];
    scope: "build" | "level";
    levelIndex?: number;
    level?: number;
    class?: string;
    /**
     * Which appearance of an element this is. Empty for anything reached
     * directly from the build — a species, a background, a class — and one per
     * pick for anything reached through a choice. Grants inherit it, so an
     * occurrence's whole subtree shares one key.
     */
    occurrence?: string;
  }

  /** One pick's occurrence key: which choice, answered where, and which pick. */
  function occurrenceFor(def: ChoiceDef, ctx: Ctx, pick: number): string {
    return `${def.id}@${ctx.scope}:${ctx.levelIndex ?? "build"}#${pick}`;
  }

  function missing(id: string, where: string): void {
    result.diagnostics.push({
      severity: "warning",
      code: "unresolved-reference",
      message: `"${id}" is not in any loaded source (referenced by ${where})`,
      subject: id,
    });
  }

  function addParts(el: Element, from: PartSource): void {
    for (const m of el.modifiers ?? []) result.modifiers.push({ def: m, from });
    for (const r of el.resources ?? []) result.resources.push({ def: r, from });
    for (const a of el.actions ?? []) result.actions.push({ def: a, from });
    for (const e of el.effects ?? []) result.effects.push({ def: e, from });
  }

  function declareChoices(el: Element, ctx: Ctx): void {
    for (const def of el.choices ?? []) {
      const chosen = answerFor(build, def.id, ctx.scope, ctx.levelIndex);
      result.choices.push({
        definition: def,
        owner: el,
        scope: ctx.scope,
        levelIndex: ctx.levelIndex,
        level: ctx.level,
        class: ctx.class,
        chosen,
      });
      chosen.forEach((id, pick) =>
        visit(id, {
          ...ctx,
          origin: [...ctx.origin, el.id],
          occurrence: occurrenceFor(def, ctx, pick),
        }),
      );
    }
  }

  function visit(id: string, ctx: Ctx): void {
    const key = `${ctx.occurrence ?? ""}\u0000${id}`;
    if (visited.has(key)) return;
    visited.add(key);
    const el = index.get(id);
    if (!el) {
      missing(id, ctx.origin.length ? ctx.origin[ctx.origin.length - 1] : "the build");
      return;
    }
    const collected: CollectedElement = {
      element: el,
      origin: ctx.origin,
      scope: ctx.scope,
      levelIndex: ctx.levelIndex,
      level: ctx.level,
      class: ctx.class,
    };
    result.elements.push(collected);
    result.byId.set(id, collected);
    addParts(el, collected);
    declareChoices(el, ctx);

    for (const grant of el.grants ?? [])
      visit(grantId(grant), { ...ctx, origin: [...ctx.origin, id] });

    if (el.levels && el.kind !== "class") {
      if (el.levelsBy === "character") {
        // Staged against total character level, which isn't known yet.
        if (!characterProgressions.some((e) => e.id === el.id)) characterProgressions.push(el);
      } else if (ctx.class) {
        // A chosen element with its own level progression (a subclass) rides along
        // with the class that offered it, catching up to that class's current level.
        const list = progressionsByClass.get(ctx.class) ?? [];
        if (!list.some((e) => e.id === el.id)) list.push(el);
        progressionsByClass.set(ctx.class, list);
        const upTo = ctx.level ?? 0;
        for (let l = 1; l <= upTo; l++) applyLevelEntry(el, l, ctx.class);
      } else {
        // A `levels` map keyed by class level on something no class governs: it
        // would be read by nothing at all. Saying so is the whole point — this
        // used to be silent, and a converter would never find out.
        result.diagnostics.push({
          severity: "warning",
          code: "unknown-part",
          message: `"${el.id}" declares levels that nothing reads. Add \`levelsBy: "character"\` to stage it against character level.`,
          subject: el.id,
        });
      }
    }
  }

  /**
   * One level's worth of an element's progression. `classId` is omitted when the
   * element stages against total character level, in which case the level and
   * the build level index are the same thing — total level *is* how many build
   * levels there are, so a species trait gained at level 5 belongs to the fifth
   * one, and rides along with it when that level is removed.
   */
  function applyLevelEntry(owner: Element, level: number, classId?: string): void {
    const entry = (owner.levels as Record<string, LevelEntry> | undefined)?.[String(level)];
    if (!entry) return;
    const levelIndex = classId ? levelIndexOf.get(classId)?.[level - 1] : level - 1;
    const from: PartSource = { element: owner, level, class: classId };

    for (const key of LEVEL_PART_KEYS) {
      const list = entry[key];
      if (!list) continue;
      for (const def of list) {
        if (key === "modifiers") result.modifiers.push({ def: def as Modifier, from });
        else if (key === "resources") result.resources.push({ def: def as ResourceDef, from });
        else if (key === "actions") result.actions.push({ def: def as ActionDef, from });
        else result.effects.push({ def: def as EffectDef, from });
      }
    }

    const ctx: Ctx = {
      origin: [owner.id],
      scope: "level",
      levelIndex,
      level,
      class: classId,
    };
    for (const grant of entry.grants ?? []) visit(grantId(grant), ctx);
    for (const def of entry.choices ?? []) {
      const chosen = answerFor(build, def.id, "level", levelIndex);
      result.choices.push({
        definition: def,
        owner,
        scope: "level",
        levelIndex,
        level,
        class: classId,
        chosen,
      });
      chosen.forEach((id, pick) => visit(id, { ...ctx, occurrence: occurrenceFor(def, ctx, pick) }));
    }
  }

  // --- species and background ----------------------------------------------

  if (build.species) visit(build.species, { origin: [], scope: "build" });
  if (build.background) visit(build.background, { origin: [], scope: "build" });

  // --- class levels, in build order ----------------------------------------

  const counts = new Map<string, number>();
  (build.levels ?? []).forEach((lvl, i) => {
    if (!lvl?.class) {
      result.diagnostics.push({
        severity: "error",
        code: "invalid-element",
        message: `Level ${i + 1} has no class`,
        subject: "build",
      });
      return;
    }
    const cls = index.get(lvl.class);
    const level = (counts.get(lvl.class) ?? 0) + 1;
    counts.set(lvl.class, level);
    const indices = levelIndexOf.get(lvl.class) ?? [];
    indices[level - 1] = i;
    levelIndexOf.set(lvl.class, indices);

    if (!cls) {
      missing(lvl.class, `level ${i + 1}`);
      return;
    }
    if (level === 1) visit(cls.id, { origin: [], scope: "build", class: cls.id, level: 1 });
    applyLevelEntry(cls, level, cls.id);
    // Subclasses chosen earlier gain their feature for this level too.
    for (const prog of progressionsByClass.get(cls.id) ?? []) applyLevelEntry(prog, level, cls.id);
  });

  // --- elements staged against total character level ------------------------

  // A worklist, because a staged entry can grant something that stages too.
  const totalLevel = Math.max(build.levels?.length ?? 0, 0) || build.level || 0;
  for (let i = 0; i < characterProgressions.length; i++) {
    const owner = characterProgressions[i];
    for (let level = 1; level <= totalLevel; level++) applyLevelEntry(owner, level);
  }

  for (const [id, level] of counts) {
    const element = index.get(id);
    if (!element) continue;
    result.classLevels.push({
      element,
      id,
      level,
      subclasses: (progressionsByClass.get(id) ?? []).filter((e) => e.kind === "subclass"),
    });
  }

  // --- inventory -----------------------------------------------------------

  (inventory?.items ?? []).forEach((entry, i) => {
    const element = resolveItem(index, entry, i, result.diagnostics);
    if (!element) return;
    const item = element as ItemElement;
    const needsEquip = item.requiresEquipped ?? true;
    const applies = (!needsEquip || entry.equipped === true) && (!item.attunement || entry.attuned === true);
    result.items.push({ entry, index: i, element, applies });
    if (!applies) return;

    const from: PartSource = { element, itemIndex: i };
    const collected: CollectedElement = { ...from, origin: ["inventory"], scope: "build" };
    if (!result.byId.has(element.id)) {
      result.elements.push(collected);
      result.byId.set(element.id, collected);
    }
    addParts(element, from);
    for (const mod of armorModifiers(item)) result.modifiers.push({ def: mod, from });
    if (item.charges) result.resources.push({ def: item.charges, from });
    declareChoices(element, { origin: ["inventory"], scope: "build" });
    for (const grant of element.grants ?? [])
      visit(grantId(grant), { origin: ["inventory", element.id], scope: "build" });
  });

  return result;
}

/** An inventory entry is either a reference to content or an inline custom item. */
export function resolveItem(
  index: ContentIndex,
  entry: InventoryEntry,
  i: number,
  diagnostics: Diagnostic[],
): Element | undefined {
  if (entry.item) {
    const inline = entry.item;
    return {
      id: inline.id ?? `custom:item:${i}`,
      kind: inline.kind ?? "item",
      name: inline.name ?? "Custom item",
      source: inline.source ?? "custom",
      ...inline,
    } as Element;
  }
  if (!entry.id) {
    diagnostics.push({
      severity: "error",
      code: "invalid-element",
      message: `Inventory entry ${i + 1} has neither an id nor an inline item`,
      subject: "inventory",
    });
    return undefined;
  }
  const el = index.get(entry.id);
  if (!el) {
    diagnostics.push({
      severity: "warning",
      code: "unresolved-reference",
      message: `Inventory item "${entry.id}" is not in any loaded source`,
      subject: entry.id,
    });
    return undefined;
  }
  return el;
}

/**
 * Armour is typed sugar over a `base` AC candidate, so content authors (and the
 * conversion skill) don't have to hand-write the dex formula every time. Written
 * modifiers still work and compete in the same `base` race.
 */
export function armorModifiers(item: ItemElement): Modifier[] {
  const armor = item.armor;
  if (!armor) return [];
  const dexPart =
    armor.dexMax === null
      ? ""
      : armor.dexMax === undefined
        ? " + @abilities.dex.mod"
        : ` + min(${armor.dexMax}, @abilities.dex.mod)`;
  const base = typeof armor.base === "number" ? String(armor.base) : `(${armor.base})`;
  const mods: Modifier[] = [{ target: "ac", op: "base", value: `${base}${dexPart}` }];
  if (armor.stealthDisadvantage)
    mods.push({ target: "skills.stealth", op: "disadvantage", stackKey: `armor:${item.id}` });
  return mods;
}
