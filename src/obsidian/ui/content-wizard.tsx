/**
 * Add or edit one element in a writable source. The kind system is what keeps this
 * dynamic: the kind dropdown is `index.allKindDefs()`, not a hand-written list, so a
 * source that declares its own kind gets a working editor with no code change here.
 *
 * Only the fields every element carries (id, kind, name, source, text, tags, page)
 * get their own inputs. Everything kind-specific — parts, armor, spellcasting, an
 * x- extension — lives in "Other fields", edited as JSON, because typing a bespoke
 * control for every part of every kind is exactly the per-kind hard-coding the kind
 * system exists to avoid. The toggle swaps that split view for one textarea holding
 * the whole element, for pasting a converted element in wholesale.
 */

import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Notice } from "obsidian";
import type { ContentIndex } from "../../core/content";
import { validateElement } from "../../core/content/validate";
import type { Diagnostic, Element, SourceRef } from "../../core/types";
import { upsertElement } from "../content-editor";
import { ConfirmModal } from "../modals/confirm";
import { isWritableSource } from "../sources";
import { usePlugin } from "./context";
import { Diagnostics, Empty, Pill, Section } from "./components";

interface CommonFields {
  id: string;
  kind: string;
  name: string;
  source: string;
  text: string;
  tags: string;
  page: string;
}

const COMMON_KEYS = ["id", "kind", "name", "source", "text", "tags", "page"] as const;

function splitElement(obj: Record<string, unknown>): { common: CommonFields; otherText: string } {
  const rest: Record<string, unknown> = { ...obj };
  for (const key of COMMON_KEYS) delete rest[key];
  const tags = obj.tags;
  return {
    common: {
      id: typeof obj.id === "string" ? obj.id : "",
      kind: typeof obj.kind === "string" ? obj.kind : "",
      name: typeof obj.name === "string" ? obj.name : "",
      source: typeof obj.source === "string" ? obj.source : "",
      text: typeof obj.text === "string" ? obj.text : "",
      tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string").join(", ") : "",
      page: obj.page === undefined ? "" : String(obj.page),
    },
    otherText: Object.keys(rest).length ? JSON.stringify(rest, null, 2) : "",
  };
}

function buildElement(common: CommonFields, otherText: string): { element?: Record<string, unknown>; error?: string } {
  let other: Record<string, unknown>;
  try {
    const parsed = otherText.trim() ? JSON.parse(otherText) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("must be a JSON object");
    other = parsed as Record<string, unknown>;
  } catch (e) {
    return { error: `Other fields: ${e instanceof Error ? e.message : String(e)}` };
  }

  const tags = common.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const page = common.page.trim();

  const element: Record<string, unknown> = {
    ...other,
    id: common.id.trim(),
    kind: common.kind.trim(),
    name: common.name.trim(),
    source: common.source.trim(),
  };
  if (common.text.trim()) element.text = common.text;
  if (tags.length) element.tags = tags;
  if (page) element.page = /^\d+$/.test(page) ? Number(page) : page;

  return { element };
}

function extraDiagnostics(index: ContentIndex, element: Record<string, unknown>): Diagnostic[] {
  const out: Diagnostic[] = [];
  const kind = String(element.kind ?? "");
  const source = String(element.source ?? "");
  const metaKinds = ["kind", "stat-path", "sourcebook"];
  if (kind && !metaKinds.includes(kind) && !index.kindDef(kind))
    out.push({
      severity: "warning",
      code: "unknown-kind",
      message: `"${kind}" is not declared by a kind element; shown as text`,
      subject: typeof element.id === "string" ? element.id : undefined,
      path: "kind",
    });
  if (kind && kind !== "sourcebook" && source && !index.sourcebook(source))
    out.push({
      severity: "error",
      code: "missing-source",
      message: `"${source}" is not a loaded sourcebook element`,
      subject: typeof element.id === "string" ? element.id : undefined,
      path: "source",
    });
  return out;
}

