import { describe, expect, it } from "vitest";
import { resolve } from "../src/core/resolver/resolve";
import type { Element, InventoryFile, StateFile } from "../src/core/types";
import { build, scores, testIndex, TEST_BOOK } from "./helpers";

const CLASS_FIGHTER: Element = {
  id: "test:class:fighter",
  kind: "class",
  name: "Fighter",
  source: "test",
  hitDie: "d10",
  key: "fighter",
  tables: { surges: [1, 1, 1, 1, 1, 1, 2, 2] },
  levels: {
    "1": {
      modifiers: [
        { target: "saves.str", op: "proficiency", value: "proficient" },
        { target: "proficiencies.armor", op: "include", value: ["heavy"] },
      ],
      grants: ["test:feature:second-wind"],
    },
    "2": { grants: ["test:feature:action-surge"] },
    "3": {
      choices: [{ id: "test:fighter:style", count: 1, from: { kind: "fighting-style" } }],
    },
  },
};

const SECOND_WIND: Element = {
  id: "test:feature:second-wind",
  kind: "class-feature",
  name: "Second Wind",
  source: "test",
  resources: [{ id: "uses", name: "Second Wind", max: 1, recharge: "short-rest" }],
  actions: [
    {
      id: "use",
      name: "Second Wind",
      activation: "bonus-action",
      cost: { uses: 1 },
      damage: "1d10 + @level",
    },
  ],
};

const ACTION_SURGE: Element = {
  id: "test:feature:action-surge",
  kind: "class-feature",
  name: "Action Surge",
  source: "test",
  resources: [{ id: "surges", name: "Action Surges", max: "@table(fighter, surges)", recharge: "short-rest" }],
};

const STYLE_DEFENSE: Element = {
  id: "test:style:defense",
  kind: "fighting-style",
  name: "Defense",
  source: "test",
  modifiers: [{ target: "ac", op: "add", value: 1 }],
};

const STYLE_LOCKED: Element = {
  id: "test:style:locked",
  kind: "fighting-style",
  name: "Archery Mastery",
  source: "test",
  requires: { all: [{ type: "ability", ability: "dex", min: 15 }] },
  modifiers: [{ target: "attacks.ranged", op: "add", value: 2 }],
};

const SPECIES_DWARFISH: Element = {
  id: "test:species:stoutling",
  kind: "species",
  name: "Stoutling",
  source: "test",
  modifiers: [
    { target: "abilities.con.score", op: "add", value: 2 },
    { target: "speed.walk", op: "base", value: 25 },
    { target: "senses.darkvision", op: "base", value: 60 },
    { target: "resistances", op: "include", value: ["poison"] },
    { target: "saves.all", op: "advantage", when: { text: "against poison", context: "poison" } },
  ],
  grants: ["test:trait:sturdy"],
};

const TRAIT_STURDY: Element = {
  id: "test:trait:sturdy",
  kind: "species-trait",
  name: "Sturdy",
  source: "test",
  modifiers: [{ target: "hp.max", op: "add", value: "@level" }],
};

const UNARMORED_DEFENSE: Element = {
  id: "test:feature:unarmored-defense",
  kind: "class-feature",
  name: "Unarmored Defense",
  source: "test",
  modifiers: [{ target: "ac", op: "base", value: "10 + @abilities.dex.mod + @abilities.con.mod" }],
};

const RAGE: Element = {
  id: "test:feature:rage",
  kind: "class-feature",
  name: "Rage",
  source: "test",
  resources: [{ id: "rages", name: "Rages", max: 2, recharge: "long-rest" }],
  actions: [{ id: "rage", activation: "bonus-action", cost: { rages: 1 }, applies: "raging" }],
  effects: [
    {
      id: "raging",
      name: "Raging",
      duration: "1 minute",
      modifiers: [
        { target: "checks.str", op: "advantage" },
        { target: "damage.weapon.melee.str", op: "add", value: 2 },
        { target: "resistances", op: "include", value: ["bludgeoning", "piercing", "slashing"] },
      ],
    },
  ],
};

const BASE_ELEMENTS = [
  TEST_BOOK,
  CLASS_FIGHTER,
  SECOND_WIND,
  ACTION_SURGE,
  STYLE_DEFENSE,
  STYLE_LOCKED,
  SPECIES_DWARFISH,
  TRAIT_STURDY,
  UNARMORED_DEFENSE,
  RAGE,
];

function fighter(levels: number, extra: Partial<Parameters<typeof build>[0]> = {}) {
  return build({
    levels: Array.from({ length: levels }, () => ({ class: "test:class:fighter", hp: "average" as const })),
    level: levels,
    ...extra,
  });
}

