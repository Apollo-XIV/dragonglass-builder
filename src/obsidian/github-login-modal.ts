import { Modal, Notice, requestUrl, type App } from "obsidian";
import type DragonglassPlugin from "../main";
import type { SourceRef } from "../core/types";
import {
    saveLogin,
  savedLoginExists,
  secretStorageAvailable,
  sessionLoginToken,
  setSessionLogin,
  unlockLogin,
} from "./github-auth";
import { WrongPasswordError } from "./login-crypto";
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
      // Saving is offered, not forced: without it the login simply ends with the session.
      if (secretStorageAvailable(this.app)) new PasswordModal(this.app, "set", (password) => saveLogin(this.app, token, password), this.onDone).open();
      else await this.onDone();
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
        "Next you can protect it with a password and save it, so a later update only needs the password. " +
        "Waiting for you to approve…",
    });
  }

  onClose(): void {
    this.cancelled = true;
    this.contentEl.empty();
  }
}

/** Asks for the password that seals the saved login: to set it (twice), or to unlock it. */
export class PasswordModal extends Modal {
  private done = false;

  constructor(
    app: App,
    private readonly mode: "set" | "unlock",
    private readonly submit: (password: string) => Promise<void>,
    private readonly onDone: () => void | Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    const el = this.contentEl;
    let password = "";
    let confirm = "";
    this.setTitle(this.mode === "set" ? "Protect your GitHub login" : "Enter your password");
    el.createEl("p", {
      text:
        this.mode === "set"
          ? "Choose a password. It seals the login saved on this device, so a later update only needs the password. " +
            "Other plugins can read what is saved, and a short password can be guessed offline, so make it a good one. " +
            "It can't be recovered; if it's lost, forget the login and sign in again."
          : "Unlocks your saved GitHub login for this session, to check for updates.",
    });
    const error = el.createEl("p", { cls: "mod-warning" });
    const field = (placeholder: string, set: (v: string) => void) => {
      const input = el.createEl("input", { type: "password", placeholder });
      input.autocomplete = "off";
      input.addEventListener("input", () => set(input.value));
      input.addEventListener("keydown", (e) => e.key === "Enter" && void go());
      return input;
    };
    const first = field(this.mode === "set" ? "Password" : "Password", (v) => (password = v));
    if (this.mode === "set") field("Again", (v) => (confirm = v));
    const go = async (): Promise<void> => {
      if (!password) return;
      if (this.mode === "set" && password !== confirm) {
        error.setText("The two passwords differ");
        return;
      }
      try {
        await this.submit(password);
      } catch (e) {
        error.setText(e instanceof WrongPasswordError ? "Wrong password" : e instanceof Error ? e.message : String(e));
        return;
      }
      this.done = true;
      this.close();
      await this.onDone();
    };
    const buttons = el.createDiv({ cls: "modal-button-container" });
    buttons.createEl("button", { text: this.mode === "set" ? "Save" : "Unlock", cls: "mod-cta" }).addEventListener("click", () => void go());
    if (this.mode === "set")
      buttons.createEl("button", { text: "Don't save (this session only)" }).addEventListener("click", () => {
        this.done = true;
        this.close();
        void this.onDone();
      });
    first.focus();
  }

  onClose(): void {
    this.contentEl.empty();
    // Dismissing the box still leaves the new login usable this session; nothing is saved.
    if (!this.done && this.mode === "set") void this.onDone();
  }
}

/** Unlocks the saved login, or signs in if there isn't one, then runs `then`. A no-op if already unlocked. */
export function ensureLogin(app: App, then: () => void | Promise<void>): void {
  if (sessionLoginToken()) void then();
  else if (savedLoginExists(app)) new PasswordModal(app, "unlock", (password) => unlockLogin(app, password), then).open();
  else new GithubLoginModal(app, then).open();
}

/**
 * Fetches a login-backed source from GitHub again, asking for the password (or a sign-in) first
 * if this session has no login. The cached copy stays as the fallback, so a failed update loses nothing.
 */
export async function updateFromGithub(plugin: DragonglassPlugin, ref: SourceRef): Promise<void> {
  const run = async (): Promise<void> => {
    plugin.sources.refresh(ref.id);
    await plugin.reloadSources();
    new Notice(`Updated "${ref.name ?? ref.id}" from GitHub`);
  };
  ensureLogin(plugin.app, run);
}
