/** A choice as a row: what it is, what was chosen, and the picker that changes it. */

import { type ReactNode } from "react";
import type { PendingChoice } from "../../../core/resolver/resolved";
import type { CharacterStore } from "../../character-store";
import { usePlugin } from "../context";
import { useBuildChange } from "./changes";
import { Readable, type DetailSpec } from "./detail";
import { inheritedFilterOf, optionsFor, sourceRefOf } from "./model";
import { chosenSpec, usePicker, usePickerSlot, type PickerOption, type PickerSlot } from "./picker";

/** A row that opens a choice sheet: label, current selection or "Choose", chevron. */
export function ChoiceRow({
  label,
  value,
  empty,
  invalid,
  reading,
  onOpen,
  slot: shared,
  slotKey,
  inline,
}: {
  /** Absent on an inline control whose feature's own title already names it. */
  label?: string;
  value?: string;
  /** What was chosen, read the way the layout reads: held on a phone, hovered on a desktop. */
  reading?: DetailSpec;
  /** Dashed accent border, for a decision still to make (spec 7.3). */
  empty?: boolean;
  invalid?: string;
  onOpen: () => void;
  /** A slot the caller places, for a control inside a row its options shouldn't open in. */
  slot?: PickerSlot;
  slotKey?: string;
  /** Drawn as a control on a feature's row rather than a row of its own. */
  inline?: boolean;
}): ReactNode {
  const own = usePickerSlot();
  const slot = shared ?? own;
  return (
    <>
      <Readable
        className={["dg-choice-row", inline ? "is-inline" : "", empty ? "is-empty" : ""].filter(Boolean).join(" ")}
        spec={value ? reading : undefined}
        onTap={() => slot.open(onOpen, slotKey)}
      >
        <span className="dg-choice-main">
          {label ? <span className="dg-choice-label">{label}</span> : null}
          <span
            className={
              value ? "dg-choice-value" : "dg-choice-value is-placeholder"
            }
          >
            {value ?? "Choose"}
          </span>
          {invalid ? (
            <span className="dg-choice-invalid">Invalid — {invalid}</span>
          ) : null}
        </span>
        <span className="dg-choice-chevron" aria-hidden="true">
          ›
        </span>
      </Readable>
      {shared ? null : slot.node}
    </>
  );
}

/** One pending choice as a row plus its sheet. */
export function PendingChoiceRow({
  choice,
  store,
  nameOf,
  inline,
  unlabelled,
  slot,
}: {
  choice: PendingChoice;
  store: CharacterStore;
  nameOf: (id: string) => string;
  /** On its feature's row; see `ChoiceRow`. */
  inline?: boolean;
  /** For an inline control whose feature already names it. */
  unlabelled?: boolean;
  slot?: PickerSlot;
}): ReactNode {
  const picker = usePicker();
  const { plugin } = usePlugin();
  const change = useBuildChange(store);
  const chosen = choice.chosen.map(nameOf).join(", ");
  const optionsOf = (options: PendingChoice["options"]): PickerOption[] =>
    optionsFor(
      { ...choice, options },
      (id) => (nameOf(id) === id ? undefined : nameOf(id)),
      (id) => (store.index ? sourceRefOf(store.index, id) : undefined),
      (id) => store.index?.get(id),
    );
  // Only what was chosen is read on the row; the rest wait for the picker to open.
  const picked = optionsOf(choice.options.filter((o) => choice.chosen.includes(o.id)));

  const write = (ids: string[]): void => {
    change({
      type: "choice",
      choiceId: choice.id,
      scope: choice.scope,
      levelIndex: choice.levelIndex,
      chosen: ids,
    });
  };

  return (
    <ChoiceRow
      label={unlabelled ? undefined : choice.name}
      inline={inline}
      slot={slot}
      slotKey={choice.id}
      value={chosen || undefined}
      empty={!choice.complete}
      reading={chosenSpec(choice.name, picked)}
      invalid={
        choice.invalid.length
          ? choice.invalid.map(nameOf).join(", ")
          : undefined
      }
      onOpen={() =>
        picker({
          title: choice.name,
          subtitle: `${choice.sourceName}${choice.count > 1 ? ` · choose ${choice.count}` : ""}`,
          options: optionsOf(choice.options),
          defaultFilter: store.index ? inheritedFilterOf(store.index, choice.source) : undefined,
          selected: choice.chosen,
          count: choice.count,
          repeatable: choice.definition.repeatable,
          maxPer: choice.definition.maxPer,
          enforce: plugin.settings.enforceRequirements,
          onCommit: write,
          live: true,
          extra: choice.chosen.length
            ? { label: "Clear", onClick: () => write([]) }
            : undefined,
        })
      }
    />
  );
}
