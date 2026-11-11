import { Modal, Notice, requestUrl, type App } from "obsidian";
import type DragonglassPlugin from "../main";
import type { SourceRef } from "../core/types";
import { sessionLoginToken, setSessionLogin } from "./github-auth";
import { pollForToken, requestDeviceCode, type DeviceCode, type PostForm } from "./github-oauth";

export const postForm: PostForm = async (url, form) => {
  const response = await requestUrl({
    url,
    method: "POST",
    throw: false,
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  return (response.json ?? {}) as Record<string, unknown>;
};

/** Walks through GitHub's device flow and stores the login. `onDone` runs once it is saved. */
export class GithubLoginModal extends Modal {
  private cancelled = false;

  constructor(
    app: App,
    private readonly onDone: () => void | Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("Sign in to GitHub");
    this.contentEl.createEl("p", { text: "Asking GitHub for a code…" });
    void this.run();
  }

  private async run(): Promise<void> {
    try {
      const code = await requestDeviceCode(postForm);
      this.showCode(code);
      const token = await pollForToken(postForm, code, { cancelled: () => this.cancelled });
      setSessionLogin(token);
      this.close();
      await this.onDone();
    } catch (e) {
      if (this.cancelled) return;
      this.contentEl.empty();
      this.contentEl.createEl("p", { text: e instanceof Error ? e.message : String(e) });
    }
  }

  private showCode(code: DeviceCode): void {
    const el = this.contentEl;
    el.empty();
    el.createEl("p", { text: `Enter this code at ${code.verificationUri}:` });
    el.createEl("p", { text: code.userCode, cls: "dg-device-code" });
    const open = el.createEl("button", { text: "Copy code and open GitHub", cls: "mod-cta" });
    open.addEventListener("click", () => {
      void navigator.clipboard?.writeText(code.userCode).catch(() => undefined);
      window.open(code.verificationUri);
      new Notice("Code copied");
    });
    el.createEl("p", {
      cls: "dg-muted",
      text:
        "This lets Dragonglass read the private repos your GitHub account can, to fetch sources. GitHub offers " +
        "no read-only scope for them, so the login can also write wherever you can; Dragonglass only ever reads. " +
        "It is kept in memory for this session only and forgotten when Obsidian closes; fetched sources are " +
        "cached in your vault. Waiting for you to approve…",
    });
  }

  onClose(): void {
    this.cancelled = true;
    this.contentEl.empty();
  }
}

/**
 * Fetches a login-backed source from GitHub again, asking for the login first if this session
 * has none. The cached copy stays as the fallback, so a failed update loses nothing.
 */
export async function updateFromGithub(plugin: DragonglassPlugin, ref: SourceRef): Promise<void> {
  const run = async (): Promise<void> => {
    plugin.sources.refresh(ref.id);
    await plugin.reloadSources();
    new Notice(`Updated "${ref.name ?? ref.id}" from GitHub`);
  };
  if (sessionLoginToken()) await run();
  else new GithubLoginModal(plugin.app, run).open();
}
