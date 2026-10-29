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
  /**
   * May one option be taken more than once? Then `selected` carries duplicates
   * and a tap cycles that option's own count rather than toggling it.
   */
  repeatable?: boolean;
  /** The most times one option may be taken. Defaults to `count`. */
  maxPer?: number;
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
  // Repeating one option only means anything when there is more than one pick to
  // spend, so a `count` of 1 behaves as an ordinary choice whatever it declares.
  const stepping = spec.repeatable === true && multiple;

  const toggle = (id: string): void => {
    if (!multiple) {
      spec.onCommit([id]);
      close();
      return;
    }
    setSelected((current) => {
      if (stepping) return cycle(current, id, spec.count, spec.maxPer);
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
          {stepping ? " · tap again for another, or to clear it" : ""}
          {stepping && spec.maxPer !== undefined && spec.maxPer < spec.count
            ? ` · at most ${spec.maxPer} in any one`
            : ""}
        </p>
      ) : null}
      <div className="dg-picker">
        {spec.options.map((option) => (
          <OptionRow
            key={option.id}
            option={option}
            selected={selected.includes(option.id)}
            taken={stepping ? selected.filter((x) => x === option.id).length : 0}
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

/**
 * One tap on a repeatable option. It adds another of that option, and wraps to
 * none once there is no room for more — so a tap only ever changes the row that
 * was tapped. Dropping someone else's pick to make room, which is what the
 * one-each path does, reads as the sheet rearranging itself under your finger
 * when every row is the same six abilities.
 *
 * Two bounds say when there is no room: the budget (`count`) and the per-option
 * cap (`maxPer`, defaulting to the budget). A 2024 background spends three
 * points with a cap of two, so a third tap on one ability clears it rather than
 * buying an increase the rules don't allow.
 */
export function cycle(current: string[], id: string, count: number, maxPer = count): string[] {
  const others = current.filter((x) => x !== id);
  const own = current.length - others.length;
  const wanted = own + 1;
  const room = wanted <= Math.min(count, maxPer) && others.length + wanted <= count;
  return [...others, ...Array<string>(room ? wanted : 0).fill(id)];
}

function OptionRow({
  option,
  selected,
  taken,
  onPick,
}: {
  option: PickerOption;
  selected: boolean;
  /** How many of this option are taken, when the choice is repeatable. */
  taken: number;
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
    <button
      {...handlers}
      style={handlers.style}
      aria-pressed={selected}
      aria-label={taken > 1 ? `${option.name}, ${taken} taken` : undefined}
    >
      <span className="dg-option-main">
        <span className="dg-option-name">{option.name}</span>
        {option.warnings?.length ? <span className="dg-option-warning">{option.warnings.join("; ")}</span> : null}
      </span>
      {taken > 1 ? <span className="dg-option-count">×{taken}</span> : null}
      {option.tag ? <span className="dg-option-tag">{option.tag}</span> : null}
    </button>
  );
}
