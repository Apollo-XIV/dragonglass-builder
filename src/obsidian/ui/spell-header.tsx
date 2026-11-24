/**
 * The Spells page's header: one stat set per distinct (ability, save DC, attack) and, when
 * the character casts as more than one source, the chips that narrow the page to one.
 * Both layouts render it; the grouping and filtering are `core/resolver/spell-sources`.
 */

import { Fragment, type ReactNode } from "react";
import { explainStat } from "../../core/resolver/explain";
import { ALL_SOURCES, setStat, type SpellSource, type StatSet } from "../../core/resolver/spell-sources";
import { ChipRow } from "./builder/chips";
import { useSheet } from "./narrow/sheet";
import { ReadRow, RollBox, TextBody } from "./narrow/targets";

export function SpellHeader({ sets, proficiency }: { sets: StatSet[]; proficiency: number }): ReactNode {
  return (
    <div className="dg-sp-header">
      {sets.map((set) => (
        <StatSetCard key={set.key} set={set} proficiency={proficiency} />
      ))}
    </div>
  );
}

function StatSetCard({ set, proficiency }: { set: StatSet; proficiency: number }): ReactNode {
  const sheet = useSheet();
  const dc = setStat(set, "dc", proficiency);
  const attack = setStat(set, "attack", proficiency);
  return (
    <section className="dg-sp-set">
      <div className="dg-sp-set-label">
        {set.names.map((name, i) => (
          <Fragment key={name}>
            {i > 0 ? <span className="dg-sp-sep"> + </span> : null}
            <span className="dg-sp-set-name">{name}</span>
          </Fragment>
        ))}
        <span className="dg-sp-sep"> · </span>
        <span className="dg-sp-set-ability">{set.ability.toUpperCase()}</span>
      </div>
      <div className="dg-sp-set-stats">
        <div className="dg-sp-cell">
          <ReadRow
            title={String(dc.value)}
            className="dg-sp-dc"
            onTap={() => {
              const current = explainStat(dc, { label: `${set.label} spell save DC` });
              sheet.open({ title: current.label, body: () => <TextBody formula={current.formula} /> });
            }}
          />
          <span className="dg-sp-caption">Save DC</span>
        </div>
        <div className="dg-sp-cell">
          <RollBox
            kind="d20"
            lead="dg-die-d20-plain"
            label={`${set.label} spell attack`}
            explanation={() => explainStat(attack, { label: `${set.label} spell attack`, kind: "d20" })}
          />
          <span className="dg-sp-caption">Attack</span>
        </div>
      </div>
    </section>
  );
}

/** Shown only when there is more than one source to choose between. */
export function SourceChips({
  sources,
  active,
  onPick,
}: {
  sources: SpellSource[];
  active: string;
  onPick: (id: string) => void;
}): ReactNode {
  if (sources.length < 2) return null;
  return (
    <ChipRow
      chips={[{ id: ALL_SOURCES, label: "All" }, ...sources.map((s) => ({ id: s.id, label: s.name }))]}
      active={active}
      onPick={onPick}
    />
  );
}
