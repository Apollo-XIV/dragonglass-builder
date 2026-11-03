/**
 * How a layout lets you read what something is.
 *
 * The narrow layout reads by holding a row, which opens a sheet. The desktop reads
 * in a sidebar. The sections just render an `InfoRow`; which kind of row it is
 * comes from the layout's provider, so neither the sections nor the picker know
 * which gesture is behind it.
 */

import { createContext, useContext, type ComponentType, type ReactNode } from "react";

export interface DetailSpec {
  title: string;
  /** "Wizard 1 · Class feature", "look ahead". */
  subtitle?: string;
  text?: string;
  /** Source abbreviation and page, where known. */
  tag?: string;
  page?: string | number;
  tags?: string[];
  /** The source that replaces this element, when another one overrides it. */
  overriddenBy?: string;
}

export interface InfoRowProps extends DetailSpec {
  className?: string;
  /** Tap targets inside the row. */
  children?: ReactNode;
}

export interface DetailStrategy {
  Row: ComponentType<InfoRowProps>;
  /**
   * `hold`: reading is a gesture that opens a sheet over the screen.
   * `pane`: reading is hovering, and the text appears beside what is hovered.
   */
  mode: "hold" | "pane";
  /**
   * Show something in the reading pane without a row of its own: an option in an
   * open list, say. Absent where reading is a gesture rather than a place.
   */
  read?: (spec: DetailSpec | undefined) => void;
}

function PlainRow({ title, subtitle, className, children }: InfoRowProps): ReactNode {
  return (
    <div className={["dg-read-row", className].filter(Boolean).join(" ")}>
      <span className="dg-read-main">
        <span className="dg-read-title">{title}</span>
        {subtitle ? <span className="dg-read-subtitle">{subtitle}</span> : null}
      </span>
      {children}
    </div>
  );
}

export const DetailContext = createContext<DetailStrategy>({ Row: PlainRow, mode: "hold" });

export function useDetail(): DetailStrategy {
  return useContext(DetailContext);
}

/** A row that shows its text the way the current layout reads things. */
export function InfoRow(props: InfoRowProps): ReactNode {
  const { Row } = useDetail();
  return <Row {...props} />;
}
