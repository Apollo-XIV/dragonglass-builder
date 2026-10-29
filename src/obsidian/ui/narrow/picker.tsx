/**
 * Choice sheets (spec 7.7). Every selection in the narrow builder happens in one
 * of these: species, background, a fighting style, a subclass, a class to
 * multiclass into.
 *
 * Tapping an option selects it; holding one shows its text, so a player can read
 * the four options before committing to one (spec 3.3.4).
 */

import { useState, type ReactNode } from "react";
import { Markdown } from "../components";
import { useHold } from "./hold";
import { useSheet } from "./sheet";

export interface PickerOption {
  id: string;
  name: string;
  text?: string;
  /** Source abbreviation: SRD, PHB. */
  tag?: string;
  /** Unmet prerequisites. Shown as an amber note; only enforced if asked. */
  warnings?: string[];
  allowed?: boolean;
}

export interface PickerSpec {
  title: string;
  subtitle?: string;
  options: PickerOption[];
  selected: string[];
  /** How many may be chosen. 1 commits on tap; more needs Done. */
  count: number;
  /** Hide options whose prerequisites aren't met. */
  enforce?: boolean;
  onCommit: (ids: string[]) => void;
  /** Extra button, for "clear" or a destructive action. */
  extra?: { label: string; onClick: () => void; destructive?: boolean };
}

export function usePicker(): (spec: PickerSpec) => void {
  const sheet = useSheet();
  return (spec) => {
    const options = spec.enforce ? spec.options.filter((o) => o.allowed !== false) : spec.options;
    sheet.open({
      title: spec.title,
      subtitle: spec.subtitle,
      body: () => <PickerBody spec={{ ...spec, options }} close={sheet.close} />,
    });
  };
}

function PickerBody({ spec, close }: { spec: PickerSpec; close: () => void }): ReactNode {
  const [selected, setSelected] = useState<string[]>(spec.selected);
  const multiple = spec.count > 1;

  const toggle = (id: string): void => {
    if (!multiple) {
      spec.onCommit([id]);
      close();
      return;
    }
    setSelected((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      // Choosing one too many drops the oldest rather than refusing the tap: the
      // player has already said what they want, and which one to give up is
      // usually obvious to them, not to us.
      const next = [...current, id];
      return next.length > spec.count ? next.slice(next.length - spec.count) : next;
    });
  };

  return (
    <>
      {multiple ? (
        <p className="dg-muted">
          {selected.length} of {spec.count} chosen
        </p>
      ) : null}
      <div className="dg-picker">
        {spec.options.map((option) => (
          <OptionRow
            key={option.id}
            option={option}
            selected={selected.includes(option.id)}
            onPick={() => toggle(option.id)}
          />
        ))}
        {spec.options.length === 0 ? <p className="dg-muted">No options in the loaded sources.</p> : null}
      </div>
      <div className="dg-sheet-actions">
        {spec.extra ? (
          <button
            className={spec.extra.destructive ? "dg-sheet-button is-destructive" : "dg-sheet-button"}
            onClick={() => {
              spec.extra?.onClick();
              close();
            }}
          >
            {spec.extra.label}
          </button>
        ) : null}
        {multiple ? (
          <button
            className="dg-sheet-button is-primary"
            onClick={() => {
              spec.onCommit(selected);
              close();
            }}
          >
            Done
          </button>
        ) : null}
      </div>
    </>
  );
}

function OptionRow({
  option,
  selected,
  onPick,
}: {
  option: PickerOption;
  selected: boolean;
  onPick: () => void;
}): ReactNode {
  const sheet = useSheet();
  const { handlers } = useHold({
    onTap: onPick,
    // Reading an option replaces the sheet's contents rather than stacking a
    // second sheet on the first.
    onHold: () =>
      sheet.open({
        title: option.name,
        subtitle: option.tag,
        body: () => (option.text ? <Markdown source={option.text} /> : <p className="dg-muted">No rules text.</p>),
      }),
    className: selected ? "dg-option is-selected" : "dg-option",
  });

  return (
    <button {...handlers} style={handlers.style} aria-pressed={selected}>
      <span className="dg-option-main">
        <span className="dg-option-name">{option.name}</span>
        {option.warnings?.length ? <span className="dg-option-warning">{option.warnings.join("; ")}</span> : null}
      </span>
      {option.tag ? <span className="dg-option-tag">{option.tag}</span> : null}
    </button>
  );
}
