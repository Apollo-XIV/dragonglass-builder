/**
 * The stat cluster: the small numbers that sit between the identity column and
 * the HP panel, plus the two wide tiles under them — hit dice, and the pinned
 * resources.
 *
 * Which resources are pinned is a reading of the character, not a layout choice,
 * so `choosePins` in core decides and this only draws the answer.
 */

import { useState, type ReactNode } from "react";
import { explainStat } from "../../../core/resolver/explain";
import { choosePins, type PinnedSlot } from "../../../core/resolver/pins";
import type { ResolvedCharacter } from "../../../core/resolver/resolved";
import { event } from "../../../core/state/fold";
import type { CharacterStore } from "../../character-store";
import { Icon, signed } from "../components";
import { prettyPath } from "../sheet-panels";
import { useSheet } from "../narrow/sheet";
import { Pips, TextBody } from "../narrow/targets";
import { ReadTarget, RollTarget, useHoverCard } from "./targets";

export function StatCluster({
  store,
  character,
  pins,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  /** The explicit pin layers: the character's own, then the plugin's. */
  pins: { character?: string[]; plugin?: string[] };
}): ReactNode {
  const walk = character.speed.walk;
  const others = Object.entries(character.speed).filter(([name, stat]) => name !== "walk" && stat.value > 0);

  return (
    <div className="dg-d-cluster">
      <Tile
        label="Speed"
        icon="footprints"
        extra={
          others.length ? (
            <span className="dg-d-tile-extra">
              {others.map(([name, stat]) => (
                <span key={name}>
                  {prettyPath(name).toLowerCase()} {stat.value}
                </span>
              ))}
            </span>
          ) : undefined
        }
      >
        <ReadTarget
          label="Walking speed"
          explanation={walk ? () => explainStat(walk, { label: "Walking speed" }) : undefined}
        >
          <span className="dg-d-value">{walk?.value ?? 0}</span>
          <span className="dg-d-unit">ft</span>
        </ReadTarget>
      </Tile>

      <Tile label="AC" icon="shield">
        <ReadTarget label="Armour Class" explanation={() => explainStat(character.ac, { label: "Armour Class" })}>
          <span className="dg-d-value">{character.ac.value}</span>
        </ReadTarget>
      </Tile>

      <HitDiceTile store={store} character={character} />

      <Tile label="Init." icon="dg-d20">
        <RollTarget
          label="Initiative"
          explanation={() => explainStat(character.initiative, { label: "Initiative", kind: "d20" })}
        >
          <span className="dg-d-value">{signed(character.initiative.value)}</span>
        </RollTarget>
      </Tile>

      <Tile label="Prof." icon="award">
        <ReadTarget
          label="Proficiency bonus"
          explanation={() => explainStat(character.proficiencyBonus, { label: "Proficiency bonus" })}
        >
          <span className="dg-d-value">{signed(character.proficiencyBonus.value)}</span>
        </ReadTarget>
      </Tile>

      <PinnedTile store={store} character={character} pins={pins} />
    </div>
  );
}

/**
 * The value fills everything above the label and centres in it, so the number
 * sits in the middle of the box whatever the label's height, and the label is
 * pinned to the bottom edge. `extra` sits under the value, inside that centred
 * area, so a secondary line does not push the main number off centre.
 */
function Tile({
  label,
  icon,
  wide,
  extra,
  children,
}: {
  label: string;
  icon?: string;
  wide?: boolean;
  extra?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={wide ? "dg-d-tile is-wide" : "dg-d-tile"}>
      <div className="dg-d-tile-value">
        {children}
        {extra}
      </div>
      <span className="dg-d-label">
        {icon ? <Icon name={icon} /> : null}
        {label}
      </span>
    </div>
  );
}

/**
 * Hit dice: remaining over total, and the remaining count is typed rather than
 * stepped, because a short rest spends three of them at once. One line per die
 * size, so a multiclass character sees both pools in the same tile.
 */