describe("collection", () => {
  it("follows grants recursively from species and class", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(2, { species: "test:species:stoutling" }) });
    const ids = r.elements.map((e) => e.id);
    expect(ids).toContain("test:species:stoutling");
    expect(ids).toContain("test:trait:sturdy");
    expect(ids).toContain("test:feature:second-wind");
    expect(ids).toContain("test:feature:action-surge");
  });

  it("only applies level entries up to the level taken", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(1) });
    expect(r.elements.map((e) => e.id)).not.toContain("test:feature:action-surge");
  });

  it("groups features by kind for data-driven tabs", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(2, { species: "test:species:stoutling" }) });
    expect(r.features["class-feature"].map((e) => e.name).sort()).toEqual(["Action Surge", "Second Wind"]);
    expect(r.features["species-trait"].map((e) => e.name)).toEqual(["Sturdy"]);
  });

  it("reports an unresolved reference without failing", () => {
    const content = testIndex([TEST_BOOK]);
    const r = resolve({ content, build: fighter(1, { species: "test:species:ghost" }) });
    expect(r.diagnostics.some((d) => d.code === "unresolved-reference")).toBe(true);
    expect(r.level).toBe(1);
  });

  it("records the class level a feature was gained at", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(2) });
    const surge = r.elements.find((e) => e.id === "test:feature:action-surge");
    expect(surge?.level).toBe(2);
    expect(surge?.class).toBe("test:class:fighter");
  });
});

describe("staging against character level", () => {
  const BREATH: Element = { id: "test:trait:breath", kind: "species-trait", name: "Breath", source: "test" };
  const WINGS: Element = {
    id: "test:trait:wings",
    kind: "species-trait",
    name: "Wings",
    source: "test",
    modifiers: [{ target: "speed.fly", op: "add", value: 30 }],
  };
  const DRAGONBORN: Element = {
    id: "test:species:dragonborn",
    kind: "species",
    name: "Dragonborn",
    source: "test",
    levelsBy: "character",
    levels: { "1": { grants: [BREATH.id] }, "5": { grants: [WINGS.id] } },
  };
  const content = testIndex([...BASE_ELEMENTS, BREATH, WINGS, DRAGONBORN]);
  const at = (level: number) => resolve({ content, build: fighter(level, { species: DRAGONBORN.id }) });

  it("gives a species its level-1 trait straight away", () => {
    expect(at(1).elements.map((e) => e.id)).toContain(BREATH.id);
  });

  it("withholds a later trait until the character level arrives", () => {
    expect(at(4).elements.map((e) => e.id)).not.toContain(WINGS.id);
    expect(at(4).speed.fly?.value ?? 0).toBe(0);
  });

  it("applies it at that level, modifiers and all", () => {
    expect(at(5).elements.map((e) => e.id)).toContain(WINGS.id);
    expect(at(5).speed.fly?.value).toBe(30);
  });

  it("attributes it to the character level rather than to a class", () => {
    const wings = at(5).elements.find((e) => e.id === WINGS.id)!;
    expect(wings.level).toBe(5);
    expect(wings.class).toBeUndefined();
  });

  it("counts total level across classes, not one class's levels", () => {
    // Three fighter levels and two rogue ones is a level-5 character, so the
    // trait arrives even though neither class reached 5.
    const ROGUE: Element = { id: "test:class:rogue", kind: "class", name: "Rogue", source: "test", hitDie: "d8" };
    const index = testIndex([...BASE_ELEMENTS, BREATH, WINGS, DRAGONBORN, ROGUE]);
    const multi = build({
      species: DRAGONBORN.id,
      abilities: { method: "manual", base: scores() },
      levels: [
        { class: "test:class:fighter", hp: "average" },
        { class: "test:class:fighter", hp: "average" },
        { class: "test:class:fighter", hp: "average" },
        { class: ROGUE.id, hp: "average" },
        { class: ROGUE.id, hp: "average" },
      ],
    });
    const r = resolve({ content: index, build: multi });
    expect(r.elements.map((e) => e.id)).toContain(WINGS.id);
    // and no class reached level 5
    expect(r.classes.map((c) => c.level).sort()).toEqual([2, 3]);
  });

  it("says so when a levels map would be read by nothing", () => {
    // No basis declared and no class to govern it: silently ignored before, and
    // the silence was the bug.
    const silent: Element = {
      id: "test:species:silent",
      kind: "species",
      name: "Silent",
      source: "test",
      levels: { "5": { grants: [WINGS.id] } },
    };
    const index = testIndex([...BASE_ELEMENTS, WINGS, silent]);
    const r = resolve({ content: index, build: fighter(5, { species: silent.id }) });
    expect(r.elements.map((e) => e.id)).not.toContain(WINGS.id);
    expect(r.diagnostics.some((d) => d.message.includes("declares levels that nothing reads"))).toBe(true);
  });
});

