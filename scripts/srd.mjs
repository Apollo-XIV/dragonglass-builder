/**
 * Reading the unconverted SRD.
 *
 * `srd-unconverted/srd-source.json` is a PDF extraction: one flat array of 13k
 * document nodes carrying x/y coordinates, not structured game data. It is 14MB,
 * so nothing can read it whole — a conversion agent needs to find its section and
 * read that, which is what this script is for.
 *
 *   npm run srd:outline                      the heading tree
 *   npm run srd:outline -- Spell             headings matching "Spell"
 *   npm run srd:section -- "Barbarian"       one section as readable text
 *   npm run srd:section -- "Dwarf" --at 142  disambiguate by node index
 *
 * Output is plain text with the coordinates stripped, because the rules text is
 * the only part a converter wants.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = process.env.SRD_SOURCE ?? "srd-unconverted/srd-source.json";
const HEADINGS = new Set(["h1", "h2", "h3", "h4"]);
/** Characters of section text before truncating, so one call can't swamp a context. */
const MAX_CHARS = 120_000;

function load() {
  try {
    return JSON.parse(readFileSync(resolve(SOURCE), "utf8"));
  } catch (error) {
    console.error(`Could not read ${SOURCE}: ${error.message}`);
    console.error("Set SRD_SOURCE to point at the extraction if it lives elsewhere.");
    process.exit(1);
  }
}

/** A node's text, with the PDF's stray spacing collapsed. */
function textOf(node) {
  const parts = (node.subelements ?? []).map((s) => s.text ?? "");
  return parts.join("").replace(/\s+/g, " ").trim();
}

function depthOf(node) {
  return Number(node.type.slice(1));
}

/** A table as pipe-delimited rows, which reads well enough to convert from. */
function tableOf(node) {
  const rows = (node.rows ?? []).map((row) =>
    row.map((cell) => textOf(cell)).join(" | "),
  );
  return rows.length ? rows.map((r) => `| ${r} |`).join("\n") : "";
}

function headings(nodes) {
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!HEADINGS.has(node.type)) continue;
    out.push({ at: i, depth: depthOf(node), text: textOf(node), page: node.page });
  }
  return out;
}

function outline(nodes, query) {
  const all = headings(nodes);
  const needle = query?.toLowerCase();
  const shown = needle ? all.filter((h) => h.text.toLowerCase().includes(needle)) : all;
  if (shown.length === 0) {
    console.error(query ? `No heading matches "${query}".` : "No headings found.");
    process.exit(1);
  }
  for (const h of shown) {
    const indent = "  ".repeat(h.depth - 1);
    console.log(`${String(h.at).padStart(6)}  p${String(h.page).padStart(4)}  ${indent}${"#".repeat(h.depth)} ${h.text}`);
  }
  console.log(`\n${shown.length} heading(s). The first column is the node index: pass it as --at to pick one exactly.`);
}

function section(nodes, query, at) {
  const all = headings(nodes);
  let start;
  if (at !== undefined) {
    start = all.find((h) => h.at === at);
    if (!start) {
      console.error(`Node ${at} is not a heading. Run srd:outline to find one.`);
      process.exit(1);
    }
  } else {
    const needle = query.toLowerCase();
    const exact = all.filter((h) => h.text.toLowerCase() === needle);
    const matches = exact.length ? exact : all.filter((h) => h.text.toLowerCase().includes(needle));
    if (matches.length === 0) {
      console.error(`No heading matches "${query}". Run srd:outline to see what's there.`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.error(`"${query}" matches ${matches.length} headings. Pick one with --at:\n`);
      for (const m of matches) console.error(`  --at ${m.at}   p${m.page}  ${"#".repeat(m.depth)} ${m.text}`);
      process.exit(1);
    }
    start = matches[0];
  }

  // A section runs until the next heading at the same depth or shallower.
  let end = nodes.length;
  for (let i = start.at + 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (HEADINGS.has(node.type) && depthOf(node) <= start.depth) {
      end = i;
      break;
    }
  }

  const lines = [`${"#".repeat(start.depth)} ${start.text}`, ""];
  for (let i = start.at + 1; i < end; i++) {
    const node = nodes[i];
    if (HEADINGS.has(node.type)) {
      lines.push("", `${"#".repeat(depthOf(node))} ${textOf(node)}`, "");
    } else if (node.type === "table") {
      const table = tableOf(node);
      if (table) lines.push("", table, "");
    } else {
      const text = textOf(node);
      if (text) lines.push(text);
    }
  }

  let body = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  const truncated = body.length > MAX_CHARS;
  if (truncated) body = body.slice(0, MAX_CHARS);

  console.log(`<!-- srd: nodes ${start.at}..${end - 1}, pages ${start.page}+ -->`);
  console.log(body);
  if (truncated) {
    console.log(
      `\n<!-- truncated at ${MAX_CHARS} characters. This section is too big to read in one go; ` +
        `use srd:outline to find its sub-headings and read them one at a time. -->`,
    );
  }
}

const [command, ...rest] = process.argv.slice(2);
const atFlag = rest.indexOf("--at");
const at = atFlag === -1 ? undefined : Number(rest[atFlag + 1]);
// Drop the flag and its value, and nothing else: with no --at, `atFlag + 1` is 0
// and a naive index test eats the first real argument.
const query = rest
  .filter((_, i) => atFlag === -1 || (i !== atFlag && i !== atFlag + 1))
  .join(" ")
  .trim();

const nodes = load();
if (!Array.isArray(nodes)) {
  console.error(`${SOURCE} is not an array of document nodes.`);
  process.exit(1);
}

if (command === "outline") outline(nodes, query || undefined);
else if (command === "section") {
  if (!query && at === undefined) {
    console.error('Usage: npm run srd:section -- "<heading>"   (or --at <node index>)');
    process.exit(1);
  }
  section(nodes, query, at);
} else {
  console.error("Usage: node scripts/srd.mjs outline [query] | section <heading> [--at N]");
  process.exit(1);
}
