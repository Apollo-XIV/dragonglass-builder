import { Modal, Notice, requestUrl, type App } from "obsidian";
import { saveGithubLogin, secretStorageAvailable, SECRET_STORAGE_UPDATE_MESSAGE } from "./github-auth";
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
    if (!secretStorageAvailable(this.app)) {
      this.contentEl.createEl("p", { text: SECRET_STORAGE_UPDATE_MESSAGE });
      return;
    }
    this.contentEl.createEl("p", { text: "Asking GitHub for a code…" });
    void this.run();
  }

  private async run(): Promise<void> {
    try {
      const code = await requestDeviceCode(postForm);
      this.showCode(code);
      const token = await pollForToken(postForm, code, { cancelled: () => this.cancelled });
      saveGithubLogin(this.app, token);
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
        "This lets Dragonglass read every private repo your GitHub account can. GitHub offers no read-only " +
        "scope for private repos, so the login can also write to them; Dragonglass only ever reads. " +
        "Waiting for you to approve…",
    });
  }

  onClose(): void {
    this.cancelled = true;
    this.contentEl.empty();
  }
}
