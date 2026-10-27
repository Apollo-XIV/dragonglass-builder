import { describe, expect, it } from "vitest";
import { evaluate, resolveDice, dependencies, checkExpression, type ExprContext } from "../src/core/expr/evaluate";
import { ExprError, parseExpression } from "../src/core/expr/parser";

const ctx: ExprContext = {
  lookup: (p) =>
    ({
      prof: 3,
      level: 7,
      "abilities.con.mod": 2,
      "abilities.str.mod": 4,
      "abilities.cha.mod": -1,
      "skills.animal-handling": 5,
    })[p],
  classLevel: (c) => ({ paladin: 5, monk: 2 })[c] ?? 0,
  table: (c, col) => (c === "barbarian" && col === "rages" ? 3 : undefined),
};

describe("parser", () => {
  it("respects precedence", () => {
    expect(evaluate("1 + 2 * 3", ctx)).toBe(7);
    expect(evaluate("(1 + 2) * 3", ctx)).toBe(9);
  });

  it("handles unary minus and subtraction of references", () => {
    expect(evaluate("-@prof", ctx)).toBe(-3);
    expect(evaluate("@prof - 1", ctx)).toBe(2);
    expect(evaluate("@abilities.cha.mod", ctx)).toBe(-1);
  });

  it("reads hyphenated paths without treating the hyphen as minus", () => {
    expect(evaluate("@skills.animal-handling + 1", ctx)).toBe(6);
  });

  it("evaluates functions", () => {
    expect(evaluate("floor(@level / 2)", ctx)).toBe(3);
    expect(evaluate("ceil(@level / 3)", ctx)).toBe(3);
    expect(evaluate("max(1, @abilities.cha.mod)", ctx)).toBe(1);
    expect(evaluate("min(2, 5, 3)", ctx)).toBe(2);
    expect(evaluate("abs(-4)", ctx)).toBe(4);
  });

  it("evaluates class levels and tables", () => {
    expect(evaluate("@level(paladin)", ctx)).toBe(5);
    expect(evaluate("@level(druid)", ctx)).toBe(0);
    expect(evaluate("@table(barbarian, rages)", ctx)).toBe(3);
  });

  it("accepts plain numbers", () => {
    expect(evaluate(5, ctx)).toBe(5);
    expect(evaluate("5", ctx)).toBe(5);
  });

  it("rejects unknown references, functions and syntax", () => {
    expect(() => evaluate("@nope", ctx)).toThrow(ExprError);
    expect(() => evaluate("sqrt(4)", ctx)).toThrow(ExprError);
    expect(() => evaluate("1 +", ctx)).toThrow(ExprError);
    expect(() => evaluate("1 2", ctx)).toThrow(ExprError);
    expect(() => evaluate("1 / 0", ctx)).toThrow(ExprError);
    expect(() => evaluate("@table(barbarian)", ctx)).toThrow(ExprError);
  });

  it("never evaluates arbitrary code", () => {
    expect(() => evaluate("process.exit(1)", ctx)).toThrow(ExprError);
    expect(() => evaluate("globalThis", ctx)).toThrow(ExprError);
  });

  it("reports dependencies", () => {
    expect([...dependencies("@abilities.con.mod + @prof")]).toEqual(["abilities.con.mod", "prof"]);
    expect([...dependencies("@table(barbarian, rages)")]).toEqual(["level:barbarian"]);
  });

  it("checks expressions without a context", () => {
    expect(checkExpression("floor(@level / 2)")).toBeUndefined();
    expect(checkExpression("floor(")).toMatch(/unexpected end/);
  });

  it("parses to a stable AST", () => {
    expect(parseExpression("@prof + 1")).toEqual({
      t: "bin",
      op: "+",
      l: { t: "ref", path: "prof" },
      r: { t: "num", v: 1 },
    });
  });
});

describe("dice interpolation", () => {
  it("substitutes references and leaves dice alone", () => {
    expect(resolveDice("2d6 + @abilities.str.mod", ctx).text).toBe("2d6 + 4");
  });

  it("tidies a negative modifier", () => {
    expect(resolveDice("1d8 + @abilities.cha.mod", ctx).text).toBe("1d8 - 1");
  });

  it("substitutes table and level calls", () => {
    expect(resolveDice("1d12 + @table(barbarian, rages)", ctx).text).toBe("1d12 + 3");
    expect(resolveDice("@level(paladin)d8", ctx).text).toBe("5d8");
  });

  it("keeps the original text when a reference is unknown", () => {
    const out = resolveDice("2d6 + @mystery", ctx);
    expect(out.text).toBe("2d6 + @mystery");
    expect(out.error).toBeDefined();
  });
});
