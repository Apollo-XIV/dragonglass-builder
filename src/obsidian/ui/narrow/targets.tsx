/**
 * The tap targets of the narrow layout (spec 3.1) and the sheet bodies they open
 * (spec 3.3).
 *
 * The visual language is fixed: a d20 roll is an outlined box, other dice are a
 * filled box, a resource is a bordered pill of pips. The target is the number
 * itself — never the whole row — so that a row can carry its own hold without
 * swallowing the taps inside it.
 */

import { useRef, type ReactNode } from "react";
import { describeRoll, rollNotation, type RollOptions } from "../../../core/dice";
import type { Explanation, ExplainRow } from "../../../core/resolver/explain";
import type { Fact } from "../../../core/content/facts";
import { Facts, Icon, Markdown } from "../components";
import { UI } from "./constants";
import { useNarrowSettings } from "./context";
import { useHold } from "./hold";
import { useHaptics } from "./platform";
import { useSheet } from "./sheet";
import { useToast, type ToastSpec } from "./toast";

// ---------------------------------------------------------------------------
// Sheet bodies
// ---------------------------------------------------------------------------

function BreakdownBody({ explanation }: { explanation: Explanation }): ReactNode {
  return (
    <>
      <p className="dg-sheet-total">{explanation.total >= 0 && explanation.kind === "d20" ? `+${explanation.total}` : explanation.total}</p>
      <ul className="dg-explain">
        {explanation.rows.map((row, i) => (
          <ExplainLine key={`${row.label}-${i}`} row={row} />
        ))}
      </ul>
      {explanation.notes.length > 0 ? (
        <ul className="dg-explain-notes">
          {explanation.notes.map((note, i) => (
            <li key={i} className={`is-${note.kind}`}>
              {note.text}
              <span className="dg-explain-source">{note.source}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function ExplainLine({ row }: { row: ExplainRow }): ReactNode {
  return (
    <li className={row.applied ? undefined : "is-suppressed"}>
      <span className="dg-explain-label">{row.label}</span>
      <span className="dg-explain-value">{row.value}</span>
      <span className="dg-explain-source">
        {row.source ?? ""}
        {row.fromEffect ? " (active effect)" : ""}
        {!row.applied && row.suppressedBy ? `superseded by ${row.suppressedBy}` : ""}
      </span>
    </li>
  );
}

/** Rules text, with the arithmetic behind any derived number it mentions. */
export function TextBody({
  text,
  fluff,
  facts,
  formula,
  sourcePath,
}: {
  text?: string;
  fluff?: string;
  facts?: Fact[];
  formula?: string;
  sourcePath?: string;
}): ReactNode {
  return (
    <>
      {formula ? <p className="dg-sheet-formula">{formula}</p> : null}
      {fluff ? <Markdown source={fluff} sourcePath={sourcePath} className="dg-fluff" /> : null}
      <Facts facts={facts} />
      {text ? <Markdown source={text} sourcePath={sourcePath} /> : <p className="dg-muted">No rules text.</p>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

function toastFor(explanation: Explanation, options: RollOptions): ToastSpec {
  const notation = explanation.notation ?? `1d20 ${explanation.total >= 0 ? `+${explanation.total}` : explanation.total}`;
  const result = rollNotation(notation, undefined, options);
  const qualifier = options.advantage
    ? " with advantage"
    : options.disadvantage
      ? " with disadvantage"
      : options.critical
        ? " critical"
        : "";
  return {
    label: `${explanation.label}${qualifier}`,
    detail: describeRoll(result),
    total: result.total,
    tag:
      result.natural === 20
        ? { text: "nat 20", tone: "crit" }
        : result.natural === 1
          ? { text: "nat 1", tone: "fumble" }
          : undefined,
  };
}

/**
 * Tap rolls, hold explains. Returns the two handlers so any rollable — an
 * ability, a skill, an attack, a weapon's damage — behaves identically.
 */
export function useRollable(explanation: () => Explanation): { roll: (options?: RollOptions) => void; explain: () => void } {
  const sheet = useSheet();
  const toast = useToast();
  const haptics = useHaptics();

  const roll = (options: RollOptions = {}): void => {
    const current = explanation();
    haptics.buzz(UI.rollHaptic);
    toast.show(toastFor(current, options));
  };

  const explain = (): void => {
    const current = explanation();
    sheet.open({
      title: current.label,
      subtitle: current.kind === "d20" ? "d20 roll" : current.kind === "damage" ? "Damage" : undefined,
      body: () => <BreakdownBody explanation={current} />,
      actions:
        current.kind === "none"
          ? undefined
          : () =>
              current.kind === "d20" ? (
                <>
                  <button className="dg-sheet-button" onClick={() => roll({ disadvantage: true })}>
                    Disadvantage
                  </button>
                  <button className="dg-sheet-button is-primary" onClick={() => roll()}>
                    Roll
                  </button>
                  <button className="dg-sheet-button" onClick={() => roll({ advantage: true })}>
                    Advantage
                  </button>
                </>
              ) : (
                <>
                  <button className="dg-sheet-button is-primary" onClick={() => roll()}>
                    Roll
                  </button>
                  <button className="dg-sheet-button" onClick={() => roll({ critical: true })}>
                    Roll critical
                  </button>
                </>
              ),
    });
  };

  return { roll, explain };
}

/** An outlined box for d20 rolls, a filled one for everything else (spec 3.1.2). */
export function RollBox({
  explanation,
  display,
  kind,
  label,
}: {
  explanation: () => Explanation;
  /** What the box shows; defaults to the signed total. */
  display?: ReactNode;
  kind: "d20" | "damage";
  /** Accessible name, when the display alone isn't enough. */
  label?: string;
}): ReactNode {
  const { roll, explain } = useRollable(explanation);
  const { handlers } = useHold({
    onTap: () => roll(),
    onHold: explain,
    className: kind === "d20" ? "dg-roll-box" : "dg-roll-box is-dice",
  });
  const settings = useNarrowSettings();
  const total = display ?? defaultDisplay(explanation);

  return (
    <span className="dg-target">
      <button
        {...handlers}
        style={{ ...handlers.style, minWidth: UI.rollBoxMinWidth, height: UI.rollBoxHeight }}
        aria-label={label}
        aria-haspopup="dialog"
      >
        {total}
      </button>
      {settings.infoButtons ? <InfoButton onClick={explain} /> : null}
      <button className="dg-sr-only" onClick={explain}>
        View details
      </button>
    </span>
  );
}

/**
 * A desktop-format tile (`dg-d-target`) with the phone's gesture: tap rolls, hold
 * explains. The shape is the desktop's own, so an ability or save reads the same
 * on both layouts; only what touching it does is different.
 */
export function HoldRollTarget({
  explanation,
  children,
  label,
  className,
}: {
  explanation: () => Explanation;
  children: ReactNode;
  label: string;
  className?: string;
}): ReactNode {
  const { roll, explain } = useRollable(explanation);
  const { handlers } = useHold({
    onTap: () => roll(),
    onHold: explain,
    className: ["dg-d-target", className].filter(Boolean).join(" "),
  });

  return (
    <button {...handlers} style={handlers.style} aria-haspopup="dialog">
      {children}
      <span className="dg-sr-only">{label}</span>
    </button>
  );
}

function defaultDisplay(explanation: () => Explanation): string {
  const current = explanation();
  return current.kind === "d20"
    ? current.total >= 0
      ? `+${current.total}`
      : String(current.total)
    : (current.notation ?? String(current.total));
}

/**
 * Tapping something that only reads teaches the gesture rather than doing
 * nothing (spec 3.4), and says so a couple of times at most.
 */
function useHoldHint(): () => void {
  const settings = useNarrowSettings();
  const toast = useToast();
  const hints = useRef(0);
  return () => {
    if (!settings.holdHint || hints.current >= UI.holdHintCount) return;
    hints.current += 1;
    toast.show({ label: "Hold to read" });
  };
}

/**
 * A number that is read rather than rolled, in the desktop's tile shape: AC,
 * speed, proficiency. Holding it opens the breakdown; a tap gives the hint.
 */
export function HoldReadTarget({
  explanation,
  children,
  label,
  className,
}: {
  explanation?: () => Explanation;
  children: ReactNode;
  label: string;
  className?: string;
}): ReactNode {
  if (!explanation) return <span className={className}>{children}</span>;
  return (
    <HeldReadButton explanation={explanation} label={label} className={className}>
      {children}
    </HeldReadButton>
  );
}

function HeldReadButton({
  explanation,
  children,
  label,
  className,
}: {
  explanation: () => Explanation;
  children: ReactNode;
  label: string;
  className?: string;
}): ReactNode {
  const sheet = useSheet();
  const hint = useHoldHint();
  const { handlers } = useHold({
    onHold: () => {
      const current = explanation();
      sheet.open({ title: current.label, body: () => <TextBody formula={current.formula} /> });
    },
    onTap: hint,
    className: ["dg-d-target", className].filter(Boolean).join(" "),
  });

  return (
    <button {...handlers} style={handlers.style} aria-haspopup="dialog">
      {children}
      <span className="dg-sr-only">{label}</span>
    </button>
  );
}

/**
 * A row that only reads: a feature, a spell, a weapon, an item. The hold target
 * is the whole row (spec 3.1.3).
 */
export function ReadRow({
  title,
  subtitle,
  text,
  fluff,
  facts,
  formula,
  children,
  onTap,
  className,
}: {
  title: string;
  /** "Wizard 1 · Class feature". */
  subtitle?: string;
  text?: string;
  fluff?: string;
  facts?: Fact[];
  formula?: string;
  /** Tap targets inside the row; they stop the row's own hold. */
  children?: ReactNode;
  /** When the row itself does something on tap, no hint is shown. */
  onTap?: () => void;
  className?: string;
}): ReactNode {
  const sheet = useSheet();
  const settings = useNarrowSettings();
  const hint = useHoldHint();

  const open = (): void =>
    sheet.open({
      title,
      subtitle,
      body: () => <TextBody text={text} fluff={fluff} facts={facts} formula={formula} />,
    });

  const { handlers } = useHold({
    onHold: open,
    onTap: onTap ? onTap : hint,
    className: ["dg-read-row", className].filter(Boolean).join(" "),
  });

  return (
    <div {...handlers} style={handlers.style}>
      <span className="dg-read-main">
        <span className="dg-read-title">{title}</span>
        {subtitle ? <span className="dg-read-subtitle">{subtitle}</span> : null}
      </span>
      {children}
      {settings.infoButtons ? <InfoButton onClick={open} /> : null}
      <button className="dg-sr-only" onClick={open}>
        View details
      </button>
    </div>
  );
}

export function InfoButton({ onClick }: { onClick: () => void }): ReactNode {
  return (
    <button
      className="dg-info-button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label="View details"
    >
      <Icon name="info" />
    </button>
  );
}

/**
 * A resource's pips in a bordered pill. Tapping spends one use; holding opens the
 * resource menu, which is where putting a use back lives — so a misfire is fixed
 * in the same place rather than by chasing an undo button on a toast (spec 3.3.3).
 */
export function ResourcePill({
  name,
  remaining,
  max,
  text,
  subtitle,
  read,
  onSpend,
  onSet,
}: {
  name: string;
  /** For the pill itself, which redraws with the rest of the screen. */
  remaining: number;
  max: number;
  text?: string;
  subtitle?: string;
  /**
   * The current numbers, read when asked. The menu needs this rather than the
   * props above: the sheet host sits above this component in the tree, so by
   * the time a prop reaches here the host has already rendered, and anything
   * the host read would be one update behind for as long as the sheet stays
   * open — which, for the resource menu, is the whole point of it.
   */
  read: () => { remaining: number; max: number };
  onSpend: () => void;
  onSet: (remaining: number) => void;
}): ReactNode {
  const sheet = useSheet();
  const toast = useToast();
  const haptics = useHaptics();

  const spend = (): void => {
    const now = read();
    if (now.remaining <= 0) {
      toast.show({ label: name, detail: "No uses left" });
      return;
    }
    haptics.buzz(UI.rollHaptic);
    onSpend();
    toast.show({ label: name, detail: `${now.remaining - 1} of ${now.max} left` });
  };

  // The menu re-reads its numbers on every render of the host, so spending from
  // inside it updates the pips here and there without closing.
  const menu = (): void =>
    sheet.open({
      title: name,
      subtitle,
      body: () => {
        const now = read();
        return (
          <>
            <TextBody text={text} />
            <div className="dg-uses">
              <span className="dg-uses-label">Uses left</span>
              <div className="dg-stepper">
                <button
                  onClick={() => onSet(Math.max(0, read().remaining - 1))}
                  aria-label="One fewer use"
                  disabled={now.remaining <= 0}
                >
                  −
                </button>
                <Pips total={now.max} filled={now.remaining} />
                <button
                  onClick={() => onSet(Math.min(read().max, read().remaining + 1))}
                  aria-label="One more use"
                  disabled={now.remaining >= now.max}
                >
                  +
                </button>
              </div>
              <span className="dg-uses-count">
                {now.remaining} of {now.max}
              </span>
            </div>
          </>
        );
      },
      actions: () => {
        const now = read();
        return (
          <>
            <button className="dg-sheet-button is-primary" onClick={spend} disabled={now.remaining <= 0}>
              Use one
            </button>
            <button
              className="dg-sheet-button"
              onClick={() => onSet(read().max)}
              disabled={now.remaining >= now.max}
            >
              Restore all
            </button>
          </>
        );
      },
    });

  const { handlers } = useHold({ onTap: spend, onHold: menu, className: "dg-resource-pill" });

  return (
    <button {...handlers} style={handlers.style} aria-label={`${name}, ${remaining} of ${max} left`}>
      <Pips total={max} filled={remaining} />
    </button>
  );
}

/** Pips as plain marks: in the narrow layout the pill around them is the target. */
export function Pips({ total, filled }: { total: number; filled: number }): ReactNode {
  // A long track of pips stops being countable, so past a dozen it becomes a number.
  if (total > 12) return <span className="dg-pip-count">{filled}</span>;
  return (
    <span className="dg-pip-row" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < filled ? "dg-pip-dot is-filled" : "dg-pip-dot"} />
      ))}
    </span>
  );
}
