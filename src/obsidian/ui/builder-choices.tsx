/**
 * Choice rendering. Every choice the content declares becomes a plain options
 * select. If the content declares requirements, a toggle enforces them; with
 * enforcement off, unmet requirements show as a warning on the option rather than
 * hiding it.
 */

import { useState, type ReactNode } from "react";
import type { ChoiceOption, PendingChoice, ResolvedCharacter } from "../../core/resolver/resolved";
import type { BuildFile } from "../../core/types";
import type { CharacterStore } from "../character-store";
import { usePlugin } from "./context";
import { Empty, Markdown, Pill, Section } from "./components";

/** Writes a choice's answer to the place the resolver says it belongs. */
export function writeChoice(store: CharacterStore, choice: PendingChoice, chosen: string[]): void {
  store.mutateBuild((build: BuildFile) => {
    if (choice.scope === "level" && choice.levelIndex !== undefined) {
      const levels = build.levels.map((level, i) =>
        i === choice.levelIndex
          ? { ...level, choices: pruned({ ...(level.choices ?? {}), [choice.id]: chosen }) }
          : level,
      );
      // A pick that used to live in the global map moves with it, so it isn't applied twice.
      const choices = { ...(build.choices ?? {}) };
      delete choices[choice.id];
      return { ...build, levels, choices };
    }
    return { ...build, choices: pruned({ ...(build.choices ?? {}), [choice.id]: chosen }) };
  });
}

function pruned(choices: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, picks] of Object.entries(choices)) if (picks.length) out[id] = picks;
  return out;
}

export function ChoicePicker({ choice, store }: { choice: PendingChoice; store: CharacterStore }): ReactNode {
  const { plugin } = usePlugin();
  const [expanded, setExpanded] = useState<string | undefined>();
  const chosen = choice.chosen;
  const multi = choice.count > 1;

  const toggle = (id: string): void => {
    if (chosen.includes(id)) {
      writeChoice(store, choice, chosen.filter((c) => c !== id));
      return;
    }
    if (multi) {
      // Picking past the count replaces the oldest pick, so the control never wedges.
      const next = [...chosen, id].slice(-choice.count);
      writeChoice(store, choice, next);
    } else {
      writeChoice(store, choice, [id]);
    }
  };

  return (
    <div className={choice.complete ? "dg-choice is-complete" : "dg-choice"}>
      <div className="dg-choice-head">
        <strong>{choice.name}</strong>
        <span className="dg-muted">
          {chosen.length} / {choice.count} · {choice.sourceName}
          {choice.level ? ` (level ${choice.level})` : ""}
        </span>
        {choice.complete ? <Pill tone="info">done</Pill> : <Pill tone="warn">outstanding</Pill>}
      </div>

      {choice.definition.text ? <Markdown source={choice.definition.text} /> : null}

      {choice.blocked ? (
        <Pill tone="warn">Prerequisite not met: {choice.blockedReason}</Pill>
      ) : null}

      {choice.invalid.length > 0 ? (
        <Pill tone="warn">
          {choice.invalid.map((id) => store.index?.get(id)?.name ?? id).join(", ")} no longer fits this choice. The
          pick is kept until you change it.
        </Pill>
      ) : null}

      {choice.options.length === 0 ? (
        <Empty>No options in the loaded sources match this choice.</Empty>
      ) : (
        <ul className="dg-option-list">
          {choice.options.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              selected={chosen.includes(option.id)}
              multi={multi}
              enforced={plugin.settings.enforceRequirements}
              expanded={expanded === option.id}
              onExpand={() => setExpanded(expanded === option.id ? undefined : option.id)}
              onToggle={() => toggle(option.id)}
              overriddenBy={store.index?.overrideFor(option.id)?.winner}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function OptionRow({
  option,
  selected,
  multi,
  enforced,
  expanded,
  onExpand,
  onToggle,
  overriddenBy,
}: {
  option: ChoiceOption;
  selected: boolean;
  multi: boolean;
  enforced: boolean;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  overriddenBy?: string;
}): ReactNode {
  return (
    <li className={option.allowed ? "dg-option" : "dg-option is-warned"}>
      <div className="dg-option-head">
        <label>
          <input
            type={multi ? "checkbox" : "radio"}
            checked={selected}
            disabled={enforced && !option.allowed}
            onChange={onToggle}
          />
          {option.name}
        </label>
        {option.abbreviation ? (
          <Pill>
            {option.abbreviation}
            {option.page ? ` ${option.page}` : ""}
          </Pill>
        ) : null}
        {overriddenBy ? <Pill tone="info">overridden by {overriddenBy}</Pill> : null}
        {!option.allowed ? <Pill tone="warn">needs {option.warnings.join(", ")}</Pill> : null}
        {option.text ? (
          <button className="dg-link" onClick={onExpand} aria-expanded={expanded}>
            {expanded ? "less" : "more"}
          </button>
        ) : null}
      </div>
      {expanded && option.text ? <Markdown source={option.text} /> : null}
      {expanded && option.tags.length ? (
        <div className="dg-tags">
          {option.tags.map((tag) => (
            <span className="dg-tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/** Everything still to choose, read straight from the resolver. */
export function PendingChoiceList({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const { plugin } = usePlugin();
  const [showComplete, setShowComplete] = useState(false);
  const outstanding = character.pendingChoices.filter((c) => !c.complete);
  const complete = character.pendingChoices.filter((c) => c.complete);
  const shown = showComplete ? character.pendingChoices : outstanding;

  return (
    <>
      <Section
        title="Enforcement"
        action={
          <label className="dg-toggle">
            <input
              type="checkbox"
              checked={plugin.settings.enforceRequirements}
              onChange={(e) => {
                plugin.settings.enforceRequirements = e.currentTarget.checked;
                void plugin.saveSettings();
              }}
            />
            Enforce prerequisites
          </label>
        }
      >
        <p className="dg-muted">
          With enforcement off, every option stays selectable and unmet prerequisites show as a warning. With it
          on, options whose prerequisites aren't met are hidden.
        </p>
      </Section>

      <Section
        title={`Choices (${outstanding.length} outstanding)`}
        action={
          complete.length ? (
            <label className="dg-toggle">
              <input type="checkbox" checked={showComplete} onChange={(e) => setShowComplete(e.currentTarget.checked)} />
              Show completed
            </label>
          ) : null
        }
      >
        {shown.length === 0 ? <Empty>Nothing left to choose.</Empty> : null}
        {shown.map((choice) => (
          <ChoicePicker key={`${choice.id}-${choice.levelIndex ?? "build"}`} choice={choice} store={store} />
        ))}
      </Section>
    </>
  );
}
