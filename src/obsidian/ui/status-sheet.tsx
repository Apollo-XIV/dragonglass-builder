/**
 * Holding a status says what it does. The chips in the header band and the rows in
 * the "+ Cond" menu are both targets for this: tap changes the status, hold (or a
 * right-click on desktop) opens its rules with the same change as a button, so a
 * status can be read and then added or removed without going back to the menu.
 */

import { useState, type ReactNode } from "react";
import {
  CONCENTRATION_RULES,
  CONDITION_RULES,
  EXHAUSTION_LEVELS,
  EXHAUSTION_NOTE,
  EXHAUSTION_NOTE_2024,
  exhaustionLevels2024,
  MAX_EXHAUSTION,
} from "../../core/state/conditions";
import { event } from "../../core/state/fold";
import type { CharacterStore } from "../character-store";
import { useHold } from "./narrow/hold";
import { useSheet } from "./narrow/sheet";

export type Status = { kind: "condition"; id: string } | { kind: "exhaustion" } | { kind: "concentration" };

const titleOf = (status: Status): string =>
  status.kind === "condition"
    ? status.id.charAt(0).toUpperCase() + status.id.slice(1)
    : status.kind === "exhaustion"
      ? "Exhaustion"
      : "Concentration";

export function setCondition(store: CharacterStore, condition: string, on: boolean): void {
  store.appendEvents(on ? event("condition.add", { condition }) : event("condition.remove", { condition }));
}

export function setConcentration(store: CharacterStore, on: boolean): void {
  // A concentration started by hand has no spell to name.
  store.appendEvents(on ? event("concentration.start", { on: "" }) : event("concentration.end", {}));
}

export function setExhaustion(store: CharacterStore, level: number): void {
  store.appendEvents(event("exhaustion", { level: Math.min(MAX_EXHAUSTION, Math.max(0, level)) }));
}

/**
 * Everything the sheet shows is read from the store when the host renders: the
 * sheet stays open while it is used, and a prop would be one change behind.
 */
function isOn(store: CharacterStore, status: Status): boolean {
  const current = store.resolved?.status;
  if (!current) return false;
  if (status.kind === "condition") return current.conditions.includes(status.id);
  if (status.kind === "exhaustion") return current.exhaustion > 0;
  return Boolean(current.concentration);
}

function Rules({ lines }: { lines: string[] }): ReactNode {
  return (
    <ul className="dg-status-rules">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

type Edition = "5.1" | "5.2";

/** Which book the character's first class comes from decides which text opens first. */
function editionOf(store: CharacterStore): Edition {
  const source = store.resolved?.classes[0]?.element.source;
  return source && store.index?.ruleset(source) === "2024" ? "5.2" : "5.1";
}

function ExhaustionBody({ store }: { store: CharacterStore }): ReactNode {
  const [edition, setEdition] = useState<Edition>(() => editionOf(store));
  const level = store.resolved?.status.exhaustion ?? 0;
  const levels = edition === "5.2" ? exhaustionLevels2024() : EXHAUSTION_LEVELS;
  return (
    <>
      <div className="dg-status-edition" role="group" aria-label="Rules edition">
        {(["5.1", "5.2"] as const).map((e) => (
          <button
            key={e}
            type="button"
            className={e === edition ? "is-on" : undefined}
            aria-pressed={e === edition}
            onClick={() => setEdition(e)}
          >
            SRD {e}
          </button>
        ))}
      </div>
      <ol className="dg-status-levels">
        {levels.map((text, i) => (
          <li key={text} className={i + 1 <= level ? "is-reached" : undefined}>
            <span className="dg-status-level">{i + 1}</span>
            {text}
          </li>
        ))}
      </ol>
      <p className="dg-status-note">{edition === "5.2" ? EXHAUSTION_NOTE_2024 : EXHAUSTION_NOTE}</p>
    </>
  );
}

export function useStatusSheet(store: CharacterStore): (status: Status) => void {
  const sheet = useSheet();
  return (status) =>
    sheet.open({
      title: titleOf(status),
      subtitle: status.kind === "condition" ? "Condition" : status.kind === "exhaustion" ? "Level 0 to 6" : "Status",
      body: () => {
        const immune =
          status.kind === "condition" && store.resolved?.sets["conditionImmunities"]?.values.includes(status.id);
        return (
          <>
            {immune ? <p className="dg-status-note">This character is immune to this condition.</p> : null}
            {status.kind === "condition" ? (
              <Rules lines={CONDITION_RULES[status.id] ?? ["No description is recorded for this condition."]} />
            ) : status.kind === "exhaustion" ? (
              <ExhaustionBody store={store} />
            ) : (
              <Rules lines={CONCENTRATION_RULES} />
            )}
          </>
        );
      },
      actions: () => {
        if (status.kind === "exhaustion") {
          const level = store.resolved?.status.exhaustion ?? 0;
          return (
            <div className="dg-stepper dg-status-stepper">
              <button onClick={() => setExhaustion(store, level - 1)} disabled={level <= 0} aria-label="One level less">
                −
              </button>
              <span className="dg-uses-count">Level {level}</span>
              <button
                onClick={() => setExhaustion(store, level + 1)}
                disabled={level >= MAX_EXHAUSTION}
                aria-label="One level more"
              >
                +
              </button>
            </div>
          );
        }
        const on = isOn(store, status);
        const toggle = (): void =>
          status.kind === "condition" ? setCondition(store, status.id, !on) : setConcentration(store, !on);
        const noun = status.kind === "condition" ? "condition" : "concentration";
        return (
          <button className={on ? "dg-sheet-button" : "dg-sheet-button is-primary"} onClick={toggle}>
            {on ? (status.kind === "condition" ? "Remove condition" : "End concentration") : `Add ${noun}`}
          </button>
        );
      },
    });
}

/**
 * A status as a button: tap does `onTap`, hold or right-click reads it. `onRead`
 * runs first, for the menu to close itself before the sheet rises over it.
 */
export function StatusButton({
  store,
  status,
  onTap,
  onRead,
  className,
  title,
  children,
}: {
  store: CharacterStore;
  status: Status;
  onTap: () => void;
  onRead?: () => void;
  className: string;
  title?: string;
  children: ReactNode;
}): ReactNode {
  const open = useStatusSheet(store);
  const read = (): void => {
    onRead?.();
    open(status);
  };
  const { handlers } = useHold({ onTap, onHold: read, className });
  return (
    <button
      type="button"
      {...handlers}
      style={handlers.style}
      title={title}
      aria-haspopup="dialog"
      onContextMenu={(e) => {
        e.preventDefault();
        if (e.button === 2) read();
      }}
    >
      {children}
    </button>
  );
}
