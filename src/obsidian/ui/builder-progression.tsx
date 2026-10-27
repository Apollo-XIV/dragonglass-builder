/**
 * The class and subclass progression browser.
 *
 * This fixes a frustration with Aurora Builder, where looking ahead meant setting
 * level 20, browsing, then levelling back down. It is strictly read-only: it reads
 * the content directly and never touches the character.
 */

import { useMemo, useState, type ReactNode } from "react";
import type {
  ChoiceDef,
  ClassElement,
  Element,
  Grant,
  LevelEntry,
  Modifier,
} from "../../core/types";
import type { ContentIndex } from "../../core/content";
import { describeRequirement } from "../../core/content/requirements";
import type { CharacterStore } from "../character-store";
import { Empty, Markdown, Pill, Section } from "./components";

export function ProgressionBrowser({ store }: { store: CharacterStore }): ReactNode {
  const index = store.index;
  const classes = index?.byKind("class") ?? [];
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [subclassId, setSubclassId] = useState("");
  const [mode, setMode] = useState<"timeline" | "page">("timeline");

  const cls = index?.get(classId) as ClassElement | undefined;
  const subclasses = useMemo(() => {
    if (!index || !cls) return [];
    // A subclass declares its class, or carries the class's subclass tag.
    return index
      .byKind("subclass")
      .filter((sub) => sub.class === cls.id || subclassTagsFor(cls, index).some((tag) => sub.tags?.includes(tag)));
  }, [index, cls]);

  const subclass = subclassId ? index?.get(subclassId) : undefined;

  if (!index || !classes.length) return <Empty>No classes in the loaded sources.</Empty>;

  return (
    <>
      <Section
        title="Browse a class"
        action={
          <span className="dg-filters">
            <select className="dg-select is-inline" value={classId} onChange={(e) => { setClassId(e.target.value); setSubclassId(""); }}>
              {classes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <select className="dg-select is-inline" value={subclassId} onChange={(e) => setSubclassId(e.target.value)}>
              <option value="">No subclass</option>
              {subclasses.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <select className="dg-select is-inline" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="timeline">Timeline</option>
              <option value="page">View source</option>
            </select>
          </span>
        }
      >
        <p className="dg-muted">
          Read-only. Nothing here changes your character, so you can look ahead to level 20 and come back.
        </p>
      </Section>

      {cls ? (
        mode === "timeline" ? (
          <Timeline cls={cls} subclass={subclass} index={index} />
        ) : (
          <SourcePage cls={cls} subclass={subclass} index={index} />
        )
      ) : null}
    </>
  );
}

function subclassTagsFor(cls: Element, index: ContentIndex): string[] {
  // The subclass choice point names the tag it filters on; read it off the class.
  const tags: string[] = [];
  const levels = (cls as ClassElement).levels ?? {};
  for (const entry of Object.values(levels))
    for (const choice of entry.choices ?? [])
      if (choice.from.kind === "subclass" || (Array.isArray(choice.from.kind) && choice.from.kind.includes("subclass")))
        tags.push(...(choice.from.tags ?? []));
  void index;
  return tags;
}

function Timeline({
  cls,
  subclass,
  index,
}: {
  cls: ClassElement;
  subclass?: Element;
  index: ContentIndex;
}): ReactNode {
  const levels = Array.from({ length: 20 }, (_, i) => i + 1);
  const classLevels = cls.levels ?? {};
  const subLevels = (subclass as ClassElement | undefined)?.levels ?? {};
  const tables = { ...(cls.tables ?? {}), ...((subclass as ClassElement | undefined)?.tables ?? {}) };
  const columns = Object.keys(tables);

  return (
    <Section title={`${cls.name}${subclass ? ` · ${subclass.name}` : ""}`}>
      <p className="dg-muted">
        Hit die {String(cls.hitDie)}
        {cls.spellcasting
          ? ` · ${cls.spellcasting.progression} caster (${cls.spellcasting.ability.toUpperCase()}, ${cls.spellcasting.type}), from level ${cls.spellcasting.startsAt ?? 1}`
          : ""}
      </p>
      {cls.multiclassRequires ? (
        <p>
          <Pill tone="info">Multiclass: {describeRequirement(cls.multiclassRequires)}</Pill>
        </p>
      ) : null}

      <ol className="dg-timeline">
        {levels.map((level) => {
          const entry = classLevels[String(level)];
          const subEntry = subLevels[String(level)];
          const empty = !entry && !subEntry;
          return (
            <li key={level} className={empty ? "dg-timeline-level is-empty" : "dg-timeline-level"}>
              <div className="dg-timeline-level-head">
                <strong>Level {level}</strong>
                {columns
                  .map((column) => ({ column, value: tableValue(tables[column] as TableColumn, level) }))
                  .filter((c) => c.value !== undefined && c.value !== null)
                  .map((c) => (
                    <Pill key={c.column}>
                      {c.column.replace(/-/g, " ")} {String(c.value)}
                    </Pill>
                  ))}
              </div>
              {entry ? <LevelEntryView entry={entry} index={index} owner={cls.name} /> : null}
              {subEntry ? <LevelEntryView entry={subEntry} index={index} owner={subclass?.name ?? "Subclass"} /> : null}
              {empty ? <span className="dg-muted">—</span> : null}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

type TableColumn = (number | string | null)[] | Record<string, number | string | null>;

function tableValue(column: TableColumn | undefined, level: number): unknown {
  if (!column) return undefined;
  return Array.isArray(column) ? column[level - 1] : column[String(level)];
}

function LevelEntryView({
  entry,
  index,
  owner,
}: {
  entry: LevelEntry;
  index: ContentIndex;
  owner: string;
}): ReactNode {
  return (
    <div className="dg-timeline-entry">
      <span className="dg-muted">{owner}</span>
      {(entry.grants ?? []).length > 0 && (
        <ul className="dg-inline-list">
          {(entry.grants ?? []).map((grant) => (
            <GrantChip key={grantId(grant)} grant={grant} index={index} />
          ))}
        </ul>
      )}
      {(entry.choices ?? []).map((choice) => (
        <ChoicePreview key={choice.id} choice={choice} index={index} />
      ))}
      {(entry.modifiers ?? []).length > 0 && <ModifierList modifiers={entry.modifiers ?? []} />}
      {entry.text ? <Markdown source={entry.text} /> : null}
    </div>
  );
}

function grantId(grant: Grant): string {
  return typeof grant === "string" ? grant : grant.id;
}

function GrantChip({ grant, index }: { grant: Grant; index: ContentIndex }): ReactNode {
  const id = grantId(grant);
  const element = index.get(id);
  const [open, setOpen] = useState(false);
  if (!element)
    return (
      <li>
        <Pill tone="warn">{id} not loaded</Pill>
      </li>
    );
  return (
    <li>
      <button className="dg-link" onClick={() => setOpen((v) => !v)}>
        {element.name}
      </button>
      {open && typeof element.text === "string" ? <Markdown source={element.text} /> : null}
    </li>
  );
}

/** A choice point expands to show its options, such as every Fighting Style. */
function ChoicePreview({ choice, index }: { choice: ChoiceDef; index: ContentIndex }): ReactNode {
  const [open, setOpen] = useState(false);
  const options = index.query(choice.from);
  return (
    <div className="dg-choice-preview">
      <button className="dg-link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {choice.name ?? `Choose ${choice.count}`} ({options.length} options)
      </button>
      {open ? (
        <ul className="dg-option-list is-readonly">
          {options.map((option) => (
            <li key={option.id}>
              <strong>{option.name}</strong>
              {option.requires ? <Pill tone="info">{describeRequirement(option.requires)}</Pill> : null}
              {typeof option.text === "string" ? <Markdown source={option.text} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ModifierList({ modifiers }: { modifiers: Modifier[] }): ReactNode {
  return (
    <ul className="dg-modifier-list">
      {modifiers.map((mod, i) => (
        <li key={i}>
          {mod.target} {mod.op}
          {mod.value !== undefined ? ` ${Array.isArray(mod.value) ? mod.value.join(", ") : mod.value}` : ""}
          {mod.when ? <span className="dg-muted"> ({mod.when.text})</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** A mimic of the sourcebook page, built from the class's own features. */
function SourcePage({
  cls,
  subclass,
  index,
}: {
  cls: ClassElement;
  subclass?: Element;
  index: ContentIndex;
}): ReactNode {
  const owners: Element[] = subclass ? [cls, subclass] : [cls];
  const featureIds: { id: string; level: number; owner: string }[] = [];
  for (const owner of owners)
    for (const [level, entry] of Object.entries((owner as ClassElement).levels ?? {}))
      for (const grant of entry.grants ?? [])
        featureIds.push({ id: grantId(grant), level: Number(level), owner: owner.name });

  featureIds.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));

  return (
    <article className="dg-source-page">
      <h1>{cls.name}</h1>
      {typeof cls.text === "string" ? <Markdown source={cls.text} /> : null}
      {subclass ? (
        <>
          <h2>{subclass.name}</h2>
          {typeof subclass.text === "string" ? <Markdown source={subclass.text} /> : null}
        </>
      ) : null}
      <h2>Class features</h2>
      {featureIds.map(({ id, level, owner }) => {
        const element = index.get(id);
        if (!element) return null;
        // A spell granted as an oath spell isn't a feature heading; list it inline.
        if (element.kind === "spell") return null;
        return (
          <section key={`${id}-${level}`}>
            <h3>
              {element.name}
              <span className="dg-muted">
                {" "}
                · {owner}, level {level}
              </span>
            </h3>
            {typeof element.text === "string" ? (
              <Markdown source={element.text} />
            ) : (
              <p className="dg-muted">No rules text in the source.</p>
            )}
          </section>
        );
      })}
    </article>
  );
}
