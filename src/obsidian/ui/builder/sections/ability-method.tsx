/** The head of the starting ability scores: method, its rules, and the point-buy budget. */

import { useState, type ReactNode } from "react";
import type { BuildFile } from "../../../../core/types";
import type { CharacterStore } from "../../../character-store";
import { Icon } from "../../components";
import { Reel } from "../../reel";
import { POINT_BUY_BUDGET, pointsSpent, STANDARD_ARRAY } from "../model";

type Method = BuildFile["abilities"]["method"];

const METHODS: { id: Method; label: string; rules: string[] }[] = [
  {
    id: "point-buy",
    label: "Point buy",
    rules: [
      `You have ${POINT_BUY_BUDGET} points to spend. Every score starts at 8 and can be raised to at most 15 before bonuses.`,
      "Raising a score costs 1 point per step up to 13, then 2 points per step: 14 costs 7 in total and 15 costs 9.",
    ],
  },
  {
    id: "standard-array",
    label: "Standard array",
    rules: [
      `Take ${STANDARD_ARRAY.join(", ")} and assign each number to one ability. Each number is used exactly once.`,
    ],
  },
  {
    id: "rolled",
    label: "Rolled",
    rules: [
      "Roll four six-sided dice for each ability, drop the lowest die and add the other three. Do this six times and assign the totals as you like.",
    ],
  },
  {
    id: "manual",
    label: "Manual",
    rules: [
      "Enter any score you like for each ability, with no limits or budget. Use it for 3d6 down the line, a rolled array from your table or a homebrew method.",
    ],
  },
];

export function AbilityMethod({ store }: { store: CharacterStore }): ReactNode {
  const [helping, setHelping] = useState(false);
  const build = store.data.build;
  if (!build) return null;
  const method = build.abilities.method;
  const current = METHODS.find((m) => m.id === method) ?? METHODS[0]!;
  const spent = pointsSpent(build.abilities.base, Object.keys(build.abilities.base));

  return (
    <div className="dg-ability-method">
      <h3 className="dg-ability-heading">Starting Ability Scores</h3>
      <div className="dg-ability-method-row">
        <select
          className="dg-select"
          value={method}
          onChange={(e) =>
            store.mutateBuild((b) => ({
              ...b,
              abilities: { ...b.abilities, method: e.target.value as Method },
            }))
          }
        >
          {METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          className="dg-ability-help dg-ability-help-button"
          aria-expanded={helping}
          onClick={() => setHelping((v) => !v)}
        >
          <Icon name="circle-help" />
          <span className="dg-sr-only">How {current.label.toLowerCase()} works</span>
        </button>
      </div>
      {helping ? (
        <div className="dg-ability-rules">
          {current.rules.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      {method === "point-buy" ? (
        <div className="dg-ability-budget">
          <span className={`dg-ability-budget-text${spent > POINT_BUY_BUDGET ? " dg-warn" : ""}`}>
            <Reel value={spent} />/{POINT_BUY_BUDGET} allocated
          </span>
          <div className="dg-ability-budget-track">
            <div
              className={`dg-ability-budget-fill${spent > POINT_BUY_BUDGET ? " is-over" : ""}`}
              style={{ width: `${Math.min(100, (spent / POINT_BUY_BUDGET) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
