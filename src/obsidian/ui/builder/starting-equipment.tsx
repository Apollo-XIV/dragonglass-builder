/**
 * The Starting equipment area of the inventory section: one card for the first-level class
 * and one for the background. A card shows the top-level choice (the kit, or gold instead)
 * as a selector, the choices nested under it as rows, a category row opens the item picker
 * on exactly the items it allows, and starting gold asks for the X that is typed or rolled.
 *
 * Every write is an ordinary choice change, so the confirmation, the session and the
 * reconciliation into the inventory are the ones every other edit has.
 */

import { useMemo, type ReactNode } from "react";
import {
  equipmentChoices,
  equipmentRoot,
  goldAmount,
  startingPlan,
  type ResolvedCharacter,
} from "../../../core/index";
import { collect } from "../../../core/resolver/collect";
import type { PendingChoice } from "../../../core/resolver/resolved";
import type { CharacterStore } from "../../character-store";
import { useStoreVersion } from "../context";
import { useSheet } from "../narrow/sheet";
import { useBuildChange } from "./changes";
import { ChoiceRow, PendingChoiceRow } from "./choice-row";
import { FacetPicker } from "./facet-picker";
import { costText, ITEM_FACETS, itemRows, weightText } from "./item-adapter";
import { RolledField } from "./rolled-field";