function HitDiceTile({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  return (
    <Tile label="Hit dice" icon="dices" wide>
      <div className="dg-d-hitdice">
        {character.hp.hitDice.map((pool) => (
          <div className="dg-d-hitdice-row" key={pool.die}>
            <EditableCount
              value={pool.remaining}
              max={pool.max}
              label={`${pool.die} hit dice remaining`}
              onSet={(to) => {
                const delta = to - pool.remaining;
                if (!delta) return;
                store.appendEvents(
                  delta > 0
                    ? event("regain", { target: `hitDice.${pool.die}`, amount: delta })
                    : event("spend", { target: `hitDice.${pool.die}`, amount: -delta }),
                );
              }}
            />
            <span className="dg-d-hitdice-total">
              /{pool.max}
              {pool.die}
            </span>
          </div>
        ))}
        {character.hp.hitDice.length === 0 ? <span className="dg-d-empty">None</span> : null}
      </div>
    </Tile>
  );
}

/** A number you can type over. Click shows the field; blur or Enter commits. */
function EditableCount({
  value,
  max,
  label,
  onSet,
}: {
  value: number;
  max: number;
  label: string;
  onSet: (to: number) => void;
}): ReactNode {
  const [text, setText] = useState<string | undefined>();

  if (text === undefined)
    return (
      <button
        type="button"
        className="dg-d-count"
        aria-label={label}
        title="Click to set"
        onClick={() => setText(String(value))}
      >
        {value}
      </button>
    );

  const commit = (): void => {
    const next = Number(text);
    if (Number.isFinite(next)) onSet(Math.max(0, Math.min(max, Math.floor(next))));
    setText(undefined);
  };

  return (
    <input
      className="dg-d-count-input"
      aria-label={label}
      value={text}
      autoFocus
      inputMode="numeric"
      onChange={(e) => setText(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setText(undefined);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Pinned resources
// ---------------------------------------------------------------------------

/**
 * Two slots under the hit dice. Clicking a use spends it; right-clicking opens
 * the same resource menu the narrow layout uses, which is where putting one back
 * lives.
 */
function PinnedTile({
  store,
  character,
  pins,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  pins: { character?: string[]; plugin?: string[] };
}): ReactNode {
  const slots = choosePins(character, pins);
  return (
    <div className="dg-d-tile is-wide is-pins">
      {[0, 1].map((i) =>
        slots[i] ? (
          <PinnedResource key={slots[i].target} slot={slots[i]} store={store} />
        ) : (
          <div className="dg-d-pin is-empty" key={`empty-${i}`} />
        ),
      )}
    </div>
  );
}

function PinnedResource({ slot, store }: { slot: PinnedSlot; store: CharacterStore }): ReactNode {
  const sheet = useSheet();

  /**
   * Read through the store, not through the props: the resource menu stays open
   * while uses are spent, and a prop-derived count would be one render behind
   * for as long as it does.
   */
  const read = (): { remaining: number; max: number } => {
    const resolved = store.resolved;
    const resource = resolved?.resources.find((r) => `resources.${r.key}` === slot.target);
    if (resource) return { remaining: resource.remaining, max: resource.max };
    const casting = resolved?.spellcasting;
    if (slot.target === "pact" && casting?.pact) return { remaining: casting.pact.remaining, max: casting.pact.max };
    const level = slot.target.match(/^slots\.(\d+)$/);
    const pool = level ? casting?.slots.find((s) => s.level === Number(level[1])) : undefined;
    return pool ? { remaining: pool.remaining, max: pool.max } : { remaining: slot.remaining, max: slot.max };
  };

  const set = (to: number): void => {
    const delta = to - read().remaining;
    if (!delta) return;
    store.appendEvents(
      delta > 0
        ? event("regain", { target: slot.target, amount: delta })
        : event("spend", { target: slot.target, amount: -delta }),
    );
  };

  const menu = (): void =>
    sheet.open({
      title: slot.name,
      subtitle: slot.resource ? `${slot.resource.recharge.replace("-", " ")} · ${slot.resource.sourceName}` : undefined,
      body: () => {
        const now = read();
        return (
          <>
            <TextBody text={slot.resource?.notes} />
            <div className="dg-uses">
              <span className="dg-uses-label">Uses left</span>
              <div className="dg-stepper">
                <button onClick={() => set(Math.max(0, read().remaining - 1))} aria-label="One fewer use">
                  −
                </button>
                <Pips total={now.max} filled={now.remaining} />
                <button onClick={() => set(Math.min(read().max, read().remaining + 1))} aria-label="One more use">
                  +
                </button>
              </div>
              <span className="dg-uses-count">
                {now.remaining} of {now.max}
              </span>
            </div>
          </>
        );
      },
      actions: () => (
        <button className="dg-sheet-button" onClick={() => set(read().max)}>
          Restore all
        </button>
      ),
    });

  const { handlers, card } = useHoverCard(() => (
    <p className="dg-d-hovercard-formula">
      {slot.name} — {slot.remaining} of {slot.max}
      {slot.resource ? ` · back on a ${slot.resource.recharge.replace("-", " ")}` : ""}
    </p>
  ));

  return (
    <>
      <div className="dg-d-pin" onContextMenu={(e) => (e.preventDefault(), menu())} {...handlers}>
        <span className="dg-d-pin-name">
          {slot.name}
          {slot.die ? <span className="dg-d-pin-die">{slot.die}</span> : null}
        </span>
        <PinUses slot={slot} read={read} onSet={set} />
      </div>
      {card}
    </>
  );
}

/**
 * Uses as pips while they can be counted, and as a number once they can't: a
 * paladin's forty points of Lay on Hands is a figure, not a row of dots.
 */
function PinUses({
  slot,
  read,
  onSet,
}: {
  slot: PinnedSlot;
  read: () => { remaining: number; max: number };
  onSet: (to: number) => void;
}): ReactNode {
  const { remaining, max } = read();
  if (max > 8)
    return (
      <span className="dg-d-pin-count">
        <button
          type="button"
          className="dg-d-pin-step"
          aria-label={`Spend one ${slot.name}`}
          disabled={remaining <= 0}
          onClick={() => onSet(remaining - 1)}
        >
          −
        </button>
        {remaining}
        <small>/{max}</small>
      </span>
    );

  return (
    <span className="dg-d-pin-pips">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          className={i < remaining ? "dg-d-use is-on" : "dg-d-use"}
          aria-label={`${slot.name} use ${i + 1}`}
          aria-pressed={i < remaining}
          // Clicking a lit pip spends down to it; clicking a spent one puts the
          // uses back up to it, so a misfire is undone in the same place.
          onClick={() => onSet(i < remaining ? i : i + 1)}
        />
      ))}
      {max === 0 ? <span className="dg-d-empty">—</span> : null}
    </span>
  );
}
