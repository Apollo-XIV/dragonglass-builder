/**
 * Progression: one ordered list of level cards with a PLANNED divider in it.
 * Everything above the divider is a level taken; everything below is queued.
 *
 * The cards themselves are `levels.tsx` and `planned.tsx`'s. What this adds is
 * the arrangement: the divider, the drag that reorders the list (`reorder/`), and
 * what a drop means — a single `reorder` change through the same preview and
 * confirmation every other builder edit uses.
 */

import { useMemo, useState, type ReactNode } from "react";
import { classLevels } from "../../../../core/resolver/levels";
import type { ResolvedCharacter } from "../../../../core/resolver/resolved";
import type { HpChoice } from "../../../../core/types";
import type { CharacterStore } from "../../../character-store";
import { usePlugin } from "../../context";
import { useBuildChange } from "../changes";
import { useBuilderFeatures } from "../features";
import { defaultHpFor, PLANNED_PAGE } from "../model";
import { DIVIDER_KEY, activeCount, orderFromKeys, progressionRows } from "../progression";
import { DragFoldContext } from "../reorder/fold";
import { ReorderList, type ReorderEntry } from "../reorder/ReorderList";
import { choicesByLevel, LevelButtons, LevelCard } from "./levels";
import { PlannedCard, PlannedStaged } from "./planned";

