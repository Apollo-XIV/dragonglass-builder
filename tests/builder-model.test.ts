/** The builder's pure model, and the guarantee that both layouts name every feature flag. */

import { describe, expect, it } from "vitest";
import { levelForXp, setLevelHp, XP_THRESHOLDS } from "../src/core/resolver/levels";
import { NO_FEATURES } from "../src/obsidian/ui/builder/features";
import { orderSections, type SectionDef } from "../src/obsidian/ui/builder/registry";
import {
  multiclassNote,
  pointsSpent,
  POINT_BUY_BUDGET,
  relativeTime,
  upcomingStaged,
} from "../src/obsidian/ui/builder/model";
import { DESKTOP_FEATURES } from "../src/obsidian/ui/desktop/DesktopBuilder";
import type { BuildFile, Element } from "../src/core/types";

describe("feature flags", () => {
  it("names the same flags in every shell, so none is added to one and forgotten in the other", () => {
    expect(Object.keys(DESKTOP_FEATURES).sort()).toEqual(Object.keys(NO_FEATURES).sort());
  });

  it("turns nothing on for the narrow layout yet", () => {
    expect(Object.values(NO_FEATURES).every((v) => v === false)).toBe(true);
  });
});

describe("section order", () => {
  const sections = ["a", "b", "c", "d"].map((id) => ({ id, label: id, icon: id, body: null }) as SectionDef);

  it("follows the preference and appends the sections it does not name", () => {
    expect(orderSections(sections, ["c", "a"]).map((s) => s.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("ignores a preferred section that does not exist", () => {
    expect(orderSections(sections, ["z", "b"]).map((s) => s.id)).toEqual(["b", "a", "c", "d"]);
  });
});

describe("point buy", () => {
  it("costs the standard array's neighbour scores as the rules do", () => {
    const base = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
    expect(pointsSpent(base, Object.keys(base))).toBe(27);
    expect(POINT_BUY_BUDGET).toBe(27);
  });
});

describe("experience", () => {
  it("finds the level an amount of XP is enough for", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(299)).toBe(1);
    expect(levelForXp(300)).toBe(2);
    expect(levelForXp(355000)).toBe(20);
    expect(XP_THRESHOLDS).toHaveLength(20);
  });
});

describe("level hit points", () => {
  it("changes only the level asked for", () => {
    const build = {
      levels: [
        { class: "a", hp: "max" },
        { class: "a", hp: "average" },
      ],
    } as unknown as BuildFile;
    const next = setLevelHp(build, 1, 6);
    expect(next.levels.map((l) => l.hp)).toEqual(["max", 6]);
    expect(build.levels[1].hp).toBe("average");
  });
});

describe("small helpers", () => {
  it("describes a class's multiclass prerequisite only when it has one", () => {
    expect(multiclassNote({ id: "x", kind: "class", name: "X", source: "s" } as Element)).toBeUndefined();
  });

  it("says how long ago a draft was saved", () => {
    expect(relativeTime(new Date(Date.now() - 5 * 60000).toISOString())).toBe("5 minutes ago");
    expect(relativeTime("not a date")).toBe("earlier");
  });

  it("looks ahead only at owners that stage themselves by character level", () => {
    expect(upcomingStaged([], 3, 3)).toEqual([]);
  });
});
