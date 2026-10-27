#!/usr/bin/env node
/**
 * The validation CLI. Shares the plugin's validator exactly: JSON Schema-shaped
 * structural checks, then reference checks (sourcebooks exist, ids resolve,
 * expressions parse). Claude Code runs this on its own conversion output in a loop
 * until it passes.
 *
 *   npm run validate -- content/srd
 *   npm run validate -- content/srd --with content/core --json
 *   npm run validate -- content/srd --strict     # warnings fail too
 */

import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { ContentIndex } from "../core/content";
import { checkExpression } from "../core/expr/evaluate";
import type { Diagnostic, Element } from "../core/types";
import { loadSourceFromDisk } from "../node/load-source";

interface Options {
  roots: string[];
  /** Extra sources loaded for reference resolution but not themselves reported on. */
  with: string[];
  json: boolean;
  strict: boolean;
  quiet: boolean;
}

function parseArgs(argv: string[]): Options | { error: string } {
  const opts: Options = { roots: [], with: [], json: false, strict: false, quiet: false };
  let mode: "root" | "with" = "root";
  for (const arg of argv) {
    if (arg === "--with") {
      mode = "with";
      continue;
    }
    if (arg === "--json") {
      opts.json = true;
      continue;
    }
    if (arg === "--strict") {
      opts.strict = true;
      continue;
    }
    if (arg === "--quiet" || arg === "-q") {
      opts.quiet = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") return { error: "help" };
    if (arg.startsWith("-")) return { error: `unknown flag "${arg}"` };
    (mode === "root" ? opts.roots : opts.with).push(arg);
    mode = "root";
  }
  if (!opts.roots.length) return { error: "no source directory given" };
  return opts;
}

const USAGE = `Usage: validate <source-dir> [more-source-dirs...] [options]

  --with <dir>   Load another source for reference checks without reporting on it.
                 Repeat the flag for several. Defaults to content/core when present.
  --strict       Exit non-zero on warnings as well as errors.
  --json         Machine-readable output.
  --quiet        Only print the summary.
  --help

Checks performed:
  * structural validation of every element (the same code the plugin runs on load)
  * every element's source resolves to a loaded sourcebook
  * every element's kind resolves to a kind definition
  * every grant, choice id and exclusion resolves
  * every expression parses
  * no duplicate ids within a source
`;

/** Expression fields the structural validator doesn't reach. */
function checkExpressionsDeep(el: Element): Diagnostic[] {
  const out: Diagnostic[] = [];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, i) => visit(child, `${path}[${i}]`));
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      // Only fields the engine evaluates as expressions; `text` stays prose.
      if ((key === "max" || key === "value" || key === "dc" || key === "rechargeAmount" || key === "base") && (typeof value === "string" || typeof value === "number")) {
        const error = typeof value === "string" && !value.includes("@") && !/^[-+\d\s.()*/]+$/.test(value)
          ? undefined // a plain word like "proficient" or "expertise", not an expression
          : checkExpression(value);
        if (error) out.push({ severity: "warning", code: "expression-error", message: error, subject: el.id, path: childPath });
        continue;
      }
      visit(value, childPath);
    }
  };
  visit(el, "");
  return out;
}

function report(diagnostics: Diagnostic[], opts: Options, index: ContentIndex, reportedSources: Set<string>): number {
  const relevant = diagnostics.filter((d) => {
    if (d.code === "overridden") return false;
    // Prefer the diagnostic's own source; fall back to where the element was indexed.
    const owner = d.source ?? (d.subject ? index.origin(d.subject)?.source : undefined) ?? d.subject;
    return owner === undefined || reportedSources.has(owner);
  });

  const errors = relevant.filter((d) => d.severity === "error");
  const warnings = relevant.filter((d) => d.severity === "warning");
  const infos = relevant.filter((d) => d.severity === "info");

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: errors.length === 0 && (!opts.strict || warnings.length === 0),
          elements: index.all().length,
          counts: { errors: errors.length, warnings: warnings.length, info: infos.length },
          diagnostics: relevant,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    if (!opts.quiet)
      for (const d of [...errors, ...warnings, ...infos]) {
        const icon = d.severity === "error" ? "error" : d.severity === "warning" ? "warn " : "info ";
        const where = [d.file, d.subject, d.path].filter(Boolean).join(" · ");
        process.stdout.write(`${icon}  ${where ? `${where}: ` : ""}${d.message}\n`);
      }
    const summary = `${index.all().length} elements · ${errors.length} errors · ${warnings.length} warnings`;
    process.stdout.write(`${relevant.length ? "\n" : ""}${summary}\n`);
  }

  if (errors.length) return 1;
  if (opts.strict && warnings.length) return 1;
  return 0;
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    if (parsed.error !== "help") process.stderr.write(`validate: ${parsed.error}\n\n`);
    process.stdout.write(USAGE);
    return parsed.error === "help" ? 0 : 2;
  }
  const opts = parsed;

  // Core ships with the plugin, so content always resolves against it.
  if (!opts.with.length) {
    const core = resolvePath("content/core");
    if (existsSync(core) && !opts.roots.some((r) => resolvePath(r) === core)) opts.with.push(core);
  }

  for (const dir of [...opts.roots, ...opts.with])
    if (!existsSync(dir)) {
      process.stderr.write(`validate: "${dir}" does not exist\n`);
      return 2;
    }

  const reported = opts.roots.map(loadSourceFromDisk);
  const support = opts.with.map(loadSourceFromDisk);
  const index = ContentIndex.build([...reported, ...support]);

  const diagnostics = [...index.diagnostics];
  const reportedSources = new Set(reported.map((s) => s.id));

  for (const el of index.all()) {
    const origin = index.origin(el.id);
    if (!reportedSources.has(origin?.source ?? "")) continue;
    diagnostics.push(
      ...checkExpressionsDeep(el).map((d) => ({ ...d, source: origin?.source, file: origin?.file })),
    );
    for (const choice of el.choices ?? [])
      for (const missing of index.unresolvedIn(choice.from))
        diagnostics.push({
          severity: "warning",
          code: "unresolved-reference",
          message: `choice "${choice.id}" lists "${missing}", which is not loaded`,
          subject: el.id,
          path: "choices",
          source: origin?.source,
          file: origin?.file,
        });
    const levels = el.levels as Record<string, { choices?: { id: string; from: Parameters<ContentIndex["unresolvedIn"]>[0] }[] }> | undefined;
    for (const [level, entry] of Object.entries(levels ?? {}))
      for (const choice of entry.choices ?? [])
        for (const missing of index.unresolvedIn(choice.from))
          diagnostics.push({
            severity: "warning",
            code: "unresolved-reference",
            message: `choice "${choice.id}" at level ${level} lists "${missing}", which is not loaded`,
            subject: el.id,
            path: `levels.${level}.choices`,
            source: origin?.source,
            file: origin?.file,
          });
  }

  return report(diagnostics, opts, index, reportedSources);
}

process.exitCode = main(process.argv.slice(2));
