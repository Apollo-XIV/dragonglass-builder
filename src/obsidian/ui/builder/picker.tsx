/**
 * Choice sheets (spec 7.7). Every selection in the narrow builder happens in one
 * of these: species, background, a fighting style, a subclass, a class to
 * multiclass into.
 *
 * Tapping an option selects it; holding one shows its text, so a player can read
 * the four options before committing to one (spec 3.3.4).
 */

import {
  createContext,
  useEffect,
  useContext,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Markdown } from "../components";
import { ChipRow } from "./chips";
import { useDetail, type DetailSpec } from "./detail";
import { useBuilderFeatures } from "./features";
import { useHold } from "../narrow/hold";
import { useSheet } from "../narrow/sheet";

export interface PickerOption {
  id: string;
  name: string;
  text?: string;
  fluff?: string;
  /** Source abbreviation: SRD, PHB. */
  tag?: string;
  /** Unmet prerequisites. Shown as an amber note; only enforced if asked. */
  warnings?: string[];
  allowed?: boolean;
  /** Which of the spec's `buckets` this option counts against. */
  bucket?: string;
  /** What the filter chips narrow by: a spell's level, an item's first tag. */
  group?: string;
}

export interface PickerSpec {
  title: string;
  subtitle?: string;
  options: PickerOption[];
  selected: string[];
  /** How many may be chosen. 1 commits on tap; more needs Done. */
  count: number;
  /**
   * May one option be taken more than once? Then `selected` carries duplicates
   * and a tap cycles that option's own count rather than toggling it.
   */
  repeatable?: boolean;
  /** The most times one option may be taken. Defaults to `count`. */
  maxPer?: number;
  /** A search box, and chips for each group the options fall in. */
  search?: boolean;
  /** Hide options whose prerequisites aren't met, and refuse picks past a bucket's room. */
  enforce?: boolean;
  /**
   * Separate allowances within one pick, like cantrips and leveled spells. `used` is
   * what is already held; the picker adds what is selected to it. With `enforce` off
   * a full bucket still takes the pick and says so.
   */
  buckets?: Record<string, { label: string; used: number; cap?: number }>;
  onCommit: (ids: string[]) => void;
  /** Extra button, for "clear" or a destructive action. */
  extra?: { label: string; onClick: () => void; destructive?: boolean };
}

type Slot = (spec: PickerSpec) => void;

/** The slot a row has armed for the picker its `onOpen` is about to ask for. */
const ArmedSlot = createContext<MutableRefObject<Slot | null> | null>(null);

export function PickerSlotProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const armed = useRef<Slot | null>(null);
  return <ArmedSlot.Provider value={armed}>{children}</ArmedSlot.Provider>;
}

function prepare(spec: PickerSpec): PickerSpec {
  return spec.enforce
    ? { ...spec, options: spec.options.filter((o) => o.allowed !== false) }
    : spec;
}

export function usePicker(): (spec: PickerSpec) => void {
  const sheet = useSheet();
  const armed = useContext(ArmedSlot);
  return (raw) => {
    const spec = prepare(raw);
    // A row that wants its options under it has armed its slot just before asking.
    if (armed?.current) {
      armed.current(spec);
      return;
    }
    sheet.open({
      title: spec.title,
      subtitle: spec.subtitle,
      body: () => <PickerBody spec={spec} close={sheet.close} />,
    });
  };
}

/**
 * A place under a row for its options to open. Where the layout has no inline
 * pickers `open` simply runs `ask`, and the picker is the sheet it always was.
 */
export function usePickerSlot(): {
  node: ReactNode;
  open: (ask: () => void) => void;
} {
  const inline = useBuilderFeatures().inlinePicker;
  const armed = useContext(ArmedSlot);
  const [spec, setSpec] = useState<PickerSpec | undefined>();
  const detail = useDetail();

  const open = (ask: () => void): void => {
    if (!inline || !armed) return ask();
    if (spec) return setSpec(undefined);
    armed.current = setSpec;
    try {
      ask();
    } finally {
      armed.current = null;
    }
  };
  const node = spec ? (
    <div className="dg-picker-inline">
      <PickerBody
        spec={spec}
        close={() => setSpec(undefined)}
        onRead={detail.read}
      />
    </div>
  ) : null;
  return { node, open };
}

