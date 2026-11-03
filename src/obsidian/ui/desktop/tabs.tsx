/**
 * The tabs panel (desktop spec, "Tabs panel"): everything that doesn't need to be
 * on screen at all times.
 *
 * The bodies are the narrow layout's sections, not new ones. Actions keeps its
 * filter chips, Spells keeps its level chips, and the extra width is spent on
 * columns rather than on a second design — so a feature row behaves the same way
 * in both layouts and only its density changes.
 *
 * Inventory and Details use the desktop panels instead, because the mobile ones
 * have no room for attunement, currency or editing the backstory, and all three
 * are things the spec asks this tab for.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ResolvedCharacter } from "../../../core/resolver/resolved";
import type { CharacterStore } from "../../character-store";
import { Icon } from "../components";
import {
  ActionsSection,
  FeaturesSection,
  SpellsSection,
} from "../narrow/NarrowSheet";
import { DetailsPanel, FeaturesPanel, InventoryPanel, LogPanel, prettyPath } from "../sheet-panels";

/** Tabs with a body of their own; anything else becomes a generic feature list. */
const BUILT_IN = ["actions", "spells", "features", "inventory", "details", "log"];

export interface TabSpec {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  /** A decision waits here: a dot rather than a count. */
  attention?: boolean;
  body: () => ReactNode;
}

export function TabsPanel({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const tabs = useTabs(store, character);
  const [wanted, setWanted] = useState("actions");
  const active = tabs.some((t) => t.id === wanted) ? wanted : (tabs[0]?.id ?? "actions");
  const current = tabs.find((t) => t.id === active);

  return (
    <section className="dg-d-tabs-panel">
      <TabBar tabs={tabs} active={active} onPick={setWanted} />
      <div className="dg-d-tab-body" role="tabpanel" aria-label={current?.label}>
        {current?.body()}
      </div>
    </section>
  );
}

/**
 * The bar scrolls sideways when the tabs outgrow it, with a fade at each end and
 * the active tab scrolled into view — the active tab is attached to the body
 * below it, folder-style, so it has to be visible for the join to make sense.
 */
export function TabBar({
  tabs,
  active,
  onPick,
}: {
  tabs: TabSpec[];
  active: string;
  onPick: (id: string) => void;
}): ReactNode {
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = (): void => {
    const el = strip.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  };

  useEffect(() => {
    measure();
    const el = strip.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tabs.length]);

  // Scrolled by hand rather than with `scrollIntoView`, which also scrolls every
  // scrollable ancestor — and the tab body right below is one of them, so
  // switching tabs would nudge its content out from under the chips.
  useEffect(() => {
    const el = strip.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !tab) return;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < el.scrollLeft) el.scrollLeft = left;
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
  }, [active]);

  return (
    <div
      className={["dg-d-tabbar", edges.left ? "has-left" : "", edges.right ? "has-right" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="dg-d-tabstrip" role="tablist" ref={strip} onScroll={measure}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === active}
            className={tab.id === active ? "dg-d-tab is-active" : "dg-d-tab"}
            onClick={() => onPick(tab.id)}
          >
            <Icon name={tab.icon} />
            {tab.label}
            {tab.badge ? <span className="dg-d-tab-badge">{tab.badge}</span> : null}
            {tab.attention ? <span className="dg-d-tab-dot" aria-label="needs attention" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function useTabs(store: CharacterStore, character: ResolvedCharacter): TabSpec[] {
  return useMemo(() => {
    const tabs: TabSpec[] = [
      {
        id: "actions",
        label: "Actions",
        icon: "swords",
        badge: character.effects.filter((e) => e.active).length,
        body: () => <ActionsSection store={store} character={character} />,
      },
    ];

    if (character.spellcasting)
      tabs.push({
        id: "spells",
        label: "Spells",
        icon: "sparkles",
        body: () => <SpellsSection store={store} character={character} />,
      });

    tabs.push(
      {
        id: "features",
        label: "Features",
        icon: "scroll",
        body: () => <FeaturesSection store={store} character={character} />,
      },
      {
        id: "inventory",
        label: "Inventory",
        icon: "backpack",
        body: () => <InventoryPanel character={character} store={store} />,
      },
    );

    // Any tab a loaded kind definition asked for and the character has content
    // for: a source that adds Disciplines gets a tab with no plugin change.
    const kindsByTab = new Map<string, string[]>();
    for (const def of store.index?.allKindDefs() ?? []) {
      if (!def.tab || BUILT_IN.includes(def.tab)) continue;
      const present = (character.features[def.key] ?? []).length > 0;
      if (!present) continue;
      kindsByTab.set(def.tab, [...(kindsByTab.get(def.tab) ?? []), def.key]);
    }
    for (const [tab, kinds] of kindsByTab)
      tabs.push({
        id: tab,
        label: prettyPath(tab),
        icon: "book-open",
        body: () => (
          <FeaturesPanel
            character={character}
            kinds={kinds}
            labelFor={(kind) => store.index?.kindLabel(kind, true) ?? kind}
          />
        ),
      });

    tabs.push(
      { id: "details", label: "Details", icon: "user", body: () => <DetailsPanel store={store} /> },
      { id: "log", label: "Log", icon: "history", body: () => <LogPanel store={store} /> },
    );

    return tabs;
  }, [store, character]);
}
