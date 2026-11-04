/** Planned: the cards for levels still to come, which sit under the PLANNED divider. */

import { type ReactNode } from "react";
import { plannedFor, setPlannedChoice } from "../../../../core/resolver/levels";
import type { ResolvedCharacter } from "../../../../core/resolver/resolved";
import type { Element } from "../../../../core/types";
import type { CharacterStore } from "../../../character-store";
import { InfoRow } from "../detail";
import { upcomingStaged, type LevelEntryShape } from "../model";
import { useCardShown } from "../reorder/fold";
import { usePicker } from "../picker";
import { ChoiceRow } from "./origin";

/** One planned level: what it grants and the picks queued for it. */
export function PlannedCard({
  store,
  classId,
  classLevel,
  character,
  displayNumber,
}: {
  store: CharacterStore;
  classId: string;
  classLevel: number;
  character: ResolvedCharacter;
  /** Set mid-drag, once the card has been carried above the divider. */
  displayNumber?: number;
}): ReactNode {
  const index = store.index;
  const shown = useCardShown();
  if (!index) return null;

  const cls = index.get(classId) as (Element & { levels?: Record<string, LevelEntryShape> }) | undefined;
  const subclassId = character.classes.find((c) => c.id === classId)?.subclass?.id;
  const subclass = subclassId
    ? (index.get(subclassId) as (Element & { levels?: Record<string, LevelEntryShape> }) | undefined)
    : undefined;

  const entries = [cls?.levels?.[String(classLevel)], subclass?.levels?.[String(classLevel)]].filter(Boolean);

  return (
    <div className={displayNumber === undefined ? "dg-level-card is-planned" : "dg-level-card"}>
      <div className="dg-level-card-head">
        {displayNumber === undefined ? (
          <>
            <strong>
              {cls?.name ?? classId} {classLevel}
            </strong>
            <span className="dg-level-chip is-planned">planned</span>
          </>
        ) : (
          <>
            <strong>Level {displayNumber}</strong>
            <span className="dg-level-chip">
              {cls?.name ?? classId} {classLevel}
            </span>
          </>
        )}
      </div>
      {shown
        ? entries.map((entry, i) => (
            <PlannedEntry key={i} entry={entry as LevelEntryShape} store={store} classId={classId} classLevel={classLevel} />
          ))
        : null}
      {shown && entries.length === 0 ? <p className="dg-muted">Nothing new at this level.</p> : null}
    </div>
  );
}

export function PlannedStaged({
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