export function PickerBody({
  spec,
  close,
  onRead,
}: {
  spec: PickerSpec;
  close: () => void;
  /** Reading by hover, into the layout's pane. */
  onRead?: (spec: DetailSpec | undefined) => void;
}): ReactNode {
  const [selected, setSelected] = useState<string[]>(spec.selected);
  // An option that unmounts under the pointer never says it left.
  useEffect(() => () => onRead?.(undefined), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const groups = spec.search
    ? [
        ...new Set(
          spec.options.map((o) => o.group).filter((g): g is string => !!g),
        ),
      ].sort((a, b) =>
        a === "Cantrip"
          ? -1
          : b === "Cantrip"
            ? 1
            : a.localeCompare(b, undefined, { numeric: true }),
      )
    : [];
  const shown = spec.options.filter(
    (o) =>
      (group === "all" || o.group === group) &&
      (!query || o.name.toLowerCase().includes(query.toLowerCase())),
  );
  const multiple = spec.count > 1;
  // Repeating one option only means anything when there is more than one pick to
  // spend, so a `count` of 1 behaves as an ordinary choice whatever it declares.
  const stepping = spec.repeatable === true && multiple;

  const bucketOf = (id: string): string | undefined =>
    spec.options.find((o) => o.id === id)?.bucket;
  const held = (bucket: string, among: string[]): number =>
    (spec.buckets?.[bucket]?.used ?? 0) + among.filter((x) => bucketOf(x) === bucket).length;
  const full = (bucket: string, among: string[]): boolean => {
    const cap = spec.buckets?.[bucket]?.cap;
    return cap !== undefined && held(bucket, among) >= cap;
  };

  const toggle = (id: string): void => {
    const bucket = bucketOf(id);
    if (spec.enforce && bucket && !selected.includes(id) && full(bucket, selected)) return;
    if (!multiple) {
      spec.onCommit([id]);
      close();
      return;
    }
    setSelected((current) => {
      if (stepping) return cycle(current, id, spec.count, spec.maxPer);
      if (current.includes(id)) return current.filter((x) => x !== id);
      // Choosing one too many drops the oldest rather than refusing the tap: the
      // player has already said what they want, and which one to give up is
      // usually obvious to them, not to us.
      const next = [...current, id];
      return next.length > spec.count
        ? next.slice(next.length - spec.count)
        : next;
    });
  };

  return (
    <>
      {multiple ? (
        <p className="dg-muted">
          {Number.isFinite(spec.count) ? `${selected.length} of ${spec.count} chosen` : `${selected.length} chosen`}
          {stepping ? " · tap again for another, or to clear it" : ""}
          {stepping && spec.maxPer !== undefined && spec.maxPer < spec.count
            ? ` · at most ${spec.maxPer} in any one`
            : ""}
        </p>
      ) : null}
      {spec.buckets ? (
        <p className="dg-muted">
          {Object.entries(spec.buckets)
            .filter(([, b]) => b.cap !== undefined)
            .map(([key, b]) => {
              const count = held(key, selected);
              return `${b.label} ${count}/${b.cap}${count > b.cap! ? " (over)" : ""}`;
            })
            .join(" · ")}
        </p>
      ) : null}
      {spec.search ? (
        <div className="dg-picker-search">
          <input
            type="search"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          {groups.length > 1 ? (
            <ChipRow
              chips={[
                { id: "all", label: "All" },
                ...groups.map((g) => ({ id: g, label: g })),
              ]}
              active={group}
              onPick={setGroup}
            />
          ) : null}
        </div>
      ) : null}
      <div className="dg-picker">
        {shown.map((option) => (
          <OptionRow
            key={option.id}
            option={option}
            selected={selected.includes(option.id)}
            taken={
              stepping ? selected.filter((x) => x === option.id).length : 0
            }
            onPick={() => toggle(option.id)}
            onRead={
              onRead
                ? (on) =>
                    onRead(
                      on
                        ? {
                            title: option.name,
                            tag: option.tag,
                            text: option.text,
                            fluff: option.fluff,
                            subtitle: option.warnings?.join("; "),
                          }
                        : undefined,
                    )
                : undefined
            }
          />
        ))}
        {shown.length === 0 ? (
          <p className="dg-muted">No options in the loaded sources.</p>
        ) : null}
      </div>
      <div className="dg-sheet-actions">
        {spec.extra ? (
          <button
            className={
              spec.extra.destructive
                ? "dg-sheet-button is-destructive"
                : "dg-sheet-button"
            }
            onClick={() => {
              spec.extra?.onClick();
              close();
            }}
          >
            {spec.extra.label}
          </button>
        ) : null}
        {multiple ? (
          <button
            className="dg-sheet-button is-primary"
            onClick={() => {
              spec.onCommit(selected);
              close();
            }}
          >
            Done
          </button>
        ) : null}
      </div>
    </>
  );
}

/**
 * One tap on a repeatable option. It adds another of that option, and wraps to
 * none once there is no room for more — so a tap only ever changes the row that
 * was tapped. Dropping someone else's pick to make room, which is what the
 * one-each path does, reads as the sheet rearranging itself under your finger
 * when every row is the same six abilities.
 *
 * Two bounds say when there is no room: the budget (`count`) and the per-option
 * cap (`maxPer`, defaulting to the budget). A 2024 background spends three
 * points with a cap of two, so a third tap on one ability clears it rather than
 * buying an increase the rules don't allow.
 */
export function cycle(
  current: string[],
  id: string,
  count: number,
  maxPer = count,
): string[] {
  const others = current.filter((x) => x !== id);
  const own = current.length - others.length;
  const wanted = own + 1;
  const room =
    wanted <= Math.min(count, maxPer) && others.length + wanted <= count;
  return [...others, ...Array<string>(room ? wanted : 0).fill(id)];
}

function OptionRow({
  option,
  selected,
  taken,
  onPick,
  onRead,
}: {
  option: PickerOption;
  selected: boolean;
  /** How many of this option are taken, when the choice is repeatable. */
  taken: number;
  onPick: () => void;
  /** Where reading is hovering: called as the pointer or focus arrives, and again as it leaves. */
  onRead?: (on: boolean) => void;
}): ReactNode {
  const sheet = useSheet();
  const { handlers } = useHold({
    onTap: onPick,
    // Reading an option replaces the sheet's contents rather than stacking a
    // second sheet on the first.
    onHold: () =>
      sheet.open({
        title: option.name,
        subtitle: option.tag,
        body: () =>
          option.text || option.fluff ? (
            <>
              {option.fluff ? <Markdown source={option.fluff} className="dg-fluff" /> : null}
              {option.text ? <Markdown source={option.text} /> : null}
            </>
          ) : (
            <p className="dg-muted">No rules text.</p>
          ),
      }),
    className: selected ? "dg-option is-selected" : "dg-option",
  });

  return (
    <button
      {...(onRead
        ? {
            className: selected ? "dg-option is-selected" : "dg-option",
            onClick: onPick,
          }
        : handlers)}
      onPointerEnter={onRead ? () => onRead(true) : undefined}
      onPointerLeave={onRead ? () => onRead(false) : undefined}
      onFocus={onRead ? () => onRead(true) : undefined}
      onBlur={onRead ? () => onRead(false) : undefined}
      style={onRead ? undefined : handlers.style}
      aria-pressed={selected}
      aria-label={taken > 1 ? `${option.name}, ${taken} taken` : undefined}
    >
      <span className="dg-option-main">
        <span className="dg-option-name">{option.name}</span>
        {option.warnings?.length ? (
          <span className="dg-option-warning">
            {option.warnings.join("; ")}
          </span>
        ) : null}
      </span>
      {taken > 1 ? <span className="dg-option-count">×{taken}</span> : null}
      {option.tag ? <span className="dg-option-tag">{option.tag}</span> : null}
    </button>
  );
}
