/** Origin: species, background, ability scores, and the choices they bring. */

import { type ReactNode } from "react";
import { inactivePicks } from "../../../../core/resolver/validity";
import type {
  PendingChoice,
  ResolvedCharacter,
} from "../../../../core/resolver/resolved";
import {
  ABILITIES,
  type Ability,
  type BuildFile,
} from "../../../../core/types";
import type { CharacterStore } from "../../../character-store";
import { usePlugin } from "../../context";
import { useSheet } from "../../narrow/sheet";
import { InactivePickRow, useBuildChange } from "../changes";
import { useBuilderFeatures } from "../features";
import {
  optionsFor,
  POINT_BUY_BUDGET,
  pointsSpent,
  STANDARD_ARRAY,
} from "../model";
import { usePicker, usePickerSlot } from "../picker";

/** A row that opens a choice sheet: label, current selection or "Choose", chevron. */
export function ChoiceRow({
  label,
  value,
  empty,
  invalid,
  onOpen,
}: {
  label: string;
  value?: string;
  /** Dashed accent border, for a decision still to make (spec 7.3). */
  empty?: boolean;
  invalid?: string;
  onOpen: () => void;
}): ReactNode {
  const slot = usePickerSlot();
  return (
    <>
      <button
        className={empty ? "dg-choice-row is-empty" : "dg-choice-row"}
        onClick={() => slot.open(onOpen)}
      >
        <span className="dg-choice-main">
          <span className="dg-choice-label">{label}</span>
          <span
            className={
              value ? "dg-choice-value" : "dg-choice-value is-placeholder"
            }
          >
            {value ?? "Choose"}
          </span>
          {invalid ? (
            <span className="dg-choice-invalid">Invalid — {invalid}</span>
          ) : null}
        </span>
        <span className="dg-choice-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      {slot.node}
    </>
  );
}

/** One pending choice as a row plus its sheet. */
export function PendingChoiceRow({
  choice,
  store,
  nameOf,
}: {
  choice: PendingChoice;
  store: CharacterStore;
  nameOf: (id: string) => string;
}): ReactNode {
  const picker = usePicker();
  const { plugin } = usePlugin();
  const change = useBuildChange(store);
  const chosen = choice.chosen.map(nameOf).join(", ");

  const write = (ids: string[]): void =>
    change({
      type: "choice",
      choiceId: choice.id,
      scope: choice.scope,
      levelIndex: choice.levelIndex,
      chosen: ids,
    });

  return (
    <ChoiceRow
      label={choice.name}
      value={chosen || undefined}
      empty={!choice.complete}
      invalid={
        choice.invalid.length
          ? choice.invalid.map(nameOf).join(", ")
          : undefined
      }
      onOpen={() =>
        picker({
          title: choice.name,
          subtitle: `${choice.sourceName}${choice.count > 1 ? ` · choose ${choice.count}` : ""}`,
          options: optionsFor(choice),
          selected: choice.chosen,
          count: choice.count,
          repeatable: choice.definition.repeatable,
          maxPer: choice.definition.maxPer,
          enforce: plugin.settings.enforceRequirements,
          onCommit: write,
          extra: choice.chosen.length
            ? { label: "Clear", onClick: () => write([]) }
            : undefined,
        })
      }
    />
  );
}

