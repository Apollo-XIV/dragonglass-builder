/**
 * A small, safe expression language. Never `eval`.
 *
 *   @abilities.con.mod + 2
 *   floor(@level / 2)
 *   @table(barbarian, rages)
 *   max(1, @abilities.cha.mod)
 *   @level(monk)
 */

export type ExprNode =
  | { t: "num"; v: number }
  | { t: "ref"; path: string }
  | { t: "level"; class: string }
  | { t: "table"; class: string; column: string }
  | { t: "call"; name: FunctionName; args: ExprNode[] }
  | { t: "bin"; op: "+" | "-" | "*" | "/"; l: ExprNode; r: ExprNode }
  | { t: "neg"; e: ExprNode };

export const FUNCTIONS = ["floor", "ceil", "round", "abs", "min", "max"] as const;
export type FunctionName = (typeof FUNCTIONS)[number];

const ARITY: Record<FunctionName, { min: number; max: number }> = {
  floor: { min: 1, max: 1 },
  ceil: { min: 1, max: 1 },
  round: { min: 1, max: 1 },
  abs: { min: 1, max: 1 },
  min: { min: 1, max: Infinity },
  max: { min: 1, max: Infinity },
};

export class ExprError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly position?: number,
  ) {
    super(`${message} in "${source}"`);
    this.name = "ExprError";
  }
}

type Token =
  | { k: "num"; v: number; p: number }
  | { k: "ident"; v: string; p: number }
  | { k: "at"; v: string; p: number }
  | { k: "op"; v: "+" | "-" | "*" | "/"; p: number }
  | { k: "punc"; v: "(" | ")" | ","; p: number };

const isDigit = (c: string) => c >= "0" && c <= "9";
const isAlpha = (c: string) => /[A-Za-z_]/.test(c);
const isPathChar = (c: string) => /[A-Za-z0-9_.]/.test(c);

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    const start = i;
    if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
      let j = i;
      while (j < src.length && (isDigit(src[j]) || src[j] === ".")) j++;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) throw new ExprError(`bad number at ${i}`, src, i);
      out.push({ k: "num", v, p: start });
      i = j;
      continue;
    }
    if (c === "@") {
      let j = i + 1;
      while (j < src.length) {
        if (isPathChar(src[j])) {
          j++;
          continue;
        }
        // A hyphen belongs to the path only when a letter follows it directly,
        // so "@skills.animal-handling" parses but "@prof - 1" still subtracts.
        if (src[j] === "-" && isAlpha(src[j + 1] ?? "")) {
          j += 2;
          continue;
        }
        break;
      }
      const path = src.slice(i + 1, j);
      if (!path) throw new ExprError(`empty reference at ${i}`, src, i);
      out.push({ k: "at", v: path, p: start });
      i = j;
      continue;
    }
    if (isAlpha(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_-]/.test(src[j])) j++;
      out.push({ k: "ident", v: src.slice(i, j), p: start });
      i = j;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      out.push({ k: "op", v: c, p: start });
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === ",") {
      out.push({ k: "punc", v: c, p: start });
      i++;
      continue;
    }
    throw new ExprError(`unexpected character "${c}" at ${i}`, src, i);
  }
  return out;
}

