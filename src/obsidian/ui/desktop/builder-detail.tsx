/**
 * Reading in the desktop builder: hover a row and its text appears in the
 * sidebar; click it to keep it there. It is the desktop's answer to the narrow
 * layout's hold, behind the same `InfoRow` the shared sections render.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Markdown } from "../components";
import { DetailContext, type DetailSpec, type DetailStrategy, type InfoRowProps } from "../builder/detail";

interface Sink {
  hover: (spec: DetailSpec | undefined) => void;
  pin: (spec: DetailSpec) => void;
}

const SinkContext = createContext<Sink>({ hover: () => {}, pin: () => {} });
const CurrentContext = createContext<DetailSpec | undefined>(undefined);

function DeskRow({ title, subtitle, text, tag, page, tags, overriddenBy, className, children }: InfoRowProps): ReactNode {
  const sink = useContext(SinkContext);
  const spec: DetailSpec = { title, subtitle, text, tag, page, tags, overriddenBy };
  return (
    <div
      className={["dg-read-row", "is-readable", className].filter(Boolean).join(" ")}
      tabIndex={0}
      onPointerEnter={() => sink.hover(spec)}
      onPointerLeave={() => sink.hover(undefined)}
      onFocus={() => sink.hover(spec)}
      onBlur={() => sink.hover(undefined)}
      onClick={() => sink.pin(spec)}
    >
      <span className="dg-read-main">
        <span className="dg-read-title">{title}</span>
        {subtitle ? <span className="dg-read-subtitle">{subtitle}</span> : null}
      </span>
      {children}
    </div>
  );
}


export function DesktopDetailProvider({ children }: { children: ReactNode }): ReactNode {
  const [hovered, setHovered] = useState<DetailSpec | undefined>();
  const [pinned, setPinned] = useState<DetailSpec | undefined>();
  const sink = useMemo<Sink>(() => ({ hover: setHovered, pin: setPinned }), []);
  const strategy = useMemo<DetailStrategy>(() => ({ Row: DeskRow, mode: "pane", read: setHovered }), []);

  return (
    <DetailContext.Provider value={strategy}>
      <SinkContext.Provider value={sink}>
        <CurrentContext.Provider value={hovered ?? pinned}>{children}</CurrentContext.Provider>
      </SinkContext.Provider>
    </DetailContext.Provider>
  );
}

/** The sidebar: whatever is hovered, else whatever was last clicked. */
export function DetailPane(): ReactNode {
  const spec = useContext(CurrentContext);
  return (
    <aside className="dg-b-detail" aria-label="Details" aria-live="polite">
      {spec ? (
        <>
          <h3>{spec.title}</h3>
          {spec.subtitle ? <p className="dg-muted">{spec.subtitle}</p> : null}
          {spec.tag || spec.page ? (
            <p className="dg-b-source">
              {[spec.tag, spec.page ? `p. ${spec.page}` : undefined].filter(Boolean).join(" ")}
            </p>
          ) : null}
          {spec.overriddenBy ? <p className="dg-warn">Overridden by {spec.overriddenBy}</p> : null}
          {spec.text ? <Markdown source={spec.text} /> : <p className="dg-muted">No rules text.</p>}
          {spec.tags?.length ? (
            <div className="dg-tags">
              {spec.tags.map((tag) => (
                <span className="dg-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="dg-muted">Hover a feature or option to read it here. Click to keep it.</p>
      )}
    </aside>
  );
}
