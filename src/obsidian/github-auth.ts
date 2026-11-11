/**
 * Credentials for private GitHub sources. A `SourceRef` only names a secret; the
 * token lives in Obsidian's secret storage (1.11.4+), which doesn't travel with the
 * vault the way `data.json` and a character's `sources.5e` do.
 */
import type { App } from "obsidian";
import type { SourceAuth } from "../core/types";

export const SECRET_STORAGE_MIN_VERSION = "1.11.4";

export const SECRET_STORAGE_UPDATE_MESSAGE =
  `Private GitHub repos need Obsidian ${SECRET_STORAGE_MIN_VERSION} or newer, ` +
  "which is where secure token storage arrived. Update Obsidian to add one.";

type WithSecrets = { secretStorage?: { getSecret?: unknown; setSecret?: unknown } };

/** Older Obsidian has no `app.secretStorage` at all, so test for it rather than comparing versions. */
export function secretStorageAvailable(app: App): boolean {
  const storage = (app as unknown as WithSecrets | undefined)?.secretStorage;
  return typeof storage?.getSecret === "function" && typeof storage?.setSecret === "function";
}

/** Secret ids are lowercase alphanumerics and dashes. One per repo, so adding a second never overwrites the first. */
export function secretIdFor(location: string): string {
  const tail = location.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `dragonglass-github-${tail || "source"}`;
}

/**
 * Saves a token and returns the reference to put on the `SourceRef`. Throws on an Obsidian too old to hold it.
 * Pass the secret a source already names to replace its token in place: nothing but the secret changes,
 * so the source's pin and the rest of its entry are left alone.
 */
export function saveGithubToken(app: App, location: string, token: string, existing?: SourceAuth): SourceAuth {
  if (!secretStorageAvailable(app)) throw new Error(SECRET_STORAGE_UPDATE_MESSAGE);
  const secret = existing?.type === "token" ? existing.secret : secretIdFor(location);
  app.secretStorage.setSecret(secret, token.trim());
  return { type: "token", secret };
}

/** The one secret the GitHub login lives in, whatever the number of sources that use it. */
export const OAUTH_SECRET_ID = "dragonglass-github-login";

/** Stores the access token from a completed sign-in. */
export function saveGithubLogin(app: App, token: string): void {
  if (!secretStorageAvailable(app)) throw new Error(SECRET_STORAGE_UPDATE_MESSAGE);
  app.secretStorage.setSecret(OAUTH_SECRET_ID, token.trim());
}

/** Forgets the login on this device. Sources keep `auth: oauth` and report "sign in" until there is another. */
export function clearGithubLogin(app: App): void {
  if (secretStorageAvailable(app)) app.secretStorage.setSecret(OAUTH_SECRET_ID, "");
}

export function githubLoginToken(app: App): string | undefined {
  if (!secretStorageAvailable(app)) return undefined;
  return app.secretStorage.getSecret(OAUTH_SECRET_ID) || undefined;
}

/** The token a ref points at, or why there isn't one. */
export function readGithubToken(app: App, auth: SourceAuth): string {
  if (!secretStorageAvailable(app)) throw new Error(SECRET_STORAGE_UPDATE_MESSAGE);
  if (auth.type === "oauth") {
    const login = githubLoginToken(app);
    if (!login) throw new Error("not signed in to GitHub on this device; sign in from the sources settings");
    return login;
  }
  const token = app.secretStorage.getSecret(auth.secret);
  if (!token) throw new Error(`no token is stored under "${auth.secret}" on this device; add it again in the sources settings`);
  return token;
}
