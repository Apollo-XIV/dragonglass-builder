/**
 * The walk characters in vault/Characters, resolved against the converter's output and
 * checked against the rules text longhand. The converter's output lives beside this
 * repository, so the suite is skipped where it is not checked out. What does not reconcile
 * is in docs/walk-report.md; the numbers here are the ones that do.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ContentIndex } from "../src/core/content";
import { resolve } from "../src/core/resolver/resolve";
import type { ResolvedCharacter } from "../src/core/resolver/resolved";
import type { BuildFile, StateEvent, StateFile } from "../src/core/types";
import { loadSourceFromDisk } from "../src/node/load-source";
import { CONTENT_ROOT } from "./helpers";

const OUT = join(__dirname, "..", "..", "5etools-to-dragonglass", "out");
const VAULT = join(__dirname, "..", "vault");
const present = existsSync(join(OUT, "srd")) && existsSync(join(OUT, "srd24"));

const indexes = new Map<string, ContentIndex>();
function walk(dir: string, src: "srd" | "srd24", events: StateEvent[] = []): ResolvedCharacter {
  let index = indexes.get(src);
  if (!index) {
    index = ContentIndex.build([
      loadSourceFromDisk(join(OUT, src)),
      loadSourceFromDisk(join(CONTENT_ROOT, "core")),
    ]);
    indexes.set(src, index);
  }
  const build = JSON.parse(readFileSync(join(VAULT, "Characters", dir, "build.5e"), "utf8")) as BuildFile;
  const state: StateFile | undefined = events.length
    ? { kind: "state", schemaVersion: 1, checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] }, events }
    : undefined;
  return resolve({ content: index, build, state });
}
const t = "2026-11-08T10:00:00Z";
const res = (c: ResolvedCharacter, id: string) => c.resources.find((r) => r.id.includes(id))!;
const act = (c: ResolvedCharacter, name: string) => c.actions.find((a) => a.name === name)!;

describe.skipIf(!present)("the walk characters", () => {
  it("2024 Paladin 5: Lay on Hands, Channel Divinity, masteries, oath spells", () => {
    const c = walk("Walk Paladin 2024", "srd24");
    expect(c.hp.max.value).toBe(10 + 2 + 4 * (6 + 2));
    expect(c.spellcasting!.classes[0]).toMatchObject({ prepared: 6, maxSpellLevel: 2 });
    expect(c.spellcasting!.classes[0].dc.value).toBe(8 + 3 + 3);
    expect(c.spellcasting!.slots.map((s) => s.max)).toEqual([4, 2]);
    expect(res(c, "lay-on-hands").max).toBe(25);
    expect(res(c, "channel-divinity")).toMatchObject({ max: 2 });
    expect(res(c, "channel-divinity").recharge).toEqual(expect.arrayContaining([{ on: "short-rest", amount: 1 }, { on: "long-rest", amount: "all" }]));
    expect(c.elements.filter((e) => e.kind === "weapon-mastery")).toHaveLength(2);
    expect(c.spellcasting!.spells.filter((s) => s.alwaysPrepared).map((s) => s.name)).toEqual(
      expect.arrayContaining(["Protection from Evil and Good", "Shield of Faith", "Aid", "Zone of Truth", "Find Steed"]),
    );
    // Lay on Hands: a chosen amount of the 25-point pool, healing that many.
    expect(act(c, "Lay on Hands")).toMatchObject({ healResolved: "@spent", resolvedCost: [{ amount: { min: 1, max: 25 }, remaining: 25 }] });
    const spent = walk("Walk Paladin 2024", "srd24", [{ t, type: "spend", target: `resources.${res(c, "lay-on-hands").key}`, amount: 18 }]);
    expect(act(spent, "Lay on Hands").resolvedCost![0]).toMatchObject({ amount: { min: 1, max: 7 }, remaining: 7 });
  });

  it("Barbarian 5, both rulesets: Rage uses, recharge, resistances, advantage and damage", () => {
    for (const [dir, src, uses, shortRest] of [["Walk Barbarian 2014", "srd", 3, false], ["Walk Barbarian 2024", "srd24", 3, true]] as const) {
      const base = walk(dir, src);
      const rages = res(base, "rages");
      expect(rages.max, dir).toBe(uses);
      // Unarmored Defense: 10 + Dex + Con.
      expect(base.ac.value, dir).toBe(10 + base.abilities.dex.mod + base.abilities.con.mod);
      expect(rages.recharge.some((r) => r.on === "short-rest"), dir).toBe(shortRest);
      const key = `resources.${rages.key}`;
      const spent = [1, 2, 3].map((): StateEvent => ({ t, type: "spend", target: key, amount: 1 }));
      expect(res(walk(dir, src, [...spent, { t, type: "rest.short" }]), "rages").remaining, dir).toBe(shortRest ? 1 : 0);
      expect(res(walk(dir, src, [...spent, { t, type: "rest.long" }]), "rages").remaining, dir).toBe(3);
      const on = walk(dir, src, [{ t, type: "effect.start", effect: "rage" }]);
      expect(on.sets["resistances"].values, dir).toEqual(expect.arrayContaining(["slashing", "piercing", "bludgeoning"]));
      expect(on.stats["checks.str"].advantage, dir).toBe("advantage");
      expect(on.stats["damage.melee"].annotations[0], dir).toMatchObject({ op: "add", value: 2 });
    }
  });

  it("2014 Monk 5: ki pool, costs and Stunning Strike", () => {
    const c = walk("Walk Monk 2014", "srd");
    expect(c.ac.value).toBe(10 + c.abilities.dex.mod + c.abilities.wis.mod);
    expect(res(c, "ki-points")).toMatchObject({ max: 5, recharge: [{ on: "short-rest", amount: "all" }] });
    for (const name of ["Flurry of Blows", "Patient Defense", "Step of the Wind", "Stunning Strike"])
      expect(act(c, name).resolvedCost![0].amount, name).toBe(1);
    expect(act(c, "Stunning Strike").save).toEqual({ ability: "con", dc: 8 + 3 + c.abilities.wis.mod });
  });

  it("2024 Sorcerer 5: Sorcery Points and Metamagic costs", () => {
    const c = walk("Walk Sorcerer 2024", "srd24");
    expect(res(c, "sorcery-points").max).toBe(5);
    expect(act(c, "Quickened Spell").resolvedCost![0].amount).toBe(2);
    // The 2024 text is a flat point ("spend 1 Sorcery Point"); the level-sized cost was the 2014 rule.
    expect(act(c, "Twinned Spell").resolvedCost![0].amount).toBe(1);
    // Draconic Resilience: +3 hit points at 3rd and +1 per Sorcerer level after, and 10 + Dex + Cha unarmoured.
    expect(c.hp.max.value).toBe(37);
    expect(c.ac.value).toBe(10 + 2 + 5);
    expect(res(c, "innate-sorcery").max).toBe(2);
  });

  it("2024 High Elf Wizard 5 (Evoker): innate spells use the chosen ability; Evoker's picks are free", () => {
    const c = walk("Walk High Elf Wizard 2024", "srd24");
    const spells = c.spellcasting!.spells;
    const innate = spells.filter((s) => s.innate.length);
    expect(innate.map((s) => s.name)).toEqual(expect.arrayContaining(["Prestidigitation", "Detect Magic", "Misty Step", "Shield", "Mage Hand", "Dancing Lights"]));
    for (const s of innate) expect(s.innate[0], s.name).toMatchObject({ ability: "int", dc: 8 + 3 + 5 });
    expect(innate.filter((s) => s.innate[0].resource).map((s) => s.name).sort()).toEqual(["Detect Magic", "Misty Step", "Shield"]);
    expect(spells.filter((s) => s.learned && s.free).map((s) => s.name).sort()).toEqual(["Fireball", "Magic Missile", "Scorching Ray"]);
    expect(c.spellcasting!.limits[0]).toMatchObject({ spellbook: { cap: 14, used: 0 }, cantrips: { cap: 4 } });
  });

  it("2024 Druid 5 (Land): terrain spells, Wild Shape uses and recharge", () => {
    const c = walk("Walk Druid 2024", "srd24");
    expect(c.spellcasting!.spells.filter((s) => s.alwaysPrepared).map((s) => s.name)).toEqual(
      expect.arrayContaining(["Blur", "Burning Hands", "Fire Bolt", "Fireball"]),
    );
    const ws = res(c, "wild-shape");
    expect(ws.max).toBe(2);
    const key = `resources.${ws.key}`;
    const spent: StateEvent = { t, type: "spend", target: key, amount: 2 };
    expect(res(walk("Walk Druid 2024", "srd24", [spent, { t, type: "rest.short" }]), "wild-shape").remaining).toBe(1);
    expect(res(walk("Walk Druid 2024", "srd24", [spent, { t, type: "rest.long" }]), "wild-shape").remaining).toBe(2);
    expect(act(c, "Land's Aid").save!.dc).toBe(8 + 3 + c.abilities.wis.mod);
  });

  it("2014 Cleric 6: the bare Channel Divinity button is left to its spenders", () => {
    const c = walk("Walk Cleric 2014", "srd");
    expect(res(c, "channel-divinity").max).toBe(2);
    expect(c.actions.map((a) => a.name)).toEqual(expect.arrayContaining(["Channel Divinity: Turn Undead", "Channel Divinity: Preserve Life"]));
    expect(c.actions.map((a) => a.name)).not.toContain("Channel Divinity");
  });

  it("a subclass that arrives at its class level is applied once", () => {
    for (const [dir, src] of [["Walk Paladin 2024", "srd24"], ["Walk Barbarian 2024", "srd24"], ["Walk Sorcerer 2024", "srd24"], ["Walk High Elf Wizard 2024", "srd24"], ["Walk Druid 2024", "srd24"], ["Walk Monk 2014", "srd"], ["Walk Lore Bard 2014", "srd"]] as const) {
      const c = walk(dir, src);
      const keys = c.resources.map((r) => r.key);
      expect(new Set(keys).size, dir).toBe(keys.length);
      const origin = c.elements.map((e) => `${e.id}|${e.origin.join(">")}`).filter((k) => !k.includes(":ability-point:") && !k.includes(":language:") && !k.includes(":skill:") && !k.includes(":mastery:") && !k.includes("ability-score-improvement") && !k.includes(":casting-ability:"));
      expect(new Set(origin).size, dir).toBe(origin.length);
    }
  });

  it("2014 Lore Bard 10: spells known, and what Magical Secrets does to them (see the report)", () => {
    const c = walk("Walk Lore Bard 2014", "srd");
    expect(c.spellcasting!.classes[0]).toMatchObject({ known: 14, cantrips: 4, maxSpellLevel: 5 });
    // Lore's two (Fireball, Sacred Flame) are free; Magical Secrets at 10th (Fire Shield, Fire Bolt) counts:
    // one cantrip against the cantrips and one spell against the 14 known.
    expect(c.spellcasting!.limits[0]).toMatchObject({ cantrips: { cap: 4, used: 1 }, known: { cap: 14, used: 1 }, extras: 0 });
    const free = Object.fromEntries(c.spellcasting!.spells.map((s) => [s.name, s.free]));
    expect(free).toMatchObject({ Fireball: true, "Sacred Flame": true, "Fire Shield": false, "Fire Bolt": false });
  });

  it("2014 Bard: Magical Secrets at 10, 14 and 18 count, and Lore's level-6 choice does not", () => {
    const index = indexes.get("srd")!;
    const choicesAt = (cls: string, level: number) => (index.get(cls) as any).levels[level].choices ?? [];
    for (const level of [10, 14, 18]) {
      const picks = choicesAt("srd:class:bard", level).filter((ch: any) => ch.mode === "learned");
      expect(picks, `level ${level}`).toHaveLength(1);
      expect(picks[0]).toMatchObject({ count: 2 });
      expect(picks[0].counts, `level ${level}`).not.toBe(false);
    }
    const lore = choicesAt("srd:subclass:college-of-lore", 6).filter((ch: any) => ch.mode === "learned");
    expect(lore).toHaveLength(1);
    expect(lore[0]).toMatchObject({ count: 2, counts: false });
  });
});
