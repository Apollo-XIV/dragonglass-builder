/** Origin: species and background with what each brings beneath it, then ability scores. */

import { type ReactNode } from "react";
import { unverifiedNotes } from "../../../../core/content/provenance";
import { grantsPreview } from "../../../../core/content/preview";
import { choiceKey, choicesIn, grantChildren } from "../../../../core/resolver/grant-tree";
import { inactivePicks } from "../../../../core/resolver/validity";
import type { Element } from "../../../../core/types";
import type { ResolvedCharacter } from "../../../../core/resolver/resolved";
import type { CharacterStore } from "../../../character-store";
import { usePlugin } from "../../context";
import { InactivePickRow, useBuildChange } from "../changes";
import { ChoiceRow, PendingChoiceRow } from "../choice-row";
import { GrantTree } from "../grants";
import { sourceRefOf } from "../model";
import { specOf, usePicker, type PickerOption } from "../picker";
import { type DetailSpec } from "../detail";
import { AbilityMethod } from "./ability-method";
import { AbilityTiles } from "./ability-tiles";

export function OriginSection({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const picker = usePicker();
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

      <AbilityMethod store={store} />
      <AbilityTiles store={store} character={character} />

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