describe("stats", () => {
  it("computes ability scores, modifiers and proficiency bonus", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({
      content,
      build: fighter(5, { species: "test:species:stoutling", abilities: { method: "manual", base: scores({ str: 16, con: 14 }) } }),
    });
    expect(r.abilities.str.score.value).toBe(16);
    expect(r.abilities.str.mod).toBe(3);
    expect(r.abilities.con.score.value).toBe(16); // 14 + 2 from the species
    expect(r.proficiencyBonus.value).toBe(3);
  });

  it("adds proficiency to proficient saves only", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(1, { abilities: { method: "manual", base: scores({ str: 16, dex: 14 }) } }) });
    expect(r.abilities.str.save.value).toBe(3 + 2);
    expect(r.abilities.str.save.proficiency).toBe("proficient");
    expect(r.abilities.dex.save.value).toBe(2);
    expect(r.abilities.dex.save.proficiency).toBeUndefined();
  });

  it("lets base candidates compete, highest wins", () => {
    const content = testIndex(BASE_ELEMENTS);
    const naked = resolve({
      content,
      build: fighter(1, { abilities: { method: "manual", base: scores({ dex: 14 }) } }),
    });
    expect(naked.ac.value).toBe(12); // 10 + DEX

    const monkish = resolve({
      content,
      build: build({
        levels: [{ class: "test:class:fighter", hp: "max" }],
        choices: {},
        abilities: { method: "manual", base: scores({ dex: 14, con: 16 }) },
        background: "test:feature:unarmored-defense",
      }),
    });
    expect(monkish.ac.value).toBe(15); // 10 + 2 + 3 beats 10 + 2
  });

  it("explains where a number came from", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(1, { abilities: { method: "manual", base: scores({ dex: 14 }) } }) });
    const sources = r.ac.breakdown.filter((b) => b.applied).map((b) => b.sourceName);
    expect(sources).toContain("Unarmoured");
    expect(sources).toContain("DEX modifier");
  });

  it("keeps situational modifiers out of the value and lists them as annotations", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(1, { species: "test:species:stoutling" }) });
    expect(r.abilities.con.save.annotations[0].when.text).toBe("against poison");
    expect(r.abilities.con.save.advantage).toBe("none");
  });

  it("fans saves.all out to every save", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(1, { species: "test:species:stoutling" }) });
    for (const ability of ["str", "dex", "con", "int", "wis", "cha"] as const)
      expect(r.abilities[ability].save.annotations).toHaveLength(1);
  });

  it("collects set stats", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(1, { species: "test:species:stoutling" }) });
    expect(r.sets["resistances"].values).toEqual(["poison"]);
    expect(r.sets["proficiencies.armor"].values).toEqual(["heavy"]);
  });

  it("computes speed and senses", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(1, { species: "test:species:stoutling" }) });
    expect(r.speed.walk.value).toBe(25);
    expect(r.senses.darkvision.value).toBe(60);
  });

  it("computes hit points level by level, with the die's maximum at first level", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({
      content,
      build: build({
        levels: [
          { class: "test:class:fighter", hp: "max" },
          { class: "test:class:fighter", hp: "average" },
          { class: "test:class:fighter", hp: 7 },
        ],
        abilities: { method: "manual", base: scores({ con: 14 }) },
      }),
    });
    // 10 + 2, then 6 + 2, then 7 + 2.
    expect(r.hp.max.value).toBe(29);
  });

  it("lets a feature add to max HP with an expression", () => {
    const content = testIndex(BASE_ELEMENTS);
    const plain = resolve({ content, build: fighter(3) });
    const sturdy = resolve({ content, build: fighter(3, { species: "test:species:stoutling" }) });
    // The species adds +2 CON (so +1 mod per level) and Sturdy adds @level.
    expect(sturdy.hp.max.value).toBe(plain.hp.max.value + 3 + 3);
  });

  it("resolves a CON change through to HP, the dependency the lazy engine exists for", () => {
    const content = testIndex(BASE_ELEMENTS);
    const low = resolve({ content, build: fighter(4, { abilities: { method: "manual", base: scores({ con: 10 }) } }) });
    const high = resolve({ content, build: fighter(4, { abilities: { method: "manual", base: scores({ con: 18 }) } }) });
    expect(high.hp.max.value - low.hp.max.value).toBe(16);
  });

  it("reports a cycle instead of looping forever", () => {
    const content = testIndex([
      TEST_BOOK,
      {
        id: "test:feature:ouroboros",
        kind: "feature",
        name: "Ouroboros",
        source: "test",
        modifiers: [{ target: "ac", op: "add", value: "@ac" }],
      },
    ]);
    const r = resolve({ content, build: build({ background: "test:feature:ouroboros" }) });
    expect(r.diagnostics.some((d) => d.code === "expression-cycle")).toBe(true);
  });

  it("does not stack modifiers sharing a stackKey", () => {
    const content = testIndex([
      TEST_BOOK,
      {
        id: "test:feature:a",
        kind: "feature",
        name: "Blessing A",
        source: "test",
        modifiers: [{ target: "ac", op: "add", value: 1, stackKey: "blessing" }],
        grants: ["test:feature:b"],
      },
      {
        id: "test:feature:b",
        kind: "feature",
        name: "Blessing B",
        source: "test",
        modifiers: [{ target: "ac", op: "add", value: 3, stackKey: "blessing" }],
      },
    ]);
    const r = resolve({ content, build: build({ background: "test:feature:a" }) });
    expect(r.ac.value).toBe(13);
    const suppressed = r.ac.breakdown.find((b) => b.sourceName === "Blessing A");
    expect(suppressed?.applied).toBe(false);
    expect(suppressed?.suppressedBy).toBe("Blessing B");
  });

  it("treats min as a floor and max as a ceiling", () => {
    const content = testIndex([
      TEST_BOOK,
      {
        id: "test:feature:floors",
        kind: "feature",
        name: "Floors",
        source: "test",
        modifiers: [
          { target: "speed.walk", op: "base", value: 20 },
          { target: "speed.walk", op: "min", value: 30 },
          { target: "senses.darkvision", op: "base", value: 120 },
          { target: "senses.darkvision", op: "max", value: 60 },
        ],
      },
    ]);
    const r = resolve({ content, build: build({ background: "test:feature:floors" }) });
    expect(r.speed.walk.value).toBe(30);
    expect(r.senses.darkvision.value).toBe(60);
  });

  it("keeps an unknown op as text with a warning", () => {
    const content = testIndex([
      TEST_BOOK,
      {
        id: "test:feature:weird",
        kind: "feature",
        name: "Weird",
        source: "test",
        modifiers: [{ target: "ac", op: "reticulate" as never, value: 3 }],
      },
    ]);
    const r = resolve({ content, build: build({ background: "test:feature:weird" }) });
    expect(r.ac.value).toBe(10);
    expect(r.diagnostics.some((d) => d.code === "unknown-op")).toBe(true);
  });
});

