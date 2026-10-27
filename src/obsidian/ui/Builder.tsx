/**
 * The builder generates a character's data by walking the content graph. Every
 * choice the content declares becomes a select, so there is no class-specific or
 * source-specific code here.
 *
 * Tabs run left to right like a wizard, but any tab can be revisited at any time,
 * and changing an earlier choice updates everything after it.
 */

import { useMemo, useState, type ReactNode } from "react";
import type { Element } from "../../core/types";
import { ABILITIES, type Ability } from "../../core/types";
import type { PendingChoice, ResolvedCharacter } from "../../core/resolver/resolved";
import { averageForDie, maxForDie } from "../../core/resolver/spellslots";
import type { CharacterStore } from "../character-store";
import { usePlugin } from "./context";
import { Diagnostics, ElementInfo, Empty, Markdown, Pill, Section, Tabs, signed } from "./components";
import { ChoicePicker, PendingChoiceList } from "./builder-choices";
import { ProgressionBrowser } from "./builder-progression";
import { SourcesPanel } from "./builder-sources";

const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const POINT_BUY_BUDGET = 27;
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export function Builder({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const tabs = useBuilderTabs(store, character);
  const [active, setActive] = useState("core");
  const current = tabs.some((t) => t.id === active) ? active : "core";

  return (
    <div className="dg-builder">
      <Tabs tabs={tabs} active={current} onChange={setActive} />
      <div className="dg-tab-body">
        {current === "core" ? <CorePanel store={store} character={character} /> : null}
        {current === "levels" ? <LevelsPanel store={store} character={character} /> : null}
        {current === "choices" ? <PendingChoiceList store={store} character={character} /> : null}
        {current === "spells" ? <SpellBuilder store={store} character={character} /> : null}
        {current === "inventory" ? <InventoryBuilder store={store} character={character} /> : null}
        {current === "browse" ? <ProgressionBrowser store={store} /> : null}
        {current === "sources" ? <SourcesPanel store={store} /> : null}
      </div>
      <Diagnostics diagnostics={[...store.fileDiagnostics, ...character.diagnostics]} title="Notes" />
    </div>
  );
}

function useBuilderTabs(
  store: CharacterStore,
  character: ResolvedCharacter,
): { id: string; label: string; badge?: number }[] {
  return useMemo(() => {
    const outstanding = character.pendingChoices.filter((c) => !c.complete).length;
    const tabs = [
      { id: "core", label: "Core" },
      { id: "levels", label: "Levels & features" },
      { id: "choices", label: "Choices", badge: outstanding },
    ];
    // A character with no spellcasting has no spells tab. The picker filters by a
    // class's spell list, so it needs a casting class, not merely a spells file.
    if (character.spellcasting?.classes.length) tabs.push({ id: "spells", label: "Spells" });
    tabs.push({ id: "inventory", label: "Inventory" });
    tabs.push({ id: "browse", label: "Browse classes" });
    tabs.push({ id: "sources", label: "Sources" });
    return tabs;
  }, [character.pendingChoices, character.spellcasting, store.version]);
}

// ---------------------------------------------------------------------------
// Core: name, species, background, ability scores
// ---------------------------------------------------------------------------

function CorePanel({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const index = store.index;
  const build = store.data.build;
  if (!build || !index) return <Empty>No build.5e in this character's folder.</Empty>;

  const species = index.byKind("species");
  const backgrounds = index.byKind("background");

  return (
    <>
      <Section title="Identity">
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
          XP and level are separate fields, so milestone campaigns work. XP only prompts a level-up; it never
          forces one.
        </p>
        {levelUpHint(build.xp ?? 0, character.level)}
      </Section>

      <ElementSelect
        title="Species"
        options={species}
        value={build.species}
        store={store}
        onPick={(id) => store.mutateBuild((b) => ({ ...b, species: id }))}
      />

      <ElementSelect
        title="Background"
        options={backgrounds}
        value={build.background}
        store={store}
        onPick={(id) => store.mutateBuild((b) => ({ ...b, background: id }))}
      />

      <AbilityScores store={store} character={character} />

      {character.pendingChoices.filter((c) => c.scope === "build").length > 0 && (
        <Section title="Species and background choices">
          {character.pendingChoices
            .filter((c) => c.scope === "build")
            .map((choice) => (
              <ChoicePicker key={choice.id} choice={choice} store={store} />
            ))}
        </Section>
      )}
    </>
  );
}

function levelUpHint(xp: number, level: number): ReactNode {
  const thresholds = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
  const earned = thresholds.filter((t) => xp >= t).length;
  if (earned <= level) return null;
  return (
    <p>
      <Pill tone="info">
        {xp} XP is enough for level {earned}. Add a level on the Levels tab when your table is ready.
      </Pill>
    </p>
  );
}

function ElementSelect({
  title,
  options,
  value,
  store,
  onPick,
}: {
  title: string;
  options: Element[];
  value?: string;
  store: CharacterStore;
  onPick: (id: string | undefined) => void;
}): ReactNode {
  const selected = value ? store.index?.get(value) : undefined;
  const override = value ? store.index?.overrideFor(value) : undefined;
  return (
    <Section title={title}>
      <select
        className="dg-select"
        value={value ?? ""}
        onChange={(e) => onPick(e.currentTarget.value || undefined)}
      >
        <option value="">— none —</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
            {store.index?.abbreviation(option.source) ? ` (${store.index.abbreviation(option.source)})` : ""}
          </option>
        ))}
      </select>
      {value && !selected ? (
        <Pill tone="warn">
          "{value}" is not in any loaded source. The selection is kept; re-add the source to restore it.
        </Pill>
      ) : null}
      {selected ? (
        <ElementInfo
          element={{
            id: selected.id,
            name: selected.name,
            kind: selected.kind,
            abbreviation: store.index?.abbreviation(selected.source),
            page: selected.page,
            text: typeof selected.text === "string" ? selected.text : undefined,
            tags: selected.tags,
          }}
          overriddenBy={override ? override.winner : undefined}
        />
      ) : null}
      {options.length === 0 ? <Empty>No {title.toLowerCase()} in the loaded sources.</Empty> : null}
    </Section>
  );
}

