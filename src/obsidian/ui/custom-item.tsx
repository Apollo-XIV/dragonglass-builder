/**
 * Quick custom items: a menu of forms for the basic item types, From Existing Item and
 * From Scratch, and the same form to edit one later. Every form is drawn from the
 * definitions in `core/custom-item.ts`, so a new type needs no new UI.
 *
 * A custom item is inline in `inventory.5e`, in the element format source content uses.
 * From Existing it stays an instance of the original (`base`, plus only what changed)
 * unless the player detaches it.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  appendInventoryEntry,
  blankDraft,
  buildItem,
  CHARGE_RECHARGES,
  customItemId,
  draftFromItem,
  formTypeOf,
  ITEM_FORMS,
  ITEM_FORM_TYPES,
  overridesOf,
  RARITIES,
  type FormField,
  type ItemDraft,
  type ItemFormType,
} from "../../core/index";
import type { Element, InventoryFile, Modifier } from "../../core/types";
import type { CharacterStore } from "../character-store";
import { FacetPicker } from "./builder/facet-picker";
import { costText, ITEM_FACETS, itemRows, weightText } from "./builder/item-adapter";

type Step =
  | { step: "menu" }
  | { step: "existing" }
  | { step: "form"; draft: ItemDraft; base?: Element; scratch?: boolean; edit?: string };

const emptyFile = (): InventoryFile => ({ kind: "inventory", schemaVersion: 1, items: [] });
const suffix = (): string => Math.random().toString(36).slice(2, 6);

/** The menu, or with `edit` the form for one existing custom entry. */
export function CustomItemFlow({
  store,
  close,
  edit,
}: {
  store: CharacterStore;
  close: () => void;
  edit?: string;
}): ReactNode {
  const [state, setState] = useState<Step>(() => {
    if (!edit) return { step: "menu" };
    const entry = store.data.inventory?.items.find((e) => e.uid === edit);
    const resolved = store.resolved?.inventory.find((i) => i.entry.uid === edit);
    const base = entry?.item?.base ? store.index?.get(entry.item.base) : undefined;
    return resolved
      ? { step: "form", draft: draftFromItem(resolved.element as never), base, edit }
      : { step: "menu" };
  });
  const rows = useMemo(() => (store.index ? itemRows(store.index) : []), [store.index]);

  if (state.step === "existing")
    return (
      <FacetPicker
        rows={rows}
        idOf={(r) => r.id}
        nameOf={(r) => r.name}
        searchOf={(r) => r.tags}
        facets={ITEM_FACETS}
        renderMeta={(r) => [weightText(r.weight), costText(r.value)].filter(Boolean).join(" · ")}
        added={{}}
        single
        onAdd={(r) =>
          setState({
            step: "form",
            draft: draftFromItem(r.element as never, formTypeOf(r.element)),
            base: r.element,
          })
        }
        onStep={() => {}}
        close={() => setState({ step: "menu" })}
      />
    );

  if (state.step === "form")
    return (
      <ItemForm
        key={state.edit ?? state.base?.id ?? state.draft.type}
        store={store}
        initial={state.draft}
        base={state.base}
        scratch={state.scratch}
        edit={state.edit}
        close={close}
        back={state.edit ? undefined : () => setState({ step: "menu" })}
      />
    );

  return (
    <div className="dg-wizard dg-ci-menu">
      {ITEM_FORM_TYPES.map((type) => (
        <button
          key={type}
          className="dg-level-button is-multiclass"
          onClick={() => setState({ step: "form", draft: blankDraft(type) })}
        >
          {ITEM_FORMS[type].label}
        </button>
      ))}
      <hr />
      <button className="dg-level-button is-multiclass" onClick={() => setState({ step: "existing" })}>
        From Existing Item
      </button>
      <button
        className="dg-level-button is-multiclass"
        onClick={() => setState({ step: "form", draft: blankDraft("gear"), scratch: true })}
      >
        From Scratch
      </button>
    </div>
  );
}

