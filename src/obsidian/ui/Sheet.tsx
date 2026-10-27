/**
 * The character sheet: a full-pane, tabbed view of the resolved character with
 * interactivity for live play. Tabs come from the loaded kind definitions, so a
 * source that adds a kind gets a tab with no plugin changes.
 */

import { useMemo, useState, type ReactNode } from "react";
import type { ResolvedCharacter } from "../../core/resolver/resolved";
import { event } from "../../core/state/fold";
import { ABILITIES } from "../../core/types";
import type { CharacterStore } from "../character-store";
import { usePlugin } from "./context";
import { Diagnostics, Empty, Icon, Pill, Pips, Section, StatValue, Tabs, signed } from "./components";
import {
  ActionsPanel,
  DetailsPanel,
  FeaturesPanel,
  InventoryPanel,
  LogPanel,
  ResourcesPanel,
  SetsPanel,
  SpellsPanel,
  prettyPath,
} from "./sheet-panels";

const CONDITIONS = [
  "blinded",
  "charmed",
  "deafened",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
];

/** Tabs the sheet always offers, in order. Kind definitions can add more. */
const BUILT_IN_TABS = ["overview", "actions", "spells", "inventory", "features", "details", "log"] as const;

export function Sheet({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const { plugin } = usePlugin();
  const readOnly = false;
  const [playMode, setPlayMode] = useState(plugin.settings.layout.playMode);

  const { tabs, kindsByTab, generatedTabs } = useTabs(store, character);
  const [active, setActive] = useState("overview");
  const current = tabs.some((t) => t.id === active) ? active : tabs[0]?.id ?? "overview";

  const nameOf = (id: string): string => store.index?.get(id)?.name ?? id;

  return (
    <div className={playMode ? "dg-sheet is-play" : "dg-sheet"}>
      <SheetHeader store={store} character={character} playMode={playMode} onPlayMode={setPlayMode} />
      <VitalsBar store={store} character={character} readOnly={readOnly} />

      <Tabs tabs={tabs} active={current} onChange={setActive} />

      <div className="dg-tab-body">
        {current === "overview" ? (
          <Overview store={store} character={character} nameOf={nameOf} readOnly={readOnly} />
        ) : null}
        {current === "actions" ? <ActionsPanel character={character} store={store} readOnly={readOnly} /> : null}
        {current === "spells" ? <SpellsPanel character={character} store={store} readOnly={readOnly} /> : null}
        {current === "inventory" ? <InventoryPanel character={character} store={store} readOnly={readOnly} /> : null}
        {current === "details" ? <DetailsPanel store={store} readOnly={readOnly || playMode} /> : null}
        {current === "log" ? <LogPanel store={store} readOnly={readOnly} /> : null}
        {generatedTabs.has(current) ? (
          <FeaturesPanel
            character={character}
            kinds={kindsByTab.get(current) ?? []}
            labelFor={(kind) => store.index?.kindLabel(kind, true) ?? kind}
          />
        ) : null}
      </div>

      {!playMode ? (
        <Diagnostics diagnostics={[...store.fileDiagnostics, ...character.diagnostics]} title="Notes" />
      ) : null}
    </div>
  );
}

/**
 * Tab list: the built-in tabs that have something to show, plus one tab per `tab`
 * id any loaded kind definition declares.
 */
function useTabs(
  store: CharacterStore,
  character: ResolvedCharacter,
): {
  tabs: { id: string; label: string; badge?: number }[];
  kindsByTab: Map<string, string[]>;
  /** Tabs whose body is the generic feature list, not a dedicated panel. */
  generatedTabs: Set<string>;
} {
  return useMemo(() => {
    const index = store.index;
    const kindsByTab = new Map<string, string[]>();
    for (const def of index?.allKindDefs() ?? []) {
      if (!def.tab) continue;
      const list = kindsByTab.get(def.tab) ?? [];
      list.push(def.key);
      kindsByTab.set(def.tab, list);
    }
    // Kinds whose features the character actually has, grouped by their tab.
    for (const [tab, kinds] of [...kindsByTab.entries()]) {
      const present = kinds.filter((kind) => (character.features[kind] ?? []).length > 0);
      if (present.length) kindsByTab.set(tab, present);
      else kindsByTab.delete(tab);
    }

    const tabs: { id: string; label: string; badge?: number }[] = [{ id: "overview", label: "Overview" }];
    if (character.actions.length || character.effects.length)
      // The badge counts effects that are currently up, not unaffordable actions:
      // "three smites you can't pay for" is not something to act on.
      tabs.push({ id: "actions", label: "Actions", badge: character.effects.filter((e) => e.active).length });
    if (character.spellcasting) tabs.push({ id: "spells", label: "Spells" });
    tabs.push({ id: "inventory", label: "Inventory" });

    const featureKinds = kindsByTab.get("features");
    if (featureKinds?.length) tabs.push({ id: "features", label: "Features" });

    // Any other tab a kind definition asked for: a Mystic source's Disciplines tab
    // arrives here without a plugin change.
    for (const tab of kindsByTab.keys()) {
      if (BUILT_IN_TABS.includes(tab as (typeof BUILT_IN_TABS)[number])) continue;
      if (tabs.some((t) => t.id === tab)) continue;
      tabs.push({ id: tab, label: prettyPath(tab) });
    }

    if (store.data.details) tabs.push({ id: "details", label: "Details" });
    tabs.push({ id: "log", label: "Log" });

    // Tabs with a dedicated panel render that panel and nothing else; without this,
    // the Inventory tab would list every item a second time as a feature card.
    const generatedTabs = new Set(
      [...kindsByTab.keys()].filter(
        (tab) => tab === "features" || !BUILT_IN_TABS.includes(tab as (typeof BUILT_IN_TABS)[number]),
      ),
    );
    return { tabs, kindsByTab, generatedTabs };
  }, [store.index, store.data.details, character]);
}

function SheetHeader({
  store,
  character,
  playMode,
  onPlayMode,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  playMode: boolean;
  onPlayMode: (value: boolean) => void;
}): ReactNode {
  const { app } = usePlugin();
  const avatarPath = store.data.details?.frontmatter.avatar;
  const avatar = avatarPath ? app.vault.adapter.getResourcePath(avatarPath) : undefined;
  const classLine = character.classes
    .map((c) => `${c.name} ${c.level}${c.subclass ? ` (${c.subclass.name})` : ""}`)
    .join(" / ");

  return (
    <header className="dg-sheet-header">
      {avatar ? <img className="dg-avatar" src={avatar} alt="" /> : <div className="dg-avatar is-empty" />}
      <div className="dg-identity">
        <h2>{character.name}</h2>
        <p className="dg-muted">
          {[classLine || "No class yet", character.species?.name, character.background?.name]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="dg-muted">
          Level {character.level}
          {character.xp !== undefined ? ` · ${character.xp} XP` : ""} · Proficiency{" "}
          {signed(character.proficiencyBonus.value)}
        </p>
      </div>
      <div className="dg-header-actions">
        <button
          className={character.status.inspiration ? "dg-button is-active" : "dg-button"}
          onClick={() => store.appendEvents(event("inspiration", { value: !character.status.inspiration }))}
          title="Inspiration"
        >
          <Icon name="sparkle" /> Inspiration
        </button>
        <label className="dg-toggle">
          <input type="checkbox" checked={playMode} onChange={(e) => onPlayMode(e.currentTarget.checked)} />
          Play mode
        </label>
      </div>
    </header>
  );
}

/** HP, rests and the conditions that matter at the table, always on screen. */
function VitalsBar({
  store,
  character,
  readOnly,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  readOnly?: boolean;
}): ReactNode {
  const [amount, setAmount] = useState(1);
  const effectiveMax = character.hp.max.value + character.hp.tempMax;
  const dying = character.hp.current === 0;

  const apply = (type: "damage" | "heal" | "temp-hp"): void => {
    if (type === "temp-hp") store.appendEvents(event("temp-hp", { amount }));
    else store.appendEvents(event(type, { amount }));
  };

  return (
    <div className="dg-vitals">
      <div className="dg-hp">
        <div className="dg-hp-figure">
          <span className="dg-hp-current">{character.hp.current}</span>
          <span className="dg-muted"> / {effectiveMax}</span>
          {character.hp.temp > 0 ? <Pill tone="info">+{character.hp.temp} temp</Pill> : null}
          {character.hp.tempMax !== 0 ? <Pill>max {signed(character.hp.tempMax)}</Pill> : null}
        </div>
        {!readOnly && (
          <div className="dg-hp-controls">
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.currentTarget.value)))}
              aria-label="Amount"
            />
            <button className="dg-button is-damage" onClick={() => apply("damage")}>
              Damage
            </button>
            <button className="dg-button is-heal" onClick={() => apply("heal")}>
              Heal
            </button>
            <button className="dg-button is-quiet" onClick={() => apply("temp-hp")}>
              Temp HP
            </button>
          </div>
        )}
      </div>

      <div className="dg-vitals-stats">
        <StatValue stat={character.ac} label="AC" display={String(character.ac.value)} />
        <StatValue stat={character.initiative} label="Initiative" />
        <StatValue
          stat={character.speed.walk}
          label="Speed"
          display={`${character.speed.walk?.value ?? 0} ft`}
        />
      </div>

      <div className="dg-rests">
        <div className="dg-hit-dice">
          {character.hp.hitDice.map((pool) => (
            <div key={pool.die}>
              <span className="dg-muted">Hit dice {pool.die}</span>
              <Pips
                total={pool.max}
                filled={pool.spent}
                label={`${pool.die} hit dice`}
                onToggle={
                  readOnly
                    ? undefined
                    : (i) =>
                        store.appendEvents(
                          i < pool.spent
                            ? event("regain", { target: `hitDice.${pool.die}`, amount: pool.spent - i })
                            : event("spend", { target: `hitDice.${pool.die}`, amount: i + 1 - pool.spent }),
                        )
                }
              />
            </div>
          ))}
        </div>
        {!readOnly && (
          <div className="dg-rest-buttons">
            <button className="dg-button" onClick={() => store.rest("short")}>
              Short rest
            </button>
            <button className="dg-button" onClick={() => store.rest("long")}>
              Long rest
            </button>
          </div>
        )}
      </div>

      {dying ? <DeathSaves store={store} character={character} readOnly={readOnly} /> : null}
      <ConditionsStrip store={store} character={character} readOnly={readOnly} />
    </div>
  );
}

