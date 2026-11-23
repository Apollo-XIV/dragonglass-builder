/**
 * The header band (desktop spec, "Header"): who the character is, the two things
 * you press at the table, and the state they are in right now.
 *
 * The avatar overlaps down out of the band and the chips sit beside its lower
 * half, so the band stays one line tall while the row below it carries the state.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { ResolvedCharacter } from "../../../core/resolver/resolved";
import { nextExhaustion } from "../../../core/state/conditions";
import { event } from "../../../core/state/fold";
import type { CharacterStore } from "../../character-store";
import { Avatar } from "../avatar";
import { Icon } from "../components";
import { setConcentration, setCondition, setExhaustion, StatusButton } from "../status-sheet";
import { useHoverCard } from "./targets";

/**
 * The 5e conditions, for the "+ Cond" menu. Condition immunities come from the
 * character's own `conditionImmunities` set, so an immune condition is offered
 * greyed rather than hidden: a DM can still impose one.
 */
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

export function DeskHeader({
  store,
  character,
  onBuilder,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  onBuilder?: () => void;
}): ReactNode {
  const classLine = character.classes
    .map((c) => `${c.name} ${c.level}`)
    .join(" / ");
  const subtitle = [
    character.species?.name,
    classLine || `Level ${character.level}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className="dg-d-header">
      <Avatar
        className="dg-d-avatar"
        name={character.name}
        path={character.avatar}
      />
      <div className="dg-d-identity">
        <h2 className="dg-d-name">{character.name}</h2>
        <p className="dg-d-subline">{subtitle}</p>
      </div>
      <div className="dg-d-header-actions">
        {onBuilder ? (
          <button type="button" className="dg-d-button" onClick={onBuilder}>
            <Icon name="wrench" />
            Builder
          </button>
        ) : null}
        <RestMenu store={store} character={character} />
        <button
          type="button"
          className={
            character.status.inspiration
              ? "dg-d-button is-inspired"
              : "dg-d-button"
          }
          aria-pressed={character.status.inspiration}
          onClick={() =>
            store.appendEvents(
              event("inspiration", { value: !character.status.inspiration }),
            )
          }
        >
          <Icon name="sparkles" />
          Inspiration
        </button>
      </div>
      <StatusChips store={store} character={character} />
    </header>
  );
}

/**
 * Rest is a menu, not two buttons: a long rest is rare and destructive enough
 * that it should take a deliberate second press, and a short rest needs somewhere
 * to spend hit dice from.
 */
function RestMenu({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const dice = character.hp.hitDice.filter((pool) => pool.remaining > 0);

  return (
    <div className="dg-d-menu-anchor" ref={box}>
      <button
        type="button"
        className="dg-d-button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="moon" />
        Rest
      </button>
      {open ? (
        <div className="dg-d-menu" role="menu">
          <button
            type="button"
            className="dg-d-menu-item"
            onClick={() => {
              store.rest("short");
              setOpen(false);
            }}
          >
            <Icon name="coffee" />
            <span>
              Short rest
              <small>Recharges short-rest features</small>
            </span>
          </button>
          {dice.length ? (
            <div className="dg-d-menu-dice">
              <span className="dg-d-menu-dice-label">Spend a hit die</span>
              {dice.map((pool) => (
                <button
                  key={pool.die}
                  type="button"
                  className="dg-d-chip"
                  onClick={() =>
                    store.appendEvents(
                      event("spend", {
                        target: `hitDice.${pool.die}`,
                        amount: 1,
                      }),
                    )
                  }
                >
                  {pool.die} <small>{pool.remaining} left</small>
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="dg-d-menu-item"
            onClick={() => {
              store.rest("long");
              setOpen(false);
            }}
          >
            <Icon name="bed" />
            <span>
              Long rest
              <small>Full HP, slots, and half your hit dice back</small>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status chips
// ---------------------------------------------------------------------------

export function StatusChips({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const groups: { icon: string; label: string; set: string }[] = [
    { icon: "shield-half", label: "Res.", set: "resistances" },
    { icon: "shield", label: "Imm.", set: "immunities" },
    { icon: "shield-alert", label: "Vuln.", set: "vulnerabilities" },
  ];
  const concentration = character.status.concentration;

  return (
    <div className="dg-d-chips">
      {groups.map(({ icon, label, set }) =>
        (character.sets[set]?.values ?? []).map((value) => (
          <DamageChip
            key={`${set}-${value}`}
            icon={icon}
            label={label}
            value={value}
            stat={set}
            character={character}
          />
        )),
      )}

      {concentration ? (
        <StatusButton
          store={store}
          status={{ kind: "concentration" }}
          className="dg-d-chip is-concentration"
          title={`Concentrating${concentration.name ? ` on ${concentration.name}` : ""} — click to end, hold to read`}
          onTap={() => setConcentration(store, false)}
        >
          <Icon name="dg-concentration" />
          Concentrating
          <Icon name="x" className="dg-d-chip-x" />
        </StatusButton>
      ) : null}

      {character.status.exhaustion > 0 ? (
        <StatusButton
          store={store}
          status={{ kind: "exhaustion" }}
          className="dg-d-chip is-condition"
          title="Exhaustion — click to step down a level, hold to read"
          onTap={() => setExhaustion(store, character.status.exhaustion - 1)}
        >
          <Icon name="battery-low" />
          Exhaustion {character.status.exhaustion}
          <Icon name="x" className="dg-d-chip-x" />
        </StatusButton>
      ) : null}

      {character.status.conditions.map((condition) => (
        <StatusButton
          key={condition}
          store={store}
          status={{ kind: "condition", id: condition }}
          className="dg-d-chip is-condition"
          title={`${condition} — click to remove, hold to read`}
          onTap={() => setCondition(store, condition, false)}
        >
          <Icon name="alert-triangle" />
          {condition}
          <Icon name="x" className="dg-d-chip-x" />
        </StatusButton>
      ))}

      <ConditionPicker store={store} character={character} />
    </div>
  );
}

/** A resistance, immunity or vulnerability, with its source on hover. */
function DamageChip({
  icon,
  label,
  value,
  stat,
  character,
}: {
  icon: string;
  label: string;
  value: string;
  stat: string;
  character: ResolvedCharacter;
}): ReactNode {
  const sources = (character.sets[stat]?.breakdown ?? [])
    .filter((row) =>
      Array.isArray(row.value)
        ? row.value.includes(value)
        : row.value === value,
    )
    .map((row) => row.sourceName);
  const { handlers, card } = useHoverCard(() => (
    <p className="dg-d-hovercard-formula">
      {label} {value}
      {sources.length ? ` — from ${[...new Set(sources)].join(", ")}` : ""}
    </p>
  ));
  return (
    <>
      <span className="dg-d-chip is-passive" {...handlers}>
        <Icon name={icon} />
        {label} {value}
      </span>
      {card}
    </>
  );
}

function ConditionPicker({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>({});
  const active = new Set(character.status.conditions);
  const immune = new Set(character.sets["conditionImmunities"]?.values ?? []);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (!box.current?.contains(target) && !menu.current?.contains(target))
        setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  // The menu is portalled to the body: the narrow layout's chip row scrolls sideways,
  // which clips anything absolutely positioned inside it down to the row's own height.
  const toggle = (): void => {
    if (!open && box.current) {
      const rect = box.current.getBoundingClientRect();
      const width = Math.min(288, window.innerWidth - 16);
      const left = Math.min(
        Math.max(8, rect.left),
        window.innerWidth - width - 8,
      );
      const below = window.innerHeight - rect.bottom - 12;
      const flip = below < 240 && rect.top > below;
      setPlace(
        flip
          ? {
              left,
              width,
              bottom: window.innerHeight - rect.top + 4,
              maxHeight: rect.top - 12,
            }
          : { left, width, top: rect.bottom + 4, maxHeight: below },
      );
    }
    setOpen((v) => !v);
  };

  return (
    <div className="dg-d-menu-anchor" ref={box}>
      <button
        type="button"
        className="dg-d-chip is-add"
        aria-expanded={open}
        onClick={toggle}
        title="Add a condition"
      >
        <Icon name="plus" />
        Cond
      </button>
      {open
        ? createPortal(
            <div className="dg-layout dg-d-menu-portal">
              <div
                className="dg-d-menu is-conditions"
                role="menu"
                ref={menu}
                style={place}
              >
                {CONDITIONS.map((condition) => (
                  <StatusButton
                    key={condition}
                    store={store}
                    status={{ kind: "condition", id: condition }}
                    className={
                      active.has(condition)
                        ? "dg-d-menu-row is-on"
                        : immune.has(condition)
                          ? "dg-d-menu-row is-immune"
                          : "dg-d-menu-row"
                    }
                    onTap={() => setCondition(store, condition, !active.has(condition))}
                    onRead={() => setOpen(false)}
                  >
                    {condition}
                    {immune.has(condition) ? <small>immune</small> : null}
                  </StatusButton>
                ))}
                <StatusButton
                  store={store}
                  status={{ kind: "exhaustion" }}
                  className={
                    character.status.exhaustion > 0
                      ? "dg-d-menu-row is-on is-exhaustion"
                      : "dg-d-menu-row is-exhaustion"
                  }
                  onTap={() =>
                    setExhaustion(store, nextExhaustion(character.status.exhaustion))
                  }
                  onRead={() => setOpen(false)}
                >
                  Exhaustion
                  <small>{character.status.exhaustion}</small>
                </StatusButton>
                <StatusButton
                  store={store}
                  status={{ kind: "concentration" }}
                  className={
                    character.status.concentration
                      ? "dg-d-menu-row is-on"
                      : "dg-d-menu-row"
                  }
                  onTap={() =>
                    setConcentration(store, !character.status.concentration)
                  }
                  onRead={() => setOpen(false)}
                >
                  Concentration
                </StatusButton>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
