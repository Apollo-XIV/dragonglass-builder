/**
 * The subtle marker on a part nobody has reviewed. It is a note and nothing more: it
 * takes no clicks, sits outside every tap and hold target's behaviour, and the setting
 * that hides it changes nothing else.
 */

import { useContext, type ReactNode } from "react";
import { PluginContext } from "./context";

export function ProvenanceMark({ notes }: { notes: readonly string[] }): ReactNode {
  const hidden = useContext(PluginContext)?.plugin.settings.layout.hideUnverifiedMarkers === true;
  if (hidden || notes.length === 0) return null;
  const text = notes.join("; ");
  return (
    <span className="dg-unverified" title={text}>
      <span className="dg-sr-only">{text}</span>
    </span>
  );
}