function AbilityScores({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const build = store.data.build;
  if (!build) return null;
  const method = build.abilities.method;
  const base = build.abilities.base;

  const setScore = (ability: Ability, value: number): void =>
    store.mutateBuild((b) => ({
      ...b,
      abilities: { ...b.abilities, base: { ...b.abilities.base, [ability]: clamp(value, 1, 30) } },
    }));

  const spent = ABILITIES.reduce((n, a) => n + (POINT_BUY_COST[base[a]] ?? 0), 0);
  const pointBuyValid = ABILITIES.every((a) => base[a] >= 8 && base[a] <= 15);

  return (
    <Section
      title="Ability scores"
      action={
        <select
          className="dg-select is-inline"
          value={method}
          onChange={(e) =>
            store.mutateBuild((b) => ({
              ...b,
              abilities: { ...b.abilities, method: e.target.value as typeof method },
            }))
          }
        >
          <option value="point-buy">Point buy</option>
          <option value="standard-array">Standard array</option>
          <option value="rolled">Rolled</option>
          <option value="manual">Manual</option>
        </select>
      }
    >
      {method === "point-buy" ? (
        <p className={spent > POINT_BUY_BUDGET || !pointBuyValid ? "dg-warn" : "dg-muted"}>
          {spent} of {POINT_BUY_BUDGET} points spent
          {pointBuyValid ? "" : " · point buy expects base scores from 8 to 15"}
        </p>
      ) : null}
      {method === "standard-array" ? (
        <p className="dg-muted">Assign {STANDARD_ARRAY.join(", ")} across the six abilities.</p>
      ) : null}
      <div className="dg-score-grid">
        {ABILITIES.map((ability) => {
          const block = character.abilities[ability];
          const bonus = block.score.value - base[ability];
          return (
            <label className="dg-score" key={ability}>
              <span className="dg-ability-name">{ability.toUpperCase()}</span>
              <input
                type="number"
                min={1}
                max={30}
                value={base[ability]}
                onChange={(e) => setScore(ability, Number(e.target.value))}
              />
              <span className="dg-muted">
                {bonus ? `${signed(bonus)} → ${block.score.value}` : `= ${block.score.value}`} ({signed(block.mod)})
              </span>
            </label>
          );
        })}
      </div>
      <p className="dg-muted">
        Ability score improvements are applied here, so point buy, rolled scores and later increases all live in
        one place.
      </p>
    </Section>
  );
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : lo, lo), hi);
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

