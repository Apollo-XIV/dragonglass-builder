/** Levels: the card for a level taken, and the buttons that take the next. */

import { type ReactNode } from "react";
import {
  changesStartingClass,
  classLevelAt,
  classLevels,
  normalisedQueue,
} from "../../../../core/resolver/levels";
import { factsOf } from "../../../../core/content/facts";
import { inactivePicks } from "../../../../core/resolver/validity";
import type {
  PendingChoice,
  ResolvedCharacter,
  ResolvedElement,
} from "../../../../core/resolver/resolved";
import type { CharacterStore } from "../../../character-store";
import { usePlugin } from "../../context";
import { UI } from "../../narrow/constants";
import { useSheet } from "../../narrow/sheet";
import { InactivePickRow, useBuildChange } from "../changes";
import { InfoRow } from "../detail";
import { useBuilderStop } from "../nav";
import { defaultHpFor, multiclassNote } from "../model";
import { useBuilderFeatures } from "../features";
import { usePicker, usePickerSlot } from "../picker";
import { useCardShown } from "../reorder/fold";
import { LevelHp } from "./extras";
import { PendingChoiceRow } from "./origin";

/** The choices a character still has open, by the build level they belong to. */
export function choicesByLevel(character: ResolvedCharacter): Map<number, PendingChoice[]> {
  const byLevel = new Map<number, PendingChoice[]>();
  for (const choice of character.pendingChoices) {
    if (choice.scope !== "level" || choice.levelIndex === undefined) continue;
    const list = byLevel.get(choice.levelIndex) ?? [];
    list.push(choice);
    byLevel.set(choice.levelIndex, list);
  }
  return byLevel;
}

export function LevelCard({
  index,
  store,
  character,
  choices,
  nameOf,
  displayNumber,
}: {
  index: number;
  store: CharacterStore;
  character: ResolvedCharacter;
  choices: PendingChoice[];
  nameOf: (id: string) => string;
  /**
   * The character level to print. Defaults to the card's own place in the build;
   * mid-drag it is where the card currently sits, and `null` once it has been
   * carried below the divider.
   */
  displayNumber?: number | null;
}): ReactNode {
  const sheet = useSheet();
  const change = useBuildChange(store);
  const build = store.data.build;
  // Registered so Review can jump straight to this card, and for nothing else:
  // no rail icon (twenty icons would be a scrollbar, not a rail), and no tick or
  // detent either — on a phone a stop every card made scrolling the builder a
  // fight (spec 4.3, 7.3).
  const features = useBuilderFeatures();
  const ref = useBuilderStop(`level-${index}`);
  const shown = useCardShown();
  if (!build) return null;

  const level = build.levels[index];
  const classElement = store.index?.get(level.class);
  const classLevel = classLevelAt(build, index);
  const outstanding = choices.filter((c) => !c.complete).length;
  const chosenIds = new Set(choices.flatMap((c) => c.chosen));
  const automatic = character.elements.filter(
    (element) =>
      element.class === level.class &&
      element.level === classLevel &&
      !chosenIds.has(element.id),
  );
  // Anything staged against character level rather than a class — a species
  // trait that arrives at 5 — belongs to this card too, since this is the level
  // that brought it. Shown apart from the class's own features because it did
  // not come from the class, and a player reading the card should see which.
  const staged = character.elements.filter(
    (element) =>
      element.class === undefined &&
      element.level === index + 1 &&
      !chosenIds.has(element.id),
  );
  const inactive = store.index
    ? inactivePicks(store.index, build).filter((p) => p.levelIndex === index)
    : [];

  const remove = (): void => {
    const starting = changesStartingClass(build, index);
    sheet.open({
      title: `Remove level ${index + 1}?`,
      subtitle: starting
        ? "This is the first level, so it also changes the starting class, its proficiencies and its starting equipment."
        : `${classElement?.name ?? level.class} ${classLevel}`,
      body: () => (
        <p className="dg-muted">
          The picks made at this level are kept in Planned, so taking the level
          again restores them. Later choices that depended on them are flagged
          rather than deleted.
        </p>
      ),
      actions: () => (
        <>
          <button className="dg-sheet-button" onClick={sheet.close}>
            Keep it
          </button>
          <button
            className="dg-sheet-button is-destructive"
            onClick={() => {
              sheet.close();
              // Straight through the same pipeline, so a removal that reaches
              // later choices gets the same confirmation an edit would.
              change({ type: "remove-level", index });
            }}
          >
            Remove level
          </button>
        </>
      ),
    });
  };

  return (
    <div className="dg-level-card" ref={ref}>
      <div className="dg-level-card-head">
        {displayNumber === null ? (
          <>
            <strong>
              {classElement?.name ?? level.class} {classLevel}
            </strong>
            <span className="dg-level-chip is-planned">planned</span>
          </>
        ) : (
          <>
            <strong>Level {displayNumber ?? index + 1}</strong>
            <span className="dg-level-chip">
              {classElement?.name ?? level.class} {classLevel}
            </span>
          </>
        )}
        {outstanding ? (
          <span className="dg-level-todo">{outstanding} to choose</span>
        ) : null}
        <button
          className="dg-level-remove"
          onClick={remove}
          aria-label={`Remove level ${index + 1}`}
        >
          ×
        </button>
      </div>

      {features.levelHp && shown ? (
        <LevelHp store={store} index={index} classId={level.class} />
      ) : null}

      {!shown ? null : automatic.length ? (
        <div className="dg-level-features">
          {automatic.map((feature) => (
            <FeatureChip key={feature.id} feature={feature} />
          ))}
        </div>
      ) : null}

      {shown && staged.length ? (
        <div className="dg-level-features is-staged">
          {staged.map((feature) => (
            <FeatureChip key={feature.id} feature={feature} />
          ))}
        </div>
      ) : null}

      {(shown ? choices : []).map((choice) => (
        <PendingChoiceRow
          key={`${choice.id}-${index}`}
          choice={choice}
          store={store}
          nameOf={nameOf}
        />
      ))}

      {(shown ? inactive : []).map((pick) => (
        <InactivePickRow
          key={pick.choiceId}
          pick={pick}
          store={store}
          nameOf={nameOf}
        />
      ))}
    </div>
  );
}

