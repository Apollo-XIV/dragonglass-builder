/** Review: what is still open, and how to save. */

import { type ReactNode } from "react";
import type { ResolvedCharacter } from "../../../../core/resolver/resolved";
import { UI } from "../../narrow/constants";
import { useSheet } from "../../narrow/sheet";
import { useShell } from "../../narrow/platform";
import { useBuilderNav } from "../nav";
import { useBuilderFeatures } from "../features";
import { relativeTime } from "../model";
import { EnforceToggle } from "./extras";
import { useBuilderSession, type BuilderSession } from "../session";

export function DraftBanner(): ReactNode {
  const session = useBuilderSession();
  const draft = session?.pendingDraft;
  if (!session || !draft) return null;

  return (
    <div className="dg-draft-banner">
      <span className="dg-draft-text">
        You have unfinished changes from {relativeTime(draft.saved)}.
        {session.baseMoved ? " This character has changed since then, so resuming will replace those changes." : ""}
      </span>
      <div className="dg-draft-actions">
        <button className="dg-n-chip is-action" onClick={session.resumeDraft}>
          Resume draft
        </button>
        <button className="dg-n-chip" onClick={session.discardDraft}>
          Discard
        </button>
      </div>
    </div>
  );
}

export function ReviewSection({ character }: { character: ResolvedCharacter }): ReactNode {
  const nav = useBuilderNav();
  const features = useBuilderFeatures();
  const shell = useShell();
  const session = useBuilderSession();
  const open = character.pendingChoices.filter((c) => !c.complete);

  return (
    <>
      {features.enforceToggle ? <EnforceToggle /> : null}
      {open.length === 0 ? (
        <p className="dg-muted">Nothing left to choose.</p>
      ) : (
        open.map((choice) => (
          <button
            key={`${choice.id}-${choice.levelIndex ?? "build"}`}
            className="dg-review-link"
            onClick={() => nav.goTo(choice.levelIndex !== undefined ? `level-${choice.levelIndex}` : "origin")}
          >
            <span>{choice.name}</span>
            <span className="dg-muted">
              {choice.sourceName}
              {choice.level ? ` · level ${choice.level}` : ""}
            </span>
          </button>
        ))
      )}

      {session && !session.creating ? (
        <SaveControls session={session} openChoices={open.length} onFinish={shell.openSheet} />
      ) : (
        <button className="dg-level-button" style={{ minHeight: UI.levelButtonHeight }} onClick={shell.openSheet}>
          Finish{open.length ? ` · ${open.length} still open` : ""}
        </button>
      )}
    </>
  );
}

/**
 * Editing an existing character writes nothing until this button is pressed, so
 * it has to say what it is about to do: how many changes, and which (spec 7.9).
 */
function SaveControls({
  session,
  openChoices,
  onFinish,
}: {
  session: BuilderSession;
  openChoices: number;
  onFinish: () => void;
}): ReactNode {
  const sheet = useSheet();

  if (!session.dirty)
    return (
      <>
        <p className="dg-muted">No unsaved changes.</p>
        <button className="dg-level-button" style={{ minHeight: UI.levelButtonHeight }} onClick={onFinish}>
          Done{openChoices ? ` · ${openChoices} still open` : ""}
        </button>
      </>
    );

  return (
    <>
      <button
        className="dg-review-link"
        onClick={() =>
          sheet.open({
            title: "Unsaved changes",
            subtitle: `${session.diff.count} ${session.diff.count === 1 ? "change" : "changes"}`,
            body: () => (
              <ul className="dg-diff">
                {session.diff.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ),
          })
        }
      >
        <span>
          {session.diff.count} unsaved {session.diff.count === 1 ? "change" : "changes"}
        </span>
        <span className="dg-muted">Tap to see what they are</span>
      </button>

      {session.baseMoved ? (
        <p className="dg-warn">This character has changed elsewhere since you started. Saving will replace that.</p>
      ) : null}

      <div className="dg-save-row">
        <button
          className="dg-level-button"
          style={{ minHeight: UI.levelButtonHeight }}
          onClick={() => {
            session.save();
            onFinish();
          }}
        >
          Save changes · {session.diff.count}
        </button>
        <button
          className="dg-level-button is-multiclass"
          style={{ minHeight: UI.levelButtonHeight }}
          onClick={session.discard}
        >
          Discard
        </button>
      </div>
    </>
  );
}
