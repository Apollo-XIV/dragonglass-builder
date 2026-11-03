/** Planned: the levels still to come, so a build can be laid out ahead of taking it. */

import { useState, type ReactNode } from "react";
import { classLevels, plannedFor, setPlannedChoice } from "../../../../core/resolver/levels";
import type { ResolvedCharacter } from "../../../../core/resolver/resolved";
import type { Element } from "../../../../core/types";
import type { CharacterStore } from "../../../character-store";
import { ChipRow } from "../chips";
import { InfoRow } from "../detail";
import { PLANNED_PAGE, upcomingStaged, type LevelEntryShape } from "../model";
import { usePicker } from "../picker";
import { ChoiceRow } from "./origin";

export function PlannedSection({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PLANNED_PAGE);
  const [filter, setFilter] = useState("all");
  const index = store.index;
  const build = store.data.build;
  if (!build || !index) return null;

  const taken = [...classLevels(build).entries()];
  const queued = build.planned?.length ?? 0;
  const summary = `${queued} queued · ${taken.map(([id, n]) => `${index.get(id)?.name ?? id} ${n + 1}+`).join(", ")}`;

  const chips = [{ id: "all", label: "All" }, ...taken.map(([id]) => ({ id, label: index.get(id)?.name ?? id }))];
  const classes = filter === "all" ? taken : taken.filter(([id]) => id === filter);

  return (
    <>
      <button className="dg-planned-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{open ? "Hide planned levels" : summary}</span>
        <span className="dg-choice-chevron" aria-hidden="true">
          {open ? "⌃" : "⌄"}
        </span>
      </button>

      {open ? (
        <>
          {taken.length > 1 ? <ChipRow chips={chips} active={filter} onPick={setFilter} /> : null}
          {classes.map(([classId, level]) => (
            <PlannedClass
              key={classId}
              store={store}
              classId={classId}
              from={level + 1}
              count={shown}
              character={character}
            />
          ))}
          {filter === "all" ? <PlannedStaged store={store} character={character} count={shown} /> : null}
          <button className="dg-level-button is-multiclass" onClick={() => setShown((n) => n + PLANNED_PAGE)}>
            Show more levels
          </button>
        </>
      ) : null}
    </>
  );
}

function PlannedClass({
  store,
  classId,
  from,
  count,
  character,
}: {
  store: CharacterStore;
  classId: string;
  from: number;
  count: number;
  character: ResolvedCharacter;
}): ReactNode {
  const index = store.index;
  const build = store.data.build;
  if (!index || !build) return null;

  const cls = index.get(classId) as (Element & { levels?: Record<string, LevelEntryShape> }) | undefined;
  const subclassId = character.classes.find((c) => c.id === classId)?.subclass?.id;
  const subclass = subclassId
    ? (index.get(subclassId) as (Element & { levels?: Record<string, LevelEntryShape> }) | undefined)
    : undefined;
  if (!cls) return null;

  const levels: number[] = [];
  for (let level = from; level <= 20 && levels.length < count; level++) {
    if (cls.levels?.[String(level)] || subclass?.levels?.[String(level)]) levels.push(level);
  }

  return (
    <>
      {levels.map((level) => (
        <div className="dg-level-card is-planned" key={`${classId}-${level}`}>
          <div className="dg-level-card-head">
            <strong>
              {cls.name} {level}
            </strong>
            <span className="dg-level-chip is-planned">planned</span>
          </div>
          {[cls.levels?.[String(level)], subclass?.levels?.[String(level)]].filter(Boolean).map((entry, i) => (
            <PlannedEntry
              key={i}
              entry={entry as LevelEntryShape}
              store={store}
              classId={classId}
              classLevel={level}
            />
          ))}
        </div>
      ))}
      {levels.length === 0 ? <p className="dg-muted">No further levels in the loaded data.</p> : null}
    </>
  );
}

function PlannedStaged({
  store,
  character,
  count,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  count: number;
}): ReactNode {
  const index = store.index;
  const build = store.data.build;
  if (!index || !build) return null;

  const cards = upcomingStaged(character.elements, build.levels?.length ?? 0, count);
  if (cards.length === 0) return null;

  return (
    <>
      {cards.map(({ owner, level, entry }) => (
        <div className="dg-level-card is-planned" key={`${owner.id}-${level}`}>
          <div className="dg-level-card-head">
            <strong>
              {owner.name} · level {level}
            </strong>
            <span className="dg-level-chip is-planned">planned</span>
          </div>
          {(entry.grants ?? []).map((grant) => {
            const id = typeof grant === "string" ? grant : grant.id;
            const element = index.get(id);
            return (
              <InfoRow
                key={id}
                title={element?.name ?? id}
                subtitle="look ahead"
                text={typeof element?.text === "string" ? element.text : undefined}
                className="dg-level-feature"
              />
            );
          })}
          {entry.text ? <p className="dg-muted">{entry.text}</p> : null}
        </div>
      ))}
    </>
  );
}

function PlannedEntry({
  entry,
  store,
  classId,
  classLevel,
}: {
  entry: LevelEntryShape;
  store: CharacterStore;
  classId: string;
  classLevel: number;
}): ReactNode {
  const index = store.index;
  const picker = usePicker();
  const build = store.data.build;
  if (!index || !build) return null;

  const planned = plannedFor(build, classId, classLevel);

  return (
    <>
      {(entry.grants ?? []).map((grant) => {
        const id = typeof grant === "string" ? grant : grant.id;
        const element = index.get(id);
        return (
          <InfoRow
            key={id}
            title={element?.name ?? id}
            subtitle="look ahead"
            text={typeof element?.text === "string" ? element.text : undefined}
            className="dg-level-feature"
          />
        );
      })}

      {(entry.choices ?? []).map((choice) => {
        const chosen = planned?.choices[choice.id] ?? [];
        const options = index.query(choice.from);
        return (
          <ChoiceRow
            key={choice.id}
            label={choice.name ?? `Choose ${choice.count ?? 1}`}
            value={chosen.map((id) => index.get(id)?.name ?? id).join(", ") || undefined}
            empty={chosen.length === 0}
            onOpen={() =>
              picker({
                title: choice.name ?? "Choose",
                subtitle: "planned, applies when you reach it",
                options: options.map((option) => ({
                  id: option.id,
                  name: option.name,
                  text: typeof option.text === "string" ? option.text : undefined,
                  tag: index.abbreviation(option.source),
                })),
                selected: chosen,
                count: choice.count ?? 1,
                onCommit: (ids) =>
                  store.mutateBuild((b) => setPlannedChoice(b, classId, classLevel, choice.id, ids)),
                extra: chosen.length
                  ? {
                      label: "Clear",
                      onClick: () =>
                        store.mutateBuild((b) => setPlannedChoice(b, classId, classLevel, choice.id, [])),
                    }
                  : undefined,
              })
            }
          />
        );
      })}
    </>
  );
}
