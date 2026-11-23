/**
 * Reading in the desktop builder: hover a row and its text appears in the
 * sidebar; click it to keep it there. It is the desktop's answer to the narrow
 * layout's hold, behind the same `InfoRow` the shared sections render.
 */

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { ProvenanceMark } from "../provenance";
import {
  DetailBody,
  DetailContext,
  type DetailSpec,
  type DetailStrategy,
  type InfoRowProps,
  type ReadableProps,
} from "../builder/detail";

interface Sink {
  hover: (spec: DetailSpec | undefined) => void;
  pin: (spec: DetailSpec) => void;
  /** The pointer is in the sidebar: keep what it shows, or let it go. */
  hold: (on: boolean) => void;
}

/**
 * How long what was hovered stays after the pointer leaves it, which is long enough
 * to cross into the sidebar and keep it there: a class's levels fold open, and a
 * long text scrolls, so the sidebar has to be somewhere the pointer can go.
 */
const LINGER_MS = 250;

const SinkContext = createContext<Sink>({ hover: () => {}, pin: () => {}, hold: () => {} });
const CurrentContext = createContext<DetailSpec | undefined>(undefined);

function DeskRow({ title, subtitle, text, fluff, facts, preview, tag, page, tags, overriddenBy, unverified, className, children }: InfoRowProps): ReactNode {
  const sink = useContext(SinkContext);
  const spec: DetailSpec = { title, subtitle, text, fluff, facts, preview, tag, page, tags, overriddenBy, unverified };
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

/** A button read by hovering it; clicking it does its own thing rather than pinning. */
function DeskReadable({ spec, onTap, className, children }: ReadableProps): ReactNode {
  const sink = useContext(SinkContext);
  const read = spec ? (): void => sink.hover(spec) : undefined;
  const leave = spec ? (): void => sink.hover(undefined) : undefined;
  return (
    <button
      className={className}
      onClick={onTap}
      onPointerEnter={read}
      onPointerLeave={leave}
      onFocus={read}
      onBlur={leave}
    >
      {children}
    </button>
  );
}

export function DesktopDetailProvider({ children }: { children: ReactNode }): ReactNode {
  const [hovered, setHovered] = useState<DetailSpec | undefined>();
  const [pinned, setPinned] = useState<DetailSpec | undefined>();
  const leaving = useRef<number | undefined>(undefined);
  const sink = useMemo<Sink>(() => {
    const hover = (spec: DetailSpec | undefined): void => {
      window.clearTimeout(leaving.current);
      if (spec) setHovered(spec);
      else leaving.current = window.setTimeout(() => setHovered(undefined), LINGER_MS);
    };
    return {
      hover,
      pin: setPinned,
      hold: (on) => (on ? window.clearTimeout(leaving.current) : hover(undefined)),
    };
  }, []);
  const strategy = useMemo<DetailStrategy>(() => ({ Row: DeskRow, Readable: DeskReadable, mode: "pane", read: sink.hover }), [sink]);

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
  const sink = useContext(SinkContext);
  return (
    <aside
      className="dg-b-detail"
      aria-label="Details"
      aria-live="polite"
      onPointerEnter={() => sink.hold(true)}
      onPointerLeave={() => sink.hold(false)}
    >
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
        <p className="dg-muted">Hover a feature or option to read it here. Click to keep it.</p>
      )}
    </aside>
  );
}
