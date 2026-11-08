import type { Expr } from "../types";
import { ExprError, expressionRefs, parseCached, type ExprNode } from "./parser";

/**
 * What an expression can read. The resolver supplies this; it's the only coupling
 * between the expression language and the rules engine.
 */
export interface ExprContext {
  /** "prof", "level", "abilities.con.mod", "ac". Undefined for unknown paths. */
  lookup(path: string): number | undefined;
  /** Level in one class, by its short key or full id. 0 when the class isn't taken. */
  classLevel(classRef: string): number;
  /** A class table column at the character's level in that class. */
  table(classRef: string, column: string): number | undefined;
}

export function evaluateNode(node: ExprNode, ctx: ExprContext, src: string): number {
  switch (node.t) {
    case "num":
      return node.v;
    case "ref": {
      const v = ctx.lookup(node.path);
      if (v === undefined) throw new ExprError(`unknown reference "@${node.path}"`, src);
      return v;
    }
    case "level":
      return ctx.classLevel(node.class);
    case "table": {
      const v = ctx.table(node.class, node.column);
      if (v === undefined)
        throw new ExprError(`no table column "${node.column}" for "${node.class}"`, src);
      return v;
    }
    case "neg":
      return -evaluateNode(node.e, ctx, src);
    case "bin": {
      const l = evaluateNode(node.l, ctx, src);
      const r = evaluateNode(node.r, ctx, src);
      switch (node.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          if (r === 0) throw new ExprError("division by zero", src);
          return l / r;
      }
      break;
    }
    case "call": {
      const args = node.args.map((a) => evaluateNode(a, ctx, src));
      switch (node.name) {
        case "floor":
          return Math.floor(args[0]);
        case "ceil":
          return Math.ceil(args[0]);
        case "round":
          return Math.round(args[0]);
        case "abs":
          return Math.abs(args[0]);
        case "min":
          return Math.min(...args);
        case "max":
          return Math.max(...args);
      }
    }
  }
  throw new ExprError("unevaluable expression", src);
}

/** Evaluates a number or expression string. Throws ExprError. */
export function evaluate(expr: Expr, ctx: ExprContext): number {
  if (typeof expr === "number") return expr;
  const trimmed = expr.trim();
  if (trimmed === "") throw new ExprError("empty expression", expr);
  return evaluateNode(parseCached(trimmed), ctx, trimmed);
}

/** Evaluates, returning `fallback` instead of throwing. */
export function tryEvaluate(expr: Expr, ctx: ExprContext, fallback = 0): { value: number; error?: string } {
  try {
    return { value: evaluate(expr, ctx) };
  } catch (e) {
    return { value: fallback, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The references an expression depends on. Used for dependency ordering. */
export function dependencies(expr: Expr): Set<string> {
  if (typeof expr === "number") return new Set();
  try {
    return expressionRefs(parseCached(expr.trim()));
  } catch {
    return new Set();
  }
}

/** Parses without evaluating, for the validator and CLI. */
export function checkExpression(expr: Expr): string | undefined {
  if (typeof expr === "number") return undefined;
  try {
    parseCached(String(expr).trim());
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const DICE_REF = /@[A-Za-z_][A-Za-z0-9_.]*(?:-[A-Za-z][A-Za-z0-9_.]*)*(?:\(\s*[A-Za-z0-9_-]+\s*(?:,\s*[A-Za-z0-9_-]+\s*)?\))?/g;

/**
 * Substitutes expression references inside dice notation, leaving the dice alone:
 * "2d6 + @abilities.str.mod" -> "2d6 + 3". Keeps the original on failure, since a
 * readable-but-unresolved string beats an error at the table.
 */
export function resolveDice(
  notation: string,
  ctx: ExprContext,
  /** Paths left as written, without an error: values only the sheet knows, like `spent`. */
  deferred?: ReadonlySet<string>,
): { text: string; error?: string } {
  let error: string | undefined;
  const text = notation.replace(DICE_REF, (match) => {
    if (deferred?.has(match.slice(1))) return match;
    try {
      return String(evaluate(match, ctx));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return match;
    }
  });
  // "2d6 + -1" reads badly; "2d6 - 1" does not.
  return { text: text.replace(/\+\s*-\s*/g, "- ").replace(/\s+/g, " ").trim(), error };
}

/** The name a chosen-amount cost's amount goes by in the action's own expressions. */
export const SPENT_REF = "spent";

/** Whether `text` still refers to the chosen amount. */
export const mentionsSpent = (text: string | undefined): boolean => !!text && /@spent\b/.test(text);

/**
 * Fills in the amount the player chose, in text the resolver left `@spent` in.
 * Everything else was substituted already, so only the chosen amount is left to read.
 */
export function fillSpent(text: string, spent: number): string {
  const ctx: ExprContext = {
    lookup: (path) => (path === SPENT_REF ? spent : undefined),
    classLevel: () => 0,
    table: () => undefined,
  };
  return resolveDice(text, ctx).text;
}

export { ExprError } from "./parser";
export type { ExprNode } from "./parser";