/** Parses an expression string into an AST. Throws ExprError on bad input. */
export function parseExpression(src: string): ExprNode {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token => {
    const t = tokens[pos];
    if (!t) throw new ExprError("unexpected end of expression", src);
    pos++;
    return t;
  };
  const expectPunc = (v: "(" | ")" | ",") => {
    const t = next();
    if (t.k !== "punc" || t.v !== v) throw new ExprError(`expected "${v}" at ${t.p}`, src, t.p);
  };

  function parseArgs(): ExprNode[] {
    expectPunc("(");
    const args: ExprNode[] = [];
    const t = peek();
    if (t && t.k === "punc" && t.v === ")") {
      next();
      return args;
    }
    for (;;) {
      args.push(parseExpr());
      const n = next();
      if (n.k === "punc" && n.v === ")") break;
      if (n.k !== "punc" || n.v !== ",") throw new ExprError(`expected "," or ")" at ${n.p}`, src, n.p);
    }
    return args;
  }

  /** `@level(monk)` and `@table(barbarian, rages)` take bare identifiers, not expressions. */
  function parseIdentArgs(count: number, name: string): string[] {
    expectPunc("(");
    const out: string[] = [];
    for (let n = 0; n < count; n++) {
      const t = next();
      if (t.k !== "ident" && t.k !== "num")
        throw new ExprError(`expected a name in @${name}() at ${t.p}`, src, t.p);
      out.push(String(t.v));
      if (n < count - 1) expectPunc(",");
    }
    expectPunc(")");
    return out;
  }

  function parsePrimary(): ExprNode {
    const t = next();
    if (t.k === "num") return { t: "num", v: t.v };
    if (t.k === "punc" && t.v === "(") {
      const e = parseExpr();
      expectPunc(")");
      return e;
    }
    if (t.k === "op" && t.v === "-") return { t: "neg", e: parseUnary() };
    if (t.k === "at") {
      const nextTok = peek();
      const isCall = nextTok && nextTok.k === "punc" && nextTok.v === "(";
      if (t.v === "level" && isCall) {
        const [cls] = parseIdentArgs(1, "level");
        return { t: "level", class: cls };
      }
      if (t.v === "table") {
        if (!isCall) throw new ExprError(`@table needs (class, column) at ${t.p}`, src, t.p);
        const [cls, column] = parseIdentArgs(2, "table");
        return { t: "table", class: cls, column };
      }
      if (isCall) throw new ExprError(`"@${t.v}" is not callable at ${t.p}`, src, t.p);
      return { t: "ref", path: t.v };
    }
    if (t.k === "ident") {
      const name = t.v.toLowerCase() as FunctionName;
      if (!(FUNCTIONS as readonly string[]).includes(name))
        throw new ExprError(`unknown function "${t.v}" at ${t.p}`, src, t.p);
      const args = parseArgs();
      const arity = ARITY[name];
      if (args.length < arity.min || args.length > arity.max)
        throw new ExprError(`${name}() takes ${arity.min}..${arity.max} arguments, got ${args.length}`, src, t.p);
      return { t: "call", name, args };
    }
    throw new ExprError(`unexpected token at ${t.p}`, src, t.p);
  }

  function parseUnary(): ExprNode {
    const t = peek();
    if (t && t.k === "op" && t.v === "-") {
      next();
      return { t: "neg", e: parseUnary() };
    }
    if (t && t.k === "op" && t.v === "+") {
      next();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parseTerm(): ExprNode {
    let l = parseUnary();
    for (;;) {
      const t = peek();
      if (t && t.k === "op" && (t.v === "*" || t.v === "/")) {
        next();
        l = { t: "bin", op: t.v, l, r: parseUnary() };
      } else return l;
    }
  }

  function parseExpr(): ExprNode {
    let l = parseTerm();
    for (;;) {
      const t = peek();
      if (t && t.k === "op" && (t.v === "+" || t.v === "-")) {
        next();
        l = { t: "bin", op: t.v, l, r: parseTerm() };
      } else return l;
    }
  }

  const ast = parseExpr();
  if (pos < tokens.length) {
    const t = tokens[pos];
    throw new ExprError(`unexpected trailing input at ${t.p}`, src, t.p);
  }
  return ast;
}

/** Every reference an expression depends on, for dependency ordering and cycle detection. */
export function expressionRefs(node: ExprNode, out = new Set<string>()): Set<string> {
  switch (node.t) {
    case "ref":
      out.add(node.path);
      break;
    case "level":
      out.add(`level:${node.class}`);
      break;
    case "table":
      out.add(`level:${node.class}`);
      break;
    case "call":
      for (const a of node.args) expressionRefs(a, out);
      break;
    case "bin":
      expressionRefs(node.l, out);
      expressionRefs(node.r, out);
      break;
    case "neg":
      expressionRefs(node.e, out);
      break;
    case "num":
      break;
  }
  return out;
}

const cache = new Map<string, ExprNode | ExprError>();

/** Parses with memoisation. Rethrows the cached error for repeat bad input. */
export function parseCached(src: string): ExprNode {
  const hit = cache.get(src);
  if (hit instanceof ExprError) throw hit;
  if (hit) return hit;
  try {
    const ast = parseExpression(src);
    cache.set(src, ast);
    return ast;
  } catch (e) {
    if (e instanceof ExprError) cache.set(src, e);
    throw e;
  }
}
