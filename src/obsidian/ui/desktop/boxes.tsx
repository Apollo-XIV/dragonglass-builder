/**
 * The three standing boxes under the identity column: Skills, Senses and
 * Proficiencies. All three are lists that are read far more often than they are
 * touched, which is why they stay on screen rather than living behind a tab.
 */

import type { ReactNode } from "react";
import { explainParts, explainSet, explainStat } from "../../../core/resolver/explain";
import type { ResolvedCharacter } from "../../../core/resolver/resolved";
import type { CharacterStore } from "../../character-store";
import { Icon, signed } from "../components";
import { prettyPath } from "../sheet-panels";
import { ReadTarget, RollTarget, useHoverCard } from "./targets";

export function Box({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className={["dg-d-box", className].filter(Boolean).join(" ")}>
      <h3 className="dg-d-box-title">{title}</h3>
      <div className="dg-d-box-body">{children}</div>
    </section>
  );
}

/**
 * One row per skill: the proficiency pip, the name, its ability, and the total.
 * The pip has four states — none, half, proficient, expertise — because Jack of
 * All Trades is a thing a bard needs to see at a glance.
 */
export function SkillsBox({ character }: { character: ResolvedCharacter }): ReactNode {
  return (
    <Box title="Skills" className="dg-d-skills">
      {character.skills.map((skill) => (
        <div className="dg-d-skill" key={skill.key}>
          <ProficiencyPip level={skill.stat.proficiency} />
          <span className="dg-d-skill-name">{skill.name}</span>
          <span className="dg-d-skill-ability">{skill.ability.toUpperCase()}</span>
          <RollTarget
            className="dg-d-skill-value"
            label={`${skill.name} check`}
            explanation={() => explainStat(skill.stat, { label: skill.name, kind: "d20" })}
          >
            {signed(skill.stat.value)}
          </RollTarget>
        </div>
      ))}
    </Box>
  );
}

export function ProficiencyPip({ level }: { level?: string }): ReactNode {
  const state = level === "expertise" ? "expertise" : level === "half" ? "half" : level ? "proficient" : "none";
  return <span className={`dg-d-pip is-${state}`} title={state === "none" ? "Not proficient" : state} aria-hidden="true" />;
}

/**
 * Passive scores first, since they are the ones a DM asks for, then the special
 * senses with their ranges.
 */
export function SensesBox({ character }: { character: ResolvedCharacter }): ReactNode {
  const passives = character.skills.filter((s) => ["perception", "investigation", "insight"].some((k) => s.key.endsWith(k)));
  const senses = Object.entries(character.senses).filter(([, stat]) => stat.value > 0);

  return (
    <Box title="Senses" className="dg-d-senses">
      <span className="dg-d-group-label">Passive</span>
      {passives.map((skill) => (
        <div className="dg-d-sense" key={skill.key}>
          <span className="dg-d-sense-name">{skill.name}</span>
          <ReadTarget
            className="dg-d-sense-value"
            label={`Passive ${skill.name}`}
            explanation={() =>
              // Passive is 10 plus the skill, so the breakdown has to say that
              // rather than print the active check's rows under a passive total.
              explainParts({
                label: `Passive ${skill.name}`,
                parts: [
                  { label: "Passive base", amount: 10 },
                  { label: skill.name, amount: skill.stat.value },
                ],
              })
            }
          >
            {skill.passive}
          </ReadTarget>
        </div>
      ))}
      {senses.map(([name, stat]) => (
        <div className="dg-d-sense" key={name}>
          <span className="dg-d-sense-name">
            <Icon name="eye" />
            {prettyPath(name)}
          </span>
          <ReadTarget
            className="dg-d-sense-value"
            label={prettyPath(name)}
            explanation={() => explainStat(stat, { label: prettyPath(name) })}
          >
            {stat.value} ft
          </ReadTarget>
        </div>
      ))}
      {!senses.length ? <p className="dg-d-empty">No special senses.</p> : null}
    </Box>
  );
}

/** The order a character sheet prints them in, then anything a source adds. */
const PROFICIENCY_GROUPS = [
  { path: "proficiencies.armor", label: "Armour" },
  { path: "proficiencies.weapon", label: "Weapons" },
  { path: "proficiencies.tool", label: "Tools" },
  { path: "languages", label: "Languages" },
];

export function ProficienciesBox({
  character,
  store,
}: {
  character: ResolvedCharacter;
  store: CharacterStore;
}): ReactNode {
  const nameOf = (id: string): string => store.index?.get(id)?.name ?? prettyPath(id);
  const extra = Object.keys(character.sets)
    .filter(
      (path) =>
        path.startsWith("proficiencies.") &&
        !PROFICIENCY_GROUPS.some((g) => g.path === path) &&
        (character.sets[path]?.values.length ?? 0) > 0,
    )
    .map((path) => ({ path, label: prettyPath(path) }));

  const groups = [...PROFICIENCY_GROUPS, ...extra].filter((group) => character.sets[group.path]);

  return (
    <Box title="Proficiencies" className="dg-d-profs">
      {groups.map((group) => {
        const stat = character.sets[group.path];
        return (
          <ProficiencyGroup
            key={group.path}
            label={group.label}
            values={stat.values.map(nameOf)}
            explain={() => explainSet(stat, group.label)}
          />
        );
      })}
      {!groups.length ? <p className="dg-d-empty">Nothing yet.</p> : null}
    </Box>
  );
}

function ProficiencyGroup({
  label,
  values,
  explain,
}: {
  label: string;
  values: string[];
  explain: () => ReturnType<typeof explainSet>;
}): ReactNode {
  const { handlers, card } = useHoverCard(() => {
    const explanation = explain();
    return (
      <>
        <p className="dg-d-hovercard-formula">{label}</p>
        <ul className="dg-d-hovercard-rows">
          {explanation.rows.map((row, i) => (
            <li key={i}>
              <span>{row.value}</span>
              <span>{row.source ?? ""}</span>
            </li>
          ))}
        </ul>
      </>
    );
  });
  return (
    <>
      <div className="dg-d-prof-group" {...handlers}>
        <span className="dg-d-group-label">{label}</span>
        <span className="dg-d-group-values">
          {values.length ? values.join(", ") : <span className="dg-d-empty">none</span>}
        </span>
      </div>
      {card}
    </>
  );
}