export function ProgressionSection({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const features = useBuilderFeatures();
  const { plugin } = usePlugin();
  const change = useBuildChange(store);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(features.plannedOpen);
  const [shown, setShown] = useState(PLANNED_PAGE);
  // The order a drop proposed, held while its confirmation is up so the list
  // stays where it was dropped; cancelling clears it and everything snaps back.
  const [pending, setPending] = useState<string[] | undefined>();

  const index = store.index;
  const build = store.data.build;

  const rows = useMemo(() => (build ? progressionRows(build, shown) : []), [build, shown]);
  if (!build || !index) return null;

  const byKey = new Map(rows.map((row) => [row.key, row]));
  const nameOf = (id: string): string => index.get(id)?.name ?? id;
  const className = (id: string | undefined): string => (id ? (index.get(id)?.name ?? id) : "");
  const choices = choicesByLevel(character);

  // The list as it is, or as the drop proposed. Anything below the divider is
  // hidden while the queue is closed — unless a drag is under way, which opens it
  // so there is somewhere to drop.
  const committed = rows.map((row) => row.key);
  const keys = pending ?? committed;
  const planned = open || dragging || Boolean(pending);
  const dividerAt = keys.indexOf(DIVIDER_KEY);
  const visible = planned ? keys : keys.slice(0, dividerAt + 1);
  const entries: ReorderEntry[] = visible.flatMap((key) => {
    const row = byKey.get(key);
    if (!row) return [];
    return [
      {
        key,
        class: row.class,
        label: row.kind === "divider" ? "the planned divider" : `${className(row.class)} ${row.classLevel}`,
        className: className(row.class),
        classLevel: row.classLevel,
      },
    ];
  });

  const queuedCount = rows.filter((row) => row.kind === "planned" && row.stored).length;
  const summary = [
    queuedCount ? `${queuedCount} queued` : undefined,
    ...[...classLevels(build).entries()].map(([id, n]) => `${className(id)} ${n + 1}+`),
  ]
    .filter(Boolean)
    .join(" · ");

  const hpDefaults = (): Record<string, HpChoice> => {
    const out: Record<string, HpChoice> = {};
    for (const row of rows) if (row.class && !(row.class in out)) out[row.class] = defaultHpFor(index, row.class, plugin.settings.defaultHp);
    return out;
  };

  const drop = (order: string[]): void => {
    const next = orderFromKeys(order, rows);
    if (next.active < 1) return;
    const outcome = change(
      { type: "reorder", order: next.order, active: next.active, hp: hpDefaults() },
      { onClose: () => setPending(undefined) },
    );
    if (outcome === "asking") setPending(order);
  };

  const renderItem = (entry: ReorderEntry, ctx: { order: string[] }): ReactNode => {
    const row = byKey.get(entry.key);
    if (!row) return null;
    if (row.kind === "divider") {
      return (
        <DividerRow
          open={planned}
          summary={summary}
          toggle={features.plannedOpen ? undefined : () => setOpen((v) => !v)}
          queued={queuedCount}
        />
      );
    }
    // Where the card sits in the order right now: above the divider it is a level
    // with a number, below it it is queued. Mid-drag this is not where it started.
    const at = ctx.order.indexOf(entry.key);
    const divider = ctx.order.indexOf(DIVIDER_KEY);
    const above = at < divider;
    const number = at + 1;

    if (pending) return <PendingRow entry={entry} number={above ? number : undefined} />;

    if (row.kind === "level" && row.index !== undefined)
      return (
        <LevelCard
          index={row.index}
          store={store}
          character={character}
          choices={choices.get(row.index) ?? []}
          nameOf={nameOf}
          displayNumber={above ? number : null}
        />
      );
    if (row.class && row.classLevel !== undefined)
      return (
        <PlannedCard
          store={store}
          character={character}
          classId={row.class}
          classLevel={row.classLevel}
          displayNumber={above ? number : undefined}
        />
      );
    return null;
  };

  const renderGhost = (entry: ReorderEntry, ctx: { order: string[] }): ReactNode => {
    if (entry.key === DIVIDER_KEY) {
      const now = activeCount(ctx.order);
      const before = activeCount(committed);
      return (
        <div className="dg-ghost-card is-divider">
          <strong>Planned</strong>
          <span className="dg-level-chip">
            Level {before} → {now}
          </span>
        </div>
      );
    }
    const at = ctx.order.indexOf(entry.key);
    const above = at < ctx.order.indexOf(DIVIDER_KEY);
    return (
      <div className={above ? "dg-ghost-card" : "dg-ghost-card is-planned"}>
        <strong>{above ? `Level ${at + 1}` : `${entry.className} ${entry.classLevel}`}</strong>
        {above ? (
          <span className="dg-level-chip">
            {entry.className} {entry.classLevel}
          </span>
        ) : (
          <span className="dg-level-chip is-planned">planned</span>
        )}
      </div>
    );
  };

  return (
    <DragFoldContext.Provider value={dragging}>
      {build.levels.length === 0 ? <p className="dg-muted">No levels yet. Add one to begin.</p> : null}
      <ReorderList
        entries={entries}
        locked={Boolean(pending)}
        renderItem={renderItem}
        renderGhost={renderGhost}
        onReorder={drop}
        onActiveChange={setDragging}
      />
      {planned ? (
        <>
          <PlannedStaged store={store} character={character} count={shown} />
          <button className="dg-level-button is-multiclass" onClick={() => setShown((n) => n + PLANNED_PAGE)}>
            Show more levels
          </button>
        </>
      ) : null}
      <LevelButtons store={store} character={character} />
    </DragFoldContext.Provider>
  );
}

/** The divider card. Its handle is the list's; the toggle is where the queue folds away. */
function DividerRow({
  open,
  summary,
  toggle,
  queued,
}: {
  open: boolean;
  summary: string;
  toggle?: () => void;
  queued: number;
}): ReactNode {
  const body = (
    <>
      <span className="dg-divider-label">Planned</span>
      <span className="dg-muted dg-divider-summary">{open && !toggle ? (queued ? `${queued} queued` : "") : summary}</span>
      {toggle ? (
        <span className="dg-choice-chevron" aria-hidden="true">
          {open ? "⌃" : "⌄"}
        </span>
      ) : null}
    </>
  );
  return toggle ? (
    <button className="dg-planned-divider dg-planned-toggle" onClick={toggle} aria-expanded={open}>
      {body}
    </button>
  ) : (
    <div className="dg-planned-divider">{body}</div>
  );
}

/** A card shown as only its header, while a confirmation holds the proposed order. */
function PendingRow({ entry, number }: { entry: ReorderEntry; number?: number }): ReactNode {
  return (
    <div className={number === undefined ? "dg-ghost-card is-planned" : "dg-ghost-card"}>
      <strong>{number === undefined ? `${entry.className} ${entry.classLevel}` : `Level ${number}`}</strong>
      <span className={number === undefined ? "dg-level-chip is-planned" : "dg-level-chip"}>
        {number === undefined ? "planned" : `${entry.className} ${entry.classLevel}`}
      </span>
    </div>
  );
}
