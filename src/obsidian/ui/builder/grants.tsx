/**
 * What something brought, set out under it: its granted features and its choices,
 * indented behind one continuous line so it reads as theirs. Nests — a pick that
 * brings choices of its own gets its own indent under the choice that made it.
 *
 * A feature that declares a choice is one row, not two: the feature's own row reads
 * as the feature and carries the decision as a control, and what the pick brought
 * hangs under it.
 */

import { type ReactNode } from "react";
import { factsOf } from "../../../core/content/facts";
import { unverifiedNotes } from "../../../core/content/provenance";
import { choiceKey, type GrantNode } from "../../../core/resolver/grant-tree";
import type { PendingChoice, ResolvedElement } from "../../../core/resolver/resolved";
import type { CharacterStore } from "../../character-store";
import { PendingChoiceRow } from "./choice-row";
import { InfoRow } from "./detail";
import { usePickerSlot } from "./picker";

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

/** The choices an element declared, which its own row carries. Every choice under an element is its own. */
function ownChoices(node: GrantNode): PendingChoice[] {
  return node.children.flatMap((child) => (child.type === "choice" ? [child.choice] : []));
}

/** What hangs under a row: an element's own choices are on its row, so what their picks brought takes their place. */
function underRow(node: GrantNode): GrantNode[] {
  if (node.type !== "element") return node.children;
  return node.children.flatMap((child) => (child.type === "choice" ? child.children : [child]));
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
  return (
    <div className="dg-grants">
      <GrantRows nodes={nodes} store={store} nameOf={nameOf} />
    </div>
  );
}

/**
 * The rows of a tree without the indent that says whose they are: for a list that is
 * already its owner's, like a level card. What each row brought is still indented.
 */
export function GrantRows({
  nodes,
  store,
  nameOf,
  rowClass = "dg-grant-feature",
}: {
  nodes: GrantNode[];
  store: CharacterStore;
  nameOf: (id: string) => string;
  rowClass?: string;
}): ReactNode {
  const named = (id: string): string | undefined => (nameOf(id) === id ? undefined : nameOf(id));
  return rowsOf(nodes).map((row) => (
    <div className="dg-grant" key={keyOf(row)}>
      {row.type === "element" ? (
        <FeatureChip
          feature={row.element}
          choices={ownChoices(row)}
          store={store}
          nameOf={nameOf}
          className={rowClass}
        />
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
          className={rowClass}
        />
      ) : row.type === "spell" ? (
        <InfoRow
          title={row.spell.name}
          subtitle={row.level ? `spell · from level ${row.level}` : "spell"}
          text={typeof row.spell.text === "string" ? row.spell.text : undefined}
          facts={factsOf(row.spell, named)}
          unverified={unverifiedNotes(row.spell)}
          className={rowClass}
        />
      ) : (
        // Not the character's yet, so drawn faded; it still reads like any other row.
        <InfoRow
          title={row.name}
          subtitle={`${row.kind.replace(/-/g, " ")} · at level ${row.level}`}
          text={row.text}
          facts={row.element ? factsOf(row.element, named) : undefined}
          unverified={row.element ? unverifiedNotes(row.element) : undefined}
          className={`${rowClass} is-upcoming`}
        />
      )}
      {row.type === "list" ? null : <GrantTree nodes={underRow(row)} store={store} nameOf={nameOf} />}
    </div>
  ));
}

/**
 * A feature: readable for its text, and carrying the choices it declares as controls
 * on the same row. A single choice the feature names already goes unlabelled; their
 * options open under the whole row, since one squeezed beside the title can't be read.
 */
export function FeatureChip({
  feature,
  nameOf,
  choices = [],
  store,
  className = "dg-level-feature",
}: {
  feature: ResolvedElement;
  nameOf: (id: string) => string;
  /** The choices this feature declares; they need the store to be answered. */
  choices?: PendingChoice[];
  store?: CharacterStore;
  className?: string;
}): ReactNode {
  const slot = usePickerSlot();
  const decides = store && choices.length ? choices : [];
  const unlabelled = decides.length === 1 && decides[0].name === feature.name;
  return (
    <>
      <InfoRow
        title={feature.name}
        subtitle={feature.kind.replace(/-/g, " ")}
        text={feature.text}
        fluff={feature.fluff}
        facts={factsOf(feature.element, (id) => (nameOf(id) === id ? undefined : nameOf(id)))}
        unverified={unverifiedNotes(feature.element)}
        className={[className, decides.length ? "has-choice" : "", decides.length > 1 ? "has-choices" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {store && decides.length ? (
          <span className="dg-feature-choices">
            {decides.map((choice) => (
              <PendingChoiceRow
                key={choiceKey(choice)}
                choice={choice}
                store={store}
                nameOf={nameOf}
                inline
                unlabelled={unlabelled}
                slot={slot}
              />
            ))}
          </span>
        ) : null}
      </InfoRow>
      {slot.node}
    </>
  );
}
