/**
 * The character's portrait: the vault image `details.5e` names, or initials on a
 * colour derived from the name when there is none or it cannot be shown.
 *
 * The initials are the one place a colour cannot come from a theme variable, since
 * the whole point is that it differs per character.
 */

import { useEffect, useState, type ReactNode } from "react";
import { normalizePath } from "obsidian";
import { usePlugin } from "./context";

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function nameHue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

/** The URL the webview can load for a vault path, or undefined if it has none. */
export function useAvatarUrl(path: string | undefined): { url?: string; onError: () => void } {
  const { app } = usePlugin();
  const [failed, setFailed] = useState<string>();
  // A new path, or the same one replaced on disk, deserves another try.
  useEffect(() => setFailed(undefined), [path]);
  if (!path || failed === path) return { onError: () => undefined };
  return {
    url: app.vault.adapter.getResourcePath(normalizePath(path)),
    onError: () => setFailed(path),
  };
}

export function Avatar({
  name,
  path,
  className,
}: {
  name: string;
  path?: string;
  className: string;
}): ReactNode {
  const { url, onError } = useAvatarUrl(path);
  if (url)
    return <img className={`${className} is-image`} src={url} alt={name} onError={onError} draggable={false} />;
  return (
    <div className={className} style={{ background: `hsl(${nameHue(name)} 32% 38%)` }} role="img" aria-label={name}>
      <span>{initialsOf(name)}</span>
    </div>
  );
}
