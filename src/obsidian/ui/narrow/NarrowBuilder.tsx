/**
 * The builder in the narrow layout (spec 7): one vertical scroll in dependency
 * order, somewhere between a wizard and a freeform editor. A new player scrolls
 * down and picks as they go; an experienced one jumps with the rail.
 *
 * Nothing here knows a rule. Every choice on screen is one the content declared,
 * and every selection goes back through the resolver, which is why changing an
 * earlier level updates everything after it without this file being told.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  changesStartingClass,
  classLevelAt,
  classLevels,
  plannedFor,
  setPlannedChoice,
} from "../../../core/resolver/levels";
import { inactivePicks } from "../../../core/resolver/validity";
import type { PendingChoice, ResolvedCharacter, ResolvedElement } from "../../../core/resolver/resolved";
import { averageForDie } from "../../../core/resolver/spellslots";
import { describeRequirement } from "../../../core/content/requirements";
import {
  ABILITIES,
  type Ability,
  type BuildFile,
  type ChoiceDef,
  type Element,
  type Grant,
  type Requirement,
} from "../../../core/types";
import type { CharacterStore } from "../../character-store";
import { usePlugin } from "../context";
import { InactivePickRow, useBuildChange } from "./changes";
import { UI } from "./constants";
import { useNarrowSettings } from "./context";
import { usePicker, type PickerOption } from "./picker";
import { Rail } from "./rail";
import { NarrowScroller, useMinorStop, useScrollController, type SectionSpec } from "./scroller";
import { useSheet } from "./sheet";
import { ReadRow } from "./targets";
import { useShell } from "./platform";
import { ChipRow } from "./NarrowSheet";
import { useBuilderSession, type BuilderSession } from "./session";

const BUILDER_ICONS: Record<string, string> = {
  origin: "sprout",
  levels: "layers",
  planned: "calendar-clock",
  spells: "sparkles",
  equipment: "backpack",
  details: "user",
  review: "check-check",
};

/** How many planned levels show per class before "Show more" (spec 7.6). */
const PLANNED_PAGE = 3;