function DeathSaves({
  store,
  character,
  readOnly,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  readOnly?: boolean;
}): ReactNode {
  const { successes, failures } = character.status.deathSaves;
  return (
    <div className="dg-death-saves">
      <span>Death saves</span>
      <div>
        <span className="dg-muted">successes</span>
        <Pips total={3} filled={successes} label="death save success" />
        <span className="dg-muted">failures</span>
        <Pips total={3} filled={failures} label="death save failure" />
      </div>
      {!readOnly && (
        <div className="dg-rest-buttons">
          <button className="dg-button" onClick={() => store.appendEvents(event("death-save", { result: "success" }))}>
            Success
          </button>
          <button className="dg-button is-damage" onClick={() => store.appendEvents(event("death-save", { result: "failure" }))}>
            Failure
          </button>
          <button className="dg-button is-quiet" onClick={() => store.appendEvents(event("death-save", { result: "reset" }))}>
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

function ConditionsStrip({
  store,
  character,
  readOnly,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  readOnly?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const active = new Set(character.status.conditions);
  const immune = new Set(character.sets["conditionImmunities"]?.values ?? []);
  const exhaustion = character.status.exhaustion;

  return (
    <div className="dg-conditions">
      <button className="dg-button is-quiet" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Conditions{active.size ? ` (${active.size})` : ""}
        {exhaustion ? ` · exhaustion ${exhaustion}` : ""}
      </button>
      {[...active].map((condition) => (
        <Pill key={condition} tone="warn">
          {condition}
        </Pill>
      ))}
      {open && (
        <div className="dg-condition-picker">
          {CONDITIONS.map((condition) => (
            <label key={condition} className={immune.has(condition) ? "is-immune" : ""}>
              <input
                type="checkbox"
                checked={active.has(condition)}
                disabled={readOnly || immune.has(condition)}
                onChange={(e) =>
                  store.appendEvents(
                    e.currentTarget.checked
                      ? event("condition.add", { condition })
                      : event("condition.remove", { condition }),
                  )
                }
              />
              {condition}
              {immune.has(condition) ? <span className="dg-muted"> immune</span> : null}
            </label>
          ))}
          <label className="dg-exhaustion">
            Exhaustion
            <input
              type="number"
              min={0}
              max={6}
              value={exhaustion}
              disabled={readOnly}
              onChange={(e) => store.appendEvents(event("exhaustion", { level: Number(e.currentTarget.value) }))}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function Overview({
  store,
  character,
  nameOf,
  readOnly,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  nameOf: (id: string) => string;
  readOnly?: boolean;
}): ReactNode {
  const { plugin } = usePlugin();
  const showBreakdowns = plugin.settings.layout.showBreakdowns;

  return (
    <div className="dg-overview">
      <Section title="Abilities" className="dg-abilities">
        <div className="dg-ability-grid">
          {ABILITIES.map((ability) => {
            const block = character.abilities[ability];
            return (
              <div className="dg-ability" key={ability}>
                <span className="dg-ability-name">{ability.toUpperCase()}</span>
                <StatValue
                  stat={block.score}
                  label="score"
                  display={String(block.score.value)}
                  showBreakdown={showBreakdowns}
                  className="dg-ability-score"
                />
                <span className="dg-ability-mod">{signed(block.mod)}</span>
                <StatValue stat={block.save} label="save" showBreakdown={showBreakdowns} />
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Skills">
        <ul className="dg-skill-list">
          {character.skills.map((skill) => (
            <li key={skill.key}>
              <StatValue
                stat={skill.stat}
                showBreakdown={showBreakdowns}
                label={
                  <>
                    <span className={skill.stat.proficiency ? `dg-prof is-${skill.stat.proficiency}` : "dg-prof"} />
                    {skill.name}
                    <span className="dg-muted"> {skill.ability.toUpperCase()}</span>
                  </>
                }
              />
              <span className="dg-muted dg-passive">passive {skill.passive}</span>
            </li>
          ))}
        </ul>
      </Section>

      <ResourcesPanel character={character} store={store} readOnly={readOnly} />

      {Object.keys(character.senses).length > 0 && (
        <Section title="Senses">
          <ul className="dg-inline-list">
            {Object.entries(character.senses).map(([name, stat]) => (
              <li key={name}>
                {prettyPath(name)} {stat.value} ft
              </li>
            ))}
          </ul>
        </Section>
      )}

      {Object.keys(character.speed).length > 1 && (
        <Section title="Movement">
          <ul className="dg-inline-list">
            {Object.entries(character.speed).map(([name, stat]) => (
              <li key={name}>
                {prettyPath(name)} {stat.value} ft
              </li>
            ))}
          </ul>
        </Section>
      )}

      <SetsPanel character={character} nameOf={nameOf} />

      {character.pendingChoices.some((c) => !c.complete) ? (
        <Section title="Still to choose">
          <ul>
            {character.pendingChoices
              .filter((c) => !c.complete)
              .map((choice) => (
                <li key={`${choice.id}-${choice.levelIndex ?? "build"}`}>
                  {choice.name}
                  <span className="dg-muted">
                    {" "}
                    — {choice.sourceName}
                    {choice.level ? ` (level ${choice.level})` : ""}
                  </span>
                </li>
              ))}
          </ul>
          <p className="dg-muted">Open the builder to make these choices.</p>
        </Section>
      ) : null}

      {character.elements.length === 0 ? <Empty>Nothing selected yet. Open the builder to start.</Empty> : null}
    </div>
  );
}
