/**
 * The pieces a layout opts into (`BuilderFeatures`). Each is written once, here,
 * and mounted by the shared sections when the layout's flag is on.
 */

import { useState, type ReactNode } from "react";
import { appendInventoryEntry } from "../../../../core/inventory";
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

/**
 * A custom item uses the same element format as source content, so a homemade +1
 * shield can carry real modifiers. The player never types JSON.
 */
export function CustomItemForm({ store, close }: { store: CharacterStore; close: () => void }): ReactNode {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState(0);
  const [target, setTarget] = useState("ac");
  const [op, setOp] = useState<"add" | "base" | "min">("add");
  const [value, setValue] = useState("1");
  const [requiresEquipped, setRequiresEquipped] = useState(true);
  const [notes, setNotes] = useState("");
  const paths = store.index?.allStatPaths() ?? [];

  const create = (): void => {
    const file = store.data.inventory ?? { kind: "inventory" as const, schemaVersion: 1, items: [] };
    const id = `custom:item:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "item"}`;
    store.update(
      "inventory",
      appendInventoryEntry(file, {
          item: {
            id,
            kind: "item",
            name: name || "Custom item",
            source: "custom",
            weight,
            requiresEquipped,
            text: notes || undefined,
            modifiers: value.trim() ? [{ target, op, value: value.trim() }] : undefined,
          },
          quantity: 1,
          equipped: false,
        }),
    );
    close();
  };

  return (
    <div className="dg-wizard">
      <label className="dg-field">
        <span>Name</span>
        <input type="text" value={name} onChange={(e) => setName(e.currentTarget.value)} />
      </label>
      <label className="dg-field">
        <span>Weight (lb)</span>
        <input type="number" min={0} value={weight} onChange={(e) => setWeight(Number(e.currentTarget.value))} />
      </label>
      <label className="dg-field">
        <span>Changes</span>
        <select className="dg-select is-inline" value={target} onChange={(e) => setTarget(e.currentTarget.value)}>
          {paths.map((path) => (
            <option key={path.key} value={path.key.replace("*", "walk")}>
              {path.label ?? path.key}
            </option>
          ))}
        </select>
        <select className="dg-select is-inline" value={op} onChange={(e) => setOp(e.currentTarget.value as typeof op)}>
          <option value="add">add</option>
          <option value="base">base (competes, highest wins)</option>
          <option value="min">at least</option>
        </select>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          placeholder="1 or an expression"
        />
      </label>
      <label className="dg-field">
        <span>Only while equipped</span>
        <input type="checkbox" checked={requiresEquipped} onChange={(e) => setRequiresEquipped(e.currentTarget.checked)} />
      </label>
      <label className="dg-field">
        <span>Description</span>
        <textarea className="dg-textarea" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} rows={3} />
      </label>
      <div className="dg-sheet-actions">
        <button className="dg-sheet-button" onClick={close}>
          Cancel
        </button>
        <button className="dg-sheet-button is-primary" onClick={create} disabled={!name.trim()}>
          Add to inventory
        </button>
      </div>
    </div>
  );
}
