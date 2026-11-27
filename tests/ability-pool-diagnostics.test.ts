import { describe, expect, it } from "vitest";
import { abilityPoolDiagnostics } from "../src/core/resolver/ability-pools";
import type { BuildAbilities } from "../src/core/types";

const pool = { id: "p1", method: "4d6-drop-lowest", values: [15, 14, 13, 12, 10, null] };
const abilities = (extra: Partial<BuildAbilities>): BuildAbilities => ({ method: "rolled", base: {}, pools: [pool], ...extra });
const paths = (a: BuildAbilities) => abilityPoolDiagnostics(a).map((d) => d.path);

describe("ability pool diagnostics", () => {
  it("is quiet for a well-formed pool, a standard chip and no pools at all", () => {
    expect(abilityPoolDiagnostics(abilities({ assigned: { str: "p1:0", dex: "p1:1" } }))).toEqual([]);
    expect(abilityPoolDiagnostics({ method: "standard-array", base: { str: 15 }, assigned: { str: "standard:0" } })).toEqual([]);
    expect(abilityPoolDiagnostics({ method: "point-buy", base: { str: 8 } })).toEqual([]);
    expect(abilityPoolDiagnostics(undefined)).toEqual([]);
  });

  it("flags a chip whose pool is gone, whose slot is empty or out of range, or that is malformed", () => {
    expect(paths(abilities({ assigned: { str: "p9:0" } }))).toEqual(["abilities.assigned.str"]);
    expect(paths(abilities({ assigned: { str: "p1:5" } }))).toEqual(["abilities.assigned.str"]);
    expect(paths(abilities({ assigned: { str: "p1:6" } }))).toEqual(["abilities.assigned.str"]);
    expect(paths(abilities({ assigned: { str: "nonsense" } }))).toEqual(["abilities.assigned.str"]);
  });

  it("flags one chip claimed by two abilities, once", () => {
    expect(paths(abilities({ assigned: { str: "p1:0", dex: "p1:0" } }))).toEqual(["abilities.assigned.dex"]);
  });

  it("flags a pool of the wrong size and duplicate pool ids", () => {
    const short = { id: "p2", method: "4d6-drop-lowest", values: [1, 2] };
    expect(paths(abilities({ pools: [pool, short] }))).toEqual(["abilities.pools[1]"]);
    expect(paths(abilities({ pools: [pool, { ...pool }] }))).toEqual(["abilities.pools[1]"]);
  });

  it("carries the warning code", () => {
    const [d] = abilityPoolDiagnostics(abilities({ assigned: { str: "p9:0" } }));
    expect(d.severity).toBe("warning");
    expect(d.code).toBe("ability-pool-invalid");
  });
});
