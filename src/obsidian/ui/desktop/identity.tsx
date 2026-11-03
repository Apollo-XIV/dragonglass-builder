/**
 * The identity column (desktop spec): six ability tiles, a row of save pills, and
 * the situational notes that come off the features' conditional modifiers.
 *
 * The saves repeat their ability because they reflow: at a narrower width the
 * pills no longer line up under their tiles, and "CON +2" still reads where a
 * bare "+2" would not.
 */

import type { ReactNode } from "react";
import { explainStat } from "../../../core/resolver/explain";
import type { Annotation, NumericStat, ResolvedCharacter } from "../../../core/resolver/resolved";
import { ABILITIES, type Ability } from "../../../core/types";
import { Icon, signed } from "../components";
import { RollTarget, useHoverCard } from "./targets";

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export function IdentityColumn({ character }: { character: ResolvedCharacter }): ReactNode {
  return (
    <div className="dg-d-identity-col">
      <Divider>Abilities</Divider>
      <div className="dg-d-abilities">
        {ABILITIES.map((ability) => {
          const block = character.abilities[ability];
          return (
            <RollTarget
              key={ability}
              className="dg-d-ability"
              label={`${ABILITY_NAMES[ability]} check`}
              explanation={() =>
                explainStat(block.check, { label: `${ABILITY_NAMES[ability]} check`, kind: "d20" })
              }
            >
              <span className="dg-d-value">{signed(block.check.value)}</span>
              <span className="dg-d-label">
                {ability.toUpperCase()} {block.score.value}
              </span>
            </RollTarget>
          );
        })}
      </div>

      <Divider>Saves</Divider>
      <div className="dg-d-saves">
        {ABILITIES.map((ability) => {
          const save = character.abilities[ability].save;
          const proficient = Boolean(save.proficiency);
          return (
            <RollTarget
              key={ability}
              className={proficient ? "dg-d-save is-proficient" : "dg-d-save"}
              label={`${ABILITY_NAMES[ability]} save`}
              explanation={() => explainStat(save, { label: `${ABILITY_NAMES[ability]} save`, kind: "d20" })}
            >
              <span className={proficient ? "dg-d-pip is-on" : "dg-d-pip"} aria-hidden="true" />
              <span className="dg-d-save-name">{ability.toUpperCase()}</span>
              <span className="dg-d-save-value">{signed(save.value)}</span>
            </RollTarget>
          );
        })}
      </div>

      <SituationalNotes character={character} />
    </div>
  );
}

function Divider({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="dg-d-divider">
      <span>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Situational notes
// ---------------------------------------------------------------------------

interface Note {
  /** "A", "D", "+2": what the badge says. */
  badge: string;
  /** Whether the badge is a d20 marker or a plain number. */
  dice: boolean;
  tone: "advantage" | "disadvantage" | "modifier";
  /** "on CON saves", "against being charmed". */
  text: string;
  source: string;
}

/**
 * Every conditional modifier the character has, as one line each. They are
 * generated, not authored: the resolver already keeps a modifier with a `when`
 * apart from the arithmetic, and this is that list read out loud.
 *
 * One feature usually annotates several stats at once — a dwarf's poison
 * resilience lands on all six saves — so identical annotations are collapsed and
 * their scopes summarised. Without that, a level 1 dwarf opens with six lines
 * that all say the same thing.
 */
export function situationalNotes(character: ResolvedCharacter): Note[] {
  const groups = new Map<string, { annotation: Annotation; scopes: string[]; keys: string[] }>();

  const add = (annotation: Annotation, scope: string, key: string): void => {
    const id = `${annotation.op}|${String(annotation.value ?? "")}|${annotation.when.text}|${annotation.source}`;
    const group = groups.get(id) ?? { annotation, scopes: [], keys: [] };
    group.scopes.push(scope);
    group.keys.push(key);
    groups.set(id, group);
  };

  for (const ability of ABILITIES) {
    const name = ability.toUpperCase();
    for (const annotation of character.abilities[ability].save.annotations) add(annotation, `${name} saves`, "save");
    for (const annotation of character.abilities[ability].check.annotations) add(annotation, `${name} checks`, "check");
  }
  for (const skill of character.skills)
    for (const annotation of skill.stat.annotations) add(annotation, skill.name, `skill:${skill.name}`);
  for (const [stat, scope] of [
    [character.ac, "AC"],
    [character.initiative, "initiative"],
  ] as [NumericStat, string][])
    for (const annotation of stat.annotations) add(annotation, scope, scope);

  return [...groups.values()].map(({ annotation, scopes, keys }) => {
    const tone =
      annotation.op === "advantage" ? "advantage" : annotation.op === "disadvantage" ? "disadvantage" : "modifier";
    const every = (kind: string): boolean => keys.filter((k) => k === kind).length === ABILITIES.length;
    const where = every("save") ? "saves" : every("check") ? "ability checks" : scopes.join(", ");
    // A `when` that already names what it applies to ("on History checks about
    // stonework") would otherwise be prefixed with that name twice over.
    const mentions = annotation.when.text.toLowerCase().includes(where.toLowerCase().split(",")[0]);
    const text = mentions ? annotation.when.text : `on ${where} ${annotation.when.text}`.trim();
    return {
      badge: badgeFor(annotation, tone),
      dice: tone !== "modifier",
      tone,
      text,
      source: annotation.sourceName,
    };
  });
}

/** "A" and "D" for the dice, a signed number for a bonus, an initial for a proficiency. */
function badgeFor(annotation: Annotation, tone: Note["tone"]): string {
  if (tone === "advantage") return "A";
  if (tone === "disadvantage") return "D";
  if (annotation.op === "proficiency") {
    const level = String(annotation.value ?? "");
    return level === "expertise" ? "E" : level === "half" ? "½" : "P";
  }
  if (typeof annotation.value === "number") return signed(annotation.value);
  return String(annotation.value ?? annotation.op);
}

function SituationalNotes({ character }: { character: ResolvedCharacter }): ReactNode {
  const notes = situationalNotes(character);
  if (!notes.length) return null;
  return (
    <ul className="dg-d-notes">
      {notes.map((note, i) => (
        <NoteLine key={i} note={note} />
      ))}
    </ul>
  );
}

function NoteLine({ note }: { note: Note }): ReactNode {
  const { handlers, card } = useHoverCard(() => (
    <p className="dg-d-hovercard-formula">
      {note.badge === "A" ? "Advantage" : note.badge === "D" ? "Disadvantage" : note.badge} {note.text} — {note.source}
    </p>
  ));
  return (
    <>
      <li className={`dg-d-note is-${note.tone}`} {...handlers}>
        <span className="dg-d-note-badge">
          {note.dice ? <Icon name="dg-d20" /> : null}
          {note.badge}
        </span>
        <em>{note.text}</em>
      </li>
      {card}
    </>
  );
}
