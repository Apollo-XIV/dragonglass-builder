/**
 * What something brought, set out under it: its granted features and its choices,
 * indented behind one continuous line so it reads as theirs. Nests — a pick that
 * brings choices of its own gets its own indent under the choice that made it.
 */

import { type ReactNode } from "react";
import { factsOf } from "../../../core/content/facts";
import { unverifiedNotes } from "../../../core/content/provenance";
import { choiceKey, type GrantNode } from "../../../core/resolver/grant-tree";
import type { ResolvedElement } from "../../../core/resolver/resolved";
import type { CharacterStore } from "../../character-store";
import { PendingChoiceRow } from "./choice-row";
import { InfoRow } from "./detail";

/** Kinds that say little on their own, so a parent's are listed together on one row. */
const LISTED_KINDS: Record<string, string> = { skill: "skills", language: "languages" };

type Row = GrantNode | { type: "list"; kind: string; elements: ResolvedElement[] };

/** The nodes as rows: each listed kind folded into one row, where its first member was. */
function rowsOf(nodes: GrantNode[]): Row[] {
  const rows: Row[] = [];
  const lists = new Map<string, ResolvedElement[]>();
  for (const node of nodes) {
    const kind = node.type === "element" && !node.children.length ? node.element.kind : undefined;
    if (node.type !== "element" || kind === undefined || !(kind in LISTED_KINDS)) {
      rows.push(node);
      continue;
    }
    const list = lists.get(kind);
    if (list) list.push(node.element);
    else {
      const elements = [node.element];
      lists.set(kind, elements);
      rows.push({ type: "list", kind, elements });
    }
  }
  return rows;
}

function keyOf(row: Row): string {
  switch (row.type) {
    case "element":
      return `element:${row.element.id}`;
    case "choice":
      return `choice:${choiceKey(row.choice)}`;
    case "spell":
      return `spell:${row.spell.id}:${row.level ?? ""}`;
    case "upcoming":
      return `upcoming:${row.level}:${row.kind}:${row.name}`;
    case "list":
      return `list:${row.kind}`;
  }
}

export function GrantTree({
  nodes,
  store,
  nameOf,
}: {
  nodes: GrantNode[];
  store: CharacterStore;
  nameOf: (id: string) => string;
}): ReactNode {
  if (!nodes.length) return null;
  const named = (id: string): string | undefined => (nameOf(id) === id ? undefined : nameOf(id));
  return (
    <div className="dg-grants">
      {rowsOf(nodes).map((row) => (
        <div className="dg-grant" key={keyOf(row)}>
          {row.type === "element" ? (
            <FeatureChip feature={row.element} nameOf={nameOf} className="dg-grant-feature" />
          ) : row.type === "choice" ? (
            <PendingChoiceRow choice={row.choice} store={store} nameOf={nameOf} />
          ) : row.type === "list" ? (
            <InfoRow
              title={row.elements.map((e) => e.name).join(", ")}
              subtitle={row.elements.length > 1 ? LISTED_KINDS[row.kind] : row.kind}
              text={row.elements
                .filter((e) => e.text)
                .map((e) => `**${e.name}.** ${e.text}`)
                .join("\n\n") || undefined}
              className="dg-grant-feature"
            />
          ) : row.type === "spell" ? (
            <InfoRow
              title={row.spell.name}
              subtitle={row.level ? `spell · from level ${row.level}` : "spell"}
              text={typeof row.spell.text === "string" ? row.spell.text : undefined}
              facts={factsOf(row.spell, named)}
              unverified={unverifiedNotes(row.spell)}
              className="dg-grant-feature"
            />
          ) : (
            // Not the character's yet, so drawn faded; it still reads like any other row.
            <InfoRow
              title={row.name}
              subtitle={`${row.kind.replace(/-/g, " ")} · at level ${row.level}`}
              text={row.text}
              facts={row.element ? factsOf(row.element, named) : undefined}
              unverified={row.element ? unverifiedNotes(row.element) : undefined}
              className="dg-grant-feature is-upcoming"
            />
          )}
          {row.type === "list" ? null : <GrantTree nodes={row.children} store={store} nameOf={nameOf} />}
        </div>
      ))}
    </div>
  );
}

/** An automatic feature: readable for its text, no decision attached. */
export function FeatureChip({
  feature,
  nameOf,
  className = "dg-level-feature",
}: {
  feature: ResolvedElement;
  nameOf: (id: string) => string;
  className?: string;
}): ReactNode {
  return (
    <InfoRow
      title={feature.name}
      subtitle={feature.kind.replace(/-/g, " ")}
      text={feature.text}
      fluff={feature.fluff}
      facts={factsOf(feature.element, (id) => (nameOf(id) === id ? undefined : nameOf(id)))}
      unverified={unverifiedNotes(feature.element)}
      className={className}
    />
  );
}
