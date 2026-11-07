/**
 * The sheet's tab bodies. Each one reads the resolved character and records changes
 * as events in `state.5e`; none of them work out a rule for themselves.
 */

import { useMemo, useState, type ReactNode } from "react";
import type {
  ResolvedAction,
  ResolvedCharacter,
  ResolvedEffect,
  ResolvedElement,
  ResolvedItem,
  ResolvedSpell,
} from "../../core/resolver/resolved";
import { describeEvent, event } from "../../core/state/fold";
import { describeRecharge } from "../../core/state/recharge";
import type { InventoryEntry, SpellEntry, StateEvent } from "../../core/types";
import { removeInventoryEntry } from "../../core/index";
import type { CharacterStore } from "../character-store";
import { DETAIL_SECTIONS } from "../character-files";
import {
  Counter,
  ElementInfo,
  Empty,
  Markdown,
  Pill,
  Pips,
  Section,
  StatValue,
  UnmechanisedNote,
  signed,
} from "./components";

const ACTIVATION_ORDER = ["action", "bonus-action", "reaction", "free", "special", "minute", "hour", "passive"];

function activationLabel(activation: string): string {
  switch (activation) {
    case "action":
      return "Action";
    case "bonus-action":
      return "Bonus action";
    case "reaction":
      return "Reaction";
    case "free":
      return "No action";
    case "special":
      return "Special";
    default:
      return activation.charAt(0).toUpperCase() + activation.slice(1);
  }
}

// ---------------------------------------------------------------------------
// Actions and effects
// ---------------------------------------------------------------------------

