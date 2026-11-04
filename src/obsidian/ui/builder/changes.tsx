/**
 * Every edit the builder makes goes through here (spec 7.8, 8.4).
 *
 * The point is that no caller has to know whether what it is about to do
 * reaches later choices. It asks for a change; if the change costs something,
 * the player is shown exactly what, in the two groups the spec separates — gone
 * for good, and dormant until you put the option back — and nothing happens
 * until they say so.
 */

import { type ReactNode } from "react";
import {
  commitChange,
  isEmptyReport,
  previewChange,
  type BuildChange,
  type ChangeReport,
  type InactivePick,
} from "../../../core/resolver/validity";
import { capBreaches, newBreaches, type CapBreach } from "../../../core/resolver/caps";
import { resolve } from "../../../core/resolver/resolve";
import type { CharacterStore } from "../../character-store";
import { useSheet } from "../narrow/sheet";

/** Whether a change went straight in, or is waiting on the player's answer. */
export type ChangeOutcome = "applied" | "asking" | "ignored";

export interface ChangeOptions {
  /** The confirmation went away, whichever way it was answered. */
  onClose?: () => void;
}

export function useBuildChange(store: CharacterStore): (change: BuildChange, options?: ChangeOptions) => ChangeOutcome {
  const sheet = useSheet();

  return (change, options) => {
    const build = store.data.build;
    const index = store.index;
    if (!build || !index) return "ignored";

    const apply = (): void => {
      const current = store.data.build;
      if (!current) return;
      store.mutateBuild(() => commitChange(index, current, change).build);
    };

    const report = previewChange(index, build, change);
    // What the change would do to a stat the rules cap: an ability score past
    // 20. Resolved from the build the change produces, so the question is about
    // the result rather than about the pick.
    const breaches = breachesFrom(store, change);

    if (isEmptyReport(report) && breaches.length === 0) {
      apply();
      return "applied";
    }

    // One sheet, whatever the change costs. Two confirmations in a row for one
    // tap is how a builder teaches people to stop reading them.
    sheet.open({
      title: report.removed.length || report.invalidated.length ? "This affects other choices" : "Above the usual maximum",
      subtitle: describeChange(change),
      onClose: options?.onClose,
      body: () => (
        <>
          {breaches.length > 0 ? <CapGroup breaches={breaches} /> : null}
          {isEmptyReport(report) ? null : <ReportBody report={report} />}
        </>
      ),
      actions: () => (
        <>
          <button className="dg-sheet-button" onClick={sheet.close}>
            Cancel
          </button>
          <button
            className="dg-sheet-button is-primary"
            onClick={() => {
              apply();
              sheet.close();
            }}
          >
            Continue
          </button>
        </>
      ),
    });
    return "asking";
  };
}

/**
 * Soft caps a change would newly cross.
 *
 * This resolves the prospective character, which is the only honest way to
 * answer "what would this do to my Strength" — the increase may come from
 * anywhere, and the builder has no business knowing that ability points are the
 * thing that usually causes it.
 */
function breachesFrom(store: CharacterStore, change: BuildChange): CapBreach[] {
  const index = store.index;
  const build = store.data.build;
  const before = store.resolved;
  if (!index || !build || !before) return [];
  const next = commitChange(index, build, change).build;
  const after = resolve({
    content: index,
    build: next,
    inventory: store.data.inventory,
    spells: store.data.spells,
  });
  return newBreaches(capBreaches(before, index), capBreaches(after, index));
}

function CapGroup({ breaches }: { breaches: CapBreach[] }): ReactNode {
  return (
    <section className="dg-change-group">
      <h4>Above the usual maximum</h4>
      <p className="dg-muted">
        The rules stop increases at {breaches[0].softMax}. Items and some features go past it, so this is allowed —
        it just is not usually.
      </p>
      <ul>
        {breaches.map((breach) => (
          <li key={breach.path}>
            <strong>
              {breach.label} {breach.value}
            </strong>
            <span className="dg-muted"> — over {breach.softMax}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function describeChange(change: BuildChange): string {
  switch (change.type) {
    case "species":
      return change.id ? "Changing species" : "Clearing species";
    case "background":
      return change.id ? "Changing background" : "Clearing background";
    case "remove-level":
      return `Removing level ${change.index + 1}`;
    case "add-level":
      return "Adding a level";
    case "reorder":
      return "Reordering levels";
    case "choice":
      return change.chosen.length ? "Changing this choice" : "Clearing this choice";
  }
}

function ReportBody({ report }: { report: ChangeReport }): ReactNode {
  return (
    <>
      {report.removed.length > 0 ? (
        <Group
          title="Will be removed"
          note="These cannot be valid under the new choice, so they are forgotten."
          picks={report.removed}
        />
      ) : null}
      {report.invalidated.length > 0 ? (
        <Group
          title="Invalid until you choose it again"
          note="These stay with the character and start counting again the moment you put it back."
          picks={report.invalidated}
        />
      ) : null}
    </>
  );
}

function Group({ title, note, picks }: { title: string; note: string; picks: InactivePick[] }): ReactNode {
  return (
    <section className="dg-change-group">
      <h4>{title}</h4>
      <p className="dg-muted">{note}</p>
      <ul>
        {picks.map((pick) => (
          <li key={`${pick.choiceId}-${pick.levelIndex ?? "build"}`}>
            <strong>{pick.name}</strong>
            <span className="dg-muted"> — {pick.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A pick that is no longer contributing. It is kept rather than deleted, so it
 * is shown rather than hidden: muted, labelled, and saying what would bring it
 * back (spec 7.8.7).
 */
export function InactivePickRow({
  pick,
  store,
  nameOf,
}: {
  pick: InactivePick;
  store: CharacterStore;
  nameOf: (id: string) => string;
}): ReactNode {
  const sheet = useSheet();
  const forget = (): void => {
    const index = store.index;
    const build = store.data.build;
    if (!index || !build) return;
    store.mutateBuild(
      () =>
        commitChange(index, build, {
          type: "choice",
          choiceId: pick.choiceId,
          scope: pick.scope,
          levelIndex: pick.levelIndex,
          chosen: [],
        }).build,
    );
  };

  return (
    <button
      className="dg-choice-row is-invalid"
      onClick={() =>
        sheet.open({
          title: pick.name,
          subtitle: "Invalid",
          body: () => (
            <>
              <p>
                {pick.chosen.map(nameOf).join(", ")} is still saved, but {pick.reason.toLowerCase()}, so it is not
                part of this character.
              </p>
              <p className="dg-muted">Choose {pick.owner?.name ?? "it"} again and this comes back as it was.</p>
            </>
          ),
          actions: () => (
            <>
              <button className="dg-sheet-button" onClick={sheet.close}>
                Keep it
              </button>
              <button
                className="dg-sheet-button is-destructive"
                onClick={() => {
                  forget();
                  sheet.close();
                }}
              >
                Forget it
              </button>
            </>
          ),
        })
      }
    >
      <span className="dg-choice-main">
        <span className="dg-choice-label">{pick.name}</span>
        <span className="dg-choice-value">{pick.chosen.map(nameOf).join(", ")}</span>
        <span className="dg-choice-invalid">{pick.reason}</span>
      </span>
      <span className="dg-invalid-tag">Invalid</span>
    </button>
  );
}
