/** The six starting ability scores, and the stepper that point buy puts behind them. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ABILITIES, type Ability } from "../../../../core/types";
import type { ResolvedCharacter } from "../../../../core/resolver/resolved";
import type { CharacterStore } from "../../../character-store";
import { Icon } from "../../components";
import {
  bonusSources,
  bonusText,
  pointsSpentOn,
  rulesFor,
  stepScore,
  type Direction,
  type Peek,
  type StepIntent,
} from "../ability-stepper";
import { createHoldGesture } from "../hold-gesture";
import { useBuilderFeatures } from "../features";
import { ScoreTile } from "../score-tile";

export function AbilityTiles({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const features = useBuilderFeatures();
  const [selected, setSelected] = useState<Ability | null>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const build = store.data.build;
  if (!build) return null;

  const rules = rulesFor(build.abilities.method);
  // Switching out of a pool method fills every score, but a hand-edited file may not have.
  const base = Object.fromEntries(ABILITIES.map((a) => [a, build.abilities.base[a] ?? rules.min])) as Record<Ability, number>;
  const spent = pointsSpentOn(rules, ABILITIES.map((a) => base[a]));

  // The one stepper every input calls: commits, peeks or drops a peek.
  const step = (ability: Ability, direction: Direction, intent: StepIntent): void => {
    const result = stepScore(rules, { value: base[ability], spent }, direction, peek, intent);
    setPeek(result.peek);
    if (result.commit !== undefined) commit(ability, result.commit);
  };
  const commit = (ability: Ability, value: number): void => {
    store.mutateBuild((b) => ({
      ...b,
      abilities: { ...b.abilities, base: { ...base, ...b.abilities.base, [ability]: value } },
    }));
  };

  return (
    <>
      <div className="dg-n-ability-grid">
        {ABILITIES.map((ability) => {
          const block = character.abilities[ability];
          const sources = bonusSources(block.score.breakdown);
          return (
            <ScoreTile
              key={ability}
              label={ability.toUpperCase()}
              value={base[ability]}
              total={block.score.value}
              modifier={block.mod}
              bonus={block.score.value - base[ability]}
              bonusText={bonusText(sources)}
              selected={selected === ability}
              peek={selected === ability && peek ? { ...peek, id: `${peek.direction}${peek.label}` } : undefined}
              onSelect={() => {
                setSelected(ability);
                if (selected !== ability) setPeek(null);
              }}
              onDeselect={() => {
                setSelected((s) => (s === ability ? null : s));
                setPeek(null);
              }}
              onStep={(direction, intent) => step(ability, direction, intent)}
              onPeekEnd={() => setPeek(null)}
              onEdit={rules.peek ? undefined : (value) => commit(ability, value)}
              min={rules.min}
              max={rules.max}
            />
          );
        })}
      </div>
      {features.abilityStepButtons && selected ? (
        <StepButtons
          onStep={(direction, intent) => step(selected, direction, intent)}
          onPeekEnd={() => setPeek(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Minus and plus, fixed to the bottom of the screen so they stay put as the selection
 * moves between tiles. A tap steps; a press held down peeks. They must not take focus, or
 * the tile would deselect.
 */
function StepButtons({
  onStep,
  onPeekEnd,
}: {
  onStep: (direction: Direction, intent: StepIntent) => void;
  onPeekEnd: () => void;
}): ReactNode {
  const latest = useRef(onStep);
  latest.current = onStep;
  const latestEnd = useRef(onPeekEnd);
  latestEnd.current = onPeekEnd;
  const gesture = useRef<ReturnType<typeof createHoldGesture<Direction>> | null>(null);
  gesture.current ??= createHoldGesture<Direction>(
    (d) => latest.current(d, "step"),
    (d) => latest.current(d, "peek"),
    () => latestEnd.current(),
  );
  useEffect(() => () => gesture.current?.cancel(), []);

  const button = (direction: Direction, name: string, icon: string): ReactNode => (
    <button
      className="dg-ability-step dg-ability-step-button"
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault();
        gesture.current?.press(name, direction);
      }}
      onPointerUp={() => gesture.current?.release(name, direction)}
      onPointerCancel={() => gesture.current?.cancel()}
      onPointerLeave={() => gesture.current?.cancel()}
      // Keyboard activation has no pointer to press and release.
      onClick={(e) => {
        if (e.detail === 0) onStep(direction, "step");
      }}
    >
      <Icon name={icon} />
      <span className="dg-sr-only">{name}</span>
    </button>
  );
  return (
    <div className="dg-ability-stepbar">
      <div
        className="dg-ability-stepbar-guard"
        // A near miss lands here: swallow it, so the tile keeps focus and the next try works.
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={(e) => e.preventDefault()}
      >
        {button(-1, "Lower score", "minus")}
        {button(1, "Raise score", "plus")}
      </div>
    </div>
  );
}
