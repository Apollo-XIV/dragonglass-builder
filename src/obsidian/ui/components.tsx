/**
 * Shared presentational pieces. Everything here reads the resolver's output and
 * Obsidian's CSS variables; nothing computes a rule.
 */

import { MarkdownRenderer, setIcon } from "obsidian";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Annotation, Contribution, NumericStat, ResolvedElement, SetStat } from "../../core/resolver/resolved";
import type { Fact } from "../../core/content/facts";
import type { Diagnostic } from "../../core/types";
import { usePlugin } from "./context";

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

export function Icon({ name, className }: { name: string; className?: string }): ReactNode {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) setIcon(ref.current, name);
  }, [name]);
  return <span ref={ref} className={className ? `dg-icon ${className}` : "dg-icon"} aria-hidden="true" />;
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <section className={className ? `dg-section ${className}` : "dg-section"}>
      {(title || action) && (
        <header className="dg-section-head">
          {title ? <h3>{title}</h3> : <span />}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; badge?: number | string }[];
  active: string;
  onChange: (id: string) => void;
}): ReactNode {
  return (
    <div className="dg-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === active}
          className={tab.id === active ? "dg-tab is-active" : "dg-tab"}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge !== 0 ? <span className="dg-badge">{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Renders markdown through Obsidian, so links, embeds and callouts all work. */
export function Markdown({
  source,
  sourcePath = "",
  className,
}: {
  source: string;
  sourcePath?: string;
  className?: string;
}): ReactNode {
  const { app, view } = usePlugin();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.empty();
    void MarkdownRenderer.render(app, source, el, sourcePath, view);
  }, [app, source, sourcePath, view]);

  return <div className={className ? `dg-markdown ${className}` : "dg-markdown"} ref={ref} />;
}

function describeContribution(row: Contribution): string {
  const value = Array.isArray(row.value) ? row.value.join(", ") : String(row.value);
  switch (row.op) {
    case "add":
      return typeof row.value === "number" ? signed(row.value) : value;
    case "base":
      return value;
    case "set":
      return `set to ${value}`;
    case "min":
      return `at least ${value}`;
    case "max":
      return `at most ${value}`;
    case "proficiency":
      return value;
    case "include":
      return value;
    default:
      return `${row.op} ${value}`;
  }
}

export function Breakdown({
  stat,
  showBreakdown = true,
}: {
  stat: NumericStat | SetStat;
  showBreakdown?: boolean;
}): ReactNode {
  const rows = showBreakdown ? stat.breakdown : [];
  if (!rows.length && !stat.annotations.length) return <p className="dg-muted">No contributions.</p>;
  return (
    <>
      {rows.length > 0 && (
        <ul className="dg-breakdown">
          {rows.map((row, i) => (
            <li key={`${row.source}-${i}`} className={row.applied ? "" : "is-suppressed"}>
              <span className="dg-breakdown-value">{describeContribution(row)}</span>
              <span className="dg-breakdown-source">
                {row.sourceName}
                {row.fromEffect ? " (active effect)" : ""}
              </span>
              {!row.applied && row.suppressedBy ? (
                <span className="dg-muted"> — superseded by {row.suppressedBy}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {stat.annotations.length > 0 && (
        <ul className="dg-annotations">
          {stat.annotations.map((annotation, i) => (
            <li key={i}>
              <strong>{annotationLabel(annotation)}</strong> {annotation.when.text}
              <span className="dg-breakdown-source"> — {annotation.sourceName}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function annotationLabel(annotation: Annotation): string {
  switch (annotation.op) {
    case "advantage":
      return "Advantage";
    case "disadvantage":
      return "Disadvantage";
    case "proficiency":
      return String(annotation.value);
    case "add":
      return typeof annotation.value === "number" ? signed(annotation.value) : String(annotation.value);
    case "include":
      return Array.isArray(annotation.value) ? annotation.value.join(", ") : String(annotation.value);
    default:
      return annotation.op;
  }
}

/** A value with a marker when it has situational modifiers, and a breakdown popover. */
export function StatValue({
  stat,
  label,
  display,
  showBreakdown = true,
  className,
}: {
  stat?: NumericStat;
  label: ReactNode;
  display?: ReactNode;
  showBreakdown?: boolean;
  className?: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!stat)
    return (
      <div className={className ? `dg-stat ${className}` : "dg-stat"}>
        <span className="dg-stat-label">{label}</span>
        <span className="dg-stat-value">—</span>
      </div>
    );

  const marker =
    stat.annotations.length > 0 ? (
      <span className="dg-conditional" title={stat.annotations.map((a) => a.when.text).join("; ")}>
        *
      </span>
    ) : null;

  return (
    <div className={className ? `dg-stat ${className}` : "dg-stat"}>
      <button
        className="dg-stat-button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        title="Show where this number comes from"
      >
        <span className="dg-stat-label">{label}</span>
        <span className="dg-stat-value">
          {display ?? signed(stat.value)}
          {marker}
          {stat.advantage !== "none" ? <AdvantageMark state={stat.advantage} /> : null}
        </span>
      </button>
      {open && (
        <div className="dg-popover" id={id}>
          <Breakdown stat={stat} showBreakdown={showBreakdown} />
        </div>
      )}
    </div>
  );
}

export function AdvantageMark({ state }: { state: NumericStat["advantage"] }): ReactNode {
  const label = state === "advantage" ? "adv" : state === "disadvantage" ? "dis" : "adv/dis";
  return <span className={`dg-adv is-${state}`}>{label}</span>;
}

export function Pill({ children, tone }: { children: ReactNode; tone?: "warn" | "error" | "info" }): ReactNode {
  return <span className={tone ? `dg-pill is-${tone}` : "dg-pill"}>{children}</span>;
}

/** Name, sourcebook badge, page, rules text and tags for one element. */
export function ElementInfo({
  element,
  overriddenBy,
  compact,
}: {
  element: ResolvedElement | { id: string; name: string; kind: string; abbreviation?: string; page?: number | string; text?: string; fluff?: string; tags?: string[] };
  overriddenBy?: string;
  compact?: boolean;
}): ReactNode {
  const badge = element.abbreviation ? `${element.abbreviation}${element.page ? ` ${element.page}` : ""}` : undefined;
  return (
    <div className="dg-element">
      <div className="dg-element-head">
        <strong>{element.name}</strong>
        {badge ? <Pill>{badge}</Pill> : null}
        {overriddenBy ? <Pill tone="info">overridden by {overriddenBy}</Pill> : null}
      </div>
      {element.fluff && !compact ? <Markdown source={element.fluff} className="dg-fluff" /> : null}
      {element.text && !compact ? <Markdown source={element.text} /> : null}
      {element.tags?.length && !compact ? (
        <div className="dg-tags">
          {element.tags.map((tag) => (
            <span className="dg-tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A plus/minus counter with large tap targets, for HP, slots and resources. */
export function Counter({
  value,
  max,
  label,
  onChange,
  disabled,
  unit,
}: {
  value: number;
  max?: number;
  label: ReactNode;
  onChange: (delta: number) => void;
  disabled?: boolean;
  unit?: string;
}): ReactNode {
  return (
    <div className="dg-counter">
      <span className="dg-counter-label">{label}</span>
      <div className="dg-counter-controls">
        <button onClick={() => onChange(-1)} disabled={disabled || value <= 0} aria-label={`Spend one ${unit ?? ""}`}>
          −
        </button>
        <span className="dg-counter-value">
          {value}
          {max !== undefined ? <span className="dg-muted"> / {max}</span> : null}
        </span>
        <button
          onClick={() => onChange(1)}
          disabled={disabled || (max !== undefined && value >= max)}
          aria-label={`Regain one ${unit ?? ""}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** A row of boxes, for spell slots and death saves. */
export function Pips({
  total,
  filled,
  onToggle,
  label,
}: {
  total: number;
  filled: number;
  onToggle?: (index: number) => void;
  label?: string;
}): ReactNode {
  return (
    <div className="dg-pips" role="group" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          className={i < filled ? "dg-pip is-filled" : "dg-pip"}
          onClick={() => onToggle?.(i)}
          disabled={!onToggle}
          aria-label={`${label ?? "slot"} ${i + 1}`}
          aria-pressed={i < filled}
        />
      ))}
    </div>
  );
}

export function Diagnostics({ diagnostics, title = "Problems" }: { diagnostics: Diagnostic[]; title?: string }): ReactNode {
  const [open, setOpen] = useState(false);
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  if (!diagnostics.length) return null;
  return (
    <div className={errors ? "dg-diagnostics has-errors" : "dg-diagnostics"}>
      <button className="dg-diagnostics-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {title}: {errors} {errors === 1 ? "error" : "errors"}, {warnings} {warnings === 1 ? "warning" : "warnings"}
      </button>
      {open && (
        <ul>
          {diagnostics.map((d, i) => (
            <li key={i} className={`is-${d.severity}`}>
              <Pill tone={d.severity === "error" ? "error" : d.severity === "warning" ? "warn" : "info"}>{d.code}</Pill>{" "}
              {d.message}
              {d.subject ? <span className="dg-muted"> — {d.subject}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }): ReactNode {
  return <p className="dg-empty">{children}</p>;
}

/** Text that may be unmechanised: shown as rules text with a warning badge. */
export function UnmechanisedNote({ text }: { text?: string }): ReactNode {
  if (!text) return null;
  return (
    <div className="dg-note">
      <Pill tone="warn">text only</Pill>
      <Markdown source={text} />
    </div>
  );
}

/** An element's reference data (a spell's range, components...) as a definition list. */
export function Facts({ facts }: { facts?: Fact[] }): ReactNode {
  if (!facts?.length) return null;
  return (
    <dl className="dg-kv dg-facts">
      {facts.map((fact) => (
        <div className="dg-kv-row" key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
