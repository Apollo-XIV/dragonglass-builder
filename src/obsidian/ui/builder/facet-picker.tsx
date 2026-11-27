/**
 * A picker for long lists that are added to rather than chosen from: items now, spells
 * next. Rows are sized to their content, a tap adds one and puts a quantity stepper on
 * the row, and every add is reported at once, so there is no count and no Done. What is
 * specific to a list (its rows, what they read as, its facets) comes in as props.
 *
 * The component owns only the browsing: search, facet filters and how much of the list
 * is drawn. What has been added is the caller's, so the same picker can write to a store
 * on the sheet and to a build in the builder, and takes neither as a dependency.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "../components";
import { useHold } from "../narrow/hold";
import { cycleFilter, type SourceFilter } from "./source-filter";
import {
  clearFacet,
  facetKey,
  facetState,
  facetValues,
  matchesFacets,
  matchesSearch,
  type Facet,
} from "./facets";

/** How many rows are drawn to begin with, and how many more each time the end is near. */
export const WINDOW = 80;

export interface FacetPickerProps<Row> {
  rows: Row[];
  idOf: (row: Row) => string;
  nameOf: (row: Row) => string;
  /** Besides the name, what search reads: tags, mostly. */
  searchOf?: (row: Row) => string[];
  facets: Facet<Row>[];
  /** The line a row shows after its name: type icon, weight, cost. */
  renderMeta?: (row: Row) => ReactNode;
  /** Quantity added this session, by row id. */
  added: Record<string, number>;
  /** A tap on a row. In `single` mode it is the one answer and the picker does not stay open. */
  onAdd: (row: Row) => void;
  /** The stepper on an added row, and a chip in the strip. */
  onStep: (row: Row, delta: 1 | -1) => void;
  /** Hold: read the row. */
  onRead?: (row: Row) => void;
  /** Take one row and be done: no quantities, no strip. */
  single?: boolean;
  initialFilter?: SourceFilter;
  close: () => void;
}

