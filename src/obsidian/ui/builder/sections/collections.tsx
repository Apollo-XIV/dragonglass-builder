/** Spells, equipment and details: the lists a character carries and the facts about it. */

import { useRef, type ReactNode } from "react";
import type {
  ResolvedCharacter,
  ResolvedSpellcastingClass,
} from "../../../../core/resolver/resolved";
import { factsOf } from "../../../../core/content/facts";
import { classSpellList } from "../../../../core/resolver/spell-list";
import type { ClassSpellLimits, Count } from "../../../../core/resolver/spell-limits";
import type { Element, ExtraSpellPick, SpellEntry } from "../../../../core/types";
import type { CharacterStore } from "../../../character-store";
import { chooseAvatar, importAvatar } from "../../../avatar-actions";
import { Avatar } from "../../avatar";
import { usePlugin } from "../../context";
import { addInventoryItem, isStackable, removeInventoryEntry } from "../../../../core/index";
import { useSheet } from "../../narrow/sheet";
import { InfoRow } from "../detail";
import { useBuilderFeatures } from "../features";
import { usePicker, usePickerSlot, type PickerOption } from "../picker";
import { CustomItemForm, XpHint } from "./extras";

/** "Level 11: choose 1 spell of level 6" — what a class level unlocked outside its counts. */
function describePick(pick: ExtraSpellPick): string {
  const levels = pick.spellLevels?.length
    ? ` of level ${pick.spellLevels.length > 1 ? `${Math.min(...pick.spellLevels)}–${Math.max(...pick.spellLevels)}` : pick.spellLevels[0]}`
    : "";
  return `Level ${pick.level}: choose ${pick.choose} spell${pick.choose === 1 ? "" : "s"}${levels}${pick.anyClass ? ", from any class" : ""}`;
}

function SpellCounts({ limits }: { limits: ClassSpellLimits }): ReactNode {
  const part = (label: string, c: Count): string | null =>
    c.cap === undefined ? null : `${c.used}/${c.cap} ${label}`;
  const over = [limits.cantrips, limits.leveled].some((c) => c.cap !== undefined && c.used > c.cap);
  const parts = [
    part("cantrips", limits.cantrips),
    part(limits.leveled.label, limits.leveled),
    `up to level ${limits.maxSpellLevel}`,
    limits.extras ? `${limits.extras} extra` : null,
  ].filter(Boolean);
  return (
    <p className={over ? "dg-muted dg-warn" : "dg-muted"}>
      {limits.name}: {parts.join(" · ")}
    </p>
  );
}

