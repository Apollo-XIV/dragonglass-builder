/**
 * The content index: every loaded source flattened into one queryable set, with
 * source priority resolving id collisions and kind aliases normalised on the way in.
 */

import type {
  Ability,
  Diagnostic,
  Element,
  Filter,
  KindElement,
  SkillElement,
  SourceRef,
  SourcebookElement,
  StatPathElement,
} from "../types";
import { validateElement } from "./validate";

export interface LoadedSource {
  /** Source id, from the source's source.json or its settings entry. */
  id: string;
  name?: string;
  ref?: SourceRef;
  /** Raw elements, straight from JSON. Validated here. */
  elements: unknown[];
  /** Source-relative file each element came from, by index. For error messages. */
  elementFiles?: string[];
  /** Problems from fetching or parsing, carried through to the sources panel. */
  diagnostics?: Diagnostic[];
}

export interface OverrideRecord {
  id: string;
  /** Source whose element is in use. */
  winner: string;
  /** Sources whose element was shadowed. */
  shadowed: string[];
}

/** Which source an indexed element came from. */
export interface ElementOrigin {
  source: string;
  sourceName?: string;
  priority: number;
  /** Source-relative file, when the loader tracked it. */
  file?: string;
}

export class ContentIndex {
  private readonly elements = new Map<string, Element>();
  private readonly origins = new Map<string, ElementOrigin>();
  private readonly byKindMap = new Map<string, Element[]>();
  private readonly byTag = new Map<string, Element[]>();
  private readonly kindDefinitions = new Map<string, KindElement>();
  private readonly statPaths = new Map<string, StatPathElement>();
  private readonly statPathPatterns: { re: RegExp; def: StatPathElement }[] = [];
  private readonly sourcebooks = new Map<string, SourcebookElement>();
  /** Short class keys mapped to class element ids, for @level(monk) and @table. */
  private readonly classKeys = new Map<string, string>();
  /**
   * Which ability each declared skill uses. `skills.*` is an open family like
   * `senses.*`: core declares the stat path, content declares its members, so the
   * engine carries no list of its own.
   */
  private readonly skillAbilities = new Map<string, Ability>();
  private readonly skillElements = new Map<string, SkillElement>();

  readonly diagnostics: Diagnostic[] = [];
  readonly overrides: OverrideRecord[] = [];
  readonly sources: { id: string; name?: string; priority: number }[] = [];

  /** Sources in priority order, highest first. */
  static build(sources: LoadedSource[]): ContentIndex {
    const index = new ContentIndex();
    index.load(sources);
    return index;
  }

