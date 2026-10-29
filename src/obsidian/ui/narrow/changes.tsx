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
import type { CharacterStore } from "../../character-store";
import { useSheet } from "./sheet";

export function useBuildChange(store: CharacterStore): (change: BuildChange) => void {
  const sheet = useSheet();

  return (change) => {
    const build = store.data.build;
    const index = store.index;
    if (!build || !index) return;

    const apply = (): void => {
      const current = store.data.build;
      if (!current) return;
      store.mutateBuild(() => commitChange(index, current, change).build);
    };

    const report = previewChange(index, build, change);
    if (isEmptyReport(report)) {
      apply();
      return;
    }

    sheet.open({
      title: "This affects other choices",
      subtitle: describeChange(change),
      body: () => <ReportBody report={report} />,
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
  };
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