export function SpellsSection({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const picker = usePicker();
  const slot = usePickerSlot();
  const features = useBuilderFeatures();
  const { plugin } = usePlugin();
  const index = store.index;
  const casting = character.spellcasting;
  if (!casting || !index) return null;

  // Read when a picker opens, not when this renders: the toggle can change between.
  const enforcing = (): boolean => plugin.settings.enforceRequirements;
  const known = new Set(casting.spells.map((s) => s.id));
  const levelOf = (id: string): number => {
    const level = (index.get(id) as { spellLevel?: number } | undefined)?.spellLevel;
    return typeof level === "number" ? level : 0;
  };

  const write = (entries: SpellEntry[]): void => {
    const file = store.data.spells ?? {
      kind: "spells" as const,
      schemaVersion: 1,
      spells: [],
    };
    store.update("spells", { ...file, spells: [...file.spells, ...entries] });
  };

  const optionOf = (
    spell: Element,
    limits: ClassSpellLimits,
    ceiling: number,
  ): PickerOption => {
    const level = typeof spell.spellLevel === "number" ? spell.spellLevel : 0;
    const tooHigh = level > ceiling;
    return {
      id: spell.id,
      name: spell.name,
      text: typeof spell.text === "string" ? spell.text : undefined,
      facts: factsOf(spell),
      tag: index.abbreviation(spell.source),
      group: level > 0 ? `Level ${level}` : "Cantrip",
      bucket: level > 0 ? "leveled" : "cantrips",
      allowed: !tooHigh,
      warnings: tooHigh
        ? [`Level ${level}; ${limits.name} can learn up to level ${ceiling}`]
        : undefined,
    };
  };

  const add = (cls: ResolvedSpellcastingClass, limits: ClassSpellLimits): void =>
    picker({
      title: "Add spells",
      subtitle: cls.name,
      options: classSpellList(index, cls)
        .filter((spell) => !known.has(spell.id))
        .map((spell) => optionOf(spell, limits, limits.maxSpellLevel)),
      buckets: {
        cantrips: { label: "cantrips", ...limits.cantrips },
        leveled: limits.leveled,
      },
      selected: [],
      count: Infinity,
      search: features.pickerSearch,
      enforce: enforcing(),
      onCommit: (ids) =>
        // A prepared caster chooses what to prepare, so a pick is a preparation.
        write(
          ids.map((id) => ({
            id,
            class: cls.class,
            ...(cls.type === "prepared" && levelOf(id) > 0 ? { prepared: true } : {}),
          })),
        ),
    });

  /**
   * Spells learned outside the class's progression: a scroll, a feat. They are kept
   * apart so they never count against the class, and so levelling does not touch them.
   * The class's own list is the default; some sources reach further.
   */
  const addExtra = (
    cls: ResolvedSpellcastingClass,
    limits: ClassSpellLimits,
    anyClass: boolean,
  ): void => {
    // Mystic Arcanum-style picks are higher than anything the class has slots for.
    const ceiling = Math.max(limits.maxSpellLevel, ...limits.extraPicks.flatMap((p) => p.spellLevels ?? []));
    picker({
      title: "Add extra spells",
      subtitle: `${cls.name} · ${anyClass ? "any class" : "class list"}`,
      options: (anyClass ? index.query({ kind: "spell" }) : classSpellList(index, cls))
        .filter((spell) => !known.has(spell.id))
        .map((spell) => ({ ...optionOf(spell, limits, ceiling), bucket: undefined })),
      selected: [],
      count: Infinity,
      search: features.pickerSearch,
      enforce: enforcing(),
      extra: {
        label: anyClass ? "This class's list" : "Any class's list",
        // The picker closes after this runs, so reopening has to wait for it.
        onClick: () => setTimeout(() => slot.open(() => addExtra(cls, limits, !anyClass)), 0),
      },
      onCommit: (ids) => write(ids.map((id) => ({ id, class: cls.class, extra: true }))),
    });
  };

  return (
    <>
      {casting.limits.map((limits) => (
        <SpellCounts key={limits.class} limits={limits} />
      ))}
      {casting.spells.map((spell) => (
        <InfoRow
          key={spell.id}
          title={spell.name}
          subtitle={`${spell.spellLevel === 0 ? "Cantrip" : `Level ${spell.spellLevel}`}${spell.extra ? " · Extra" : ""}${spell.innateOnly ? " · Innate" : ""}${spell.learned ? " · Learned" : ""}`}
          text={spell.text}
          facts={factsOf(spell.element)}
        >
          {features.rowEditing &&
          !spell.learned &&
          store.data.spells?.spells.some((entry) => entry.id === spell.id) ? (
            <button
              className="dg-row-remove"
              aria-label={`Remove ${spell.name}`}
              onClick={() =>
                store.update("spells", {
                  ...store.data.spells!,
                  spells: store.data.spells!.spells.filter(
                    (entry) => entry.id !== spell.id,
                  ),
                })
              }
            >
              ×
            </button>
          ) : null}
        </InfoRow>
      ))}
      {casting.classes.map((cls) => {
        const limits = casting.limits.find((l) => l.class === cls.class)!;
        return (
          <div key={cls.class}>
            <button
              className="dg-level-button is-multiclass"
              onClick={() => slot.open(() => add(cls, limits))}
            >
              + Add {cls.name} spells
            </button>
            <button
              className="dg-level-button is-multiclass"
              onClick={() => slot.open(() => addExtra(cls, limits, false))}
            >
              + Add extra {cls.name} spells
            </button>
            {limits.extraPicks.map((pick, i) => (
              <p key={i} className="dg-muted">{describePick(pick)}</p>
            ))}
          </div>
        );
      })}
      {slot.node}
    </>
  );
}

export function EquipmentSection({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const picker = usePicker();
  const slot = usePickerSlot();
  const sheet = useSheet();
  const features = useBuilderFeatures();
  const index = store.index;
  if (!index) return null;

  const addCustom = (): void =>
    sheet.open({
      title: "Custom item",
      body: () => <CustomItemForm store={store} close={sheet.close} />,
    });

  const add = (): void =>
    picker({
      title: "Add items",
      options: index.byKind("item").map((item) => ({
        id: item.id,
        name: item.name,
        text: typeof item.text === "string" ? item.text : undefined,
        facts: factsOf(item),
        tag: index.abbreviation(item.source),
        group: item.tags?.[0],
      })),
      selected: [],
      count: 99,
      search: features.pickerSearch,
      onCommit: (ids) => {
        const file = store.data.inventory ?? {
          kind: "inventory" as const,
          schemaVersion: 1,
          items: [],
        };
        store.update(
          "inventory",
          ids.reduce((next, id) => addInventoryItem(next, id, (i) => isStackable(index.get(i))), file),
        );
      },
    });

  return (
    <>
      {character.inventory.map((item) => (
        <InfoRow
          key={`${item.element.id}-${item.index}`}
          title={
            item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name
          }
          subtitle={item.equipped ? "equipped" : undefined}
          text={
            typeof item.element.text === "string"
              ? item.element.text
              : undefined
          }
          facts={factsOf(item.element)}
        >
          {features.rowEditing ? (
            <button
              className="dg-row-remove"
              aria-label={`Remove ${item.name}`}
              onClick={() => {
                const file = store.data.inventory;
                if (file)
                  store.update("inventory", removeInventoryEntry(file, item.index));
              }}
            >
              ×
            </button>
          ) : null}
        </InfoRow>
      ))}
      <button
        className="dg-level-button is-multiclass"
        onClick={() => slot.open(add)}
      >
        + Add items
      </button>
      {slot.node}
      {features.customItem ? (
        <button className="dg-level-button is-multiclass" onClick={addCustom}>
          + Custom item
        </button>
      ) : null}
    </>
  );
}

/**
 * The portrait row: what is showing now, and the three ways to change it. The
 * avatar is a path in details.5e, so it saves at once rather than with the build.
 */
function AvatarField({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const { app } = usePlugin();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="dg-field dg-avatar-field">
      <span>Avatar</span>
      <div className="dg-avatar-field-row">
        <Avatar className="dg-avatar-preview" name={character.name} path={character.avatar} />
        <div className="dg-avatar-field-actions">
          <button type="button" onClick={() => chooseAvatar(app, store)}>
            Choose from vault…
          </button>
          <button type="button" onClick={() => input.current?.click()}>
            Import image…
          </button>
          {character.avatar ? (
            <button type="button" onClick={() => store.setAvatar(undefined)}>
              Remove
            </button>
          ) : null}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importAvatar(app, store, file);
          }}
        />
      </div>
      {character.avatar ? <small className="dg-muted">{character.avatar}</small> : null}
    </div>
  );
}

export function DetailsSection({
  store,
  character,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
}): ReactNode {
  const features = useBuilderFeatures();
  const build = store.data.build;
  if (!build) return null;
  return (
    <>
      <AvatarField store={store} character={character} />
      <label className="dg-field">
        <span>Name</span>
        <input
          type="text"
          defaultValue={build.name ?? ""}
          onBlur={(e) =>
            store.mutateBuild((b) => ({ ...b, name: e.target.value }))
          }
        />
      </label>
      <label className="dg-field">
        <span>Experience</span>
        <input
          type="number"
          min={0}
          value={build.xp ?? 0}
          onChange={(e) =>
            store.mutateBuild((b) => ({
              ...b,
              xp: Math.max(0, Number(e.target.value)),
            }))
          }
        />
      </label>
      {features.xpHint ? (
        <XpHint xp={build.xp ?? 0} level={character.level} />
      ) : null}
      <p className="dg-muted">
        Everything else — traits, flaw, backstory — lives in the character's
        details note, which the sheet's Details section embeds.
      </p>
    </>
  );
}