  private load(sources: LoadedSource[]): void {
    // Pass 1: validate, note which source owns each id, build the alias map.
    const aliasToKind = new Map<string, string>();
    const accepted: { el: Element; origin: ElementOrigin }[] = [];
    const shadowed = new Map<string, string[]>();

    sources.forEach((src, priority) => {
      this.sources.push({ id: src.id, name: src.name, priority });
      for (const d of src.diagnostics ?? []) this.diagnostics.push(d);
      const seen = new Set<string>();

      src.elements.forEach((raw, i) => {
        const file = src.elementFiles?.[i];
        const { usable, diagnostics } = validateElement(raw);
        for (const d of diagnostics)
          this.diagnostics.push({ ...d, subject: d.subject ?? src.id, source: src.id, file: d.file ?? file });
        if (!usable) return;
        const el = raw as Element;

        if (seen.has(el.id)) {
          this.diagnostics.push({
            severity: "error",
            code: "duplicate-id",
            message: `"${el.id}" is defined twice in source "${src.id}"; the first wins`,
            subject: el.id,
            source: src.id,
            file,
          });
          return;
        }
        seen.add(el.id);

        if (this.origins.has(el.id)) {
          // A lower-priority source lost; record it for the "overridden by" badge.
          const list = shadowed.get(el.id) ?? [];
          list.push(src.id);
          shadowed.set(el.id, list);
          return;
        }
        const origin: ElementOrigin = { source: src.id, sourceName: src.name, priority, file };
        this.origins.set(el.id, origin);
        accepted.push({ el, origin });

        if (el.kind === "kind") {
          const kd = el as KindElement;
          for (const alias of kd.aliases ?? []) if (!aliasToKind.has(alias)) aliasToKind.set(alias, kd.key);
        }
      });
    });

    for (const [id, list] of shadowed) {
      const winner = this.origins.get(id);
      this.overrides.push({ id, winner: winner?.source ?? "?", shadowed: list });
      this.diagnostics.push({
        severity: "info",
        code: "overridden",
        message: `"${id}" from ${list.join(", ")} overridden by ${winner?.source}`,
        subject: id,
      });
    }

    // Pass 2: normalise kinds through aliases, then index.
    for (const { el } of accepted) {
      const translated = aliasToKind.get(el.kind);
      const element: Element = translated && translated !== el.kind ? { ...el, kind: translated } : el;
      this.elements.set(element.id, element);

      const list = this.byKindMap.get(element.kind) ?? [];
      list.push(element);
      this.byKindMap.set(element.kind, list);

      for (const tag of element.tags ?? []) {
        const tagged = this.byTag.get(tag) ?? [];
        tagged.push(element);
        this.byTag.set(tag, tagged);
      }

      switch (element.kind) {
        case "kind": {
          const kd = element as KindElement;
          this.kindDefinitions.set(kd.key, kd);
          break;
        }
        case "stat-path": {
          const sp = element as StatPathElement;
          if (sp.key.includes("*")) this.statPathPatterns.push({ re: wildcardToRegExp(sp.key), def: sp });
          else this.statPaths.set(sp.key, sp);
          break;
        }
        case "sourcebook":
          this.sourcebooks.set(element.id, element as SourcebookElement);
          break;
        case "class": {
          const key = typeof element.key === "string" ? element.key : lastSegment(element.id);
          if (!this.classKeys.has(key)) this.classKeys.set(key, element.id);
          this.classKeys.set(element.id, element.id);
          break;
        }
        case "skill": {
          const skill = element as SkillElement;
          // Same defaulting rule as a class's `key`: the id's last segment.
          const key = typeof skill.key === "string" ? skill.key : lastSegment(skill.id);
          this.skillAbilities.set(key, skill.ability);
          this.skillElements.set(key, skill);
          break;
        }
      }
    }

    // Pass 3: reference checks that need the whole index.
    this.checkReferences();
  }

  private checkReferences(): void {
    for (const el of this.elements.values()) {
      const origin = this.origins.get(el.id);
      const where = { source: origin?.source, file: origin?.file };
      if (el.kind !== "sourcebook" && !this.sourcebooks.has(el.source))
        this.diagnostics.push({
          severity: "error",
          code: "missing-source",
          message: `"${el.id}" references sourcebook "${el.source}", which is not loaded`,
          subject: el.id,
          path: "source",
          ...where,
        });
      const metaKinds = ["kind", "stat-path", "sourcebook"];
      if (!metaKinds.includes(el.kind) && !this.kindDefinitions.has(el.kind))
        this.diagnostics.push({
          severity: "warning",
          code: "unknown-kind",
          message: `"${el.id}" has kind "${el.kind}", which no source declares`,
          subject: el.id,
          path: "kind",
          ...where,
        });
      for (const grant of el.grants ?? []) {
        const id = typeof grant === "string" ? grant : grant.id;
        if (!this.elements.has(id))
          this.diagnostics.push({
            severity: "warning",
            code: "unresolved-reference",
            message: `"${el.id}" grants "${id}", which is not loaded`,
            subject: el.id,
            path: "grants",
            ...where,
          });
      }
      const levels = el.levels as Record<string, { grants?: (string | { id: string })[] }> | undefined;
      for (const [lvl, entry] of Object.entries(levels ?? {})) {
        for (const grant of entry.grants ?? []) {
          const id = typeof grant === "string" ? grant : grant.id;
          if (!this.elements.has(id))
            this.diagnostics.push({
              severity: "warning",
              code: "unresolved-reference",
              message: `"${el.id}" grants "${id}" at level ${lvl}, which is not loaded`,
              subject: el.id,
              path: `levels.${lvl}.grants`,
              ...where,
            });
        }
      }
    }
  }

  // -- lookups ---------------------------------------------------------------

  get(id: string): Element | undefined {
    return this.elements.get(id);
  }

  has(id: string): boolean {
    return this.elements.has(id);
  }

  all(): Element[] {
    return [...this.elements.values()];
  }

  byKind(kind: string): Element[] {
    return this.byKindMap.get(kind) ?? [];
  }

  kindsInUse(): string[] {
    return [...this.byKindMap.keys()];
  }

  kindDef(kind: string): KindElement | undefined {
    return this.kindDefinitions.get(kind);
  }

