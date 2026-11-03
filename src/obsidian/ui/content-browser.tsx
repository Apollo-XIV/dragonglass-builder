/**
 * Browsing and editing one source's elements: filterable by kind (from
 * `index.allKindDefs()`, never a hand-written list) and by text, with the add/edit/
 * remove actions a writable source gets and a read-only source doesn't.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Notice } from "obsidian";
import type { ContentIndex } from "../../core/content";
import type { Element, SourceRef } from "../../core/types";
import { isWritableSource } from "../sources";
import { removeElement } from "../content-editor";
import { usePlugin } from "./context";
import { Empty, Pill, Section } from "./components";
import { ContentWizard } from "./content-wizard";

type Target = { mode: "new" } | { mode: "edit"; element: Element; file?: string };

export function SourceBrowser({
  index,
  sourceRef,
  startNew,
  onClose,
}: {
  index: ContentIndex;
  sourceRef: SourceRef;
  /** Opens straight into "new entry", for a source just created from scratch. */
  startNew?: boolean;
  onClose: () => void;
}): ReactNode {
  const { plugin } = usePlugin();
  const writable = isWritableSource(sourceRef);
  const [kindFilter, setKindFilter] = useState("");
  const [text, setText] = useState("");
  const [target, setTarget] = useState<Target | undefined>(startNew ? { mode: "new" } : undefined);

  // A source's own source.json id wins over its SourceRef.id (so ids survive a
  // renamed settings entry), so the content index files elements under that id,
  // not necessarily `sourceRef.id`. `statusFor` is where the two get reconciled.
  const effectiveId = plugin.sources.statusFor(sourceRef.id)?.sourceId ?? sourceRef.id;
  const elements = useMemo(
    () => index.all().filter((el) => index.origin(el.id)?.source === effectiveId),
    [index, effectiveId],
  );
  const kinds = useMemo(() => [...new Set(elements.map((el) => el.kind))].sort(), [elements]);
  const needle = text.trim().toLowerCase();
  const filtered = elements
    .filter((el) => !kindFilter || el.kind === kindFilter)
    .filter((el) => !needle || el.name.toLowerCase().includes(needle) || el.id.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (target)
    return (
      <ContentWizard
        index={index}
        sourceRef={sourceRef}
        initial={target.mode === "edit" ? target.element : undefined}
        originFile={target.mode === "edit" ? target.file : undefined}
        onSaved={() => setTarget(undefined)}
        onCancel={() => setTarget(undefined)}
      />
    );

  const remove = async (element: Element): Promise<void> => {
    const file = index.origin(element.id)?.file;
    if (!file) {
      new Notice(`Can't find which file "${element.id}" lives in.`);
      return;
    }
    await removeElement(plugin.sources, sourceRef, element.id, file);
    await plugin.reloadSources();
    new Notice(`Removed "${element.name}"`);
  };

  return (
    <Section
      title={`Browse ${sourceRef.name ?? sourceRef.id}`}
      action={
        <button className="dg-button is-quiet" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="dg-filters">
        <select className="dg-select is-inline" value={kindFilter} onChange={(e) => setKindFilter(e.currentTarget.value)}>
          <option value="">Every kind</option>
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {index.kindLabel(kind, true)}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter by name or id"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
        {writable ? (
          <button className="dg-button is-cta" onClick={() => setTarget({ mode: "new" })}>
            Add entry
          </button>
        ) : (
          <Pill tone="info">read-only</Pill>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty>
          {elements.length === 0 ? "This source has no elements loaded yet." : "Nothing matches that filter."}
        </Empty>
      ) : (
        <ul className="dg-source-list">
          {filtered.map((element) => (
            <li key={element.id}>
              <div className="dg-element-head">
                <strong>{element.name}</strong>
                <Pill>{index.kindLabel(element.kind)}</Pill>
                <span className="dg-muted">{element.id}</span>
                {writable ? (
                  <>
                    <button
                      className="dg-button is-quiet"
                      onClick={() => setTarget({ mode: "edit", element, file: index.origin(element.id)?.file })}
                    >
                      Edit
                    </button>
                    <button className="dg-button is-quiet is-damage" onClick={() => void remove(element)}>
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    className="dg-button is-quiet"
                    onClick={() => setTarget({ mode: "edit", element })}
                    title="Read-only sources can be viewed but not saved"
                  >
                    View
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