/** An automatic feature: holdable for its text, no decision attached. */
function FeatureChip({ feature }: { feature: ResolvedElement }): ReactNode {
  return (
    <InfoRow
      title={feature.name}
      subtitle={feature.kind.replace(/-/g, " ")}
      text={feature.text}
      fluff={feature.fluff}
      facts={factsOf(feature.element)}
      className="dg-level-feature"
    />
  );
}

export function LevelButtons({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const picker = usePicker();
  const slot = usePickerSlot();
  const { plugin } = usePlugin();
  const change = useBuildChange(store);
  const index = store.index;
  const build = store.data.build;
  if (!build || !index) return null;

  const taken = [...classLevels(build).keys()];
  const queued = new Set(normalisedQueue(build).map((entry) => entry.class));
  const hpFor = (classId: string): "max" | "average" | number =>
    defaultHpFor(index, classId, plugin.settings.defaultHp);

  // Adding a level leaves the scroll where it is (spec 7.5). The button is at
  // the bottom of the levels, so the new card appears right where the player is
  // already looking; carrying them to it read as the view jumping ahead of them.
  const add = (classId: string): void => {
    change({ type: "add-level", class: classId, hp: hpFor(classId) });
  };

  const multiclass = (): void =>
    picker({
      title: "Multiclass",
      subtitle: "A new class at level 1",
      options: index
        .byKind("class")
        .filter((cls) => !taken.includes(cls.id))
        .map((cls) => ({
          id: cls.id,
          name: cls.name,
          text: typeof cls.text === "string" ? cls.text : undefined,
          fluff: typeof cls.fluff === "string" ? cls.fluff : undefined,
          tag: index.abbreviation(cls.source),
          // Shown whether or not enforcement is on: a player multiclassing into
          // a class they don't qualify for should at least be told.
          warnings: multiclassNote(cls),
          // A pick that arrives with its choices already filled in should not be a surprise.
          badge: queued.has(cls.id) ? "queued" : undefined,
        })),
      selected: [],
      count: 1,
      onCommit: (ids) => ids[0] && add(ids[0]),
    });

  return (
    <>
      <div
        className={
          taken.length === 2 ? "dg-level-buttons is-pair" : "dg-level-buttons"
        }
      >
        {taken.map((classId) => (
          <button
            key={classId}
            className="dg-level-button"
            style={{ minHeight: UI.levelButtonHeight }}
            onClick={() => add(classId)}
            disabled={build.levels.length >= 20}
          >
            + {index.get(classId)?.name ?? classId} level
          </button>
        ))}
        {taken.length === 0 ? (
          <button
            className="dg-level-button"
            style={{ minHeight: UI.levelButtonHeight }}
            onClick={() => slot.open(multiclass)}
          >
            + First class
          </button>
        ) : (
          <button
            className="dg-level-button is-multiclass"
            style={{ minHeight: UI.levelButtonHeight }}
            onClick={() => slot.open(multiclass)}
          >
            + Multiclass
          </button>
        )}
        {character.level >= 20 ? (
          <p className="dg-muted">Level 20 is as far as the rules go.</p>
        ) : null}
      </div>
      {slot.node}
    </>
  );
}
