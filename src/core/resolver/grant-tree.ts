/**
 * What an element brought with it, as a tree: the elements it grants, the spells it
 * gives innately and the choices it declares, each with what *they* brought underneath.
 * Read from the `origin` every collected element and choice carries, so it agrees with
 * the resolver by construction.
 *
 * A choice's children are what its picks brought, not the picks themselves — the
 * choice's own row already names what was chosen.
 *
 * An element staged against character level (`levelsBy: "character"`) also lists what
 * its later levels will bring, as `upcoming` nodes: nothing the resolver collected, so
 * read from the content itself.
 */

import { grantId } from "./collect";
import type { Origin, PendingChoice, ResolvedCharacter, ResolvedElement } from "./resolved";
import type { Element, LevelEntry } from "../types";

export type GrantNode =
  | { type: "element"; element: ResolvedElement; children: GrantNode[] }
  | { type: "choice"; choice: PendingChoice; children: GrantNode[] }
  /** A spell cast innately, from the element or a level of it already reached. */
  | { type: "spell"; spell: Element; level?: number; children: GrantNode[] }
  /** Something a character level not yet reached will bring: a grant, a spell or a choice. */
  | { type: "upcoming"; level: number; name: string; kind: string; element?: Element; text?: string; children: GrantNode[] };

type Lookup = (id: string) => Element | undefined;

function sameOrigin(a: Origin, b: Origin): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** A choice's identity across a resolve: which choice, declared by what, answered where. */
export function choiceKey(choice: PendingChoice): string {
  return [choice.id, choice.source, choice.scope, choice.levelIndex ?? ""].join("\u0000");
}

/**
 * The children of the element `id`, reached through `origin`. Grants come first, in
 * collection order, then innate spells, then choices, then what later levels bring.
 * Something reached by one of its own choices is left to that choice rather than
 * listed as a grant.
 */
export function grantChildren(character: ResolvedCharacter, id: string, get: Lookup, origin: Origin = []): GrantNode[] {
  return children(character, id, origin, get, new Set());
}

function children(character: ResolvedCharacter, id: string, origin: Origin, get: Lookup, seen: Set<string>): GrantNode[] {
  const path = [...origin, id];
  // A content cycle stops here rather than recursing forever.
  const key = path.join("\u0000");
  if (seen.has(key) || origin.includes(id)) return [];
  seen.add(key);

  const owner = character.elements.find((e) => e.id === id && sameOrigin(e.origin, origin))?.element ?? get(id);
  const choices = character.pendingChoices.filter(
    (choice) => choice.source === id && sameOrigin(choice.origin, origin),
  );
  const chosen = new Set(choices.flatMap((choice) => choice.chosen));
  // Deduplicated, since each occurrence of a repeated pick collects its grants again.
  const grants = [
    ...new Map(
      character.elements
        .filter((element) => sameOrigin(element.origin, path) && !chosen.has(element.id))
        .map((element) => [element.id, element]),
    ).values(),
  ];
  const staged = owner ? stagedEntries(owner) : [];
  const reached = staged.filter(([level]) => level <= character.level);
  const ahead = staged.filter(([level]) => level > character.level);

  return [
    ...grants.map((element): GrantNode => ({
      type: "element",
      element,
      children: children(character, element.id, path, get, seen),
    })),
    ...innateSpells(owner?.innateSpells, get).map((spell): GrantNode => ({ type: "spell", spell, children: [] })),
    ...reached.flatMap(([level, entry]) =>
      innateSpells(entry.innateSpells, get).map((spell): GrantNode => ({ type: "spell", spell, level, children: [] })),
    ),
    ...choices.map((choice): GrantNode => ({
      type: "choice",
      choice,
      // A pick taken twice is one subtree: its grants were collected once per pick, alike.
      children: [...new Set(choice.chosen)].flatMap((pick) => children(character, pick, path, get, seen)),
    })),
    ...ahead.flatMap(([level, entry]) => upcoming(level, entry, get)),
  ];
}

/**
 * What one level of a class brought, as a tree: its features and choices, with what
 * each pick brought under the choice that made it — a patron's features under the
 * patron. Read from the class's whole tree with everything from other levels pruned;
 * something brought here by an element from an earlier level (a subclass feature at
 * Warlock 6) stands as a root, since its owner's row is on that earlier card.
 */
export function levelChildren(
  character: ResolvedCharacter,
  classId: string,
  classLevel: number,
  levelIndex: number,
  get: Lookup,
): GrantNode[] {
  const here = (node: GrantNode, parentHere: boolean): boolean => {
    switch (node.type) {
      case "element":
        return node.element.class === classId && node.element.level === classLevel;
      case "choice":
        return node.choice.levelIndex === levelIndex;
      case "spell":
        return parentHere;
      case "upcoming":
        return false;
    }
  };
  const prune = (nodes: GrantNode[], parentHere: boolean): GrantNode[] =>
    nodes.flatMap((node) => {
      const kept = here(node, parentHere);
      const children = prune(node.children, kept);
      return kept ? [{ ...node, children }] : children;
    });
  return prune(grantChildren(character, classId, get), false);
}

/** An element's levels keyed by character level, in order. Empty for anything else. */
function stagedEntries(element: Element): [number, LevelEntry][] {
  if (element.levelsBy !== "character" || !element.levels) return [];
  return Object.entries(element.levels as Record<string, LevelEntry>)
    .map(([key, entry]): [number, LevelEntry] => [Number(key), entry])
    .filter(([level]) => Number.isFinite(level))
    .sort(([a], [b]) => a - b);
}

/** The spells a list of innate parts names outright. One taken from a choice is that choice's to show. */
function innateSpells(defs: Element["innateSpells"], get: Lookup): Element[] {
  return (defs ?? []).flatMap((def) => (typeof def.spell === "string" ? (get(def.spell) ?? []) : []));
}

function upcoming(level: number, entry: LevelEntry, get: Lookup): GrantNode[] {
  const of = (element: Element): GrantNode => ({
    type: "upcoming",
    level,
    name: element.name,
    kind: element.kind,
    element,
    text: typeof element.text === "string" ? element.text : undefined,
    children: [],
  });
  return [
    ...(entry.grants ?? []).flatMap((grant) => get(grantId(grant)) ?? []).map(of),
    ...innateSpells(entry.innateSpells, get).map(of),
    ...(entry.choices ?? []).map((choice): GrantNode => ({
      type: "upcoming",
      level,
      name: choice.name ?? "A choice",
      kind: "choice",
      text: choice.text,
      children: [],
    })),
  ];
}

/** Every choice somewhere in a tree, so a section can tell which it has already placed. */
export function choicesIn(nodes: GrantNode[]): PendingChoice[] {
  return nodes.flatMap((node) => [...(node.type === "choice" ? [node.choice] : []), ...choicesIn(node.children)]);
}
