/**
 * Rolled scores and the standard array: pools of chips above the six tiles, and the ways a
 * chip reaches a tile. Tap a chip then a tile, or drag one onto it; drag a tile's number
 * onto another tile to swap, or back to the pools to empty it. Every one of those calls the
 * same functions in `ability-pools.ts`, which keep the base scores and the chips in step.
 */

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ABILITIES, type Ability, type BuildAbilities } from "../../../../core/types";
import type { ResolvedCharacter } from "../../../../core/resolver/resolved";
import type { CharacterStore } from "../../../character-store";
import { usePlugin } from "../../context";
import { ChipGhost, PoolControls, PoolRow, type PoolActions, type PoolFocus, type Spin } from "../ability-pool";
import {
  addPool,
  assign,
  chipId,
  chipOf,
  chipValue,
  parseChip,
  POOL_SIZE,
  poolsOf,
  removePool,
  rollSlots,
  setValue,
  unassign,
  usedChips,
} from "../ability-pools";
import { bonusSources, bonusText } from "../ability-stepper";
import { glide, type Box } from "../glide";
import { finishDraft } from "../roll-methods";
import { ScoreTileFrame, TileCutout, TileNumber } from "../score-tile";

export function AbilityAssign({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const { plugin } = usePlugin();
  const root = useRef<HTMLDivElement>(null);
  const [focus, setFocusState] = useState<PoolFocus | null>(null);
  const focusRef = useRef(focus);
  const setFocus = (next: PoolFocus | null): void => {
    focusRef.current = next;
    setFocusState(next);
  };
  const [spins, setSpins] = useState<Record<string, Spin>>({});
  const [dragged, setDragged] = useState<string | null>(null);
  const [landing, setLanding] = useState<Ability | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // On a phone a tap then a tap is the way; a drag is a hold first, so a swipe still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  // A chip picked up is put down by a tap anywhere that is neither a chip nor a tile.
  const armed = focus?.mode === "arm";
  useEffect(() => {
    const doc = root.current?.ownerDocument;
    if (!armed || !doc) return;
    const away = (e: Event): void => {
      if (!(e.target as Element | null)?.closest?.("[data-chip], [data-tile]")) setFocus(null);
    };
    const escape = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setFocus(null);
    };
    doc.addEventListener("pointerdown", away, true);
    doc.addEventListener("keydown", escape);
    return () => {
      doc.removeEventListener("pointerdown", away, true);
      doc.removeEventListener("keydown", escape);
    };
  }, [armed]);

  const build = store.data.build;
  if (!build) return null;
  const abilities = build.abilities;
  const pools = poolsOf(abilities);
  const used = usedChips(abilities);
  const rollWith = plugin.settings.defaultRollMethod;

  const write = (next: BuildAbilities): void => store.mutateBuild((b) => ({ ...b, abilities: next }));
  // The store's build, not this render's: a blur and a tap can both write before a re-render.
  const current = (): BuildAbilities => store.data.build?.abilities ?? abilities;
  const spin = (chips: string[]): void =>
    setSpins((s) => ({ ...s, ...Object.fromEntries(chips.map((c, rank) => [c, { count: (s[c]?.count ?? 0) + 1, rank }])) }));
  const edit = (chip: string, draft = ""): void => setFocus({ chip, mode: "edit", draft });

  const chipElement = (chip: string): Element | null | undefined =>
    root.current?.querySelector(`[data-chip="${CSS.escape(chip)}"]`);
  const tileCentre = (ability: Ability): Element | null | undefined =>
    root.current?.querySelector(`[data-tile="${ability}"] [data-centre]`);

  /** The chip goes to the tile, flying from `from` (where it was seen last) into place. */
  const place = (chip: string, ability: Ability, from: Box | undefined): void => {
    const value = chipValue(current(), chip);
    if (value === null) return;
    write(assign(current(), chip, ability));
    const target = tileCentre(ability);
    if (!from || !target) return;
    setLanding(ability);
    glide(from, target, String(value), () => setLanding((l) => (l === ability ? null : l)));
  };

  const focusedPool = (): string | undefined => {
    const f = focusRef.current;
    return f ? parseChip(f.chip)?.pool : undefined;
  };

  const actions: PoolActions = {
    press: (chip) => {
      const f = focusRef.current;
      const fixed = !pools.find((p) => p.id === parseChip(chip)?.pool)?.method;
      if (f?.chip === chip && f.mode === "arm") setFocus(fixed ? null : { chip, mode: "edit", draft: "" });
      else setFocus({ chip, mode: "arm", draft: "" });
    },
    edit: (chip) => edit(chip),
    type: (chip, typed) => {
      const at = parseChip(chip);
      if (!at) return;
      let next = current();
      let slot = at.slot;
      for (const value of typed.commits) {
        if (slot >= POOL_SIZE) break;
        next = setValue(next, chipId(at.pool, slot), value);
        slot++;
      }
      if (typed.commits.length) write(next);
      // Past the last slot, focus stays on it, ready for Roll one.
      edit(chipId(at.pool, Math.min(slot, POOL_SIZE - 1)), slot < POOL_SIZE ? typed.draft : "");
    },
    leave: (chip) => {
      const f = focusRef.current;
      if (f?.chip !== chip || f.mode !== "edit") return;
      const method = pools.find((p) => p.id === parseChip(chip)?.pool)?.method;
      const left = method ? finishDraft(method, f.draft) : undefined;
      if (left !== undefined) write(setValue(current(), chip, left));
      setFocus(null);
    },
    erase: (chip) => {
      const at = parseChip(chip);
      if (!at) return;
      if (chipValue(current(), chip) !== null) write(setValue(current(), chip, null));
      else if (at.slot > 0) edit(chipId(at.pool, at.slot - 1));
    },
    move: (chip, by) => {
      const at = parseChip(chip);
      if (at && at.slot + by >= 0 && at.slot + by < POOL_SIZE) edit(chipId(at.pool, at.slot + by));
    },
    rollOne: () => {
      const f = focusRef.current;
      const at = f ? parseChip(f.chip) : undefined;
      if (!f || !at) return;
      const wasEmpty = chipValue(current(), f.chip) === null;
      write(rollSlots(current(), at.pool, [at.slot]));
      spin([f.chip]);
      // Rolling into an empty slot moves on, so pressing Roll one six times fills the pool.
      if (wasEmpty && at.slot < POOL_SIZE - 1) edit(chipId(at.pool, at.slot + 1));
      else edit(f.chip);
    },
    rollAll: () => {
      const pool = focusedPool();
      if (!pool) return;
      const slots = Array.from({ length: POOL_SIZE }, (_, i) => i);
      write(rollSlots(current(), pool, slots));
      spin(slots.map((i) => chipId(pool, i)));
      // Whatever was half typed is rolled over too.
      const f = focusRef.current;
      if (f) edit(f.chip);
    },
    addPool: () => {
      const added = addPool(current(), rollWith);
      write(added.abilities);
      edit(chipId(added.pool, 0));
    },
    removePool: () => {
      const pool = focusedPool();
      if (!pool) return;
      const ids = (current().pools ?? []).map((p) => p.id);
      const index = ids.indexOf(pool);
      const next = removePool(current(), pool);
      write(next);
      const stays = (next.pools ?? []).find((p) => p.id === pool) ?? (next.pools ?? [])[Math.max(0, index - 1)];
      if (!stays) return setFocus(null);
      const empty = stays.values.findIndex((v) => v === null);
      edit(chipId(stays.id, empty < 0 ? POOL_SIZE - 1 : empty));
    },
  };

  const pressTile = (ability: Ability): void => {
    const f = focusRef.current;
    if (f?.mode === "arm") {
      setFocus(null);
      place(f.chip, ability, chipElement(f.chip)?.getBoundingClientRect());
      return;
    }
    const chip = chipOf(abilities, ability);
    if (chip) setFocus({ chip, mode: "arm", draft: "" });
  };

  const onDragStart = (e: DragStartEvent): void => {
    setDragged((e.active.data.current as { chip?: string } | undefined)?.chip ?? null);
    if (focusRef.current?.mode === "arm") setFocus(null);
  };

  const onDragEnd = (e: DragEndEvent): void => {
    setDragged(null);
    const chip = (e.active.data.current as { chip?: string } | undefined)?.chip;
    const over = e.over ? String(e.over.id) : undefined;
    if (!chip || !over) return;
    if (over.startsWith("drop:tile:")) place(chip, over.slice("drop:tile:".length) as Ability, e.active.rect.current.translated ?? undefined);
    else if (over === "drop:pools") {
      const from = usedChips(current()).get(chip);
      if (from) write(unassign(current(), from));
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const draggedValue = dragged ? chipValue(abilities, dragged) : null;
  // The tile the chip in hand is already on, so it is plain where it would move from.
  const linked = focus ? used.get(focus.chip) : undefined;
  const picking = armed || dragged !== null;

  const ghost = (
    <DragOverlay dropAnimation={null}>{draggedValue !== null ? <ChipGhost value={draggedValue} /> : null}</DragOverlay>
  );
  const overlay = mounted ? createPortal(ghost, root.current?.ownerDocument.body ?? document.body) : null;

  return (
    <div ref={root} className="dg-ability-assign">
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragged(null)}
      >
        <Pools>
          {pools.map((pool, i) => (
            <PoolRow
              key={pool.id}
              pool={pool}
              number={pools.length > 1 ? i + 1 : undefined}
              used={used}
              focus={focus}
              spins={spins}
              actions={actions}
            />
          ))}
          {focus?.mode === "edit" && pools.find((p) => p.id === parseChip(focus.chip)?.pool)?.method ? (
            <PoolControls dragging={dragged !== null} only={pools.length === 1} actions={actions} />
          ) : null}
        </Pools>
        <div className="dg-n-ability-grid">
          {ABILITIES.map((ability) => (
            <PoolTile
              key={ability}
              ability={ability}
              character={character}
              value={abilities.base[ability]}
              chip={chipOf(abilities, ability)}
              picking={picking}
              linked={linked === ability}
              landing={landing === ability}
              onPress={() => pressTile(ability)}
            />
          ))}
        </div>
        {/* On the body: an ancestor that transforms or contains makes it the containing block of the
            overlay's position: fixed, and the ghost then trails the pointer by that ancestor's offset. */}
        {overlay}
      </DndContext>
    </div>
  );
}

/** The pools, which a tile's number can be dragged back to. */
function Pools({ children }: { children: ReactNode }): ReactNode {
  const { setNodeRef, isOver } = useDroppable({ id: "drop:pools" });
  return (
    <div ref={setNodeRef} className={`dg-pools${isOver ? " is-over" : ""}`}>
      {children}
    </div>
  );
}

function PoolTile({
  ability,
  character,
  value,
  chip,
  picking,
  linked,
  landing,
  onPress,
}: {
  ability: Ability;
  character: ResolvedCharacter;
  /** The base; absent while the tile is empty. */
  value: number | undefined;
  /** The chip the value came from. A score kept from another method has none. */
  chip: string | undefined;
  /** A chip is picked up, so the empty tiles show where it can go. */
  picking: boolean;
  /** The chip picked up or being edited is this tile's. */
  linked: boolean;
  /** A chip is flying in: the number waits for it. */
  landing: boolean;
  onPress: () => void;
}): ReactNode {
  const drop = useDroppable({ id: `drop:tile:${ability}` });
  const drag = useDraggable({ id: `tile:${ability}`, data: { chip }, disabled: !chip });
  const block = character.abilities[ability];
  const bonus = value === undefined ? 0 : block.score.value - value;
  const sources = bonusSources(block.score.breakdown);

  return (
    <ScoreTileFrame
      ref={drop.setNodeRef}
      data-tile={ability}
      className={`is-pool${drop.isOver ? " is-over" : ""}${linked ? " is-linked" : ""}${picking && value === undefined ? " is-target" : ""}`}
      label={ability.toUpperCase()}
      total={value === undefined ? undefined : block.score.value}
      modifier={block.mod}
      bonus={value === undefined ? sources.reduce((n, s) => n + s.value, 0) : bonus}
      bonusText={bonusText(sources)}
      role="button"
      tabIndex={0}
      onClick={onPress}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onPress();
      }}
    >
      {value === undefined ? (
        <TileCutout pulse={picking} />
      ) : (
        <span ref={drag.setNodeRef} className="dg-score-tile-grip" {...drag.listeners}>
          <TileNumber value={value} className={`${landing ? "is-landing" : ""}${drag.isDragging ? " is-lifted" : ""}`} />
        </span>
      )}
    </ScoreTileFrame>
  );
}