describe("choices", () => {
  it("carries an option's fluff alongside its text, and tolerates its absence", () => {
    const content = testIndex(
      BASE_ELEMENTS.map((e) =>
        (e as { id: string }).id === "test:style:defense"
          ? { ...e, text: "+1 AC in armour.", fluff: "Learned in a hard school." }
          : e,
      ),
    );
    const options = resolve({ content, build: fighter(3) }).pendingChoices.find((c) => c.id === "test:fighter:style")!.options;
    const defense = options.find((o) => o.id === "test:style:defense");
    expect(defense?.fluff).toBe("Learned in a hard school.");
    expect(defense?.text).toBe("+1 AC in armour.");
    expect(options.find((o) => o.id === "test:style:locked")?.fluff).toBeUndefined();
  });

  it("returns an unmade choice with its options", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(3) });
    const choice = r.pendingChoices.find((c) => c.id === "test:fighter:style");
    expect(choice?.complete).toBe(false);
    expect(choice?.options.map((o) => o.id).sort()).toEqual(["test:style:defense", "test:style:locked"]);
    expect(choice?.scope).toBe("level");
    expect(choice?.levelIndex).toBe(2);
  });

  it("applies a made choice and marks it complete", () => {
    const content = testIndex(BASE_ELEMENTS);
    const b = fighter(3);
    b.levels[2].choices = { "test:fighter:style": ["test:style:defense"] };
    const r = resolve({ content, build: b });
    expect(r.pendingChoices.find((c) => c.id === "test:fighter:style")?.complete).toBe(true);
    expect(r.ac.value).toBe(11);
  });

  it("warns on an option whose prerequisites are unmet, but still offers it", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(3) });
    const locked = r.pendingChoices
      .find((c) => c.id === "test:fighter:style")
      ?.options.find((o) => o.id === "test:style:locked");
    expect(locked?.allowed).toBe(false);
    expect(locked?.warnings[0]).toContain("DEX 15");
  });

  it("hides unmet options when enforcement is on", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(3), options: { enforceRequirements: true } });
    const options = r.pendingChoices.find((c) => c.id === "test:fighter:style")?.options.map((o) => o.id);
    expect(options).toEqual(["test:style:defense"]);
  });

  it("keeps a pick that is no longer valid and flags it", () => {
    const content = testIndex(BASE_ELEMENTS);
    const b = fighter(3);
    b.levels[2].choices = { "test:fighter:style": ["test:style:locked"] };
    const r = resolve({ content, build: b, options: { enforceRequirements: true } });
    const choice = r.pendingChoices.find((c) => c.id === "test:fighter:style");
    expect(choice?.chosen).toEqual(["test:style:locked"]);
    expect(choice?.invalid).toEqual(["test:style:locked"]);
    expect(choice?.complete).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "choice-invalid")).toBe(true);
  });

  it("reads a species choice from the build's global choices", () => {
    const content = testIndex([
      ...BASE_ELEMENTS,
      {
        id: "test:species:picky",
        kind: "species",
        name: "Picky",
        source: "test",
        choices: [{ id: "test:picky:style", count: 1, from: { kind: "fighting-style" } }],
      },
    ]);
    const r = resolve({
      content,
      build: build({ species: "test:species:picky", choices: { "test:picky:style": ["test:style:defense"] } }),
    });
    expect(r.ac.value).toBe(11);
    expect(r.pendingChoices.find((c) => c.id === "test:picky:style")?.scope).toBe("build");
  });
});

