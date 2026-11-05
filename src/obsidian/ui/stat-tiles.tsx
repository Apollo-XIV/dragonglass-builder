/**
 * The four small numbers on the desktop's stat cluster: speed, armour class,
 * initiative and proficiency. The narrow overview draws the same tiles, so the
 * two only differ in the gesture a number answers to.
 *
 * The targets are passed in, as the abilities' are: a click and a hover are not
 * a tap and a hold.
 */

import type { ReactNode } from "react";
import { explainStat, type Explanation } from "../../core/resolver/explain";
import type { ResolvedCharacter } from "../../core/resolver/resolved";
import { Icon, signed } from "./components";
import { prettyPath } from "./sheet-panels";

/** A number that is read rather than rolled. */
export type ReadStatTarget = (props: {
  explanation?: () => Explanation;
  label: string;
  className?: string;
  children: ReactNode;
}) => ReactNode;

/** A number that is rolled. */
export type RollStatTarget = (props: {
  explanation: () => Explanation;
  label: string;
  className?: string;
  children: ReactNode;
}) => ReactNode;

/**
 * The value fills everything above the label and centres in it, so the number
 * sits in the middle of the box whatever the label's height, and the label is
 * pinned to the bottom edge. `extra` sits under the value, inside that centred
 * area, so a secondary line does not push the main number off centre.
 */
export function Tile({
  label,
  icon,
  wide,
  extra,
  children,
}: {
  label: string;
  icon?: string;
  wide?: boolean;
  extra?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={wide ? "dg-d-tile is-wide" : "dg-d-tile"}>
      <div className="dg-d-tile-value">
        {children}
        {extra}
      </div>
      <span className="dg-d-label">
        {icon ? <Icon name={icon} /> : null}
        {label}
      </span>
    </div>
  );
}

export function SpeedTile({ character, Read }: { character: ResolvedCharacter; Read: ReadStatTarget }): ReactNode {
  const walk = character.speed.walk;
  const others = Object.entries(character.speed).filter(([name, stat]) => name !== "walk" && stat.value > 0);
  return (
    <Tile
      label="Speed"
      icon="footprints"
      extra={
        others.length ? (
          <span className="dg-d-tile-extra">
            {others.map(([name, stat]) => (
              <span key={name}>
                {prettyPath(name).toLowerCase()} {stat.value}
              </span>
            ))}
          </span>
        ) : undefined
      }
    >
      <Read label="Walking speed" explanation={walk ? () => explainStat(walk, { label: "Walking speed" }) : undefined}>
        <span className="dg-d-value">{walk?.value ?? 0}</span>
        <span className="dg-d-unit">ft</span>
      </Read>
    </Tile>
  );
}

export function ArmourTile({ character, Read }: { character: ResolvedCharacter; Read: ReadStatTarget }): ReactNode {
  return (
    <Tile label="AC" icon="shield">
      <Read label="Armour Class" explanation={() => explainStat(character.ac, { label: "Armour Class" })}>
        <span className="dg-d-value">{character.ac.value}</span>
      </Read>
    </Tile>
  );
}

export function InitiativeTile({ character, Roll }: { character: ResolvedCharacter; Roll: RollStatTarget }): ReactNode {
  return (
    <Tile label="Init." icon="dg-d20">
      <Roll label="Initiative" explanation={() => explainStat(character.initiative, { label: "Initiative", kind: "d20" })}>
        <span className="dg-d-value">{signed(character.initiative.value)}</span>
      </Roll>
    </Tile>
  );
}

export function ProficiencyTile({ character, Read }: { character: ResolvedCharacter; Read: ReadStatTarget }): ReactNode {
  return (
    <Tile label="Prof." icon="award">
      <Read
        label="Proficiency bonus"
        explanation={() => explainStat(character.proficiencyBonus, { label: "Proficiency bonus" })}
      >
        <span className="dg-d-value">{signed(character.proficiencyBonus.value)}</span>
      </Read>
    </Tile>
  );
}