export function OriginSection({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const picker = usePicker();
  const sheet = useSheet();
  const { plugin } = usePlugin();
  const change = useBuildChange(store);
  const index = store.index;
  const build = store.data.build;
  if (!build || !index)
    return <p className="dg-muted">No build.5e in this character's folder.</p>;

  const nameOf = (id: string): string => index.get(id)?.name ?? id;
  const elementPicker = (
    kind: string,
    title: string,
    current: string | undefined,
    write: (id?: string) => void,
  ): void =>
    picker({
      title,
      options: index.byKind(kind).map((element) => ({
        id: element.id,
        name: element.name,
        text: typeof element.text === "string" ? element.text : undefined,
        tag: index.abbreviation(element.source),
      })),
      selected: current ? [current] : [],
      count: 1,
      enforce: plugin.settings.enforceRequirements,
      onCommit: (ids) => write(ids[0]),
      extra: current
        ? { label: "Clear", onClick: () => write(undefined) }
        : undefined,
    });

  return (
    <>
      <ChoiceRow
        label="Species"
        value={character.species?.name}
        empty={!character.species}
        onOpen={() =>
          elementPicker("species", "Species", build.species, (id) =>
            change({ type: "species", id }),
          )
        }
      />
      <ChoiceRow
        label="Background"
        value={character.background?.name}
        empty={!character.background}
        onOpen={() =>
          elementPicker("background", "Background", build.background, (id) =>
            change({ type: "background", id }),
          )
        }
      />

      <div className="dg-n-ability-grid">
        {ABILITIES.map((ability) => {
          const block = character.abilities[ability];
          const bonus = block.score.value - build.abilities.base[ability];
          return (
            <button
              key={ability}
              className="dg-n-ability"
              onClick={() =>
                sheet.open({
                  title: "Ability scores",
                  subtitle: build.abilities.method.replace("-", " "),
                  body: () => (
                    <AbilityEditor store={store} character={character} />
                  ),
                })
              }
            >
              <span className="dg-n-ability-name">{ability.toUpperCase()}</span>
              <span className="dg-n-ability-total">{block.score.value}</span>
              <span className="dg-n-ability-score">
                {build.abilities.base[ability]}
                {bonus ? ` ${bonus > 0 ? "+" : "−"}${Math.abs(bonus)}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {character.pendingChoices
        .filter((choice) => choice.scope === "build")
        .map((choice) => (
          <PendingChoiceRow
            key={choice.id}
            choice={choice}
            store={store}
            nameOf={nameOf}
          />
        ))}

      {inactivePicks(index, build)
        .filter((pick) => pick.scope === "build")
        .map((pick) => (
          <InactivePickRow
            key={pick.choiceId}
            pick={pick}
            store={store}
            nameOf={nameOf}
          />
        ))}
    </>
  );
}

function AbilityEditor({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const build = store.data.build;
  if (!build) return null;
  const features = useBuilderFeatures();
  const base = build.abilities.base;
  const spent = pointsSpent(base, ABILITIES);
  const pointBuyValid = ABILITIES.every((a) => base[a] >= 8 && base[a] <= 15);

  const set = (ability: Ability, value: number): void =>
    store.mutateBuild((b) => ({
      ...b,
      abilities: {
        ...b.abilities,
        base: {
          ...b.abilities.base,
          [ability]: Math.min(30, Math.max(1, value)),
        },
      },
    }));

  return (
    <>
      <select
        className="dg-select"
        value={build.abilities.method}
        onChange={(e) =>
          store.mutateBuild((b) => ({
            ...b,
            abilities: {
              ...b.abilities,
              method: e.target.value as BuildFile["abilities"]["method"],
            },
          }))
        }
      >
        <option value="point-buy">Point buy</option>
        <option value="standard-array">Standard array</option>
        <option value="rolled">Rolled</option>
        <option value="manual">Manual</option>
      </select>
      {build.abilities.method === "point-buy" ? (
        <p
          className={
            spent > POINT_BUY_BUDGET ||
            (features.abilityInputs && !pointBuyValid)
              ? "dg-warn"
              : "dg-muted"
          }
        >
          {spent} of {POINT_BUY_BUDGET} points spent
          {features.abilityInputs && !pointBuyValid
            ? " · point buy expects base scores from 8 to 15"
            : ""}
        </p>
      ) : null}
      {features.abilityInputs && build.abilities.method === "standard-array" ? (
        <p className="dg-muted">
          Assign {STANDARD_ARRAY.join(", ")} across the six abilities.
        </p>
      ) : null}
      {ABILITIES.map((ability) => {
        const block = character.abilities[ability];
        return (
          <div className="dg-score-row" key={ability}>
            <span className="dg-n-ability-name">{ability.toUpperCase()}</span>
            <button
              onClick={() => set(ability, base[ability] - 1)}
              aria-label={`Lower ${ability}`}
            >
              −
            </button>
            {features.abilityInputs ? (
              <input
                type="number"
                min={1}
                max={30}
                className="dg-score-input"
                value={base[ability]}
                onChange={(e) =>
                  set(ability, Number(e.currentTarget.value) || 1)
                }
              />
            ) : (
              <span className="dg-score-value">{base[ability]}</span>
            )}
            <button
              onClick={() => set(ability, base[ability] + 1)}
              aria-label={`Raise ${ability}`}
            >
              +
            </button>
            <span className="dg-muted">
              → {block.score.value} (
              {block.mod >= 0 ? `+${block.mod}` : block.mod})
            </span>
          </div>
        );
      })}
    </>
  );
}