describe("resources, actions and effects", () => {
  it("resolves a resource max from an expression and a class table", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(7) });
    expect(r.resources.find((x) => x.key === "test:feature:action-surge:surges")?.max).toBe(2);
  });

  it("resolves an action's cost against the element's own resource", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(1) });
    const action = r.actions.find((a) => a.id === "use");
    expect(action?.resolvedCost).toEqual([
      { key: "test:feature:second-wind:uses", amount: 1, label: "Second Wind" },
    ]);
  });

  it("substitutes expressions in damage notation", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(4) });
    expect(r.actions.find((a) => a.id === "use")?.damageResolved).toBe("1d10 + 4");
  });

  it("lists effects as inactive in level state", () => {
    const content = testIndex(BASE_ELEMENTS);
    const r = resolve({ content, build: fighter(1, { background: "test:feature:rage" }) });
    const raging = r.effects.find((e) => e.id === "raging");
    expect(raging?.active).toBe(false);
    expect(r.live).toBe(false);
  });
});

describe("live state overlay", () => {
  const content = testIndex(BASE_ELEMENTS);
  const character = fighter(3, { background: "test:feature:rage", abilities: { method: "manual", base: scores({ con: 14 }) } });

  function withEvents(...events: StateFile["events"]): StateFile {
    return {
      kind: "state",
      schemaVersion: 1,
      checkpoint: { damage: 0, tempHp: 0, tempMaxHp: [], spent: {}, effects: [] },
      events,
    };
  }

  it("subtracts damage from max HP to give current HP", () => {
    const r = resolve({ content, build: character, state: withEvents({ t: "t", type: "damage", amount: 5 }) });
    expect(r.live).toBe(true);
    expect(r.hp.current).toBe(r.hp.max.value - 5);
    expect(r.hp.damage).toBe(5);
  });

  it("counts temporary max HP on top of the resolved maximum", () => {
    const r = resolve({
      content,
      build: character,
      state: withEvents({ t: "t", type: "temp-max-hp.add", effect: { id: "aid", amount: 5, source: "Aid" } }),
    });
    expect(r.hp.tempMax).toBe(5);
    expect(r.hp.current).toBe(r.hp.max.value + 5);
    expect(r.status.tempMaxHpEffects).toHaveLength(1);
  });

  it("applies an active effect's modifiers to the numbers", () => {
    const off = resolve({ content, build: character, state: withEvents() });
    const on = resolve({ content, build: character, state: withEvents({ t: "t", type: "effect.start", effect: "raging" }) });
    expect(off.sets["resistances"].values).toEqual([]);
    expect(on.sets["resistances"].values).toEqual(["bludgeoning", "piercing", "slashing"]);
    expect(on.abilities.str.check.advantage).toBe("advantage");
    expect(on.effects.find((e) => e.id === "raging")?.active).toBe(true);
    expect(on.stats["damage.weapon.melee.str"].value).toBe(2);
  });

  it("attributes an effect's contribution to the effect, not the build", () => {
    const on = resolve({ content, build: character, state: withEvents({ t: "t", type: "effect.start", effect: "raging" }) });
    expect(on.stats["damage.weapon.melee.str"].breakdown.some((b) => b.fromEffect)).toBe(true);
  });

  it("reports spent resources and marks an action unaffordable", () => {
    const spent = resolve({
      content,
      build: character,
      state: withEvents({ t: "t", type: "spend", target: "test:feature:second-wind:uses", amount: 1 }),
    });
    expect(spent.resources.find((x) => x.id === "uses" && x.source.includes("second-wind"))?.remaining).toBe(0);
    const action = spent.actions.find((a) => a.id === "use");
    expect(action?.available).toBe(false);
    expect(action?.unavailableReason).toContain("Second Wind");
  });

  it("clamps spent amounts above a new max", () => {
    const r = resolve({
      content,
      build: fighter(1, { background: "test:feature:rage" }),
      state: withEvents({ t: "t", type: "spend", target: "test:feature:rage:rages", amount: 9 }),
    });
    const rages = r.resources.find((x) => x.key === "test:feature:rage:rages");
    expect(rages?.spent).toBe(2);
    expect(rages?.remaining).toBe(0);
  });

  it("tracks hit dice, conditions and inspiration", () => {
    const r = resolve({
      content,
      build: character,
      state: withEvents(
        { t: "t", type: "spend", target: "hitDice.d10", amount: 2 },
        { t: "t", type: "condition.add", condition: "prone" },
        { t: "t", type: "inspiration", value: true },
      ),
    });
    expect(r.hp.hitDice).toEqual([{ die: "d10", max: 3, spent: 2, remaining: 1 }]);
    expect(r.status.conditions).toEqual(["prone"]);
    expect(r.status.inspiration).toBe(true);
  });

  it("restores on a rest according to each resource's recharge rule", () => {
    const r = resolve({
      content,
      build: character,
      state: withEvents(
        { t: "t", type: "spend", target: "test:feature:second-wind:uses", amount: 1 },
        { t: "t", type: "spend", target: "test:feature:rage:rages", amount: 2 },
        { t: "t", type: "rest.short" },
      ),
    });
    expect(r.resources.find((x) => x.key === "test:feature:second-wind:uses")?.remaining).toBe(1);
    expect(r.resources.find((x) => x.key === "test:feature:rage:rages")?.remaining).toBe(0);
  });
});

