/**
 * The pieces a layout opts into (`BuilderFeatures`). Each is written once, here,
 * and mounted by the shared sections when the layout's flag is on.
 */

import { useState, type ReactNode } from "react";
import { levelForXp, setLevelHp } from "../../../../core/resolver/levels";
import { averageForDie, maxForDie } from "../../../../core/resolver/spellslots";
import type { HpChoice } from "../../../../core/types";
import type { CharacterStore } from "../../../character-store";
import { Pill } from "../../components";
import { usePlugin } from "../../context";

/** A level's hit points: the die's maximum, its average, or what was rolled. */
export function LevelHp({ store, index, classId }: { store: CharacterStore; index: number; classId: string }): ReactNode {
  const level = store.data.build?.levels[index];
  if (!level) return null;
  const die = String((store.index?.get(classId) as { hitDie?: string } | undefined)?.hitDie ?? "d8");
  const set = (hp: HpChoice): void => store.mutateBuild((b) => setLevelHp(b, index, hp));

  // The character's first level is always the die's maximum, so there is nothing to choose.
  if (index === 0) {
    return (
      <div className="dg-hp-choice">
        <span>HP</span> <span>Maximum ({maxForDie(die)})</span>
        <span className="dg-muted"> · first level of the character</span>
      </div>
    );
  }

  return (
    <div className="dg-hp-choice">
      <label>
        HP
        <select
          className="dg-select is-inline"
          value={typeof level.hp === "number" ? "roll" : level.hp}
          onChange={(e) =>
            set(
              e.currentTarget.value === "roll"
                ? typeof level.hp === "number"
                  ? level.hp
                  : averageForDie(die)
                : (e.currentTarget.value as "max" | "average"),
            )
          }
        >
          <option value="max">Maximum ({maxForDie(die)})</option>
          <option value="average">Average ({averageForDie(die)})</option>
          <option value="roll">Rolled</option>
        </select>
      </label>
      {typeof level.hp === "number" ? (
        <input
          type="number"
          min={1}
          max={maxForDie(die)}
          value={level.hp}
          onChange={(e) => set(Math.min(maxForDie(die), Math.max(1, Number(e.currentTarget.value) || 1)))}
        />
      ) : null}
    </div>
  );
}

export function XpHint({ xp, level }: { xp: number; level: number }): ReactNode {
  const earned = levelForXp(xp);
  if (earned <= level) return null;
  return (
    <p>
      <Pill tone="info">
        {xp} XP is enough for level {earned}. Add a level when your table is ready.
      </Pill>
    </p>
  );
}

export function EnforceToggle(): ReactNode {
  const { plugin } = usePlugin();
  const [on, setOn] = useState(plugin.settings.enforceRequirements);
  return (
    <>
      <label className="dg-toggle">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            plugin.settings.enforceRequirements = e.currentTarget.checked;
            setOn(e.currentTarget.checked);
            void plugin.saveSettings();
          }}
        />
        Enforce prerequisites
      </label>
      <p className="dg-muted">
        With enforcement off every option stays selectable and unmet prerequisites show as a warning. With it on,
        options whose prerequisites are not met are hidden.
      </p>
    </>
  );
}

