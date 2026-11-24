/** Origin: species and background with what each brings beneath it, then ability scores. */

import { type ReactNode } from "react";
import { unverifiedNotes } from "../../../../core/content/provenance";
import { grantsPreview } from "../../../../core/content/preview";
import { choiceKey, choicesIn, grantChildren } from "../../../../core/resolver/grant-tree";
import { inactivePicks } from "../../../../core/resolver/validity";
import type { Element } from "../../../../core/types";
import type { ResolvedCharacter } from "../../../../core/resolver/resolved";
import {
  ABILITIES,
  type Ability,
  type BuildFile,
} from "../../../../core/types";
import type { CharacterStore } from "../../../character-store";
import { usePlugin } from "../../context";
import { useSheet } from "../../narrow/sheet";
import { InactivePickRow, useBuildChange } from "../changes";
import { ChoiceRow, PendingChoiceRow } from "../choice-row";
import { useBuilderFeatures } from "../features";
import { GrantTree } from "../grants";
import {
  POINT_BUY_BUDGET,
  pointsSpent,
  sourceRefOf,
  STANDARD_ARRAY,
} from "../model";
import { specOf, usePicker, type PickerOption } from "../picker";
import { type DetailSpec } from "../detail";

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
  const optionOf = (element: Element): PickerOption => ({
    id: element.id,
    name: element.name,
    text: typeof element.text === "string" ? element.text : undefined,
    fluff: typeof element.fluff === "string" ? element.fluff : undefined,
    // A species' rules are the traits it grants, not its own text.
    preview: grantsPreview(element, (id) => index.get(id)),
    tag: index.abbreviation(element.source),
    source: sourceRefOf(index, element.source),
    unverified: unverifiedNotes(element),
  });
  const readingOf = (id: string | undefined): DetailSpec | undefined => {
    const element = id ? index.get(id) : undefined;
    return element && specOf(optionOf(element));
  };
  const elementPicker = (
    kind: string,
    title: string,
    current: string | undefined,
    write: (id?: string) => void,
  ): void =>
    picker({
      title,
      options: index.byKind(kind).map(optionOf),
      selected: current ? [current] : [],
      count: 1,
      enforce: plugin.settings.enforceRequirements,
      onCommit: (ids) => write(ids[0]),
      extra: current
        ? { label: "Clear", onClick: () => write(undefined) }
        : undefined,
    });

  // Everything the species and background brought sits under its own row. A choice
  // neither of them declared — a starting class's, say — still waits below the scores.
  const speciesGrants = build.species ? grantChildren(character, build.species, (id) => index.get(id)) : [];
  const backgroundGrants = build.background ? grantChildren(character, build.background, (id) => index.get(id)) : [];
  const placed = new Set(choicesIn([...speciesGrants, ...backgroundGrants]).map(choiceKey));

  return (
    <>
      <ChoiceRow
        label="Species"
        value={character.species?.name}
        empty={!character.species}
        reading={readingOf(build.species)}
        onOpen={() =>
          elementPicker("species", "Species", build.species, (id) =>
            change({ type: "species", id }),
          )
        }
      />
      <GrantTree nodes={speciesGrants} store={store} nameOf={nameOf} />
      <ChoiceRow
        label="Background"
        value={character.background?.name}
        empty={!character.background}
        reading={readingOf(build.background)}
        onOpen={() =>
          elementPicker("background", "Background", build.background, (id) =>
            change({ type: "background", id }),
          )
        }
      />
      <GrantTree nodes={backgroundGrants} store={store} nameOf={nameOf} />

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
        .filter((choice) => choice.scope === "build" && !placed.has(choiceKey(choice)))
        .map((choice) => (
          <PendingChoiceRow
            key={choiceKey(choice)}
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