function LevelsPanel({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const { plugin } = usePlugin();
  const index = store.index;
  const build = store.data.build;
  if (!build || !index) return <Empty>No build.5e in this character's folder.</Empty>;

  const classes = index.byKind("class");
  const [nextClass, setNextClass] = useState(
    () => build.levels[build.levels.length - 1]?.class ?? classes[0]?.id ?? "",
  );

  const addLevel = (): void => {
    if (!nextClass) return;
    const die = String((index.get(nextClass) as { hitDie?: string } | undefined)?.hitDie ?? "d8");
    const hp =
      plugin.settings.defaultHp === "max"
        ? ("max" as const)
        : plugin.settings.defaultHp === "roll"
          ? averageForDie(die)
          : ("average" as const);
    store.mutateBuild((b) => ({
      ...b,
      levels: [...b.levels, { class: nextClass, hp, choices: {} }],
      level: b.levels.length + 1,
    }));
  };

  const removeLevel = (i: number): void =>
    store.mutateBuild((b) => ({
      ...b,
      levels: b.levels.filter((_, n) => n !== i),
      level: Math.max(0, b.levels.length - 1),
    }));

  const setHp = (i: number, hp: "max" | "average" | number): void =>
    store.mutateBuild((b) => ({
      ...b,
      levels: b.levels.map((lvl, n) => (n === i ? { ...lvl, hp } : lvl)),
    }));

  // Choices land on the build level where that class reached that class level.
  const choicesByLevelIndex = new Map<number, PendingChoice[]>();
  for (const choice of character.pendingChoices) {
    if (choice.scope !== "level" || choice.levelIndex === undefined) continue;
    const list = choicesByLevelIndex.get(choice.levelIndex) ?? [];
    list.push(choice);
    choicesByLevelIndex.set(choice.levelIndex, list);
  }

  const classLevel = new Map<string, number>();

  return (
    <>
      <Section
        title={`Levels (${build.levels.length})`}
        action={
          <span className="dg-level-add">
            <select className="dg-select is-inline" value={nextClass} onChange={(e) => setNextClass(e.target.value)}>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
            <button className="dg-button" onClick={addLevel} disabled={!nextClass || build.levels.length >= 20}>
              Add level
            </button>
          </span>
        }
      >
        {build.levels.length === 0 ? <Empty>No levels yet. Add one to begin.</Empty> : null}
        <ol className="dg-level-list">
          {build.levels.map((level, i) => {
            const cls = index.get(level.class);
            const die = String((cls as { hitDie?: string } | undefined)?.hitDie ?? "d8");
            const taken = (classLevel.get(level.class) ?? 0) + 1;
            classLevel.set(level.class, taken);
            const levelChoices = choicesByLevelIndex.get(i) ?? [];

            return (
              <li className="dg-level" key={i}>
                <div className="dg-level-head">
                  <strong>
                    Level {i + 1} · {cls?.name ?? level.class} {taken}
                  </strong>
                  {!cls ? <Pill tone="warn">class not loaded</Pill> : null}
                  <span className="dg-hp-choice">
                    <label>
                      HP
                      <select
                        className="dg-select is-inline"
                        value={typeof level.hp === "number" ? "roll" : level.hp}
                        onChange={(e) =>
                          setHp(
                            i,
                            e.target.value === "roll"
                              ? typeof level.hp === "number"
                                ? level.hp
                                : averageForDie(die)
                              : (e.target.value as "max" | "average"),
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
                        onChange={(e) => setHp(i, clamp(Number(e.target.value), 1, maxForDie(die)))}
                      />
                    ) : null}
                  </span>
                  <button className="dg-button is-quiet" onClick={() => removeLevel(i)}>
                    Remove
                  </button>
                </div>

                {levelChoices.length > 0 && (
                  <div className="dg-level-choices">
                    {levelChoices.map((choice) => (
                      <ChoicePicker key={`${choice.id}-${choice.levelIndex}`} choice={choice} store={store} />
                    ))}
                  </div>
                )}

                <FeaturesGainedAt character={character} classId={level.class} level={taken} />
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title="Hit points">
        <p>
          Maximum {character.hp.max.value}. The first level always takes the die's maximum; later levels use the
          choice recorded above.
        </p>
      </Section>
    </>
  );
}

function FeaturesGainedAt({
  character,
  classId,
  level,
}: {
  character: ResolvedCharacter;
  classId: string;
  level: number;
}): ReactNode {
  const gained = character.elements.filter((e) => e.class === classId && e.level === level);
  if (!gained.length) return null;
  return (
    <ul className="dg-inline-list dg-gained">
      {gained.map((element) => (
        <li key={element.id}>{element.name}</li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Spells and inventory, the builder's editing side
// ---------------------------------------------------------------------------

function SpellBuilder({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const index = store.index;
  const file = store.data.spells;
  const casting = character.spellcasting;
  const [classFilter, setClassFilter] = useState(casting?.classes[0]?.class ?? "");
  const [search, setSearch] = useState("");

  if (!index || !file || !casting) return <Empty>This character has no spellcasting.</Empty>;

  const cls = casting.classes.find((c) => c.class === classFilter) ?? casting.classes[0];
  const maxLevel = casting.slots.length;
  const known = new Set(file.spells.map((s) => s.id));

  const available = cls
    ? index
        .query({ kind: "spell", tags: [cls.list] })
        .filter((spell) => {
          const level = typeof spell.spellLevel === "number" ? spell.spellLevel : 0;
          return level === 0 || level <= maxLevel;
        })
        .filter((spell) => !search || spell.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  const add = (id: string): void =>
    store.update("spells", { ...file, spells: [...file.spells, { id, class: cls?.class, prepared: false }] });

  const remove = (id: string): void =>
    store.update("spells", { ...file, spells: file.spells.filter((s) => s.id !== id) });

  return (
    <>
      <Section title="Spellbook">
        <p className="dg-muted">
          {cls?.name}: {cls?.type} caster, DC {cls?.dc.value}, slots up to level {maxLevel || "—"}. Granted oath,
          domain and similar spells are always prepared and are not listed here.
        </p>
        <div className="dg-filters">
          {casting.classes.length > 1 ? (
            <select className="dg-select is-inline" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              {casting.classes.map((c) => (
                <option key={c.class} value={c.class}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null}
          <input
            type="search"
            placeholder="Search spells"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </div>
        <ul className="dg-pick-list">
          {available.map((spell) => {
            const level = typeof spell.spellLevel === "number" ? spell.spellLevel : 0;
            const inBook = known.has(spell.id);
            return (
              <li key={spell.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={inBook}
                    onChange={(e) => (e.currentTarget.checked ? add(spell.id) : remove(spell.id))}
                  />
                  {spell.name}
                  <span className="dg-muted"> · {level === 0 ? "cantrip" : `level ${level}`}</span>
                </label>
              </li>
            );
          })}
        </ul>
        {available.length === 0 ? <Empty>No spells on this list in the loaded sources.</Empty> : null}
      </Section>
    </>
  );
}

function InventoryBuilder({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const index = store.index;
  const file = store.data.inventory;
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");

  if (!index || !file) return <Empty>No inventory.5e in this character's folder.</Empty>;

  const items = index.byKind("item");
  const tags = [...new Set(items.flatMap((item) => item.tags ?? []))].sort();
  const filtered = items
    .filter((item) => !tag || item.tags?.includes(tag))
    .filter((item) => !search || item.name.toLowerCase().includes(search.toLowerCase()));

  const add = (id: string): void =>
    store.update("inventory", { ...file, items: [...file.items, { id, quantity: 1 }] });

  return (
    <>
      <Section title="Add items">
        <div className="dg-filters">
          <select className="dg-select is-inline" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search items"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </div>
        <ul className="dg-pick-list">
          {filtered.map((item) => (
            <li key={item.id}>
              <button className="dg-button is-quiet" onClick={() => add(item.id)}>
                Add
              </button>
              {item.name}
              {item.tags?.length ? <span className="dg-muted"> · {item.tags.join(", ")}</span> : null}
            </li>
          ))}
        </ul>
      </Section>

      <CustomItemWizard store={store} />

      <Section title="Carried">
        {character.inventory.length === 0 ? (
          <Empty>Nothing carried yet.</Empty>
        ) : (
          <ul className="dg-inline-list">
            {character.inventory.map((item) => (
              <li key={`${item.index}-${item.element.id}`}>
                {item.quantity > 1 ? `${item.quantity}× ` : ""}
                {item.name}
                {item.equipped ? <Pill>equipped</Pill> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="dg-muted">Equip, attune and set quantities on the sheet's inventory tab.</p>
      </Section>
    </>
  );
}

/**
 * Custom items use the same element format as source content, so a homemade +1
 * shield can carry real modifiers. The user never types JSON.
 */
function CustomItemWizard({ store }: { store: CharacterStore }): ReactNode {
  const file = store.data.inventory;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState(0);
  const [target, setTarget] = useState("ac");
  const [op, setOp] = useState<"add" | "base" | "min">("add");
  const [value, setValue] = useState("1");
  const [requiresEquipped, setRequiresEquipped] = useState(true);
  const [notes, setNotes] = useState("");

  const paths = store.index?.allStatPaths() ?? [];

  if (!file) return null;

  const create = (): void => {
    const id = `custom:item:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "item"}`;
    store.update("inventory", {
      ...file,
      items: [
        ...file.items,
        {
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
        },
      ],
    });
    setOpen(false);
    setName("");
    setNotes("");
  };

  return (
    <Section
      title="Custom item"
      action={
        <button className="dg-button is-quiet" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Create one"}
        </button>
      }
    >
      {!open ? (
        <p className="dg-muted">
          Build an item that isn't in any source. It uses the same format as source content, so its modifiers are
          real.
        </p>
      ) : (
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
            <input
              type="checkbox"
              checked={requiresEquipped}
              onChange={(e) => setRequiresEquipped(e.currentTarget.checked)}
            />
          </label>
          <label className="dg-field">
            <span>Description</span>
            <textarea className="dg-textarea" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} rows={3} />
          </label>
          <button className="dg-button" onClick={create} disabled={!name.trim()}>
            Add to inventory
          </button>
        </div>
      )}
    </Section>
  );
}

export { Markdown };
