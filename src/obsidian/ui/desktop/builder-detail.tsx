/**
 * Reading in the desktop builder: hover a row and its text appears in the
 * sidebar, and stays there until something else is read. It is the desktop's
 * answer to the narrow layout's hold, behind the same `InfoRow` the shared
 * sections render. Staying is the point: a feature's text can sit beside the
 * choice it bears on while the pointer works somewhere else.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ProvenanceMark } from "../provenance";
import {
  DetailBody,
  DetailContext,
  type DetailSpec,
  type DetailStrategy,
  type InfoRowProps,
  type ReadableProps,
} from "../builder/detail";

/** Show this in the sidebar. Leaving a row passes nothing, and what it showed stays. */
type Sink = (spec: DetailSpec | undefined) => void;

const SinkContext = createContext<Sink>(() => {});
const CurrentContext = createContext<DetailSpec | undefined>(undefined);

function DeskRow({ title, subtitle, text, fluff, facts, preview, tag, page, tags, overriddenBy, unverified, className, children }: InfoRowProps): ReactNode {
  const sink = useContext(SinkContext);
  const spec: DetailSpec = { title, subtitle, text, fluff, facts, preview, tag, page, tags, overriddenBy, unverified };
  return (
    <div
      className={["dg-read-row", "is-readable", className].filter(Boolean).join(" ")}
      tabIndex={0}
      onPointerEnter={() => sink(spec)}
      onFocus={() => sink(spec)}
      onClick={() => sink(spec)}
    >
      <span className="dg-read-main">
        <span className="dg-read-title">
          {title}
          <ProvenanceMark notes={unverified} />
        </span>
        {subtitle ? <span className="dg-read-subtitle">{subtitle}</span> : null}
      </span>
      {children}
    </div>
  );
}

/** A button read by hovering it; clicking it does its own thing. */
function DeskReadable({ spec, onTap, className, children }: ReadableProps): ReactNode {
  const sink = useContext(SinkContext);
  const read = spec ? (): void => sink(spec) : undefined;
  return (
    <button className={className} onClick={onTap} onPointerEnter={read} onFocus={read}>
      {children}
    </button>
  );
}

export function DesktopDetailProvider({ children }: { children: ReactNode }): ReactNode {
  const [current, setCurrent] = useState<DetailSpec | undefined>();
  const sink = useMemo<Sink>(() => (spec) => {
    if (spec) setCurrent(spec);
  }, []);
  const strategy = useMemo<DetailStrategy>(() => ({ Row: DeskRow, Readable: DeskReadable, mode: "pane", read: sink }), [sink]);

  return (
    <DetailContext.Provider value={strategy}>
      <SinkContext.Provider value={sink}>
        <CurrentContext.Provider value={current}>{children}</CurrentContext.Provider>
      </SinkContext.Provider>
    </DetailContext.Provider>
  );
}

/** The sidebar: whatever was last hovered. */
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
          <DetailBody spec={spec} />
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
        <p className="dg-muted">Hover a feature or option to read it here.</p>
      )}
    </aside>
  );
}
