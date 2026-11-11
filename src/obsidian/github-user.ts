import { requestUrl } from "obsidian";

/** The login name behind a token, for "Signed in as". Undefined on any failure; it's only a label. */
export async function fetchGithubUser(token: string): Promise<string | undefined> {
  try {
    const response = await requestUrl({
      url: "https://api.github.com/user",
      throw: false,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
    });
    const login = (response.json as { login?: unknown } | undefined)?.login;
    return response.status < 400 && typeof login === "string" ? login : undefined;
  } catch {
    return undefined;
  }
}
