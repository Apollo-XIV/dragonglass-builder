/**
 * Markdown (as Obsidian writes it) to plain text. Links become their visible text,
 * embeds become the text they embed, and the formatting marks go. It reads no
 * files itself: whoever has the vault supplies `embed`.
 */

export interface PlainTextHost {
  /**
   * The plain text of what `![[target]]` embeds, or undefined when it embeds
   * nothing readable (an image, a missing note). Receives the target as written,
   * heading or block suffix included. The result is itself flattened.
   */
  embed?: (target: string) => Promise<string | undefined> | string | undefined;
  /** How deep embeds may nest. Default 3; a cycle stops sooner. */
  maxDepth?: number;
}

const WIKI = /(!?)\[\[([^\]\n]+?)\]\]/g;

/** What a wikilink shows: its alias, else the note name without any #heading or ^block. */
export function wikilinkLabel(inner: string): string {
  const bar = inner.indexOf("|");
  if (bar >= 0) return inner.slice(bar + 1).trim();
  const target = inner.split(/[#^]/)[0].trim();
  const base = target.slice(target.lastIndexOf("/") + 1);
  return base || inner.replace(/^[#^]+/, "").trim();
}

export async function toPlainText(markdown: string, host: PlainTextHost = {}): Promise<string> {
  return flatten(markdown, host, 0, []);
}

async function flatten(md: string, host: PlainTextHost, depth: number, seen: string[]): Promise<string> {
  let text = md.replace(/\r\n?/g, "\n");
  text = text.replace(/^---\n[\s\S]*?\n---\n/, "");
  text = text.replace(/%%[\s\S]*?%%/g, "").replace(/<!--[\s\S]*?-->/g, "");

  // Embeds need the host, so they are replaced first and one at a time.
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(WIKI)) {
    out.push(text.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const [, bang, inner] = m;
    if (!bang) {
      out.push(wikilinkLabel(inner));
      continue;
    }
    const target = inner.split("|")[0].trim();
    const limit = host.maxDepth ?? 3;
    if (depth >= limit || seen.includes(target) || !host.embed) {
      out.push("");
      continue;
    }
    const body = await host.embed(target);
    out.push(body === undefined ? "" : (await flatten(body, host, depth + 1, [...seen, target])).trim());
  }
  out.push(text.slice(last));
  text = out.join("");

  return text
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^>\s?\[![\w-]+\][+-]?\s*/gm, "> ")
    .replace(/^>\s?/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "$1")
    .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/==(.+?)==/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\^[A-Za-z0-9-]+$/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The sections of details.5e as markdown: whatever comes before the first heading
 * (under an empty heading, when there is any), then one per heading, in file order.
 */
export function splitDetails(raw: string): { heading: string; body: string }[] {
  const text = raw.replace(/\r\n?/g, "\n").replace(/^---\n[\s\S]*?\n---\n?/, "");
  const sections: { heading: string; body: string[] }[] = [{ heading: "", body: [] }];
  for (const line of text.split("\n")) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) sections.push({ heading: heading[1].trim(), body: [] });
    else sections[sections.length - 1].body.push(line);
  }
  return sections
    .map((s) => ({ heading: s.heading, body: s.body.join("\n").trim() }))
    .filter((s, i) => i > 0 || s.body);
}
