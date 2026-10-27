/**
 * The builder's sources section: the character's effective source list in priority
 * order, validation errors per source, and the attribution every loaded sourcebook
 * requires.
 */

import { useState, type ReactNode } from "react";
import { Notice } from "obsidian";
import type { Diagnostic, SourceRef } from "../../core/types";
import type { CharacterStore } from "../character-store";
import { blankSources } from "../character-files";
import { describeSource, parseSourceInput, suggestSourceId } from "../settings";
import { usePlugin } from "./context";
import { Diagnostics, Empty, Markdown, Pill, Section } from "./components";

export function SourcesPanel({ store }: { store: CharacterStore }): ReactNode {
  const { plugin } = usePlugin();
  const index = store.index;
  const own = store.data.sources?.sources ?? [];
  const disabled = new Set(store.data.sources?.disabled ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const addOwn = async (): Promise<void> => {
    const parsed = parseSourceInput(input);
    if (!parsed) return;
    const file = store.data.sources ?? blankSources();
    const id = uniqueId(suggestSourceId(parsed), [...own.map((s) => s.id), ...plugin.settings.sources.map((s) => s.id)]);
    store.update("sources", { ...file, sources: [...own, { ...parsed, id } as SourceRef] });
    setInput("");
    setBusy(true);
    await plugin.reloadSources();
    setBusy(false);
  };

  const removeOwn = async (id: string): Promise<void> => {
    const file = store.data.sources ?? blankSources();
    store.update("sources", { ...file, sources: own.filter((s) => s.id !== id) });
    await plugin.reloadSources();
  };

  const toggleVaultSource = async (id: string, on: boolean): Promise<void> => {
    const file = store.data.sources ?? blankSources();
    const next = on ? [...disabled].filter((d) => d !== id) : [...disabled, id];
    store.update("sources", { ...file, disabled: next });
    await plugin.reloadSources();
  };

  const statusFor = (id: string) => plugin.sources.statusFor(id);

  return (
    <>
      <Section title="This character's sources">
        <p className="dg-muted">
          A character's own sources take priority over the vault-wide list, and can switch a vault-wide source off
          for this character only. More specific always wins.
        </p>
        <div className="dg-filters">
          <input
            type="text"
            placeholder="owner/repo, a GitHub URL, or a vault folder"
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addOwn();
            }}
          />
          <button className="dg-button" onClick={() => void addOwn()} disabled={!input.trim() || busy}>
            Add
          </button>
        </div>
        {own.length === 0 ? (
          <Empty>No per-character sources. This character uses the vault-wide list.</Empty>
        ) : (
          <ul className="dg-source-list">
            {own.map((ref) => (
              <SourceRow key={ref.id} ref_={ref} status={statusFor(ref.id)} onRemove={() => void removeOwn(ref.id)} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Vault-wide sources"
        action={
          <button className="dg-button is-quiet" onClick={() => void plugin.reloadSources()}>
            Reload
          </button>
        }
      >
        {plugin.settings.sources.length === 0 ? (
          <Empty>No vault-wide sources. Add one in the plugin settings.</Empty>
        ) : (
          <ul className="dg-source-list">
            {plugin.settings.sources.map((ref) => (
              <SourceRow
                key={ref.id}
                ref_={ref}
                status={statusFor(ref.id)}
                enabled={!disabled.has(ref.id)}
                onToggle={(on) => void toggleVaultSource(ref.id, on)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Pinning">
        <p className="dg-muted">
          GitHub sources are pinned to a tag or commit, so a fix pushed upstream can't silently change anyone's AC.
          Updating a pin is a deliberate action.
        </p>
        {[...plugin.settings.sources, ...own]
          .filter((ref) => ref.type === "github")
          .map((ref) => (
            <PinEditor key={ref.id} ref_={ref} store={store} />
          ))}
      </Section>

      <Section title="Attribution">
        {index?.allSourcebooks().length ? (
          <ul className="dg-attribution">
            {index.allSourcebooks().map((book) => (
              <li key={book.id}>
                <strong>{book.name}</strong> <Pill>{book.abbreviation}</Pill>
                {book.version ? <span className="dg-muted"> v{book.version}</span> : null}
                {book.license ? <Pill tone="info">{book.license}</Pill> : null}
                {book.attribution ? <Markdown source={book.attribution} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No sourcebooks loaded.</Empty>
        )}
      </Section>

      <Section title="Validation">
        <SourceDiagnostics store={store} />
      </Section>
    </>
  );
}

function SourceRow({
  ref_,
  status,
  enabled,
  onToggle,
  onRemove,
}: {
  ref_: SourceRef;
  status?: { state: string; elementCount: number; diagnostics: Diagnostic[]; origin?: string };
  enabled?: boolean;
  onToggle?: (on: boolean) => void;
  onRemove?: () => void;
}): ReactNode {
  const errors = status?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
  return (
    <li className="dg-source">
      <div className="dg-source-head">
        {onToggle ? (
          <input type="checkbox" checked={enabled ?? true} onChange={(e) => onToggle(e.currentTarget.checked)} />
        ) : null}
        <strong>{ref_.name ?? ref_.id}</strong>
        <span className="dg-muted">{describeSource(ref_)}</span>
        {status ? (
          <Pill tone={status.state === "error" ? "error" : status.state === "cached" ? "warn" : undefined}>
            {status.state}
            {status.state === "loaded" || status.state === "cached" ? ` · ${status.elementCount} elements` : ""}
          </Pill>
        ) : (
          <Pill tone="info">not loaded yet</Pill>
        )}
        {errors ? <Pill tone="error">{errors} errors</Pill> : null}
        {onRemove ? (
          <button className="dg-button is-quiet" onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>
      {status?.origin ? <div className="dg-muted">{status.origin}</div> : null}
      {status?.diagnostics.length ? <Diagnostics diagnostics={status.diagnostics} title="Source problems" /> : null}
    </li>
  );
}

function PinEditor({ ref_, store }: { ref_: SourceRef; store: CharacterStore }): ReactNode {
  const { plugin } = usePlugin();
  const [pin, setPin] = useState(ref_.pin ?? "");

  const save = async (): Promise<void> => {
    const own = store.data.sources?.sources ?? [];
    if (own.some((s) => s.id === ref_.id)) {
      const file = store.data.sources ?? blankSources();
      store.update("sources", {
        ...file,
        sources: own.map((s) => (s.id === ref_.id ? { ...s, pin: pin.trim() || undefined } : s)),
      });
    } else {
      plugin.settings.sources = plugin.settings.sources.map((s) =>
        s.id === ref_.id ? { ...s, pin: pin.trim() || undefined } : s,
      );
      await plugin.saveSettings();
    }
    plugin.sources.invalidate(ref_.id);
    await plugin.reloadSources();
    new Notice(`${ref_.id} pinned to ${pin.trim() || "its default branch"}`);
  };

  return (
    <label className="dg-field">
      <span>{ref_.id}</span>
      <input
        type="text"
        value={pin}
        placeholder="tag or commit SHA"
        onChange={(e) => setPin(e.currentTarget.value)}
      />
      <button className="dg-button is-quiet" onClick={() => void save()} disabled={pin === (ref_.pin ?? "")}>
        Update pin
      </button>
    </label>
  );
}

function SourceDiagnostics({ store }: { store: CharacterStore }): ReactNode {
  const index = store.index;
  if (!index) return <Empty>No content loaded.</Empty>;
  const bySource = new Map<string, Diagnostic[]>();
  for (const d of index.diagnostics) {
    const key = d.source ?? (d.subject ? index.origin(d.subject)?.source : undefined) ?? "unknown";
    const list = bySource.get(key) ?? [];
    list.push(d);
    bySource.set(key, list);
  }
  if (!bySource.size) return <p>Every element in every loaded source validated cleanly.</p>;
  return (
    <>
      {[...bySource.entries()].map(([source, diagnostics]) => (
        <div key={source}>
          <strong>{source}</strong>
          <Diagnostics diagnostics={diagnostics} title="Problems" />
        </div>
      ))}
      <p className="dg-muted">
        Invalid elements are skipped; valid elements from the same source still load. Anything the engine doesn't
        recognise is kept and shown as text.
      </p>
    </>
  );
}

function uniqueId(base: string, taken: string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 100; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now()}`;
}