export function FacetPicker<Row>(props: FacetPickerProps<Row>): ReactNode {
  const { rows, facets, added, single } = props;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SourceFilter>(props.initialFilter ?? {});
  const [open, setOpen] = useState<string | undefined>();
  const [limit, setLimit] = useState(WINDOW);

  const shown = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesFacets(filter, facets, row) &&
          matchesSearch(query, props.nameOf(row), ...(props.searchOf?.(row) ?? [])),
      ),
    [rows, facets, filter, query], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // A facet no row has a value for would be a chip that opens on nothing.
  const usable = useMemo(() => facets.filter((f) => facetValues(f, rows).length > 0), [facets, rows]);
  const facet = usable.find((f) => f.key === open);
  const byId = useMemo(() => new Map(rows.map((r) => [props.idOf(r), r])), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const addedRows = Object.entries(added).filter(([, n]) => n > 0);

  const refilter = (next: SourceFilter): void => {
    setFilter(next);
    setLimit(WINDOW);
  };
  const onScroll = (e: { currentTarget: HTMLElement }): void => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) setLimit((n) => Math.min(n + WINDOW, shown.length));
  };

  return (
    <div className="dg-fp">
      <div className="dg-picker-search">
        <input
          type="search"
          placeholder="Search"
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setLimit(WINDOW);
          }}
        />
        <div className="dg-fp-facets" role="toolbar" aria-label="Filters">
          {usable.map((f) => {
            const { active, onlyExcludes } = facetState(filter, f);
            const className = ["dg-n-chip", "dg-fp-facet", active ? "is-active" : "", onlyExcludes ? "is-exclude" : ""]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={f.key}
                className={className}
                aria-expanded={open === f.key}
                onClick={() => setOpen(open === f.key ? undefined : f.key)}
              >
                {f.label}
                {active ? <span className="dg-fp-facet-count">{active}</span> : null}
                <Icon name="chevron-down" />
              </button>
            );
          })}
        </div>
        {facet ? (
          <div className="dg-filter-panel dg-fp-values" role="group" aria-label={facet.label}>
            <div className="dg-filter-chips">
              {facetValues(facet, rows).map(({ value, label, count }) => {
                const mode = filter[facetKey(facet, value)];
                return (
                  <button
                    key={value}
                    className={mode ? `dg-n-chip is-${mode}` : "dg-n-chip"}
                    aria-pressed={mode === "include" ? true : mode === "exclude" ? "mixed" : false}
                    onClick={() => refilter(cycleFilter(filter, facetKey(facet, value)))}
                  >
                    {label} <span className="dg-muted">{count}</span>
                    {mode ? <span className="dg-sr-only"> ({mode === "include" ? "included" : "excluded"})</span> : null}
                  </button>
                );
              })}
            </div>
            <p className="dg-muted">
              Tap to include, again to exclude, again to clear.{" "}
              {facetState(filter, facet).active > 0 ? (
                <button className="dg-filter-clear" onClick={() => refilter(clearFacet(filter, facet))}>
                  Clear {facet.label.toLowerCase()}
                </button>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>

      <div className="dg-picker dg-fp-list" onScroll={onScroll}>
        {shown.slice(0, limit).map((row) => (
          <FacetRow
            key={props.idOf(row)}
            name={props.nameOf(row)}
            meta={props.renderMeta?.(row)}
            count={added[props.idOf(row)] ?? 0}
            single={single}
            onAdd={() => props.onAdd(row)}
            onStep={(d) => props.onStep(row, d)}
            onRead={props.onRead ? () => props.onRead!(row) : undefined}
          />
        ))}
        {shown.length === 0 ? <p className="dg-muted">Nothing matches.</p> : null}
        {limit < shown.length ? (
          <button className="dg-level-button is-multiclass" onClick={() => setLimit(limit + WINDOW)}>
            Show more ({shown.length - limit})
          </button>
        ) : null}
      </div>

      {!single && addedRows.length > 0 ? (
        <div className="dg-fp-strip" aria-label="Added">
          {addedRows.map(([id, n]) => {
            const row = byId.get(id);
            return row ? (
              <button key={id} className="dg-n-chip dg-fp-added" onClick={() => props.onStep(row, -1)}>
                {props.nameOf(row)} ×{n}
                <span className="dg-sr-only"> (tap for one fewer)</span>
              </button>
            ) : null;
          })}
        </div>
      ) : null}
      <div className="dg-sheet-actions">
        <button className="dg-sheet-button" onClick={props.close}>
          {single ? "Cancel" : "Close"}
        </button>
      </div>
    </div>
  );
}

function FacetRow({
  name,
  meta,
  count,
  single,
  onAdd,
  onStep,
  onRead,
}: {
  name: string;
  meta?: ReactNode;
  count: number;
  single?: boolean;
  onAdd: () => void;
  onStep: (delta: 1 | -1) => void;
  onRead?: () => void;
}): ReactNode {
  const className = count > 0 ? "dg-option dg-fp-row is-selected" : "dg-option dg-fp-row";
  const { handlers } = useHold({ onTap: onAdd, onHold: onRead, className });
  return (
    <div className="dg-fp-line">
      <button {...handlers} style={handlers.style}>
        <span className="dg-option-main">
          <span className="dg-option-name">{name}</span>
        </span>
        {meta ? <span className="dg-fp-meta">{meta}</span> : null}
      </button>
      {!single && count > 0 ? (
        <span className="dg-fp-stepper">
          <button className="dg-fp-step" onClick={() => onStep(-1)}>
            −<span className="dg-sr-only"> one {name}</span>
          </button>
          <span className="dg-fp-qty">{count}</span>
          <button className="dg-fp-step" onClick={() => onStep(1)}>
            +<span className="dg-sr-only"> one {name}</span>
          </button>
        </span>
      ) : null}
    </div>
  );
}
