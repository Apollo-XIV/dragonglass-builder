/** Writes docs/export-schema.json from the TypeBox schema, the one source of truth. */
import { writeFileSync } from "node:fs";
import { ExportDocument, EXPORT_SCHEMA_VERSION } from "../src/core/export/schema";

export function schemaJson(): string {
  return JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", "x-schemaVersion": EXPORT_SCHEMA_VERSION, ...ExportDocument }, null, 2) + "\n";
}

if (process.argv[1]?.endsWith("export-schema.ts")) {
  writeFileSync("docs/export-schema.json", schemaJson());
  console.log("wrote docs/export-schema.json");
}
