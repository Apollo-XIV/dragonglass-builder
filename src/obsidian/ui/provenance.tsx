/**
 * The subtle marker on a part nobody has reviewed. It is a note and nothing more: it
 * takes no clicks, sits outside every tap and hold target's behaviour, and the setting
 * that hides it changes nothing else.
 *
 * It is the builder's, not the sheet's. Choosing content is when "nobody has checked
 * this against the book" is worth knowing; at the table it only raises a question the
 * player can't answer.
 */

import { useContext, type ReactNode } from "react";
import { PluginContext } from "./context";

function useHidden(): boolean {
  return useContext(PluginContext)?.plugin.settings.layout.hideUnverifiedMarkers === true;
}

export function ProvenanceMark({ notes }: { notes?: readonly string[] }): ReactNode {
  const hidden = useHidden();
  if (hidden || !notes?.length) return null;
  const text = notes.join("; ");
  return (
    <span className="dg-unverified" title={text}>
      <span className="dg-sr-only">{text}</span>
    </span>
  );
}

/** What the marker means, spelled out where a row is read: the hold sheet or the sidebar. */
export function UnverifiedNote({ notes }: { notes?: readonly string[] }): ReactNode {
  const hidden = useHidden();
  if (hidden || !notes?.length) return null;
  return (
    <p className="dg-unverified-note">
      <span className="dg-unverified" aria-hidden="true" />
      Not yet checked against the book: {notes.map((n) => n.replace(/, not yet reviewed$/, "").replace(/^./, (c) => c.toLowerCase())).join("; ")}.
    </p>
  );
}