describe("inventory", () => {
  const content = testIndex([
    ...BASE_ELEMENTS,
    {
      id: "test:item:chain-mail",
      kind: "item",
      name: "Chain Mail",
      source: "test",
      weight: 55,
      armor: { base: 16, dexMax: null, stealthDisadvantage: true },
    },
    {
      id: "test:item:shield",
      kind: "item",
      name: "Shield",
      source: "test",
      weight: 6,
      modifiers: [{ target: "ac", op: "add", value: 2, stackKey: "shield" }],
    },
    {
      id: "test:item:cloak",
      kind: "item",
      name: "Cloak of Protection",
      source: "test",
      attunement: true,
      modifiers: [{ target: "ac", op: "add", value: 1 }],
    },
  ]);

  function inv(items: InventoryFile["items"]): InventoryFile {
    return { kind: "inventory", schemaVersion: 1, items, currency: { gp: 15 } };
  }

  it("only applies an item's modifiers when it is equipped", () => {
    const b = fighter(1, { abilities: { method: "manual", base: scores({ dex: 14 }) } });
    const carried = resolve({ content, build: b, inventory: inv([{ id: "test:item:chain-mail" }]) });
    expect(carried.ac.value).toBe(12);
    const worn = resolve({ content, build: b, inventory: inv([{ id: "test:item:chain-mail", equipped: true }]) });
    expect(worn.ac.value).toBe(16);
  });

  it("turns typed armour into a base AC candidate that caps dex", () => {
    const b = fighter(1, { abilities: { method: "manual", base: scores({ dex: 20 }) } });
    const worn = resolve({ content, build: b, inventory: inv([{ id: "test:item:chain-mail", equipped: true }]) });
    expect(worn.ac.value).toBe(16);
    expect(worn.stats["skills.stealth"].advantage).toBe("disadvantage");
  });

  it("adds a shield on top of armour", () => {
    const b = fighter(1);
    const r = resolve({
      content,
      build: b,
      inventory: inv([
        { id: "test:item:chain-mail", equipped: true },
        { id: "test:item:shield", equipped: true },
      ]),
    });
    expect(r.ac.value).toBe(18);
  });

  it("requires attunement where the item asks for it", () => {
    const b = fighter(1);
    const equipped = resolve({ content, build: b, inventory: inv([{ id: "test:item:cloak", equipped: true }]) });
    expect(equipped.ac.value).toBe(10);
    const attuned = resolve({
      content,
      build: b,
      inventory: inv([{ id: "test:item:cloak", equipped: true, attuned: true }]),
    });
    expect(attuned.ac.value).toBe(11);
  });

  it("totals weight, capacity and currency", () => {
    const r = resolve({
      content,
      build: fighter(1, { abilities: { method: "manual", base: scores({ str: 14 }) } }),
      inventory: inv([{ id: "test:item:chain-mail", quantity: 1 }, { id: "test:item:shield", quantity: 2 }]),
    });
    expect(r.carried.weight).toBe(55 + 12);
    expect(r.carried.capacity).toBe(14 * 15);
    expect(r.currency.gp).toBe(15);
  });

  it("supports an inline custom item with real modifiers", () => {
    const r = resolve({
      content,
      build: fighter(1),
      inventory: inv([
        {
          item: {
            id: "custom:item:lucky-charm",
            kind: "item",
            name: "Lucky Charm",
            source: "custom",
            requiresEquipped: true,
            modifiers: [{ target: "saves.all", op: "add", value: 1 }],
          },
          equipped: true,
        },
      ]),
    });
    expect(r.abilities.cha.save.value).toBe(1);
    expect(r.inventory[0].resolvedRef).toBe(false);
  });

  it("keeps an unresolvable item reference as a diagnostic", () => {
    const r = resolve({ content, build: fighter(1), inventory: inv([{ id: "test:item:nope" }]) });
    expect(r.diagnostics.some((d) => d.code === "unresolved-reference")).toBe(true);
  });
});