export function NarrowBuilder({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const settings = useNarrowSettings();

  const sections = useMemo(() => {
    const build = store.data.build;
    const available = new Map<string, Omit<SectionSpec, "icon">>();
    const openOrigin = character.pendingChoices.filter((c) => c.scope === "build" && !c.complete).length;
    const openLevels = character.pendingChoices.filter((c) => c.scope === "level" && !c.complete).length;

    available.set("origin", {
      id: "origin",
      label: "Origin",
      status: [character.species?.name, character.background?.name].filter(Boolean).join(" · "),
      attention: openOrigin > 0,
      body: <OriginSection store={store} character={character} />,
    });

    available.set("levels", {
      id: "levels",
      label: "Levels",
      status: `Level ${character.level} of ${character.level}`,
      attention: openLevels > 0,
      body: <LevelsSection store={store} character={character} />,
    });

    if (build?.levels?.length)
      available.set("planned", {
        id: "planned",
        label: "Planned",
        body: <PlannedSection store={store} character={character} />,
      });

    if (character.spellcasting?.classes.length)
      available.set("spells", {
        id: "spells",
        label: "Spells",
        status: `${character.spellcasting.spells.length} known`,
        body: <SpellsBuilderSection store={store} character={character} />,
      });

    available.set("equipment", {
      id: "equipment",
      label: "Equipment",
      status: `${character.inventory.length} items`,
      body: <EquipmentSection store={store} character={character} />,
    });

    available.set("details", { id: "details", label: "Details", body: <DetailsBuilderSection store={store} /> });

    available.set("review", {
      id: "review",
      label: "Review",
      status: openOrigin + openLevels > 0 ? `${openOrigin + openLevels} open` : "ready",
      body: <ReviewSection character={character} />,
    });

    const ordered: SectionSpec[] = [];
    for (const id of settings.builderSections) {
      const section = available.get(id);
      if (section) ordered.push({ ...section, icon: BUILDER_ICONS[id] ?? "circle" });
      available.delete(id);
    }
    for (const [id, section] of available) ordered.push({ ...section, icon: BUILDER_ICONS[id] ?? "circle" });
    return ordered;
  }, [store, character, settings.builderSections]);

  return (
    <NarrowScroller sections={sections} banner={<DraftBanner />}>
      <Rail sections={sections} />
    </NarrowScroller>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** A row that opens a choice sheet: label, current selection or "Choose", chevron. */
function ChoiceRow({
  label,
  value,
  empty,
  invalid,
  onOpen,
}: {
  label: string;
  value?: string;
  /** Dashed accent border, for a decision still to make (spec 7.3). */
  empty?: boolean;
  invalid?: string;
  onOpen: () => void;
}): ReactNode {
  return (
    <button className={empty ? "dg-choice-row is-empty" : "dg-choice-row"} onClick={onOpen}>
      <span className="dg-choice-main">
        <span className="dg-choice-label">{label}</span>
        <span className={value ? "dg-choice-value" : "dg-choice-value is-placeholder"}>{value ?? "Choose"}</span>
        {invalid ? <span className="dg-choice-invalid">Invalid — {invalid}</span> : null}
      </span>
      <span className="dg-choice-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function optionsFor(choice: PendingChoice): PickerOption[] {
  return choice.options.map((option) => ({
    id: option.id,
    name: option.name,
    text: option.text,
    tag: option.abbreviation,
    warnings: option.warnings,
    allowed: option.allowed,
  }));
}

/** One pending choice as a row plus its sheet. */
function PendingChoiceRow({
  choice,
  store,
  nameOf,
}: {
  choice: PendingChoice;
  store: CharacterStore;
  nameOf: (id: string) => string;
}): ReactNode {
  const picker = usePicker();
  const { plugin } = usePlugin();
  const change = useBuildChange(store);
  const chosen = choice.chosen.map(nameOf).join(", ");

  const write = (ids: string[]): void =>
    change({
      type: "choice",
      choiceId: choice.id,
      scope: choice.scope,
      levelIndex: choice.levelIndex,
      chosen: ids,
    });

  return (
    <ChoiceRow
      label={choice.name}
      value={chosen || undefined}
      empty={!choice.complete}
      invalid={choice.invalid.length ? choice.invalid.map(nameOf).join(", ") : undefined}
      onOpen={() =>
        picker({
          title: choice.name,
          subtitle: `${choice.sourceName}${choice.count > 1 ? ` · choose ${choice.count}` : ""}`,
          options: optionsFor(choice),
          selected: choice.chosen,
          count: choice.count,
          enforce: plugin.settings.enforceRequirements,
          onCommit: write,
          extra: choice.chosen.length ? { label: "Clear", onClick: () => write([]) } : undefined,
        })
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Origin
// ---------------------------------------------------------------------------

function OriginSection({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const picker = usePicker();
  const sheet = useSheet();
  const { plugin } = usePlugin();
  const change = useBuildChange(store);
  const index = store.index;
  const build = store.data.build;
  if (!build || !index) return <p className="dg-muted">No build.5e in this character's folder.</p>;

  const nameOf = (id: string): string => index.get(id)?.name ?? id;
  const elementPicker = (kind: string, title: string, current: string | undefined, write: (id?: string) => void): void =>
    picker({
      title,
      options: index.byKind(kind).map((element) => ({
        id: element.id,
        name: element.name,
        text: typeof element.text === "string" ? element.text : undefined,
        tag: index.abbreviation(element.source),
      })),
      selected: current ? [current] : [],
      count: 1,
      enforce: plugin.settings.enforceRequirements,
      onCommit: (ids) => write(ids[0]),
      extra: current ? { label: "Clear", onClick: () => write(undefined) } : undefined,
    });

  return (
    <>
      <ChoiceRow
        label="Species"
        value={character.species?.name}
        empty={!character.species}
        onOpen={() => elementPicker("species", "Species", build.species, (id) => change({ type: "species", id }))}
      />
      <ChoiceRow
        label="Background"
        value={character.background?.name}
        empty={!character.background}
        onOpen={() =>
          elementPicker("background", "Background", build.background, (id) => change({ type: "background", id }))
        }
      />

      <div className="dg-n-ability-grid">
        {ABILITIES.map((ability) => {
          const block = character.abilities[ability];
          const bonus = block.score.value - build.abilities.base[ability];
          return (
            <button
              key={ability}
              className="dg-n-ability"
              onClick={() =>
                sheet.open({
                  title: "Ability scores",
                  subtitle: build.abilities.method.replace("-", " "),
                  body: () => <AbilityEditor store={store} character={character} />,
                })
              }
            >
              <span className="dg-n-ability-name">{ability.toUpperCase()}</span>
              <span className="dg-n-ability-total">{block.score.value}</span>
              <span className="dg-n-ability-score">
                {build.abilities.base[ability]}
                {bonus ? ` ${bonus > 0 ? "+" : "−"}${Math.abs(bonus)}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {character.pendingChoices
        .filter((choice) => choice.scope === "build")
        .map((choice) => (
          <PendingChoiceRow key={choice.id} choice={choice} store={store} nameOf={nameOf} />
        ))}

      {inactivePicks(index, build)
        .filter((pick) => pick.scope === "build")
        .map((pick) => (
          <InactivePickRow key={pick.choiceId} pick={pick} store={store} nameOf={nameOf} />
        ))}
    </>
  );
}

const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

function AbilityEditor({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const build = store.data.build;
  if (!build) return null;
  const base = build.abilities.base;
  const spent = ABILITIES.reduce((n, a) => n + (POINT_BUY_COST[base[a]] ?? 0), 0);

  const set = (ability: Ability, value: number): void =>
    store.mutateBuild((b) => ({
      ...b,
      abilities: {
        ...b.abilities,
        base: { ...b.abilities.base, [ability]: Math.min(30, Math.max(1, value)) },
      },
    }));

  return (
    <>
      <select
        className="dg-select"
        value={build.abilities.method}
        onChange={(e) =>
          store.mutateBuild((b) => ({
            ...b,
            abilities: { ...b.abilities, method: e.target.value as BuildFile["abilities"]["method"] },
          }))
        }
      >
        <option value="point-buy">Point buy</option>
        <option value="standard-array">Standard array</option>
        <option value="rolled">Rolled</option>
        <option value="manual">Manual</option>
      </select>
      {build.abilities.method === "point-buy" ? (
        <p className={spent > 27 ? "dg-warn" : "dg-muted"}>{spent} of 27 points spent</p>
      ) : null}
      {ABILITIES.map((ability) => {
        const block = character.abilities[ability];
        return (
          <div className="dg-score-row" key={ability}>
            <span className="dg-n-ability-name">{ability.toUpperCase()}</span>
            <button onClick={() => set(ability, base[ability] - 1)} aria-label={`Lower ${ability}`}>
              −
            </button>
            <span className="dg-score-value">{base[ability]}</span>
            <button onClick={() => set(ability, base[ability] + 1)} aria-label={`Raise ${ability}`}>
              +
            </button>
            <span className="dg-muted">
              → {block.score.value} ({block.mod >= 0 ? `+${block.mod}` : block.mod})
            </span>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

function LevelsSection({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const index = store.index;
  const build = store.data.build;
  if (!build || !index) return null;

  const nameOf = (id: string): string => index.get(id)?.name ?? id;
  const byLevel = new Map<number, PendingChoice[]>();
  for (const choice of character.pendingChoices) {
    if (choice.scope !== "level" || choice.levelIndex === undefined) continue;
    const list = byLevel.get(choice.levelIndex) ?? [];
    list.push(choice);
    byLevel.set(choice.levelIndex, list);
  }

  return (
    <>
      {build.levels.map((_level, i) => (
        <LevelCard
          key={i}
          index={i}
          store={store}
          character={character}
          choices={byLevel.get(i) ?? []}
          nameOf={nameOf}
        />
      ))}
      {build.levels.length === 0 ? <p className="dg-muted">No levels yet. Add one to begin.</p> : null}
      <LevelButtons store={store} character={character} />
    </>
  );
}

function LevelCard({
  index,
  store,
  character,
  choices,
  nameOf,
}: {
  index: number;
  store: CharacterStore;
  character: ResolvedCharacter;
  choices: PendingChoice[];
  nameOf: (id: string) => string;
}): ReactNode {
  const sheet = useSheet();
  const change = useBuildChange(store);
  const build = store.data.build;
  // Level cards tick and detent while scrolling, but get no rail icon of their
  // own: twenty icons would be a scrollbar, not a rail (spec 4.3, 7.3).
  const ref = useMinorStop(`level-${index}`);
  if (!build) return null;

  const level = build.levels[index];
  const classElement = store.index?.get(level.class);
  const classLevel = classLevelAt(build, index);
  const outstanding = choices.filter((c) => !c.complete).length;
  const chosenIds = new Set(choices.flatMap((c) => c.chosen));
  const automatic = character.elements.filter(
    (element) => element.class === level.class && element.level === classLevel && !chosenIds.has(element.id),
  );
  const inactive = store.index ? inactivePicks(store.index, build).filter((p) => p.levelIndex === index) : [];

  const remove = (): void => {
    const starting = changesStartingClass(build, index);
    sheet.open({
      title: `Remove level ${index + 1}?`,
      subtitle: starting
        ? "This is the first level, so it also changes the starting class, its proficiencies and its starting equipment."
        : `${classElement?.name ?? level.class} ${classLevel}`,
      body: () => (
        <p className="dg-muted">
          The picks made at this level are kept in Planned, so taking the level again restores them. Later choices
          that depended on them are flagged rather than deleted.
        </p>
      ),
      actions: () => (
        <>
          <button className="dg-sheet-button" onClick={sheet.close}>
            Keep it
          </button>
          <button
            className="dg-sheet-button is-destructive"
            onClick={() => {
              sheet.close();
              // Straight through the same pipeline, so a removal that reaches
              // later choices gets the same confirmation an edit would.
              change({ type: "remove-level", index });
            }}
          >
            Remove level
          </button>
        </>
      ),
    });
  };

  return (
    <div className="dg-level-card" ref={ref}>
      <div className="dg-level-card-head">
        <strong>Level {index + 1}</strong>
        <span className="dg-level-chip">
          {classElement?.name ?? level.class} {classLevel}
        </span>
        {outstanding ? <span className="dg-level-todo">{outstanding} to choose</span> : null}
        <button className="dg-level-remove" onClick={remove} aria-label={`Remove level ${index + 1}`}>
          ×
        </button>
      </div>

      {automatic.length ? (
        <div className="dg-level-features">
          {automatic.map((feature) => (
            <FeatureChip key={feature.id} feature={feature} />
          ))}
        </div>
      ) : null}

      {choices.map((choice) => (
        <PendingChoiceRow key={`${choice.id}-${index}`} choice={choice} store={store} nameOf={nameOf} />
      ))}

      {inactive.map((pick) => (
        <InactivePickRow key={pick.choiceId} pick={pick} store={store} nameOf={nameOf} />
      ))}
    </div>
  );
}

/** An automatic feature: holdable for its text, no decision attached. */
function FeatureChip({ feature }: { feature: ResolvedElement }): ReactNode {
  return (
    <ReadRow
      title={feature.name}
      subtitle={feature.kind.replace(/-/g, " ")}
      text={feature.text}
      className="dg-level-feature"
    />
  );
}

/**
 * One button per class taken, then multiclass. Two classes sit side by side;
 * three or more stack, because a row of five buttons is a row of five mistakes
 * (spec 7.4).
 */
/** A class's multiclass prerequisite as a line of text, if it has one. */
function multiclassNote(cls: Element): string[] | undefined {
  const requires = (cls as { multiclassRequires?: Requirement }).multiclassRequires;
  return requires ? [describeRequirement(requires)] : undefined;
}

function LevelButtons({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const picker = usePicker();
  const { plugin } = usePlugin();
  const change = useBuildChange(store);
  const controller = useScrollController();
  const index = store.index;
  const build = store.data.build;
  if (!build || !index) return null;

  const taken = [...classLevels(build).keys()];
  const hpFor = (classId: string): "max" | "average" | number => {
    const die = String((index.get(classId) as { hitDie?: string } | undefined)?.hitDie ?? "d8");
    if (plugin.settings.defaultHp === "max") return "max";
    if (plugin.settings.defaultHp === "roll") return averageForDie(die);
    return "average";
  };

  const add = (classId: string): void => {
    change({ type: "add-level", class: classId, hp: hpFor(classId) });
    // The new card is what the player wants to look at next (spec 7.5).
    requestAnimationFrame(() => controller.goTo(`level-${build.levels.length}`));
  };

  const multiclass = (): void =>
    picker({
      title: "Multiclass",
      subtitle: "A new class at level 1",
      options: index
        .byKind("class")
        .filter((cls) => !taken.includes(cls.id))
        .map((cls) => ({
          id: cls.id,
          name: cls.name,
          text: typeof cls.text === "string" ? cls.text : undefined,
          tag: index.abbreviation(cls.source),
          // Shown whether or not enforcement is on: a player multiclassing into
          // a class they don't qualify for should at least be told.
          warnings: multiclassNote(cls),
        })),
      selected: [],
      count: 1,
      onCommit: (ids) => ids[0] && add(ids[0]),
    });

  return (
    <div className={taken.length === 2 ? "dg-level-buttons is-pair" : "dg-level-buttons"}>
      {taken.map((classId) => (
        <button
          key={classId}
          className="dg-level-button"
          style={{ minHeight: UI.levelButtonHeight }}
          onClick={() => add(classId)}
          disabled={build.levels.length >= 20}
        >
          + {index.get(classId)?.name ?? classId} level
        </button>
      ))}
      {taken.length === 0 ? (
        <button className="dg-level-button" style={{ minHeight: UI.levelButtonHeight }} onClick={multiclass}>
          + First class
        </button>
      ) : (
        <button
          className="dg-level-button is-multiclass"
          style={{ minHeight: UI.levelButtonHeight }}
          onClick={multiclass}
        >
          + Multiclass
        </button>
      )}
      {character.level >= 20 ? <p className="dg-muted">Level 20 is as far as the rules go.</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Planned
// ---------------------------------------------------------------------------

/**
 * The upcoming levels of every class taken, so a player can plan a build (spec
 * 7.6). Picks made here are stored against the class level they belong to and
 * applied when the character reaches it.
 */
function PlannedSection({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PLANNED_PAGE);
  const [filter, setFilter] = useState("all");
  const index = store.index;
  const build = store.data.build;
  if (!build || !index) return null;

  const taken = [...classLevels(build).entries()];
  const queued = build.planned?.length ?? 0;
  const summary = `${queued} queued · ${taken.map(([id, n]) => `${index.get(id)?.name ?? id} ${n + 1}+`).join(", ")}`;

  const chips = [{ id: "all", label: "All" }, ...taken.map(([id]) => ({ id, label: index.get(id)?.name ?? id }))];
  const classes = filter === "all" ? taken : taken.filter(([id]) => id === filter);

  return (
    <>
      <button className="dg-planned-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{open ? "Hide planned levels" : summary}</span>
        <span className="dg-choice-chevron" aria-hidden="true">
          {open ? "⌃" : "⌄"}
        </span>
      </button>

      {open ? (
        <>
          {taken.length > 1 ? <ChipRow chips={chips} active={filter} onPick={setFilter} /> : null}
          {classes.map(([classId, level]) => (
            <PlannedClass
              key={classId}
              store={store}
              classId={classId}
              from={level + 1}
              count={shown}
              character={character}
            />
          ))}
          <button className="dg-level-button is-multiclass" onClick={() => setShown((n) => n + PLANNED_PAGE)}>
            Show more levels
          </button>
        </>
      ) : null}
    </>
  );
}

function PlannedClass({
  store,
  classId,
  from,
  count,
  character,
}: {
  store: CharacterStore;
  classId: string;
  from: number;
  count: number;
  character: ResolvedCharacter;
}): ReactNode {
  const index = store.index;
  const build = store.data.build;
  if (!index || !build) return null;

  const cls = index.get(classId) as (Element & { levels?: Record<string, LevelEntryShape> }) | undefined;
  const subclassId = character.classes.find((c) => c.id === classId)?.subclass?.id;
  const subclass = subclassId
    ? (index.get(subclassId) as (Element & { levels?: Record<string, LevelEntryShape> }) | undefined)
    : undefined;
  if (!cls) return null;

  const levels: number[] = [];
  for (let level = from; level <= 20 && levels.length < count; level++) {
    if (cls.levels?.[String(level)] || subclass?.levels?.[String(level)]) levels.push(level);
  }

  return (
    <>
      {levels.map((level) => (
        <div className="dg-level-card is-planned" key={`${classId}-${level}`}>
          <div className="dg-level-card-head">
            <strong>
              {cls.name} {level}
            </strong>
            <span className="dg-level-chip is-planned">planned</span>
          </div>
          {[cls.levels?.[String(level)], subclass?.levels?.[String(level)]].filter(Boolean).map((entry, i) => (
            <PlannedEntry
              key={i}
              entry={entry as LevelEntryShape}
              store={store}
              classId={classId}
              classLevel={level}
            />
          ))}
        </div>
      ))}
      {levels.length === 0 ? <p className="dg-muted">No further levels in the loaded data.</p> : null}
    </>
  );
}

interface LevelEntryShape {
  grants?: Grant[];
  choices?: ChoiceDef[];
  text?: string;
}

function PlannedEntry({
  entry,
  store,
  classId,
  classLevel,
}: {
  entry: LevelEntryShape;
  store: CharacterStore;
  classId: string;
  classLevel: number;
}): ReactNode {
  const index = store.index;
  const picker = usePicker();
  const build = store.data.build;
  if (!index || !build) return null;

  const planned = plannedFor(build, classId, classLevel);

  return (
    <>
      {(entry.grants ?? []).map((grant) => {
        const id = typeof grant === "string" ? grant : grant.id;
        const element = index.get(id);
        return (
          <ReadRow
            key={id}
            title={element?.name ?? id}
            subtitle="look ahead"
            text={typeof element?.text === "string" ? element.text : undefined}
            className="dg-level-feature"
          />
        );
      })}

      {(entry.choices ?? []).map((choice) => {
        const chosen = planned?.choices[choice.id] ?? [];
        const options = index.query(choice.from);
        return (
          <ChoiceRow
            key={choice.id}
            label={choice.name ?? `Choose ${choice.count ?? 1}`}
            value={chosen.map((id) => index.get(id)?.name ?? id).join(", ") || undefined}
            empty={chosen.length === 0}
            onOpen={() =>
              picker({
                title: choice.name ?? "Choose",
                subtitle: "planned, applies when you reach it",
                options: options.map((option) => ({
                  id: option.id,
                  name: option.name,
                  text: typeof option.text === "string" ? option.text : undefined,
                  tag: index.abbreviation(option.source),
                })),
                selected: chosen,
                count: choice.count ?? 1,
                onCommit: (ids) =>
                  store.mutateBuild((b) => setPlannedChoice(b, classId, classLevel, choice.id, ids)),
                extra: chosen.length
                  ? {
                      label: "Clear",
                      onClick: () =>
                        store.mutateBuild((b) => setPlannedChoice(b, classId, classLevel, choice.id, [])),
                    }
                  : undefined,
              })
            }
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Spells, equipment, details, review
// ---------------------------------------------------------------------------

function SpellsBuilderSection({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const picker = usePicker();
  const index = store.index;
  const casting = character.spellcasting;
  if (!casting || !index) return null;

  const known = new Set(casting.spells.map((s) => s.id));
  const add = (classId: string, list: string): void =>
    picker({
      title: "Add spells",
      subtitle: index.get(classId)?.name,
      options: index
        .query({ kind: "spell", tags: [list] })
        .filter((spell) => !known.has(spell.id))
        .map((spell) => ({
          id: spell.id,
          name: spell.name,
          text: typeof spell.text === "string" ? spell.text : undefined,
          tag: index.abbreviation(spell.source),
        })),
      selected: [],
      count: 99,
      onCommit: (ids) => {
        const file = store.data.spells ?? { kind: "spells" as const, schemaVersion: 1, spells: [] };
        store.update("spells", {
          ...file,
          spells: [...file.spells, ...ids.map((id) => ({ id, class: classId }))],
        });
      },
    });

  return (
    <>
      {casting.spells.map((spell) => (
        <ReadRow
          key={spell.id}
          title={spell.name}
          subtitle={spell.spellLevel === 0 ? "Cantrip" : `Level ${spell.spellLevel}`}
          text={spell.text}
        />
      ))}
      {casting.classes.map((cls) => (
        <button key={cls.class} className="dg-level-button is-multiclass" onClick={() => add(cls.class, cls.list)}>
          + Add {cls.name} spells
        </button>
      ))}
    </>
  );
}

function EquipmentSection({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const picker = usePicker();
  const index = store.index;
  if (!index) return null;

  const add = (): void =>
    picker({
      title: "Add items",
      options: index.byKind("item").map((item) => ({
        id: item.id,
        name: item.name,
        text: typeof item.text === "string" ? item.text : undefined,
        tag: index.abbreviation(item.source),
      })),
      selected: [],
      count: 99,
      onCommit: (ids) => {
        const file = store.data.inventory ?? { kind: "inventory" as const, schemaVersion: 1, items: [] };
        store.update("inventory", { ...file, items: [...file.items, ...ids.map((id) => ({ id }))] });
      },
    });

  return (
    <>
      {character.inventory.map((item) => (
        <ReadRow
          key={`${item.element.id}-${item.index}`}
          title={item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name}
          subtitle={item.equipped ? "equipped" : undefined}
          text={typeof item.element.text === "string" ? item.element.text : undefined}
        />
      ))}
      <button className="dg-level-button is-multiclass" onClick={add}>
        + Add items
      </button>
    </>
  );
}

function DetailsBuilderSection({ store }: { store: CharacterStore }): ReactNode {
  const build = store.data.build;
  if (!build) return null;
  return (
    <>
      <label className="dg-field">
        <span>Name</span>
        <input
          type="text"
          defaultValue={build.name ?? ""}
          onBlur={(e) => store.mutateBuild((b) => ({ ...b, name: e.target.value }))}
        />
      </label>
      <label className="dg-field">
        <span>Experience</span>
        <input
          type="number"
          min={0}
          value={build.xp ?? 0}
          onChange={(e) => store.mutateBuild((b) => ({ ...b, xp: Math.max(0, Number(e.target.value)) }))}
        />
      </label>
      <p className="dg-muted">
        Everything else — traits, flaw, backstory — lives in the character's details note, which the sheet's Details
        section embeds.
      </p>
    </>
  );
}

/**
 * The draft banner (spec 7.9). It only appears when there is work from a
 * previous visit that is not already on screen.
 */
function DraftBanner(): ReactNode {
  const session = useBuilderSession();
  const draft = session?.pendingDraft;
  if (!session || !draft) return null;

  return (
    <div className="dg-draft-banner">
      <span className="dg-draft-text">
        You have unfinished changes from {relativeTime(draft.saved)}.
        {session.baseMoved ? " This character has changed since then, so resuming will replace those changes." : ""}
      </span>
      <div className="dg-draft-actions">
        <button className="dg-n-chip is-action" onClick={session.resumeDraft}>
          Resume draft
        </button>
        <button className="dg-n-chip" onClick={session.discardDraft}>
          Discard
        </button>
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "earlier";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "a moment ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Finish lives here rather than in a view action, because Obsidian's mobile
 * header hides view actions behind an overflow menu (spec 7.10). It is never
 * blocked by open choices; it reports them.
 */
function ReviewSection({ character }: { character: ResolvedCharacter }): ReactNode {
  const controller = useScrollController();
  const shell = useShell();
  const session = useBuilderSession();
  const open = character.pendingChoices.filter((c) => !c.complete);

  return (
    <>
      {open.length === 0 ? (
        <p className="dg-muted">Nothing left to choose.</p>
      ) : (
        open.map((choice) => (
          <button
            key={`${choice.id}-${choice.levelIndex ?? "build"}`}
            className="dg-review-link"
            onClick={() => controller.goTo(choice.levelIndex !== undefined ? `level-${choice.levelIndex}` : "origin")}
          >
            <span>{choice.name}</span>
            <span className="dg-muted">
              {choice.sourceName}
              {choice.level ? ` · level ${choice.level}` : ""}
            </span>
          </button>
        ))
      )}

      {session && !session.creating ? (
        <SaveControls session={session} openChoices={open.length} onFinish={shell.openSheet} />
      ) : (
        <button className="dg-level-button" style={{ minHeight: UI.levelButtonHeight }} onClick={shell.openSheet}>
          Finish{open.length ? ` · ${open.length} still open` : ""}
        </button>
      )}
    </>
  );
}

/**
 * Editing an existing character writes nothing until this button is pressed, so
 * it has to say what it is about to do: how many changes, and which (spec 7.9).
 */
function SaveControls({
  session,
  openChoices,
  onFinish,
}: {
  session: BuilderSession;
  openChoices: number;
  onFinish: () => void;
}): ReactNode {
  const sheet = useSheet();

  if (!session.dirty)
    return (
      <>
        <p className="dg-muted">No unsaved changes.</p>
        <button className="dg-level-button" style={{ minHeight: UI.levelButtonHeight }} onClick={onFinish}>
          Done{openChoices ? ` · ${openChoices} still open` : ""}
        </button>
      </>
    );

  return (
    <>
      <button
        className="dg-review-link"
        onClick={() =>
          sheet.open({
            title: "Unsaved changes",
            subtitle: `${session.diff.count} ${session.diff.count === 1 ? "change" : "changes"}`,
            body: () => (
              <ul className="dg-diff">
                {session.diff.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ),
          })
        }
      >
        <span>
          {session.diff.count} unsaved {session.diff.count === 1 ? "change" : "changes"}
        </span>
        <span className="dg-muted">Tap to see what they are</span>
      </button>

      {session.baseMoved ? (
        <p className="dg-warn">This character has changed elsewhere since you started. Saving will replace that.</p>
      ) : null}

      <div className="dg-save-row">
        <button
          className="dg-level-button"
          style={{ minHeight: UI.levelButtonHeight }}
          onClick={() => {
            session.save();
            onFinish();
          }}
        >
          Save changes · {session.diff.count}
        </button>
        <button
          className="dg-level-button is-multiclass"
          style={{ minHeight: UI.levelButtonHeight }}
          onClick={session.discard}
        >
          Discard
        </button>
      </div>
    </>
  );
}