export function ActionsPanel({
  character,
  store,
  readOnly,
}: {
  character: ResolvedCharacter;
  store: CharacterStore;
  readOnly?: boolean;
}): ReactNode {
  const grouped = useMemo(() => {
    const byActivation = new Map<string, ResolvedAction[]>();
    for (const action of character.actions) {
      const list = byActivation.get(action.activation) ?? [];
      list.push(action);
      byActivation.set(action.activation, list);
    }
    return [...byActivation.entries()].sort(
      (a, b) => orderOf(a[0]) - orderOf(b[0]) || a[0].localeCompare(b[0]),
    );
  }, [character.actions]);

  const use = (action: ResolvedAction): void => {
    const events: StateEvent[] = [];
    for (const cost of action.resolvedCost ?? []) {
      const amount = typeof cost.amount === "number" ? cost.amount : cost.amount.min;
      events.push(event("spend", { target: cost.key, amount }));
    }
    if (action.applies) events.push(event("effect.start", { effect: action.applies, source: action.source }));
    if (events.length) store.appendEvents(...events);
  };

  return (
    <>
      {grouped.length === 0 ? <Empty>No activated features yet.</Empty> : null}
      {grouped.map(([activation, actions]) => (
        <Section key={activation} title={activationLabel(activation)}>
          <ul className="dg-action-list">
            {actions.map((action) => (
              <li key={action.key} className={action.available ? "" : "is-unavailable"}>
                <div className="dg-action-head">
                  <strong>{action.name}</strong>
                  {action.damageResolved ? <Pill>{action.damageResolved} {action.damageType ?? ""}</Pill> : null}
                  {action.save ? <Pill>DC {action.save.dc} {action.save.ability.toUpperCase()}</Pill> : null}
                  {action.range ? <span className="dg-muted">{action.range}</span> : null}
                </div>
                {action.resolvedCost?.length ? (
                  <div className="dg-muted">
                    Costs{" "}
                    {action.resolvedCost
                      .map((c) => `${typeof c.amount === "number" ? c.amount : `${c.amount.min}–${c.amount.max}`} ${c.label}`)
                      .join(", ")}
                  </div>
                ) : null}
                {action.text ? <Markdown source={action.text} /> : null}
                {action.notes ? <p className="dg-muted">{action.notes}</p> : null}
                {!readOnly && (action.resolvedCost?.length || action.applies) ? (
                  <button className="dg-button" onClick={() => use(action)} disabled={!action.available}>
                    {action.applies ? "Use and apply" : "Use"}
                  </button>
                ) : null}
                {!action.available && action.unavailableReason ? (
                  <Pill tone="warn">{action.unavailableReason}</Pill>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ))}

      <EffectsPanel character={character} store={store} readOnly={readOnly} />
    </>
  );
}

function orderOf(activation: string): number {
  const i = ACTIVATION_ORDER.indexOf(activation);
  return i < 0 ? ACTIVATION_ORDER.length : i;
}

export function EffectsPanel({
  character,
  store,
  readOnly,
}: {
  character: ResolvedCharacter;
  store: CharacterStore;
  readOnly?: boolean;
}): ReactNode {
  if (!character.effects.length) return null;
  const toggle = (effect: ResolvedEffect): void => {
    store.appendEvents(
      effect.active
        ? event("effect.end", { effect: effect.id })
        : event("effect.start", { effect: effect.id, source: effect.source }),
    );
  };
  return (
    <Section title="Effects">
      <ul className="dg-effect-list">
        {character.effects.map((effect) => (
          <li key={effect.id} className={effect.active ? "is-active" : ""}>
            <label className="dg-effect-head">
              <input
                type="checkbox"
                checked={effect.active}
                disabled={readOnly}
                onChange={() => toggle(effect)}
              />
              <strong>{effect.name}</strong>
              {effect.duration ? <Pill>{effect.duration}</Pill> : null}
              {effect.concentration ? <Pill tone="info">concentration</Pill> : null}
            </label>
            <div className="dg-muted">from {effect.sourceName}</div>
            {effect.modifiers.length ? (
              <ul className="dg-modifier-list">
                {effect.modifiers.map((mod, i) => (
                  <li key={i}>
                    {mod.target} {mod.op}
                    {mod.value !== undefined ? ` ${Array.isArray(mod.value) ? mod.value.join(", ") : mod.value}` : ""}
                    {mod.when ? <span className="dg-muted"> ({mod.when.text})</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {effect.notes ? <p className="dg-muted">{effect.notes}</p> : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export function ResourcesPanel({
  character,
  store,
  readOnly,
}: {
  character: ResolvedCharacter;
  store: CharacterStore;
  readOnly?: boolean;
}): ReactNode {
  if (!character.resources.length) return null;
  return (
    <Section title="Resources">
      <div className="dg-resource-grid">
        {character.resources.map((resource) => (
          <div className="dg-resource" key={resource.key}>
            <Counter
              label={
                <>
                  {resource.name}
                  <span className="dg-muted"> · {describeRecharge(resource.recharge)}</span>
                </>
              }
              value={resource.remaining}
              max={resource.max}
              unit={resource.unit ?? "use"}
              disabled={readOnly}
              onChange={(delta) =>
                store.appendEvents(
                  delta < 0
                    ? event("spend", { target: `resources.${resource.key}`, amount: 1 })
                    : event("regain", { target: `resources.${resource.key}`, amount: 1 }),
                )
              }
            />
            {resource.max > 0 && resource.max <= 10 ? (
              <Pips
                total={resource.max}
                filled={resource.spent}
                label={resource.name}
                onToggle={
                  readOnly
                    ? undefined
                    : (i) =>
                        store.appendEvents(
                          i < resource.spent
                            ? event("regain", { target: `resources.${resource.key}`, amount: resource.spent - i })
                            : event("spend", { target: `resources.${resource.key}`, amount: i + 1 - resource.spent }),
                        )
                }
              />
            ) : null}
            {resource.notes ? <p className="dg-muted">{resource.notes}</p> : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

export function SpellsPanel({
  character,
  store,
  readOnly,
}: {
  character: ResolvedCharacter;
  store: CharacterStore;
  readOnly?: boolean;
}): ReactNode {
  const casting = character.spellcasting;
  if (!casting) return <Empty>This character has no spellcasting.</Empty>;

  const byLevel = new Map<number, ResolvedSpell[]>();
  for (const spell of casting.spells) {
    const list = byLevel.get(spell.spellLevel) ?? [];
    list.push(spell);
    byLevel.set(spell.spellLevel, list);
  }

  const setPrepared = (spell: ResolvedSpell, prepared: boolean): void => {
    const file = store.data.spells;
    if (!file) return;
    const spells: SpellEntry[] = file.spells.map((entry) =>
      entry.id === spell.id ? { ...entry, prepared } : entry,
    );
    store.update("spells", { ...file, spells });
  };

  return (
    <>
      <Section title="Spellcasting">
        <div className="dg-stat-row">
          {casting.classes.map((cls) => (
            <div className="dg-casting-class" key={cls.class}>
              <h4>{cls.name}</h4>
              <StatValue stat={cls.dc} label="Spell save DC" display={String(cls.dc.value)} />
              <StatValue stat={cls.attack} label="Spell attack" />
              <div className="dg-muted">
                {cls.ability.toUpperCase()} · {cls.type} · {cls.progression} caster
                {cls.known !== undefined ? ` · ${casting.limits.find((l) => l.class === cls.class)?.known.used ?? 0}/${cls.known} known` : ""}
                {cls.prepared !== undefined ? ` · ${casting.limits.find((l) => l.class === cls.class)?.prepared.used ?? 0}/${cls.prepared} prepared` : ""}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {casting.slots.length > 0 && (
        <Section title="Spell slots">
          <div className="dg-slot-grid">
            {casting.slots.map((slot) => (
              <div className="dg-slot" key={slot.level}>
                <Counter
                  label={`Level ${slot.level}`}
                  value={slot.remaining}
                  max={slot.max}
                  unit="slot"
                  disabled={readOnly}
                  onChange={(delta) =>
                    store.appendEvents(
                      delta < 0
                        ? event("spend", { target: `slots.${slot.level}`, amount: 1 })
                        : event("regain", { target: `slots.${slot.level}`, amount: 1 }),
                    )
                  }
                />
                <Pips
                  total={slot.max}
                  filled={slot.spent}
                  label={`Level ${slot.level} slot`}
                  onToggle={
                    readOnly
                      ? undefined
                      : (i) =>
                          store.appendEvents(
                            i < slot.spent
                              ? event("regain", { target: `slots.${slot.level}`, amount: slot.spent - i })
                              : event("spend", { target: `slots.${slot.level}`, amount: i + 1 - slot.spent }),
                          )
                  }
                />
              </div>
            ))}
            {casting.pact ? (
              <div className="dg-slot">
                <Counter
                  label={`Pact magic (level ${casting.pact.level})`}
                  value={casting.pact.remaining}
                  max={casting.pact.max}
                  unit="slot"
                  disabled={readOnly}
                  onChange={(delta) =>
                    store.appendEvents(
                      delta < 0
                        ? event("spend", { target: "pact", amount: 1 })
                        : event("regain", { target: "pact", amount: 1 }),
                    )
                  }
                />
              </div>
            ) : null}
          </div>
        </Section>
      )}

      {casting.orphaned.length > 0 && (
        <Section title="Spells to review">
          <p className="dg-muted">
            These no longer fit the build. They are kept rather than dropped, so nothing is lost by a change of
            class.
          </p>
          <ul>
            {casting.orphaned.map((spell) => (
              <li key={spell.id}>
                {spell.name} <Pill tone="warn">{spell.class ?? "no class"}</Pill>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {[...byLevel.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([level, spells]) => (
          <Section key={level} title={level === 0 ? "Cantrips" : `Level ${level}`}>
            <ul className="dg-spell-list">
              {spells.map((spell) => (
                <SpellRow
                  key={spell.id}
                  spell={spell}
                  readOnly={readOnly}
                  onPrepare={(prepared) => setPrepared(spell, prepared)}
                />
              ))}
            </ul>
          </Section>
        ))}
      {casting.spells.length === 0 ? <Empty>No spells in the spellbook yet.</Empty> : null}
    </>
  );
}

function SpellRow({
  spell,
  readOnly,
  onPrepare,
}: {
  spell: ResolvedSpell;
  readOnly?: boolean;
  onPrepare: (prepared: boolean) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <li className={spell.prepared ? "dg-spell is-prepared" : "dg-spell"}>
      <div className="dg-spell-head">
        <input
          type="checkbox"
          checked={spell.prepared}
          disabled={readOnly || spell.alwaysPrepared || spell.innateOnly}
          title={spell.alwaysPrepared ? "Always prepared" : spell.innateOnly ? "Innate: not prepared" : "Prepared"}
          onChange={(e) => onPrepare(e.currentTarget.checked)}
        />
        <button className="dg-link" onClick={() => setOpen((v) => !v)}>
          {spell.name}
        </button>
        {spell.alwaysPrepared ? <Pill tone="info">always prepared</Pill> : null}
        {spell.innate.length ? (
          <Pill tone="info">{spell.innate.some((i) => !i.resource) ? "innate · at will" : "innate"}</Pill>
        ) : null}
        {spell.concentration ? <Pill>conc.</Pill> : null}
        {spell.ritual ? <Pill>ritual</Pill> : null}
        {spell.abbreviation ? <Pill>{spell.abbreviation}{spell.page ? ` ${spell.page}` : ""}</Pill> : null}
      </div>
      {open && (
        <div className="dg-spell-body">
          <dl className="dg-kv">
            {spell.castingTime ? (
              <>
                <dt>Casting time</dt>
                <dd>{spell.castingTime}</dd>
              </>
            ) : null}
            {spell.range ? (
              <>
                <dt>Range</dt>
                <dd>{spell.range}</dd>
              </>
            ) : null}
            {spell.components ? (
              <>
                <dt>Components</dt>
                <dd>{spell.components}</dd>
              </>
            ) : null}
            {spell.duration ? (
              <>
                <dt>Duration</dt>
                <dd>{spell.duration}</dd>
              </>
            ) : null}
          </dl>
          {spell.text ? <Markdown source={spell.text} /> : null}
          {spell.higherLevels ? <Markdown source={`**At higher levels.** ${spell.higherLevels}`} /> : null}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export function InventoryPanel({
  character,
  store,
  readOnly,
}: {
  character: ResolvedCharacter;
  store: CharacterStore;
  readOnly?: boolean;
}): ReactNode {
  const file = store.data.inventory;

  const patch = (index: number, change: Partial<InventoryEntry>): void => {
    if (!file) return;
    const items = file.items.map((entry, i) => (i === index ? { ...entry, ...change } : entry));
    store.update("inventory", { ...file, items });
  };

  const remove = (index: number): void => {
    if (!file) return;
    store.update("inventory", removeInventoryEntry(file, index));
  };

  const setCurrency = (coin: string, value: number): void => {
    if (!file) return;
    store.update("inventory", { ...file, currency: { ...file.currency, [coin]: Math.max(0, value) } });
  };

  return (
    <>
      <Section
        title="Carried"
        action={
          <span className="dg-muted">
            {character.carried.weight} / {character.carried.capacity} lb
          </span>
        }
      >
        {character.inventory.length === 0 ? (
          <Empty>Nothing carried. Add items from the builder's inventory tab.</Empty>
        ) : (
          <table className="dg-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Equipped</th>
                <th>Attuned</th>
                <th>Weight</th>
                {readOnly ? null : <th />}
              </tr>
            </thead>
            <tbody>
              {character.inventory.map((item) => (
                <InventoryRow
                  key={`${item.index}-${item.element.id}`}
                  item={item}
                  readOnly={readOnly}
                  onPatch={(change) => patch(item.index, change)}
                  onRemove={() => remove(item.index)}
                />
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Currency">
        <div className="dg-currency">
          {(["pp", "gp", "ep", "sp", "cp"] as const).map((coin) => (
            <label key={coin}>
              <span>{coin.toUpperCase()}</span>
              <input
                type="number"
                min={0}
                value={character.currency[coin] ?? 0}
                disabled={readOnly}
                onChange={(e) => setCurrency(coin, Number(e.currentTarget.value))}
              />
            </label>
          ))}
        </div>
      </Section>
    </>
  );
}

function InventoryRow({
  item,
  readOnly,
  onPatch,
  onRemove,
}: {
  item: ResolvedItem;
  readOnly?: boolean;
  onPatch: (change: Partial<InventoryEntry>) => void;
  onRemove: () => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const element = item.element;
  const attunement = element.attunement === true;
  return (
    <>
      <tr>
        <td>
          <button className="dg-link" onClick={() => setOpen((v) => !v)}>
            {item.name}
          </button>
          {item.resolvedRef ? null : <Pill tone="info">custom</Pill>}
        </td>
        <td>
          <input
            type="number"
            min={0}
            value={item.quantity}
            disabled={readOnly}
            onChange={(e) => onPatch({ quantity: Math.max(0, Number(e.currentTarget.value)) })}
          />
        </td>
        <td>
          <input
            type="checkbox"
            checked={item.equipped}
            disabled={readOnly}
            onChange={(e) => onPatch({ equipped: e.currentTarget.checked })}
          />
        </td>
        <td>
          {attunement ? (
            <input
              type="checkbox"
              checked={item.attuned}
              disabled={readOnly}
              onChange={(e) => onPatch({ attuned: e.currentTarget.checked })}
            />
          ) : (
            <span className="dg-muted">—</span>
          )}
        </td>
        <td>{item.weight ? `${item.weight} lb` : "—"}</td>
        {readOnly ? null : (
          <td>
            <button className="dg-button is-quiet" onClick={onRemove} aria-label={`Remove ${item.name}`}>
              Remove
            </button>
          </td>
        )}
      </tr>
      {open ? (
        <tr className="dg-item-detail">
          <td colSpan={readOnly ? 5 : 6}>
            <ElementInfo
              element={{
                id: element.id,
                name: element.name,
                kind: element.kind,
                page: element.page,
                text: typeof element.text === "string" ? element.text : undefined,
                tags: element.tags,
              }}
            />
            {item.entry.notes ? <p>{item.entry.notes}</p> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

export function FeaturesPanel({
  character,
  kinds,
  labelFor,
}: {
  character: ResolvedCharacter;
  /** Which kinds this tab shows, in order. */
  kinds: string[];
  labelFor: (kind: string) => string;
}): ReactNode {
  const groups = kinds
    .map((kind) => ({ kind, elements: character.features[kind] ?? [] }))
    .filter((group) => group.elements.length > 0);

  if (!groups.length) return <Empty>No features yet.</Empty>;

  return (
    <>
      {groups.map((group) => (
        <Section key={group.kind} title={labelFor(group.kind)}>
          <ul className="dg-feature-list">
            {group.elements.map((element) => (
              <FeatureRow key={element.id} element={element} character={character} />
            ))}
          </ul>
        </Section>
      ))}
    </>
  );
}

function FeatureRow({ element, character }: { element: ResolvedElement; character: ResolvedCharacter }): ReactNode {
  const [open, setOpen] = useState(false);
  const unknown = character.diagnostics.filter(
    (d) => d.subject === element.id && (d.code === "unknown-part" || d.code === "unknown-op" || d.code === "expression-error"),
  );
  return (
    <li className="dg-feature">
      <div className="dg-feature-head">
        <button className="dg-link" onClick={() => setOpen((v) => !v)}>
          {element.name}
        </button>
        {element.level ? <Pill>level {element.level}</Pill> : null}
        {element.abbreviation ? (
          <Pill>
            {element.abbreviation}
            {element.page ? ` ${element.page}` : ""}
          </Pill>
        ) : null}
        {unknown.length ? <Pill tone="warn">not mechanised</Pill> : null}
      </div>
      {open ? (
        <div className="dg-feature-body">
          {element.text ? <Markdown source={element.text} /> : <p className="dg-muted">No rules text.</p>}
          {unknown.map((d, i) => (
            <p className="dg-muted" key={i}>
              {d.message}
            </p>
          ))}
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

export function DetailsPanel({ store, readOnly }: { store: CharacterStore; readOnly?: boolean }): ReactNode {
  const doc = store.data.details;
  const sourcePath = store.paths.byKind.details ?? "";
  const [editing, setEditing] = useState<string | undefined>();

  if (!doc) return <Empty>No details.5e in this character's folder.</Empty>;

  const headings = [
    ...doc.sections.map((s) => s.heading),
    ...DETAIL_SECTIONS.filter((h) => !doc.sections.some((s) => s.heading.toLowerCase() === h.toLowerCase())),
  ];

  const setBody = (heading: string, body: string): void => {
    const sections = doc.sections.some((s) => s.heading === heading)
      ? doc.sections.map((s) => (s.heading === heading ? { ...s, body } : s))
      : [...doc.sections, { heading, body }];
    store.update("details", { ...doc, sections });
  };

  return (
    <>
      {doc.preamble ? <Markdown source={doc.preamble} sourcePath={sourcePath} /> : null}
      {headings.map((heading) => {
        const section = doc.sections.find((s) => s.heading === heading);
        const body = section?.body ?? "";
        return (
          <Section
            key={heading}
            title={heading}
            action={
              readOnly ? null : (
                <button className="dg-button is-quiet" onClick={() => setEditing(editing === heading ? undefined : heading)}>
                  {editing === heading ? "Done" : "Edit"}
                </button>
              )
            }
          >
            {editing === heading ? (
              <textarea
                className="dg-textarea"
                defaultValue={body}
                rows={Math.max(4, body.split("\n").length + 1)}
                onBlur={(e) => setBody(heading, e.currentTarget.value)}
              />
            ) : body ? (
              <Markdown source={body} sourcePath={sourcePath} />
            ) : (
              <p className="dg-muted">Empty.</p>
            )}
          </Section>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

export function LogPanel({ store, readOnly }: { store: CharacterStore; readOnly?: boolean }): ReactNode {
  const state = store.data.state;
  const nameOf = (id: string): string =>
    store.resolved?.resources.find((r) => r.key === id)?.name ??
    store.resolved?.effects.find((e) => e.id === id)?.name ??
    store.index?.get(id)?.name ??
    id;
  if (!state) return <Empty>No state.5e in this character's folder.</Empty>;
  const events = [...state.events].reverse();
  const archive = [...(state.archive ?? [])].reverse();

  return (
    <>
      <Section
        title="Since the last rest"
        action={
          readOnly ? null : (
            <button className="dg-button" onClick={() => store.undoLastEvent()} disabled={!state.events.length}>
              Undo last
            </button>
          )
        }
      >
        {events.length === 0 ? (
          <Empty>Nothing has happened since the last checkpoint.</Empty>
        ) : (
          <ol className="dg-log">
            {events.map((e, i) => (
              <li key={`${e.t}-${i}`}>
                <time>{formatTime(e.t)}</time> {describeEvent(e, nameOf)}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {archive.length > 0 && (
        <Section title="Session record">
          <p className="dg-muted">
            A checkpoint is taken at every rest. These archived runs double as a recap of what happened.
          </p>
          {archive.map((run, i) => (
            <details key={i}>
              <summary>
                {formatTime(run.until)} · {run.events.length} events
              </summary>
              <ol className="dg-log">
                {run.events.map((e, j) => (
                  <li key={j}>
                    <time>{formatTime(e.t)}</time> {describeEvent(e, nameOf)}
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </Section>
      )}
    </>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Proficiencies and other sets
// ---------------------------------------------------------------------------

export function SetsPanel({ character, nameOf }: { character: ResolvedCharacter; nameOf: (id: string) => string }): ReactNode {
  const entries = Object.entries(character.sets).filter(([, stat]) => stat.values.length > 0 || stat.annotations.length > 0);
  if (!entries.length) return null;
  return (
    <Section title="Proficiencies and traits">
      <dl className="dg-kv">
        {entries.map(([path, stat]) => (
          <div className="dg-kv-row" key={path}>
            <dt>{prettyPath(path)}</dt>
            <dd>
              {stat.values.map(nameOf).join(", ") || <span className="dg-muted">none</span>}
              {stat.annotations.map((a, i) => (
                <span className="dg-muted" key={i}>
                  {" "}
                  · {a.when.text}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export function prettyPath(path: string): string {
  const tail = path.split(".").pop() ?? path;
  const spaced = tail.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export { signed, UnmechanisedNote };