describe("skills come from content", () => {
  const ATHLETICS: Element = {
    id: "test:skill:athletics", kind: "skill", name: "Athletics", source: "test",
    ability: "str",
    modifiers: [{ target: "skills.athletics", op: "proficiency", value: "proficient" }],
  };
  const PILOTING: Element = {
    id: "test:skill:piloting", kind: "skill", name: "Piloting", source: "test", ability: "dex",
  };
  /** A skill whose key is not its id's last segment, the way a class's `key` works. */
  const SLEIGHT: Element = {
    id: "test:skill:sleight", kind: "skill", name: "Sleight of Hand", source: "test",
    key: "sleight-of-hand", ability: "dex",
  };
  const KEEN: Element = {
    id: "test:feature:keen", kind: "feature", name: "Keen", source: "test",
    modifiers: [{ target: "skills.all", op: "advantage" }],
  };
  /** Species exist here only to carry a grant into the character. */
  const grantor = (id: string, grants: string[]): Element => ({
    id, kind: "species", name: "Grantor", source: "test", grants,
  });

  const base = [TEST_BOOK, CLASS_FIGHTER, SECOND_WIND];

  it("builds the skill list from the declared skills, under their own keys and names", () => {
    const content = testIndex([...base, ATHLETICS, PILOTING, SLEIGHT]);
    const character = resolve({ content, build: fighter(1) });
    expect(character.skills.map((s) => s.key).sort()).toEqual([
      "athletics", "piloting", "sleight-of-hand",
    ]);
    expect(character.skills.find((s) => s.key === "sleight-of-hand")!.name).toBe("Sleight of Hand");
  });

  it("rolls a skill against the ability its own element declares", () => {
    const content = testIndex([...base, PILOTING]);
    const character = resolve({
      content,
      build: fighter(1, { abilities: { method: "manual", base: scores({ dex: 16, str: 8 }) } }),
    });
    const piloting = character.skills.find((s) => s.key === "piloting")!;
    expect(piloting.ability).toBe("dex");
    expect(piloting.stat.value).toBe(3);
    expect(piloting.passive).toBe(13);
  });

  it("grants proficiency through the skill element's own modifier", () => {
    const abilities = { method: "manual" as const, base: scores({ str: 14 }) };

    const without = testIndex([...base, ATHLETICS]);
    expect(
      resolve({ content: without, build: fighter(1, { abilities }) })
        .skills.find((s) => s.key === "athletics")!.stat.value,
    ).toBe(2);

    const granted = testIndex([...base, ATHLETICS, grantor("test:species:athlete", ["test:skill:athletics"])]);
    expect(
      resolve({ content: granted, build: fighter(1, { abilities, species: "test:species:athlete" }) })
        .skills.find((s) => s.key === "athletics")!.stat.value,
    ).toBe(4);
  });

  it("fans skills.all out over a skill the engine has never heard of", () => {
    const content = testIndex([
      ...base, PILOTING, KEEN, grantor("test:species:watcher", ["test:feature:keen"]),
    ]);
    const character = resolve({
      content,
      build: fighter(1, { species: "test:species:watcher" }),
    });
    expect(character.skills.find((s) => s.key === "piloting")!.stat.advantage).toBe("advantage");
  });

  it("has an empty skill list when no source declares a skill", () => {
    const content = testIndex(base);
    expect(resolve({ content, build: fighter(1) }).skills).toEqual([]);
  });
});

describe("spellcasting.all fans out over the classes a character casts with", () => {
  const WIZARD: Element = {
    id: "test:class:wizard", kind: "class", name: "Wizard", source: "test", key: "wizard",
    hitDie: "d6",
    spellcasting: { ability: "int", progression: "full", type: "spellbook", list: "wizard-spell" },
    levels: { "1": {} },
  };
  const CLERIC: Element = {
    id: "test:class:cleric", kind: "class", name: "Cleric", source: "test", key: "cleric",
    hitDie: "d8",
    spellcasting: { ability: "wis", progression: "full", type: "prepared", list: "cleric-spell" },
    levels: { "1": {} },
  };
  /** A Rod of the Pact Keeper is the real case: +1 to DC and attack, any class. */
  const ROD: Element = {
    id: "test:item:rod", kind: "item", name: "Rod", source: "test", itemType: "rod",
    modifiers: [
      { target: "spellcasting.all.dc", op: "add", value: 1 },
      { target: "spellcasting.all.attack", op: "add", value: 1 },
    ],
  };
  const holder = (id: string): Element => ({
    id, kind: "species", name: "Holder", source: "test", grants: ["test:item:rod"],
  });

  const abilities = { method: "manual" as const, base: scores({ int: 16, wis: 16, str: 10 }) };
  const levelsOf = (...classes: string[]) =>
    classes.map((c) => ({ class: c, hp: "average" as const, choices: {} as Record<string, string[]> }));

  it("reaches the one class a single-classed caster has", () => {
    const content = testIndex([TEST_BOOK, WIZARD, ROD, holder("test:species:holder")]);
    const plain = resolve({
      content,
      build: build({ abilities, levels: levelsOf("test:class:wizard"), level: 1 }),
    });
    const withRod = resolve({
      content,
      build: build({
        abilities,
        levels: levelsOf("test:class:wizard"),
        level: 1,
        species: "test:species:holder",
      }),
    });

    const wizard = (c: typeof plain) => c.spellcasting!.classes.find((x) => x.name === "Wizard")!;
    expect(wizard(plain).dc.value).toBe(13); // 8 + 2 prof + 3 int
    expect(wizard(withRod).dc.value).toBe(14);
    expect(wizard(withRod).attack.value).toBe(wizard(plain).attack.value + 1);
  });

  it("reaches every class a multiclassed caster has", () => {
    const content = testIndex([TEST_BOOK, WIZARD, CLERIC, ROD, holder("test:species:holder")]);
    const character = resolve({
      content,
      build: build({
        abilities,
        levels: levelsOf("test:class:wizard", "test:class:cleric"),
        level: 2,
        species: "test:species:holder",
      }),
    });

    expect(character.spellcasting!.classes).toHaveLength(2);
    for (const cls of character.spellcasting!.classes) {
      // 8 + 2 prof + 3 (int or wis) + 1 from the rod
      expect(cls.dc.value, cls.name).toBe(14);
    }
  });

  it("does nothing for a character who casts with nothing", () => {
    const content = testIndex([TEST_BOOK, CLASS_FIGHTER, SECOND_WIND, ROD, holder("test:species:holder")]);
    const character = resolve({
      content,
      build: fighter(1, { species: "test:species:holder" }),
    });
    // The modifier fans out to no paths at all rather than landing somewhere wrong.
    expect(character.spellcasting?.classes ?? []).toEqual([]);
    expect(Object.keys(character.stats).filter((p) => p.startsWith("spellcasting."))).toEqual([]);
  });

  it("still lets a modifier name one class directly", () => {
    const content = testIndex([
      TEST_BOOK, WIZARD, CLERIC,
      {
        id: "test:item:wand", kind: "item", name: "Wand", source: "test",
        modifiers: [{ target: "spellcasting.wizard.dc", op: "add", value: 2 }],
      },
      { id: "test:species:wandholder", kind: "species", name: "Holder", source: "test", grants: ["test:item:wand"] },
    ]);
    const character = resolve({
      content,
      build: build({
        abilities,
        levels: levelsOf("test:class:wizard", "test:class:cleric"),
        level: 2,
        species: "test:species:wandholder",
      }),
    });
    const byName = Object.fromEntries(character.spellcasting!.classes.map((c) => [c.name, c.dc.value]));
    expect(byName).toEqual({ Wizard: 15, Cleric: 13 });
  });
});

