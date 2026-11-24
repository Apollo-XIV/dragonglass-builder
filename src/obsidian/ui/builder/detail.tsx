/**
 * How a layout lets you read what something is.
 *
 * The narrow layout reads by holding a row, which opens a sheet. The desktop reads
 * in a sidebar. The sections just render an `InfoRow`; which kind of row it is
 * comes from the layout's provider, so neither the sections nor the picker know
 * which gesture is behind it.
 */

import type { Fact } from "../../../core/content/facts";
import type { ElementPreview } from "../../../core/content/preview";
import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import { Facts, Markdown } from "../components";
import { LevelPreview } from "../level-preview";
import { ProvenanceMark, UnverifiedNote } from "../provenance";

export interface DetailSpec {
  title: string;
  /** "Wizard 1 · Class feature", "look ahead". */
  subtitle?: string;
  text?: string;
  /** Setting prose, shown above the rules text where a source has it. */
  fluff?: string;
  /** Reference data shown between the fluff and the rules text: a spell's range and components. */
  facts?: Fact[];
  /** What a class or subclass brings, level by level, after the text. */
  preview?: ElementPreview;
  /** Source abbreviation and page, where known. */
  tag?: string;
  page?: string | number;
  tags?: string[];
  /** The source that replaces this element, when another one overrides it. */
  overriddenBy?: string;
  /** Why its parts are unverified, one note each (`unverifiedNotes`); the marker is drawn only when there are some. */
  unverified?: readonly string[];
}

export interface InfoRowProps extends DetailSpec {
  className?: string;
  /** Tap targets inside the row. */
  children?: ReactNode;
}

/**
 * A button that does something on a tap or click and can also be read: a filled
 * choice, which opens its options and reads as what was chosen.
 */
export interface ReadableProps {
  /** What reading it shows; nothing, and it is only a button. */
  spec?: DetailSpec;
  onTap: () => void;
  className?: string;
  children?: ReactNode;
}

export interface DetailStrategy {
  Row: ComponentType<InfoRowProps>;
  /** Absent, a `Readable` is a plain button with nothing to read. */
  Readable?: ComponentType<ReadableProps>;
  /**
   * `hold`: reading is a gesture that opens a sheet over the screen.
   * `pane`: reading is hovering, and the text appears beside what is hovered.
   */
  mode: "hold" | "pane";
  /**
   * Show something in the reading pane without a row of its own: an option in an
   * open list, say. Absent where reading is a gesture rather than a place.
   * `undefined` says the reader has moved off; the pane may keep what it shows.
   */
  read?: (spec: DetailSpec | undefined) => void;
}

function PlainRow({ title, subtitle, unverified, className, children }: InfoRowProps): ReactNode {
  return (
    <div className={["dg-read-row", className].filter(Boolean).join(" ")}>
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

function PlainReadable({ onTap, className, children }: ReadableProps): ReactNode {
  return (
    <button className={className} onClick={onTap}>
      {children}
    </button>
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

/** A button the current layout lets you read, the way it reads rows. */
export function Readable(props: ReadableProps): ReactNode {
  const { Readable: Strategy = PlainReadable } = useDetail();
  return <Strategy {...props} />;
}

/** The body of a reading, in whichever place the layout shows it: a sheet, a sidebar. */
export function DetailBody({ spec }: { spec: DetailSpec }): ReactNode {
  return (
    <>
      <UnverifiedNote notes={spec.unverified} />
      {spec.fluff ? <Markdown source={spec.fluff} className="dg-fluff" /> : null}
      <Facts facts={spec.facts} />
      {spec.text ? (
        <Markdown source={spec.text} />
      ) : spec.preview?.levels.length ? null : (
        <p className="dg-muted">No rules text.</p>
      )}
      <LevelPreview preview={spec.preview} />
    </>
  );
}
