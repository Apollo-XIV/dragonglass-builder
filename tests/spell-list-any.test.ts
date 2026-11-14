/**
 * Spell list additions for whichever classes the character casts with (schema-gaps spec,
 * item 4): a species' "added to the spell list of your spellcasting class".
 */
import { describe, expect, it } from "vitest";
import { validateElement } from "../src/core/content/validate";
import { resolve } from "../src/core/resolver/resolve";
import type { Element } from "../src/core/types";
import { build, scores, TEST_BOOK, testIndex } from "./helpers";

const spell = (n: string, tags: string[]): Element => ({ id: `test:spell:${n}`, kind: "spell", name: n, source: "test", spellLevel: 1, tags }) as Element;

const caster = (key: string, ability: "int" | "wis"): Element =>
  ({
    id: `test:class:${key}`, kind: "class", name: key, source: "test", key, hitDie: "d8",
    spellcasting: { ability, progression: "full", type: "prepared", list: `${key}-spell`, prepared: 4 },
  }) as Element;

const FIGHTER: Element = { id: "test:class:fighter", kind: "class", name: "Fighter", source: "test", key: "fighter", hitDie: "d10" } as Element;

const MARK: Element = {
  id: "test:species:marked", kind: "species", name: "Mark of Warding", source: "test",
  spellListAdditions: [{ class: "any", spells: ["test:spell:alarm", "test:spell:mage-armor"] }],
};

const content = testIndex([TEST_BOOK, caster("wizard", "int"), caster("cleric", "wis"), FIGHTER, MARK, spell("alarm", ["ranger-spell"]), spell("mage-armor", ["wizard-spell"])]);

const character = (...classes: string[]) =>
  resolve({
    content,
    build: build({
      abilities: { method: "manual", base: scores({ int: 14, wis: 14 }) },
      species: "test:species:marked",
      levels: classes.map((c) => ({ class: `test:class:${c}`, hp: "average", choices: {} })),
    }),
  });

describe('a spell list addition for "any" class', () => {
  it("grows the list of every class the character casts with", () => {
    const c = character("wizard", "cleric");
    for (const cls of c.spellcasting!.classes)
      expect(cls.listAdditions.spells).toEqual(["test:spell:alarm", "test:spell:mage-armor"]);
    expect(c.diagnostics.filter((d) => d.code === "unknown-part")).toHaveLength(0);
  });

  it("does nothing for a character who casts with no class, and says nothing", () => {
    const c = character("fighter");
    expect(c.spellcasting).toBeUndefined();
    expect(c.diagnostics.map((d) => d.code)).not.toContain("unknown-part");
  });

  it("a named class still grows only that list", () => {
    const named = testIndex([...content.all().filter((e) => e.id !== MARK.id), { ...MARK, spellListAdditions: [{ class: "test:class:cleric", spells: ["test:spell:alarm"] }] }]);
    const c = resolve({
      content: named,
      build: build({
        abilities: { method: "manual", base: scores() },
        species: "test:species:marked",
        levels: [{ class: "test:class:wizard", hp: "average", choices: {} }, { class: "test:class:cleric", hp: "average", choices: {} }],
      }),
    });
    expect(c.spellcasting!.classes.find((x) => x.class === "test:class:wizard")!.listAdditions.spells).toEqual([]);
    expect(c.spellcasting!.classes.find((x) => x.class === "test:class:cleric")!.listAdditions.spells).toEqual(["test:spell:alarm"]);
  });

  it('validates: "any" is accepted, an empty class is not', () => {
    expect(validateElement(MARK).diagnostics).toHaveLength(0);
    const r = validateElement({ ...MARK, spellListAdditions: [{ class: "", spells: ["test:spell:alarm"] }] });
    expect(r.diagnostics[0].message).toContain('"any"');
  });
});
