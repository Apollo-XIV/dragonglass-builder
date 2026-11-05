/**
 * The ability scores and saving throws as the desktop lays them out: six tiles
 * with the check under the score, then a row of save pills with the proficiency
 * pip. The narrow sheet uses the same arrangement, so the two only differ in the
 * gesture a target answers to.
 *
 * The target is passed in rather than chosen here, because it is the one thing
 * that differs: a desktop click and hover are not a phone's tap and hold.
 */

import type { ReactNode } from "react";
import { explainStat, type Explanation } from "../../core/resolver/explain";
import type { ResolvedCharacter } from "../../core/resolver/resolved";
import { ABILITIES, type Ability } from "../../core/types";
import { signed } from "./components";

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

/** A rollable number, as each layout's own target component provides it. */
export type AbilityTarget = (props: {
  explanation: () => Explanation;
  label: string;
  className?: string;
  children: ReactNode;
}) => ReactNode;

export function AbilityBlock({ character, Target }: { character: ResolvedCharacter; Target: AbilityTarget }): ReactNode {
  return (
    <>
      <Divider>Abilities</Divider>
      <div className="dg-d-abilities">
        {ABILITIES.map((ability) => {
          const block = character.abilities[ability];
          return (
            <Target
              key={ability}
              className="dg-d-ability"
              label={`${ABILITY_NAMES[ability]} check`}
              explanation={() => explainStat(block.check, { label: `${ABILITY_NAMES[ability]} check`, kind: "d20" })}
            >
              <span className="dg-d-value">{signed(block.check.value)}</span>
              <span className="dg-d-label">
                {ability.toUpperCase()} {block.score.value}
              </span>
            </Target>
          );
        })}
      </div>

      <Divider>Saves</Divider>
      <div className="dg-d-saves">
        {ABILITIES.map((ability) => {
          const save = character.abilities[ability].save;
          const proficient = Boolean(save.proficiency);
          return (
            <Target
              key={ability}
              className={proficient ? "dg-d-save is-proficient" : "dg-d-save"}
              label={`${ABILITY_NAMES[ability]} save`}
              explanation={() => explainStat(save, { label: `${ABILITY_NAMES[ability]} save`, kind: "d20" })}
            >
              <span className={proficient ? "dg-d-pip is-on" : "dg-d-pip"} aria-hidden="true" />
              <span className="dg-d-save-name">{ability.toUpperCase()}</span>
              <span className="dg-d-save-value">{signed(save.value)}</span>
            </Target>
          );
        })}
      </div>
    </>
  );
}

function Divider({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="dg-d-divider">
      <span>{children}</span>
    </div>
  );
}