  allKindDefs(): KindElement[] {
    return [...this.kindDefinitions.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  /** A display label for a kind, falling back to the raw kind string. */
  kindLabel(kind: string, plural = false): string {
    const def = this.kindDefinitions.get(kind);
    if (!def) return kind;
    return plural ? (def.plural ?? `${def.label}s`) : def.label;
  }

  sourcebook(id: string): SourcebookElement | undefined {
    return this.sourcebooks.get(id);
  }

  allSourcebooks(): SourcebookElement[] {
    return [...this.sourcebooks.values()];
  }

  abbreviation(sourceId: string): string | undefined {
    return this.sourcebooks.get(sourceId)?.abbreviation;
  }

  origin(id: string): ElementOrigin | undefined {
    return this.origins.get(id);
  }

  overrideFor(id: string): OverrideRecord | undefined {
    return this.overrides.find((o) => o.id === id);
  }

  statPath(path: string): StatPathElement | undefined {
    const exact = this.statPaths.get(path);
    if (exact) return exact;
    for (const { re, def } of this.statPathPatterns) if (re.test(path)) return def;
    return undefined;
  }

  allStatPaths(): StatPathElement[] {
    return [...this.statPaths.values(), ...this.statPathPatterns.map((p) => p.def)];
  }

  /** Every declared skill key, in declaration order. */
  skillKeys(): string[] {
    return [...this.skillAbilities.keys()];
  }

  /** The ability a declared skill uses, or undefined if no source declares it. */
  skillAbility(key: string): Ability | undefined {
    return this.skillAbilities.get(key);
  }

  /** The element behind a skill key, for its display name. */
  skill(key: string): SkillElement | undefined {
    return this.skillElements.get(key);
  }

  /** Resolves "monk" or "srd:class:monk" to a class element. */
  classByRef(ref: string): Element | undefined {
    const id = this.classKeys.get(ref) ?? this.classKeys.get(ref.toLowerCase());
    if (id) return this.elements.get(id);
    const direct = this.elements.get(ref);
    if (direct?.kind === "class") return direct;
    return undefined;
  }

  /**
   * Every element matching a choice filter, in a stable order.
   *
   * Criteria are conjunctive: `{ kind: "skill", ids: [...six] }` means "these six
   * skills", not "every skill plus these six". An author who wants to widen a
   * choice beyond one kind omits `kind` and lists ids alone.
   */
  query(filter: Filter): Element[] {
    const kinds =
      filter.kind === undefined ? undefined : Array.isArray(filter.kind) ? filter.kind : [filter.kind];
    const ids = filter.ids?.length ? filter.ids : undefined;

    // Start from the narrowest index the filter gives us.
    let candidates: Element[];
    if (ids) {
      candidates = ids.map((id) => this.elements.get(id)).filter((el): el is Element => el !== undefined);
    } else if (filter.tags?.length) {
      candidates = [];
      const seen = new Set<string>();
      for (const tag of filter.tags)
        for (const el of this.byTag.get(tag) ?? []) {
          if (seen.has(el.id)) continue;
          seen.add(el.id);
          candidates.push(el);
        }
    } else if (kinds) {
      candidates = kinds.flatMap((k) => this.byKindMap.get(k) ?? []);
    } else if (filter.allTags?.length) {
      candidates = this.byTag.get(filter.allTags[0]) ?? [];
    } else {
      candidates = [];
    }

    const exclude = new Set(filter.exclude ?? []);
    const out = new Map<string, Element>();
    for (const el of candidates) {
      if (exclude.has(el.id)) continue;
      if (kinds && !kinds.includes(el.kind)) continue;
      if (filter.tags?.length && !filter.tags.some((t) => el.tags?.includes(t))) continue;
      if (filter.allTags?.length && !filter.allTags.every((t) => el.tags?.includes(t))) continue;
      out.set(el.id, el);
    }

    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Ids in a filter that do not resolve, for validation. */
  unresolvedIn(filter: Filter): string[] {
    return [...(filter.ids ?? []), ...(filter.exclude ?? [])].filter((id) => !this.elements.has(id));
  }
}

/**
 * "speed.*" matches "speed.walk" but not "speed.fly.hover"; "damage.**" matches any
 * depth, for open-ended families like damage.weapon.melee.str.
 */
function wildcardToRegExp(pattern: string): RegExp {
  const body = pattern
    .split("**")
    .map((chunk) =>
      chunk
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^.]+"),
    )
    .join(".+");
  return new RegExp(`^${body}$`);
}

function lastSegment(id: string): string {
  const parts = id.split(":");
  return parts[parts.length - 1];
}
