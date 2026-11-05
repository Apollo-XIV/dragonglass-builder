/**
 * The character sheet in the narrow layout (spec 6): one vertical scroll, in rail
 * order, with no tabs.
 *
 * Every number that can be rolled is a box you tap to roll and hold to explain;
 * every row of text is held to read. Sections that don't apply — Spells for a
 * character with no spellcasting — are absent from the page and from the rail.
 */

import { useMemo, useState, type ReactNode } from "react";
import { factsOf } from "../../../core/content/facts";
import { weaponAttacks } from "../../../core/resolver/attacks";
import { explainParts, explainSet, explainStat, type Explanation } from "../../../core/resolver/explain";
import type { ResolvedCharacter, ResolvedResource, ResolvedSpell } from "../../../core/resolver/resolved";
import { event } from "../../../core/state/fold";
import type { CharacterStore } from "../../character-store";
import { AbilityBlock } from "../abilities";
import { Markdown, signed } from "../components";
import { prettyPath } from "../sheet-panels";
import { useNarrowSettings } from "./context";
import { Rail } from "./rail";
import { NarrowScroller, type SectionSpec } from "./scroller";
import { useSheet } from "./sheet";
import { ArmourTile, InitiativeTile, ProficiencyTile, SpeedTile } from "../stat-tiles";
import { ChipRow } from "../builder/chips";
import { HoldReadTarget, HoldRollTarget, ReadRow, ResourcePill, RollBox, TextBody } from "./targets";
import { useToast } from "./toast";

/** Section ids are stable; the order comes from the settings (spec 4.4). */
const SHEET_ICONS: Record<string, string> = {
  overview: "heart",
  actions: "swords",
  spells: "sparkles",
  inventory: "backpack",
  features: "scroll",
  proficiencies: "target",
  details: "user",
};

