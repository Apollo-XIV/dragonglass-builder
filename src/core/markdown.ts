/**
 * Obsidian's renderer only starts a table after a blank line, and some sources (the
 * 5etools conversions) put one straight under a paragraph line: `**Title**\n| a | b |`.
 * Left alone that prints as raw pipes, so a blank line goes in front of any table whose
 * header row and delimiter row follow a line that isn't part of a table.
 */
export function spaceTables(source: string): string {
  if (!source.includes("|")) return source;
  const lines = source.split("\n");
  const row = (l: string): boolean => /^\s*\|.*\|\s*$/.test(l);
  const delimiter = (l: string): boolean => /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(l);
  const out: string[] = [];
  lines.forEach((line, i) => {
    const startsTable = row(line) && i + 1 < lines.length && delimiter(lines[i + 1]);
    if (startsTable && out.length && out[out.length - 1].trim() !== "" && !row(out[out.length - 1])) out.push("");
    out.push(line);
  });
  return out.join("\n");
}