export function ContentWizard({
  index,
  sourceRef,
  initial,
  originFile,
  onSaved,
  onCancel,
}: {
  index: ContentIndex;
  sourceRef: SourceRef;
  /** Undefined for a brand-new element. */
  initial?: Element;
  /** The file the element was loaded from; undefined for a new entry. */
  originFile?: string;
  onSaved: () => void;
  onCancel: () => void;
}): ReactNode {
  const { plugin, app } = usePlugin();
  const readOnly = !isWritableSource(sourceRef);
  const seed = useMemo(() => splitElement((initial as Record<string, unknown>) ?? {}), [initial]);
  const [common, setCommon] = useState<CommonFields>(seed.common);
  const [otherText, setOtherText] = useState(seed.otherText);
  const [mode, setMode] = useState<"form" | "json">("form");
  const [fullJson, setFullJson] = useState("");
  const [jsonError, setJsonError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const field = <K extends keyof CommonFields>(key: K) => ({
    value: common[key],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCommon((c) => ({ ...c, [key]: e.currentTarget.value })),
  });

  const preview = useMemo((): { element?: Record<string, unknown>; error?: string } => {
    if (mode === "json") {
      try {
        const parsed = JSON.parse(fullJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("must be a JSON object");
        return { element: parsed as Record<string, unknown> };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
    return buildElement(common, otherText);
  }, [mode, fullJson, common, otherText]);

  const diagnostics = useMemo(() => {
    if (!preview.element) return [];
    const { diagnostics: structural } = validateElement(preview.element);
    return [...structural, ...extraDiagnostics(index, preview.element)];
  }, [preview, index]);

  const switchToJson = (): void => {
    if (preview.error) {
      new Notice(`Fix "Other fields" first: ${preview.error}`);
      return;
    }
    setFullJson(JSON.stringify(preview.element, null, 2));
    setJsonError(undefined);
    setMode("json");
  };

  const switchToForm = (): void => {
    try {
      const parsed = JSON.parse(fullJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("must be a JSON object");
      const split = splitElement(parsed as Record<string, unknown>);
      setCommon(split.common);
      setOtherText(split.otherText);
      setJsonError(undefined);
      setMode("form");
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async (): Promise<void> => {
    if (!preview.element) {
      new Notice(`Can't save: ${preview.error}`);
      return;
    }
    const element = preview.element as Element;
    if (!element.id || !element.kind || !element.name || !element.source) {
      new Notice("id, kind, name and source are all required.");
      return;
    }

    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length) {
      const ok = await ConfirmModal.ask(
        app,
        "Save with validation errors?",
        `${errors.length} ${errors.length === 1 ? "error" : "errors"} found, starting with: ${errors[0].message}. ` +
          "Degraded content still loads and shows its text, but the parts it's missing won't work until this is fixed.",
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      await upsertElement(plugin.sources, sourceRef, element, { file: originFile, previousId: initial?.id });
      await plugin.reloadSources();
      new Notice(`Saved "${element.name}"`);
      onSaved();
    } catch (e) {
      new Notice(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title={readOnly ? `View ${initial?.name ?? ""}` : initial ? `Edit ${initial.name}` : "New entry"}
      action={
        <button className="dg-button is-quiet" onClick={mode === "form" ? switchToJson : switchToForm}>
          {mode === "form" ? "View raw JSON" : "Back to form"}
        </button>
      }
    >
      {mode === "form" ? (
        <>
          <div className="dg-field">
            <span>Id</span>
            <input type="text" placeholder="homebrew:feat:lucky-break" {...field("id")} />
          </div>
          <div className="dg-field">
            <span>Kind</span>
            <input type="text" list="dg-kind-options" placeholder="feat" {...field("kind")} />
            <datalist id="dg-kind-options">
              {index.allKindDefs().map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </datalist>
          </div>
          <div className="dg-field">
            <span>Name</span>
            <input type="text" placeholder="Lucky Break" {...field("name")} />
          </div>
          <div className="dg-field">
            <span>Source</span>
            <input type="text" list="dg-source-options" placeholder="a loaded sourcebook's id" {...field("source")} />
            <datalist id="dg-source-options">
              {index.allSourcebooks().map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </datalist>
          </div>
          <div className="dg-field">
            <span>Tags</span>
            <input type="text" placeholder="comma, separated" {...field("tags")} />
          </div>
          <div className="dg-field">
            <span>Page</span>
            <input type="text" placeholder="42" {...field("page")} />
          </div>
          <label className="dg-field" style={{ alignItems: "flex-start" }}>
            <span>Text</span>
            <textarea className="dg-textarea" rows={4} {...field("text")} />
          </label>
          <label className="dg-field" style={{ alignItems: "flex-start" }}>
            <span>Other fields</span>
            <textarea
              className="dg-textarea dg-mono"
              rows={10}
              value={otherText}
              placeholder='{ "grants": [], "modifiers": [] }'
              onChange={(e) => setOtherText(e.currentTarget.value)}
            />
          </label>
        </>
      ) : (
        <>
          <textarea
            className="dg-textarea dg-mono"
            rows={22}
            value={fullJson}
            onChange={(e) => setFullJson(e.currentTarget.value)}
          />
          {jsonError ? <Pill tone="error">{jsonError}</Pill> : null}
        </>
      )}

      {preview.error ? (
        <Pill tone="error">{preview.error}</Pill>
      ) : diagnostics.length ? (
        <Diagnostics diagnostics={diagnostics} title="Validation" />
      ) : (
        <Empty>Validates cleanly.</Empty>
      )}

      {readOnly ? <Pill tone="info">This source is read-only; fetched sources can be viewed but not saved.</Pill> : null}

      <div className="dg-filters">
        <button className="dg-button" onClick={onCancel} disabled={busy}>
          {readOnly ? "Close" : "Cancel"}
        </button>
        <button className="dg-button is-cta" onClick={() => void save()} disabled={busy || readOnly}>
          Save
        </button>
      </div>
    </Section>
  );
}