export function StartingEquipment({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  useStoreVersion(store);
  const index = store.index;
  const build = store.data.build;
  const change = useBuildChange(store);

  const roots = useMemo(() => {
    if (!index || !build) return [];
    const mine = equipmentChoices(character.pendingChoices, index);
    const wanted = [build.levels[0]?.class, build.background].filter((id): id is string => !!id);
    return wanted
      .map((id) => ({ id, choices: mine.filter((c) => equipmentRoot(c) === id) }))
      .filter((r) => r.choices.length > 0 || index.get(r.id)?.equipment?.length);
  }, [index, build, character.pendingChoices]);
  const golds = useMemo(
    () => (index && build ? startingPlan(collect(index, build, store.data.inventory), build).golds : []),
    [index, build, store.data.inventory],
  );

  if (!index || !build || roots.length === 0) return null;
  const nameOf = (id: string): string => index.get(id)?.name ?? id;

  const setX = (element: string, x: number | undefined): void =>
    store.mutateBuild((b) => {
      const starting = b.starting ?? { items: {}, gold: {}, currency: {} };
      const { [element]: _old, ...rest } = starting.gold;
      return { ...b, starting: { ...starting, gold: x === undefined ? rest : { ...rest, [element]: { x } } } };
    });

  return (
    <section className="dg-starting">
      <h4>Starting equipment</h4>
      {roots.map((root) => {
        const el = index.get(root.id);
        const top = root.choices.filter((c) => c.origin.length === 0);
        const nested = root.choices.filter((c) => c.origin.length > 0);
        const fixed = (el?.equipment ?? []).flatMap((l) => (l.item ? [`${l.quantity && l.quantity > 1 ? `${l.quantity} × ` : ""}${nameOf(l.item)}`] : []));
        const purse = (el?.equipment ?? []).flatMap((l) => (l.currency ? Object.entries(l.currency).map(([c, n]) => `${n} ${c}`) : []));
        return (
          <div key={root.id} className="dg-starting-card">
            <h5>{el?.name ?? root.id}</h5>
            {fixed.length || purse.length ? <p className="dg-muted">{[...fixed, ...purse].join(", ")}</p> : null}
            {[...top, ...nested].map((choice) => (
              <EquipmentChoice key={`${choice.id}-${choice.levelIndex ?? "b"}`} choice={choice} store={store} nameOf={nameOf} change={change} />
            ))}
            {golds
              .filter((g) => g.dice && root.choices.some((c) => c.chosen.includes(g.element)))
              .map((g) => (
                <RolledField
                  key={g.element}
                  label="Starting gold"
                  dice={g.dice!}
                  value={build.starting?.gold?.[g.element]?.x}
                  onChange={(x) => setX(g.element, x)}
                  outcome={(x) => `= ${goldAmount(x, g.multiplier)} gp`}
                />
              ))}
          </div>
        );
      })}
    </section>
  );
}

/** One choice in a card: a selector for a few options, the item picker for items, a plain row otherwise. */
function EquipmentChoice({
  choice,
  store,
  nameOf,
  change,
}: {
  choice: PendingChoice;
  store: CharacterStore;
  nameOf: (id: string) => string;
  change: ReturnType<typeof useBuildChange>;
}): ReactNode {
  const write = (chosen: string[]): void =>
    void change({ type: "choice", choiceId: choice.id, scope: choice.scope, levelIndex: choice.levelIndex, chosen });
  const items = choice.options.length > 0 && choice.options.every((o) => o.kind === "item");

  if (items) return <ItemChoiceRow choice={choice} store={store} write={write} />;
  if (choice.count === 1 && choice.options.length <= 3)
    return (
      <div className="dg-starting-choice" role="group" aria-label={choice.name}>
        <span className="dg-choice-label">{choice.name}</span>
        <span className="dg-segmented">
          {choice.options.map((o) => (
            <button
              key={o.id}
              className={choice.chosen.includes(o.id) ? "dg-n-chip is-active" : "dg-n-chip"}
              aria-pressed={choice.chosen.includes(o.id)}
              onClick={() => write(choice.chosen.includes(o.id) ? [] : [o.id])}
            >
              {o.name}
            </button>
          ))}
        </span>
      </div>
    );
  return <PendingChoiceRow choice={choice} store={store} nameOf={nameOf} />;
}

/** A category row: opens the item picker on the items the choice allows, with its pick count on the row. */
function ItemChoiceRow({
  choice,
  store,
  write,
}: {
  choice: PendingChoice;
  store: CharacterStore;
  write: (chosen: string[]) => void;
}): ReactNode {
  const sheet = useSheet();
  const index = store.index!;
  const allowed = useMemo(() => new Set(choice.options.map((o) => o.id)), [choice.options]);
  const label = `${choice.name} · ${choice.chosen.length} of ${choice.count}`;
  const names = choice.chosen.map((id) => index.get(id)?.name ?? id).join(", ");

  const open = (): void =>
    sheet.open({
      title: choice.name,
      subtitle: `Choose ${choice.count}`,
      body: () => <ItemChoicePicker choice={choice} store={store} allowed={allowed} write={write} close={sheet.close} />,
    });

  return <ChoiceRow label={label} value={names || undefined} empty={!choice.complete} onOpen={open} />;
}

function ItemChoicePicker({
  choice,
  store,
  allowed,
  write,
  close,
}: {
  choice: PendingChoice;
  store: CharacterStore;
  allowed: Set<string>;
  write: (chosen: string[]) => void;
  close: () => void;
}): ReactNode {
  useStoreVersion(store);
  const rows = useMemo(() => itemRows(store.index!).filter((r) => allowed.has(r.id)), [store.index, allowed]);
  // Read live: the sheet is above the row that opened it, so a prop would be a pick behind.
  const live = store.resolved?.pendingChoices.find(
    (c) => c.id === choice.id && c.levelIndex === choice.levelIndex,
  );
  const chosen = live?.chosen ?? choice.chosen;
  const added: Record<string, number> = {};
  for (const id of chosen) added[id] = (added[id] ?? 0) + 1;
  const room = chosen.length < choice.count;
  const repeatable = choice.definition.repeatable === true;

  return (
    <FacetPicker
      rows={rows}
      idOf={(r) => r.id}
      nameOf={(r) => r.name}
      searchOf={(r) => r.tags}
      facets={ITEM_FACETS}
      renderMeta={(r) => [weightText(r.weight), costText(r.value)].filter(Boolean).join(" · ")}
      added={added}
      single={choice.count === 1}
      onAdd={(r) => {
        if (choice.count === 1) {
          write([r.id]);
          close();
        } else if (room && (repeatable || !chosen.includes(r.id))) write([...chosen, r.id]);
      }}
      onStep={(r, d) => {
        if (d > 0) {
          if (room && (repeatable || !chosen.includes(r.id))) write([...chosen, r.id]);
        } else {
          const at = chosen.lastIndexOf(r.id);
          if (at >= 0) write(chosen.filter((_, i) => i !== at));
        }
      }}
      close={close}
    />
  );
}
