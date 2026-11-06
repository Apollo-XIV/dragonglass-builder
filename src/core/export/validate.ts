import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { EXPORT_SCHEMA_VERSION, ExportDocument } from "./schema";

FormatRegistry.Set("date-time", (v) => !Number.isNaN(Date.parse(v)) && /^\d{4}-\d\d-\d\dT/.test(v));

export interface ExportIssue {
  /** JSON pointer into the document. */
  path: string;
  message: string;
}

export type ExportValidation =
  | { ok: true; doc: ExportDocument; errors: [] }
  | { ok: false; doc?: undefined; errors: ExportIssue[] };

export function parseVersion(v: unknown): { major: number; minor: number } | undefined {
  const m = typeof v === "string" ? /^(\d+)\.(\d+)$/.exec(v) : null;
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : undefined;
}

const ABSOLUTE_PATH = /^(\/|[A-Za-z]:[\\/]|\\\\|~\/|file:)/;

/**
 * Checks a document against the schema and the rules a schema cannot say: ids are
 * unique, containers point at entries that exist, and nothing identifies a path on
 * the exporter's machine. Reports every problem, not the first.
 */
export function validateExport(input: unknown): ExportValidation {
  const errors: ExportIssue[] = [];
  const doc = input as ExportDocument;

  for (const e of Value.Errors(ExportDocument, input)) errors.push({ path: e.path || "/", message: e.message });
  if (errors.length) return { ok: false, errors: errors.slice(0, 50) };

  const mine = parseVersion(EXPORT_SCHEMA_VERSION)!;
  const theirs = parseVersion(doc.envelope.schemaVersion);
  if (!theirs) errors.push({ path: "/envelope/schemaVersion", message: "Not a major.minor version" });
  else if (theirs.major !== mine.major)
    errors.push({
      path: "/envelope/schemaVersion",
      message: `Version ${doc.envelope.schemaVersion} is not readable by schema ${EXPORT_SCHEMA_VERSION}`,
    });

  const uids = new Set<string>();
  doc.inventory.items.forEach((item, i) => {
    if (uids.has(item.uid)) errors.push({ path: `/inventory/items/${i}/uid`, message: `Duplicate entry id "${item.uid}"` });
    uids.add(item.uid);
  });
  doc.inventory.items.forEach((item, i) => {
    if (item.container !== undefined && !uids.has(item.container))
      errors.push({ path: `/inventory/items/${i}/container`, message: `Held by "${item.container}", which is not an entry` });
    if (item.container === item.uid)
      errors.push({ path: `/inventory/items/${i}/container`, message: "An entry cannot hold itself" });
    if (!item.resolved && !item.reason)
      errors.push({ path: `/inventory/items/${i}/reason`, message: "An unresolved entry must say why" });
  });

  const featureIds = new Set<string>();
  doc.features.forEach((f, i) => {
    if (featureIds.has(f.id)) errors.push({ path: `/features/${i}/id`, message: `Duplicate feature "${f.id}"` });
    featureIds.add(f.id);
  });

  doc.envelope.sources.forEach((s, i) => {
    if (s.refType === "hash" && !/^sha256:[0-9a-f]{64}$/.test(s.ref))
      errors.push({ path: `/envelope/sources/${i}/ref`, message: "A hash ref is sha256: followed by 64 hex digits" });
    for (const field of ["ref", "id", "name", "version"] as const) {
      const v = s[field];
      if (typeof v === "string" && (ABSOLUTE_PATH.test(v) || v.includes("\\")))
        errors.push({ path: `/envelope/sources/${i}/${field}`, message: "Looks like a path on the exporting machine" });
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true, doc, errors: [] };
}