export function NarrowSheet({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const settings = useNarrowSettings();

  const sections = useMemo(() => {
    const available = new Map<string, Omit<SectionSpec, "icon">>();

    available.set("overview", {
      id: "overview",
      label: "Overview",
      status: `AC ${character.ac.value} · init ${signed(character.initiative.value)}`,
      body: <OverviewSection store={store} character={character} />,
    });

    const attacks = weaponAttacks(character);
    if (attacks.length || character.actions.length || character.effects.length)
      available.set("actions", {
        id: "actions",
        label: "Actions",
        status: `${attacks.length} ${attacks.length === 1 ? "attack" : "attacks"}`,
        body: <ActionsSection store={store} character={character} />,
      });

    // A caster with nothing to cast has no spells to read or roll, so the section
    // stays off the page and the rail.
    if (character.spellcasting && character.spellcasting.spells.length > 0)
      available.set("spells", {
        id: "spells",
        label: "Spells",
        status: slotStatus(character),
        // Concentration is the thing you most need to be reminded of (spec 4.2).
        attention: Boolean(character.status.concentration),
        body: <SpellsSection store={store} character={character} />,
      });

    // The resolver always reports all five coin types, so "has currency" means a
    // non-zero one; otherwise Inventory could never be absent.
    const hasMoney = Object.values(character.currency).some((n) => n > 0);
    if (character.inventory.length || hasMoney)
      available.set("inventory", {
        id: "inventory",
        label: "Inventory",
        status: `${Math.round(character.carried.weight)} lb`,
        body: <InventorySection character={character} />,
      });

    const features = featureList(character);
    if (features.length)
      available.set("features", {
        id: "features",
        label: "Features",
        // An unspent once-per-rest feature is worth a pip: it is the thing players
        // forget they still have.
        attention: character.resources.some((r) => r.remaining === r.max && r.max > 0 && r.recharge.endsWith("rest")),
        status: `${features.length}`,
        body: <FeaturesSection store={store} character={character} />,
      });

    available.set("proficiencies", {
      id: "proficiencies",
      label: "Proficiencies",
      body: <ProficienciesSection store={store} character={character} />,
    });

    if (store.data.details)
      available.set("details", { id: "details", label: "Details", body: <DetailsSection store={store} /> });

    // The settings give the order; anything a newer version adds and the stored
    // order doesn't know about is appended rather than dropped.
    const ordered: SectionSpec[] = [];
    for (const id of settings.sheetSections) {
      const section = available.get(id);
      if (section) ordered.push({ ...section, icon: SHEET_ICONS[id] ?? "circle" });
      available.delete(id);
    }
    for (const [id, section] of available) ordered.push({ ...section, icon: SHEET_ICONS[id] ?? "circle" });
    return ordered;
  }, [store, character, settings.sheetSections]);

  return (
    <NarrowScroller sections={sections}>
      <Rail sections={sections} />
    </NarrowScroller>
  );
}

function slotStatus(character: ResolvedCharacter): string {
  const slots = character.spellcasting?.slots ?? [];
  const remaining = slots.reduce((n, s) => n + s.remaining, 0);
  const max = slots.reduce((n, s) => n + s.max, 0);
  return max ? `${remaining}/${max} slots` : "";
}

/** Kinds the Proficiencies section shows, so Features does not repeat them. */
const PROFICIENCY_KINDS = new Set(["skill", "tool", "language"]);

export function featureList(character: ResolvedCharacter): ResolvedCharacter["features"][string] {
  // Everything the sheet's Features section shows: the kinds a source marked for
  // the features tab, flattened.
  return Object.entries(character.features)
    .filter(([kind]) => kind !== "item" && kind !== "spell" && !PROFICIENCY_KINDS.has(kind.split(":").pop() ?? kind))
    .flatMap(([, list]) => list);
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function OverviewSection({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  return (
    <>
      <HpBlock store={store} character={character} />
      <div className="dg-d-cluster dg-n-stat-cluster">
        <SpeedTile character={character} Read={HoldReadTarget} />
        <ArmourTile character={character} Read={HoldReadTarget} />
        <InitiativeTile character={character} Roll={HoldRollTarget} />
        <ProficiencyTile character={character} Read={HoldReadTarget} />
      </div>

      <div className="dg-n-ability-block">
        <AbilityBlock character={character} Target={HoldRollTarget} />
      </div>

      {character.resources.length > 0 ? (
        <div className="dg-n-resources">
          {character.resources.map((resource) => (
            <ResourceRow key={resource.key} resource={resource} store={store} />
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * HP. The pair of buttons takes one point at a time, which is what a torch or a
 * second of concentration costs; holding the number opens the sheet where damage
 * and healing are entered properly.
 */
function HpBlock({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const sheet = useSheet();
  const max = character.hp.max.value + character.hp.tempMax;
  const low = character.hp.current <= max / 2;

  const open = (): void =>
    sheet.open({
      title: "Hit points",
      subtitle: `${character.hp.current} of ${max}`,
      body: () => <HpEditor store={store} character={character} />,
    });

  return (
    <div className="dg-n-hp">
      <button className="dg-n-hp-step" onClick={() => store.appendEvents(event("damage", { amount: 1 }))} aria-label="Take one damage">
        −
      </button>
      <ReadRow title={`${character.hp.current} / ${max}`} onTap={open} className={low ? "dg-n-hp-figure is-low" : "dg-n-hp-figure"}>
        {character.hp.temp > 0 ? <span className="dg-n-temp">+{character.hp.temp} temp</span> : null}
      </ReadRow>
      <button className="dg-n-hp-step" onClick={() => store.appendEvents(event("heal", { amount: 1 }))} aria-label="Heal one point">
        +
      </button>
    </div>
  );
}

function HpEditor({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const [amount, setAmount] = useState(1);
  return (
    <div className="dg-n-hp-editor">
      <input
        type="number"
        min={0}
        value={amount}
        aria-label="Amount"
        onChange={(e) => setAmount(Math.max(0, Number(e.currentTarget.value)))}
      />
      <div className="dg-n-hp-buttons">
        <button className="dg-sheet-button" onClick={() => store.appendEvents(event("damage", { amount }))}>
          Damage
        </button>
        <button className="dg-sheet-button is-primary" onClick={() => store.appendEvents(event("heal", { amount }))}>
          Heal
        </button>
        <button className="dg-sheet-button" onClick={() => store.appendEvents(event("temp-hp", { amount }))}>
          Temp HP
        </button>
      </div>
      <div className="dg-n-hp-buttons">
        <button className="dg-sheet-button" onClick={() => store.rest("short")}>
          Short rest
        </button>
        <button className="dg-sheet-button" onClick={() => store.rest("long")}>
          Long rest
        </button>
      </div>
      <p className="dg-muted">
        Hit dice: {character.hp.hitDice.map((pool) => `${pool.remaining}${pool.die}`).join(", ") || "none"}
      </p>
    </div>
  );
}

function StatTile({
  label,
  value,
  explanation,
}: {
  label: string;
  value: string;
  explanation?: () => Explanation;
}): ReactNode {
  const sheet = useSheet();
  return (
    <ReadRow
      title={value}
      subtitle={label}
      className="dg-n-tile"
      onTap={
        explanation
          ? () => {
              const current = explanation();
              sheet.open({ title: current.label, body: () => <TextBody formula={current.formula} /> });
            }
          : undefined
      }
    />
  );
}

/**
 * Changing a pool reads its current value from the store when the button is
 * pressed, not from the render that drew the row. The resource menu stays open
 * while you spend (spec 3.3.3), so by the second press the captured value would
 * be a step behind and the stepper would fight the player.
 */
function usePoolControls(
  store: CharacterStore,
  target: string,
  read: () => number,
): { spend: () => void; set: (to: number) => void } {
  return {
    spend: () => store.appendEvents(event("spend", { target, amount: 1 })),
    set: (to) => {
      const delta = to - read();
      if (delta === 0) return;
      store.appendEvents(
        delta > 0 ? event("regain", { target, amount: delta }) : event("spend", { target, amount: -delta }),
      );
    },
  };
}

function ResourceRow({ resource, store }: { resource: ResolvedResource; store: CharacterStore }): ReactNode {
  return (
    <ReadRow
      title={resource.name}
      subtitle={`${resource.recharge.replace("-", " ")} · ${resource.sourceName}`}
      text={resource.notes}
    >
      <ResourcePillFor resource={resource} store={store} />
    </ReadRow>
  );
}

function ResourcePillFor({ resource, store }: { resource: ResolvedResource; store: CharacterStore }): ReactNode {
  const read = (): { remaining: number; max: number } => {
    const live = store.resolved?.resources.find((r) => r.key === resource.key);
    return { remaining: live?.remaining ?? resource.remaining, max: live?.max ?? resource.max };
  };
  const { spend, set } = usePoolControls(store, `resources.${resource.key}`, () => read().remaining);
  return (
    <ResourcePill
      name={resource.name}
      remaining={resource.remaining}
      max={resource.max}
      text={resource.notes}
      subtitle={resource.sourceName}
      read={read}
      onSpend={spend}
      onSet={set}
    />
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const ACTIVATION_CHIPS = [
  { id: "all", label: "All" },
  { id: "action", label: "Action" },
  { id: "bonus-action", label: "Bonus" },
  { id: "reaction", label: "Reaction" },
];

export function ActionsSection({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const [filter, setFilter] = useState("all");
  const attacks = useMemo(() => weaponAttacks(character), [character]);
  const actions = character.actions.filter((a) => filter === "all" || a.activation === filter);

  return (
    <>
      <ChipRow chips={ACTIVATION_CHIPS} active={filter} onPick={setFilter} />

      {attacks.map((attack) => (
        <ReadRow
          key={attack.key}
          title={attack.name}
          subtitle={[attack.ranged ? "Ranged" : "Melee", attack.damageType, attack.range].filter(Boolean).join(" · ")}
          text={typeof attack.item.element.text === "string" ? attack.item.element.text : undefined}
        >
          <RollBox
            kind="d20"
            label={`${attack.name} attack`}
            explanation={() =>
              explainParts({
                label: `${attack.name} attack`,
                kind: "d20",
                notation: `1d20 ${signed(attack.attackBonus)}`,
                parts: attack.attackParts,
              })
            }
          />
          <RollBox
            kind="damage"
            display={attack.damage}
            label={`${attack.name} damage`}
            explanation={() =>
              explainParts({
                label: `${attack.name} damage`,
                kind: "damage",
                notation: attack.damage,
                parts: [{ label: attack.damageDice, amount: 0 }, ...attack.damageParts],
              })
            }
          />
        </ReadRow>
      ))}

      {actions.map((action) => (
        <ReadRow
          key={action.key}
          title={action.name}
          subtitle={[action.activation.replace("-", " "), action.range, action.save ? `DC ${action.save.dc} ${action.save.ability.toUpperCase()}` : undefined]
            .filter(Boolean)
            .join(" · ")}
          text={action.text}
          className={action.available ? undefined : "is-unavailable"}
        >
          {action.damageResolved ? (
            <RollBox
              kind="damage"
              display={action.damageResolved}
              label={`${action.name} damage`}
              explanation={() =>
                explainParts({
                  label: action.name,
                  kind: "damage",
                  notation: action.damageResolved,
                  parts: [{ label: action.damageResolved ?? "", amount: 0 }],
                })
              }
            />
          ) : null}
          {action.resolvedCost?.length || action.applies ? (
            <UseButton character={character} store={store} actionKey={action.key} />
          ) : null}
        </ReadRow>
      ))}

      {character.effects.filter((e) => e.active).length > 0 ? (
        <div className="dg-n-effects">
          {character.effects
            .filter((e) => e.active)
            .map((effect) => (
              <ReadRow key={effect.id} title={effect.name} subtitle={effect.duration ?? "active"} text={effect.text}>
                <button
                  className="dg-n-chip is-action"
                  onClick={() => store.appendEvents(event("effect.end", { effect: effect.id }))}
                >
                  End
                </button>
              </ReadRow>
            ))}
        </div>
      ) : null}
    </>
  );
}

function UseButton({
  character,
  store,
  actionKey,
}: {
  character: ResolvedCharacter;
  store: CharacterStore;
  actionKey: string;
}): ReactNode {
  const toast = useToast();
  const action = character.actions.find((a) => a.key === actionKey);
  if (!action) return null;
  return (
    <button
      className="dg-n-chip is-action"
      disabled={!action.available}
      onClick={() => {
        const events = [];
        for (const cost of action.resolvedCost ?? [])
          events.push(
            event("spend", { target: cost.key, amount: typeof cost.amount === "number" ? cost.amount : cost.amount.min }),
          );
        if (action.applies) events.push(event("effect.start", { effect: action.applies, source: action.source }));
        if (events.length) store.appendEvents(...events);
        toast.show({ label: action.name, detail: action.applies ? "Applied" : "Used" });
      }}
    >
      Use
    </button>
  );
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

export function SpellsSection({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const casting = character.spellcasting;
  const [filter, setFilter] = useState("all");
  if (!casting) return null;

  const levels = [...new Set(casting.spells.map((s) => s.spellLevel))].sort((a, b) => a - b);
  const chips = [
    { id: "all", label: "All" },
    ...levels.map((level) => ({ id: `level-${level}`, label: level === 0 ? "Cantrip" : `Lv ${level}` })),
    { id: "ritual", label: "Ritual" },
    { id: "concentration", label: "Conc." },
  ];

  const spells = casting.spells.filter((spell) => matchesSpellFilter(spell, filter));

  return (
    <>
      <div className="dg-n-stat-row">
        {casting.classes.map((cls) => (
          <div className="dg-n-tile" key={cls.class}>
            <StatTile
              label={`${cls.name} save DC`}
              value={String(cls.dc.value)}
              explanation={() => explainStat(cls.dc, { label: `${cls.name} spell save DC` })}
            />
            <RollBox
              kind="d20"
              label={`${cls.name} spell attack`}
              explanation={() => explainStat(cls.attack, { label: `${cls.name} spell attack`, kind: "d20" })}
            />
          </div>
        ))}
      </div>

      {character.status.concentration ? (
        <div className="dg-n-banner">
          <span>
            Concentrating on {character.status.concentration.name ?? character.status.concentration.on}
          </span>
          <button
            className="dg-n-chip is-action"
            onClick={() => store.appendEvents(event("concentration.end", {}))}
          >
            End
          </button>
        </div>
      ) : null}

      <div className="dg-n-slots">
        {casting.slots.map((slot) => (
          <SlotPill key={slot.level} store={store} level={slot.level} remaining={slot.remaining} max={slot.max} />
        ))}
        {casting.pact ? (
          <SlotPill store={store} level={casting.pact.level} remaining={casting.pact.remaining} max={casting.pact.max} pact />
        ) : null}
      </div>

      <ChipRow chips={chips} active={filter} onPick={setFilter} />

      {spells.map((spell) => (
        <ReadRow
          key={spell.id}
          title={spell.name}
          subtitle={[
            spell.spellLevel === 0 ? "Cantrip" : `Level ${spell.spellLevel}`,
            spell.castingTime,
            spell.range,
            spell.concentration ? "concentration" : undefined,
            spell.ritual ? "ritual" : undefined,
          ]
            .filter(Boolean)
            .join(" · ")}
          text={spell.text}
          facts={factsOf(spell.element)}
          className={spell.prepared || spell.alwaysPrepared ? "is-prepared" : undefined}
        />
      ))}
      {spells.length === 0 ? <p className="dg-muted">No spells match this filter.</p> : null}
    </>
  );
}

function matchesSpellFilter(spell: ResolvedSpell, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "ritual") return Boolean(spell.ritual);
  if (filter === "concentration") return Boolean(spell.concentration);
  const level = filter.match(/^level-(\d+)$/);
  return level ? spell.spellLevel === Number(level[1]) : true;
}

function SlotPill({
  store,
  level,
  remaining,
  max,
  pact,
}: {
  store: CharacterStore;
  level: number;
  remaining: number;
  max: number;
  pact?: boolean;
}): ReactNode {
  const target = pact ? "pact" : `slots.${level}`;
  const read = (): { remaining: number; max: number } => {
    const casting = store.resolved?.spellcasting;
    const pool = pact ? casting?.pact : casting?.slots.find((s) => s.level === level);
    return { remaining: pool?.remaining ?? remaining, max: pool?.max ?? max };
  };
  const { spend, set } = usePoolControls(store, target, () => read().remaining);

  return (
    <div className="dg-n-slot">
      <span className="dg-n-slot-label">{pact ? `Pact ${level}` : level}</span>
      <ResourcePill
        name={pact ? `Pact magic (level ${level})` : `Level ${level} slots`}
        remaining={remaining}
        max={max}
        read={read}
        onSpend={spend}
        onSet={set}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inventory, features, skills, details
// ---------------------------------------------------------------------------

export function InventorySection({ character }: { character: ResolvedCharacter }): ReactNode {
  const currency = Object.entries(character.currency).filter(([, n]) => n > 0);
  return (
    <>
      <p className="dg-muted">
        {Math.round(character.carried.weight)} of {Math.round(character.carried.capacity)} lb
        {currency.length ? ` · ${currency.map(([unit, n]) => `${n} ${unit}`).join(", ")}` : ""}
      </p>
      {character.inventory.map((item) => (
        <ReadRow
          key={`${item.element.id}-${item.index}`}
          title={item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name}
          subtitle={[item.equipped ? "equipped" : undefined, item.attuned ? "attuned" : undefined, item.weight ? `${item.weight} lb` : undefined]
            .filter(Boolean)
            .join(" · ")}
          text={typeof item.element.text === "string" ? item.element.text : undefined}
          facts={factsOf(item.element)}
        />
      ))}
      {character.inventory.length === 0 ? <p className="dg-muted">Nothing carried.</p> : null}
    </>
  );
}

/** Kinds that carry a class but are not the class's own features. */
const NOT_CLASS_KINDS = new Set(["skill", "language", "tool", "feat"]);

export function FeaturesSection({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const byKey = new Map(character.resources.map((r) => [r.source, r] as const));
  const [filter, setFilter] = useState("all");
  const all = featureList(character);
  const label = (kind: string): string => store.index?.kindLabel(kind, true) ?? kind;
  const groupOf = (f: (typeof all)[number]): { id: string; label: string } => {
    const kind = f.kind.split(":").pop() ?? f.kind;
    // Species, Subspecies and Species Trait read as one thing to a player; so do
    // Background and Background Feature.
    if (kind.includes("species")) return { id: "species", label: "Species" };
    if (kind.includes("background")) return { id: "background", label: "Background" };
    // Anything that came down a class's progression is that class's, whatever
    // its kind: the class itself, its subclass, its features, and what they
    // granted (metamagic). Proficiencies and feats keep their own chip.
    if (f.class && !NOT_CLASS_KINDS.has(kind)) {
      const name = character.classes.find((c) => c.id === f.class)?.name ?? f.class;
      return { id: `class:${f.class}`, label: name };
    }
    return { id: f.kind, label: label(f.kind) };
  };
  const groups = new Map<string, string>();
  for (const f of all) {
    const g = groupOf(f);
    if (!groups.has(g.id)) groups.set(g.id, g.label);
  }
  const kinds = [...groups.keys()];
  const chips = [{ id: "all", label: "All" }, ...kinds.map((id) => ({ id, label: groups.get(id) ?? id }))];
  // A filter whose kind has since gone (a level removed) falls back to everything.
  const active = kinds.includes(filter) ? filter : "all";
  const features = all.filter((f) => active === "all" || groupOf(f).id === active);
  return (
    <>
      {kinds.length > 1 ? <ChipRow chips={chips} active={active} onPick={setFilter} /> : null}
      {features.map((feature) => {
        const resource = byKey.get(feature.id);
        return (
          <ReadRow
            key={`${feature.id}-${feature.origin.join("/")}`}
            title={feature.name}
            subtitle={[feature.class ? labelForClass(character, feature) : undefined, store.index?.kindLabel(feature.kind) ?? feature.kind]
              .filter(Boolean)
              .join(" · ")}
            text={feature.text}
          >
            {resource ? <ResourcePillFor resource={resource} store={store} /> : null}
          </ReadRow>
        );
      })}
    </>
  );
}

function labelForClass(character: ResolvedCharacter, feature: { class?: string; level?: number }): string {
  const cls = character.classes.find((c) => c.id === feature.class);
  return `${cls?.name ?? feature.class ?? ""}${feature.level ? ` ${feature.level}` : ""}`.trim();
}

/** The order a character sheet prints them in, then anything a source adds. */
const PROFICIENCY_GROUPS = [
  { path: "proficiencies.armor", label: "Armour" },
  { path: "proficiencies.weapon", label: "Weapons" },
  { path: "proficiencies.tool", label: "Tools" },
  { path: "languages", label: "Languages" },
];

/** Skills, then senses, then the sets: the same three lists the desktop keeps on screen. */
export function ProficienciesSection({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const nameOf = (id: string): string => store.index?.get(id)?.name ?? prettyPath(id);
  const passives = character.skills.filter((s) =>
    ["perception", "investigation", "insight"].some((k) => s.key.endsWith(k)),
  );
  const senses = Object.entries(character.senses).filter(([, stat]) => stat.value > 0);
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
    <>
      <h4 className="dg-n-subhead">Skills</h4>
      {character.skills.map((skill) => (
        <div className="dg-n-skill" key={skill.key}>
          <span className={skill.stat.proficiency ? `dg-n-prof is-${skill.stat.proficiency}` : "dg-n-prof"} />
          <span className="dg-n-skill-name">{skill.name}</span>
          <span className="dg-n-skill-ability">{skill.ability.toUpperCase()}</span>
          <RollBox
            kind="d20"
            label={`${skill.name} check`}
            explanation={() => explainStat(skill.stat, { label: skill.name, kind: "d20" })}
          />
        </div>
      ))}

      <h4 className="dg-n-subhead">Senses</h4>
      {passives.map((skill) => (
        <ReadRow
          key={skill.key}
          title={`Passive ${skill.name}`}
          formula={explainParts({
            label: `Passive ${skill.name}`,
            parts: [
              { label: "Passive base", amount: 10 },
              { label: skill.name, amount: skill.stat.value },
            ],
          }).formula}
        >
          <span className="dg-n-sense-value">{skill.passive}</span>
        </ReadRow>
      ))}
      {senses.map(([name, stat]) => (
        <ReadRow
          key={name}
          title={prettyPath(name)}
          formula={explainStat(stat, { label: prettyPath(name) }).formula}
        >
          <span className="dg-n-sense-value">{stat.value} ft</span>
        </ReadRow>
      ))}
      {!senses.length ? <p className="dg-muted">No special senses.</p> : null}

      <h4 className="dg-n-subhead">Proficiencies</h4>
      {groups.map((group) => {
        const stat = character.sets[group.path];
        return (
          <ReadRow
            key={group.path}
            title={group.label}
            subtitle={stat.values.length ? stat.values.map(nameOf).join(", ") : "none"}
            formula={explainSet(stat, group.label).formula}
          />
        );
      })}
      {!groups.length ? <p className="dg-muted">Nothing yet.</p> : null}
    </>
  );
}

export function DetailsSection({ store }: { store: CharacterStore }): ReactNode {
  const details = store.data.details;
  if (!details) return null;
  // `kind` and `schemaVersion` say what the file is, not what the character is
  // like, and `avatar` is a path the header already uses.
  const skip = new Set(["kind", "schemaVersion", "avatar"]);
  const traits = Object.entries(details.frontmatter ?? {}).filter(
    ([key, value]) => typeof value === "string" && value && !skip.has(key),
  );
  return (
    <>
      {traits.map(([key, value]) => (
        <ReadRow key={key} title={String(value)} subtitle={key} />
      ))}
      {details.preamble.trim() ? <Markdown source={details.preamble} /> : null}
      {details.sections.map((section) => (
        <div className="dg-n-detail-section" key={section.heading}>
          <h4>{section.heading}</h4>
          <Markdown source={section.body} />
        </div>
      ))}
    </>
  );
}

/**
 * A horizontally scrolling row of filter chips (spec 6, decided). Shared with the
 * desktop layout's tabs panel, which keeps the same chips at a different density.
 */
