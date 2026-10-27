/**
 * A source's on-disk shape, independent of how the bytes arrive. The plugin reads
 * these through Obsidian's vault API or `requestUrl`; the CLI and tests read them
 * from the filesystem. Both end up calling `bundleToLoadedSource`.
 */

import type { Diagnostic } from "../types";
import type { LoadedSource } from "./index";

export interface SourceManifest {
  id: string;
  name?: string;
  description?: string;
  /** Sourcebook element ids this source provides, for display before loading. */
  sourcebooks?: string[];
  /** Schema version of the manifest itself. */
  schemaVersion?: number;
}

export interface SourceFile {
  /** Path relative to the source root, for error messages. */
  path: string;
  /** Raw file text. */
  text: string;
}

export interface SourceBundle {
  manifest: SourceManifest;
  files: SourceFile[];
}

/** Parses a bundle's files into elements, turning parse failures into diagnostics. */
export function bundleToLoadedSource(bundle: SourceBundle): LoadedSource {
  const elements: unknown[] = [];
  const elementFiles: string[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const file of bundle.files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.text);
    } catch (e) {
      diagnostics.push({
        severity: "error",
        code: "invalid-element",
        message: e instanceof Error ? e.message : String(e),
        subject: bundle.manifest.id,
        source: bundle.manifest.id,
        file: file.path,
      });
      continue;
    }
    // A file holds one element or an array of them.
    const found = Array.isArray(parsed) ? parsed : [parsed];
    for (const element of found) {
      elements.push(element);
      elementFiles.push(file.path);
    }
  }

  return {
    id: bundle.manifest.id,
    name: bundle.manifest.name,
    elements,
    elementFiles,
    diagnostics,
  };
}

export function parseManifest(text: string, fallbackId: string): { manifest: SourceManifest; diagnostics: Diagnostic[] } {
  try {
    const parsed = JSON.parse(text) as SourceManifest;
    if (typeof parsed?.id !== "string" || !parsed.id)
      return {
        manifest: { ...parsed, id: fallbackId },
        diagnostics: [
          {
            severity: "warning",
            code: "invalid-element",
            message: "source.json has no id; using the location as the id",
            subject: fallbackId,
            path: "source.json",
          },
        ],
      };
    return { manifest: parsed, diagnostics: [] };
  } catch (e) {
    return {
      manifest: { id: fallbackId },
      diagnostics: [
        {
          severity: "error",
          code: "invalid-element",
          message: `source.json: ${e instanceof Error ? e.message : String(e)}`,
          subject: fallbackId,
          path: "source.json",
        },
      ],
    };
  }
}