function ItemForm({
  store,
  initial,
  base,
  scratch,
  edit,
  close,
  back,
}: {
  store: CharacterStore;
  initial: ItemDraft;
  base?: Element;
  scratch?: boolean;
  edit?: string;
  close: () => void;
  back?: () => void;
}): ReactNode {
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [linked, setLinked] = useState(edit ? Boolean(store.data.inventory?.items.find((e) => e.uid === edit)?.item?.base) : true);
  const [quantity, setQuantity] = useState(1);
  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]): void => setDraft((d) => ({ ...d, [key]: value }));
  const form = ITEM_FORMS[draft.type];
  const paths = store.index?.allStatPaths() ?? [];

  const save = (): void => {
    const file = store.data.inventory ?? emptyFile();
    if (edit) {
      const at = file.items.findIndex((e) => e.uid === edit);
      const old = file.items[at];
      if (!old?.item) return close();
      const built = buildItem(draft, old.item.id ?? customItemId(draft.name, suffix()));
      const keep = linked && base;
      store.update("inventory", {
        ...file,
        items: file.items.map((e, i) => (i === at ? { ...e, item: keep ? overridesOf(base, built) : built } : e)),
      });
      return close();
    }
    const built = buildItem(draft, customItemId(draft.name, suffix()));
    store.update(
      "inventory",
      appendInventoryEntry(file, {
        item: linked && base ? overridesOf(base, built) : built,
        ...(quantity > 1 ? { quantity } : {}),
      }),
    );
    close();
  };

  return (
    <div className="dg-wizard dg-ci-form">
      {scratch ? (
        <label className="dg-field">
          <span>Type</span>
          <select
            className="dg-select"
            value={draft.type}
            onChange={(e) => {
              const type = e.currentTarget.value as ItemFormType;
              setDraft({ ...blankDraft(type), name: draft.name, weight: draft.weight, valueGp: draft.valueGp, text: draft.text });
            }}
          >
            {ITEM_FORM_TYPES.map((t) => (
              <option key={t} value={t}>
                {ITEM_FORMS[t].label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="dg-field">
        <span>Name</span>
        <input type="text" value={draft.name} onChange={(e) => set("name", e.currentTarget.value)} />
      </label>
      {form.fields.map((field) => (
        <Field key={field.id} field={field} draft={draft} set={set} />
      ))}
      <label className="dg-field">
        <span>Weight (lb)</span>
        <input type="number" min={0} step="any" value={draft.weight} onChange={(e) => set("weight", Number(e.currentTarget.value) || 0)} />
      </label>
      <label className="dg-field">
        <span>Value (gp)</span>
        <input type="number" min={0} step="any" value={draft.valueGp} onChange={(e) => set("valueGp", Number(e.currentTarget.value) || 0)} />
      </label>
      {draft.type === "consumable" && !edit ? (
        <label className="dg-field">
          <span>Quantity</span>
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.currentTarget.value)) || 1))} />
        </label>
      ) : null}
      <label className="dg-field">
        <span>{draft.type === "consumable" ? "Effect" : "Description"}</span>
        <textarea className="dg-textarea" rows={3} value={draft.text} onChange={(e) => set("text", e.currentTarget.value)} />
      </label>
      <label className="dg-field">
        <span>Rarity</span>
        <select className="dg-select" value={draft.rarity} onChange={(e) => set("rarity", e.currentTarget.value)}>
          <option value="">None</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {r.replace("-", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="dg-field dg-inv-check">
        <input type="checkbox" checked={draft.attunement} onChange={(e) => set("attunement", e.currentTarget.checked)} />
        <span>Requires attunement</span>
      </label>
      <label className="dg-field dg-inv-check">
        <input type="checkbox" checked={draft.requiresEquipped} onChange={(e) => set("requiresEquipped", e.currentTarget.checked)} />
        <span>Only while equipped</span>
      </label>
      <div className="dg-field">
        <span>Charges</span>
        <input
          type="number"
          min={0}
          value={draft.charges?.max ?? 0}
          onChange={(e) => {
            const max = Math.max(0, Math.floor(Number(e.currentTarget.value)) || 0);
            set("charges", max ? { max, on: draft.charges?.on ?? "dawn" } : undefined);
          }}
        />
        {draft.charges ? (
          <select
            className="dg-select is-inline"
            value={draft.charges.on}
            onChange={(e) => set("charges", { max: draft.charges!.max, on: e.currentTarget.value as never })}
          >
            {CHARGE_RECHARGES.map((on) => (
              <option key={on} value={on}>
                {on === "never" ? "never recharges" : `recharges at ${on.replace("-", " ")}`}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <ModifierList paths={paths} modifiers={draft.modifiers} onChange={(m) => set("modifiers", m)} />
      {base ? (
        <label className="dg-field dg-inv-check">
          <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.currentTarget.checked)} />
          <span>Keep linked to {base.name}</span>
        </label>
      ) : null}
      <div className="dg-sheet-actions">
        <button className="dg-sheet-button" onClick={back ?? close}>
          {back ? "Back" : "Cancel"}
        </button>
        <button className="dg-sheet-button is-primary" onClick={save} disabled={!draft.name.trim()}>
          {edit ? "Save" : "Add to inventory"}
        </button>
      </div>
    </div>
  );
}

function Field({
  field,
  draft,
  set,
}: {
  field: FormField;
  draft: ItemDraft;
  set: <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => void;
}): ReactNode {
  const value = draft[field.id];
  if (field.kind === "bool")
    return (
      <label className="dg-field dg-inv-check">
        <input type="checkbox" checked={value === true} onChange={(e) => set(field.id, e.currentTarget.checked as never)} />
        <span>{field.label}</span>
      </label>
    );
  if (field.kind === "select")
    return (
      <label className="dg-field">
        <span>{field.label}</span>
        <select className="dg-select" value={String(value ?? "")} onChange={(e) => set(field.id, e.currentTarget.value as never)}>
          <option value="">None</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  if (field.kind === "dex")
    return (
      <label className="dg-field">
        <span>{field.label}</span>
        <select
          className="dg-select is-inline"
          value={draft.dexMax === undefined ? "full" : draft.dexMax === null ? "none" : "cap"}
          onChange={(e) => set("dexMax", e.currentTarget.value === "full" ? undefined : e.currentTarget.value === "none" ? null : 2)}
        >
          <option value="full">all of it</option>
          <option value="cap">up to a cap</option>
          <option value="none">none</option>
        </select>
        {typeof draft.dexMax === "number" ? (
          <input type="number" value={draft.dexMax} onChange={(e) => set("dexMax", Number(e.currentTarget.value) || 0)} />
        ) : null}
      </label>
    );
  return (
    <label className="dg-field">
      <span>{field.label}</span>
      <input
        type={field.kind === "number" ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(e) => set(field.id, (field.kind === "number" ? Number(e.currentTarget.value) || 0 : e.currentTarget.value) as never)}
      />
    </label>
  );
}

/** Hand-written modifiers, for items that fit no form: a stat picked by its readable name. */
function ModifierList({
  paths,
  modifiers,
  onChange,
}: {
  paths: { key: string; label?: string }[];
  modifiers: Modifier[];
  onChange: (next: Modifier[]) => void;
}): ReactNode {
  const patch = (i: number, change: Partial<Modifier>): void =>
    onChange(modifiers.map((m, j) => (j === i ? { ...m, ...change } : m)));
  return (
    <div className="dg-field dg-ci-mods">
      <span>Changes</span>
      {modifiers.map((m, i) => (
        <div key={i} className="dg-ci-mod">
          <select className="dg-select is-inline" value={m.target} onChange={(e) => patch(i, { target: e.currentTarget.value })}>
            {!paths.some((p) => p.key.replace("*", "walk") === m.target) ? <option value={m.target}>{m.target}</option> : null}
            {paths.map((p) => (
              <option key={p.key} value={p.key.replace("*", "walk")}>
                {p.label ?? p.key}
              </option>
            ))}
          </select>
          <select className="dg-select is-inline" value={m.op} onChange={(e) => patch(i, { op: e.currentTarget.value as Modifier["op"] })}>
            <option value="add">add</option>
            <option value="base">base (competes, highest wins)</option>
            <option value="min">at least</option>
          </select>
          <input type="text" value={String(m.value ?? "")} onChange={(e) => patch(i, { value: e.currentTarget.value.trim() === "" || Number.isNaN(Number(e.currentTarget.value)) ? e.currentTarget.value : Number(e.currentTarget.value) })} placeholder="1 or an expression" />
          <button className="dg-row-remove" onClick={() => onChange(modifiers.filter((_, j) => j !== i))}>
            ×<span className="dg-sr-only"> remove this change</span>
          </button>
        </div>
      ))}
      <button className="dg-level-button is-multiclass" onClick={() => onChange([...modifiers, { target: "ac", op: "add", value: 1 }])}>
        + Add a change
      </button>
    </div>
  );
}