describe("the multiply op", () => {
  const boots = (modifiers: Element["modifiers"]): Element[] => [
    TEST_BOOK,
    CLASS_FIGHTER,
    SECOND_WIND,
    { id: "test:item:boots", kind: "item", name: "Boots", source: "test", modifiers },
    { id: "test:species:booted", kind: "species", name: "Booted", source: "test", grants: ["test:item:boots"], modifiers: [{ target: "speed.walk", op: "base", value: 30 }] },
  ];
  const booted = (modifiers: Element["modifiers"]) =>
    resolve({
      content: testIndex(boots(modifiers)),
      build: fighter(1, { species: "test:species:booted" }),
    });

  it("multiplies the value", () => {
    expect(booted([{ target: "speed.walk", op: "multiply", value: 2 }]).speed.walk!.value).toBe(60);
  });

  it("applies after the bonuses, because it doubles the speed you have", () => {
    const character = booted([
      { target: "speed.walk", op: "add", value: 10 },
      { target: "speed.walk", op: "multiply", value: 2 },
    ]);
    expect(character.speed.walk!.value).toBe(80);
  });

  it("rounds down, the way 5e rounds down", () => {
    // 30 halved is 15; 25 halved is 12.
    expect(booted([{ target: "speed.walk", op: "multiply", value: 0.5 }]).speed.walk!.value).toBe(15);
    const slower = resolve({
      content: testIndex([
        ...boots([{ target: "speed.walk", op: "multiply", value: 0.5 }]).slice(0, 4),
        { id: "test:species:booted", kind: "species", name: "Booted", source: "test", grants: ["test:item:boots"], modifiers: [{ target: "speed.walk", op: "base", value: 25 }] },
      ]),
      build: fighter(1, { species: "test:species:booted" }),
    });
    expect(slower.speed.walk!.value).toBe(12);
  });

  it("is still subject to a floor and a ceiling", () => {
    const floored = booted([
      { target: "speed.walk", op: "multiply", value: 0 },
      { target: "speed.walk", op: "min", value: 5 },
    ]);
    expect(floored.speed.walk!.value).toBe(5);
    const capped = booted([
      { target: "speed.walk", op: "multiply", value: 3 },
      { target: "speed.walk", op: "max", value: 50 },
    ]);
    expect(capped.speed.walk!.value).toBe(50);
  });

  it("composes several multipliers, the way several bonuses accumulate", () => {
    expect(
      booted([
        { target: "speed.walk", op: "multiply", value: 2 },
        { target: "speed.walk", op: "multiply", value: 2 },
      ]).speed.walk!.value,
    ).toBe(120);
  });

  it("honours a stackKey, so the larger of two named multipliers wins alone", () => {
    const character = booted([
      { target: "speed.walk", op: "multiply", value: 2, stackKey: "haste" },
      { target: "speed.walk", op: "multiply", value: 3, stackKey: "haste" },
    ]);
    expect(character.speed.walk!.value).toBe(90);
  });

  it("shows up in the breakdown either way", () => {
    const character = booted([
      { target: "speed.walk", op: "multiply", value: 2, stackKey: "haste" },
      { target: "speed.walk", op: "multiply", value: 3, stackKey: "haste" },
    ]);
    const rows = character.speed.walk!.breakdown.filter((r) => r.op === "multiply");
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.applied)).toHaveLength(1);
    expect(rows.find((r) => !r.applied)?.suppressedBy).toBeTruthy();
  });
});
