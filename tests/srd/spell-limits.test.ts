/**
 * Spell limits over the converted SRD (the `srd-2` source in sources.5e), longhand.
 *
 * Reads the converter's output rather than `content/srd`, which is the old
 * hand-converted slice. Skipped where the converter checkout is absent. The numbers
 * are the PHB class tables, written out, so a wrong table or a wrong expression is
 * visible as a wrong number. Nothing here names a class in the engine: Wizard's book
 * and Warlock's pact level fall out of the same fields every class uses.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolve } from "../../src/core/resolver/resolve";
import { indexFromDisk } from "../../src/node/load-source";
import type { SpellEntry } from "../../src/core/types";
import { build, CONTENT_ROOT, scores } from "../helpers";

const SRD = join(CONTENT_ROOT, "..", "..", "5etools-to-dragonglass", "out", "srd");
const available = existsSync(SRD);

describe.skipIf(!available)("spell limits over the converted SRD", () => {
  const content = available ? indexFromDisk(SRD, join(CONTENT_ROOT, "core")) : undefined!;

  function casting(cls: string, level: number, spells: SpellEntry[] = [], abilities = scores({ int: 16, wis: 16, cha: 16 })) {
    const c = resolve({
      content,
      build: build({
        abilities: { method: "manual", base: abilities },
        level,
        levels: Array.from({ length: level }, () => ({ class: `srd:class:${cls}`, hp: "average" as const, choices: {} })),
      }),
      spells: { kind: "spells", schemaVersion: 1, spells },
    });
    return { c, limits: c.spellcasting!.limits[0]! };
  }

  describe("Wizard", () => {
    it("starts with a six-spell book and three cantrips", () => {
      const { limits } = casting("wizard", 1);
      expect(limits.spellbook.cap).toBe(6);
      expect(limits.cantrips.cap).toBe(3);
      expect(limits.maxSpellLevel).toBe(1);
    });

    it("adds two spells to the book at every level", () => {
      expect(casting("wizard", 3).limits.spellbook.cap).toBe(10);
      expect(casting("wizard", 20).limits.spellbook.cap).toBe(44);
    });

    it("gains a cantrip at 4th level and prepares level + Intelligence modifier", () => {
      expect(casting("wizard", 3).limits.cantrips.cap).toBe(3);
      expect(casting("wizard", 4).limits.cantrips.cap).toBe(4);
      expect(casting("wizard", 5).limits.prepared.cap).toBe(8); // 5 + 3
    });

    it("reaches 3rd-level spells at 5th level", () => {
      expect(casting("wizard", 4).limits.maxSpellLevel).toBe(2);
      expect(casting("wizard", 5).limits.maxSpellLevel).toBe(3);
    });

    it("keeps a scroll-learned spell out of the book", () => {
      const spells = [
        { id: "srd:spell:alarm", class: "srd:class:wizard" },
        { id: "srd:spell:find-familiar", class: "srd:class:wizard", extra: true },
      ];
      const { limits } = casting("wizard", 1, spells);
      expect(limits.spellbook.used).toBe(1);
      expect(limits.extras).toBe(1);
    });
  });

  describe("Warlock", () => {
    it("follows its pact slots rather than the shared table", () => {
      expect(casting("warlock", 1).limits.maxSpellLevel).toBe(1);
      expect(casting("warlock", 5).limits.maxSpellLevel).toBe(3);
      expect(casting("warlock", 9).limits.maxSpellLevel).toBe(5);
    });

    it("knows two spells and two cantrips at 1st level, six and three at 5th", () => {
      const one = casting("warlock", 1).limits;
      expect([one.leveled.cap, one.cantrips.cap]).toEqual([2, 2]);
      const five = casting("warlock", 5).limits;
      expect([five.leveled.cap, five.cantrips.cap]).toEqual([6, 3]);
    });

    it("unlocks one Mystic Arcanum pick at 11th level, a higher one every second level after", () => {
      expect(casting("warlock", 10).limits.extraPicks).toEqual([]);
      expect(casting("warlock", 11).limits.extraPicks).toEqual([{ level: 11, choose: 1, spellLevels: [6] }]);
      expect(casting("warlock", 17).limits.extraPicks.map((p) => p.spellLevels)).toEqual([[6], [7], [8], [9]]);
    });
  });

  describe("other kinds of caster", () => {
    it("limits a known caster by its spells known", () => {
      const bard = casting("bard", 10).limits;
      expect(bard.leveled.label).toBe("spells known");
      expect(bard.leveled.cap).toBe(14);
      expect(bard.cantrips.cap).toBe(4);
    });

    it("unlocks Magical Secrets from any list at 10th level", () => {
      expect(casting("bard", 9).limits.extraPicks).toEqual([]);
      expect(casting("bard", 10).limits.extraPicks).toEqual([
        { level: 10, choose: 2, spellLevels: [0, 1, 2, 3, 4, 5], anyClass: true },
      ]);
    });

    it("limits a preparing caster by level + ability modifier", () => {
      const cleric = casting("cleric", 5).limits;
      expect(cleric.leveled.label).toBe("spells prepared");
      expect(cleric.prepared.cap).toBe(8); // 5 + 3
      expect(cleric.cantrips.cap).toBe(4);
    });

    it("reaches 2nd-level spells at 5th level as a half caster", () => {
      expect(casting("paladin", 2).limits.maxSpellLevel).toBe(1);
      expect(casting("paladin", 5).limits.maxSpellLevel).toBe(2);
      expect(casting("paladin", 5).limits.prepared.cap).toBe(5); // floor(5/2) + 3
    });
  });

  it("warns on a spell above the level a character can cast", () => {
    const { c } = casting("wizard", 1, [{ id: "srd:spell:fireball", class: "srd:class:wizard" }]);
    expect(c.diagnostics.some((d) => d.code === "spell-level-too-high")).toBe(true);
  });
});
