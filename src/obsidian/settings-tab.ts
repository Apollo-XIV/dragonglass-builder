import { Modal, Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type DragonglassPlugin from "../main";
import {
  SECRET_STORAGE_UPDATE_MESSAGE,
  clearSessionLogin,
  forgetLogin,
  saveGithubToken,
  saveLogin,
  savedLoginExists,
  secretStorageAvailable,
  sessionLoginToken,
} from "./github-auth";
import { GithubLoginModal, PasswordModal, ensureLogin, updateFromGithub } from "./github-login-modal";
import { fetchGithubUser } from "./github-user";
import type { SourceRef } from "../core/types";
import { describeSource, parseSourceInput, suggestSourceId, type CacheTier, type NarrowSettings } from "./settings";
import { HOLD } from "./ui/narrow/constants";

export class DragonglassSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: DragonglassPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Content sources" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "Sources load in order, highest priority first. A character can add its own sources and switch these off " +
        "in its sources file. The plugin's own core definitions always load last, so any source can replace them.",
    });

    this.renderGithubAccount(containerEl);
    this.renderSourceAdder(containerEl);
    this.renderSourceList(containerEl);

    containerEl.createEl("h2", { text: "Content" });

    new Setting(containerEl)
      .setName("Caching")
      .setDesc(
        "None: nothing is kept on disk, so sources are fetched each time. Smart: a source is cached once a " +
          "character uses it. All: every source is cached for speed. A phone need not download everything.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ none: "None", smart: "Smart", all: "All" })
          .setValue(this.plugin.settings.caching)
          .onChange(async (value) => {
            this.plugin.settings.caching = value as CacheTier;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Enforce prerequisites")
      .setDesc(
        "On: options whose prerequisites aren't met are hidden. Off: every option stays selectable and unmet " +
          "prerequisites show as a warning.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enforceRequirements).onChange(async (value) => {
          this.plugin.settings.enforceRequirements = value;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("h2", { text: "Characters" });

    new Setting(containerEl)
      .setName("Characters folder")
      .setDesc("Where New character creates folders.")
      .addText((text) =>
        text.setValue(this.plugin.settings.charactersFolder).onChange(async (value) => {
          this.plugin.settings.charactersFolder = value || "Characters";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Export folder")
      .setDesc("Where Export character writes its JSON file, named after the character.")
      .addText((text) =>
        text.setValue(this.plugin.settings.exportFolder).onChange(async (value) => {
          this.plugin.settings.exportFolder = value.trim() || "Exports";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Hit points for new levels")
      .setDesc("The default when a level is added. Each level's choice is recorded separately and can be changed.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ max: "Maximum", average: "Average", roll: "Rolled (enter the number)" })
          .setValue(this.plugin.settings.defaultHp)
          .onChange(async (value) => {
            this.plugin.settings.defaultHp = value as typeof this.plugin.settings.defaultHp;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h2", { text: "Sheet layout" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "Layout lives in plugin settings rather than in a character, so a character file stays portable. " +
        "All colours come from your theme unless you set an accent here.",
    });

    new Setting(containerEl)
      .setName("Accent colour")
      .setDesc("A CSS colour. Leave empty to follow the theme.")
      .addText((text) =>
        text
          .setPlaceholder("#b4472e")
          .setValue(this.plugin.settings.layout.accent)
          .onChange(async (value) => {
            this.plugin.settings.layout.accent = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Compact")
      .setDesc("Tighter spacing. Phones always use the compact layout.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.layout.compact).onChange(async (value) => {
          this.plugin.settings.layout.compact = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Show stat breakdowns")
      .setDesc("Stat tooltips list every contribution and where it came from.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.layout.showBreakdowns).onChange(async (value) => {
          this.plugin.settings.layout.showBreakdowns = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Hide unverified markers")
      .setDesc(
        "Parts the converter derived from Foundry's data or read from a feature's text carry a small marker until someone reviews them. " +
          "The marker is only a note; hiding it changes nothing else.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.layout.hideUnverifiedMarkers).onChange(async (value) => {
          this.plugin.settings.layout.hideUnverifiedMarkers = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Start in play mode")
      .setDesc("Hides builder controls when a sheet opens. Useful at the table.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.layout.playMode).onChange(async (value) => {
          this.plugin.settings.layout.playMode = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Pinned resources")
      .setDesc(
        "Resources the desktop sheet keeps in its stat cluster, most wanted first, comma separated. " +
          "A resource id, a pool key, or a slot target (\"slots.3\", \"pact\"). A character's own layout.5e " +
          "pins come first, and anything left over is chosen from the content's own pin weights.",
      )
      .addText((text) =>
        text
          .setPlaceholder("srd:barbarian:rage:rages, slots.1")
          .setValue(this.plugin.settings.layout.pins.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.layout.pins = value
              .split(",")
              .map((pin) => pin.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h2", { text: "Narrow layout" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "The narrow layout is used on phones, on vertically held tablets and in any pane under about 900px wide. " +
        "It replaces the tabs with one scroll and a navigation rail. A character can override any of these for " +
        "itself in its layout.5e file, which also carries its accent colour.",
    });

    const narrow = <K extends keyof NarrowSettings>(key: K, value: NarrowSettings[K]): Promise<void> => {
      this.plugin.settings.narrow[key] = value;
      return this.plugin.saveSettings();
    };

    new Setting(containerEl)
      .setName("Layout")
      .setDesc("Auto follows the width of the pane the character is open in.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ auto: "Auto", narrow: "Narrow", desktop: "Desktop" })
          .setValue(this.plugin.settings.narrow.layout)
          .onChange(async (value) => narrow("layout", value as NarrowSettings["layout"])),
      );

    new Setting(containerEl)
      .setName("Desktop layout needs landscape")
      .setDesc("Keeps a large tablet held vertically on the narrow layout, even though it is wide enough.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.narrow.desktopNeedsLandscape)
          .onChange(async (value) => narrow("desktopNeedsLandscape", value)),
      );

    new Setting(containerEl)
      .setName("Rail side")
      .setDesc("Which thumb the navigation rail sits under.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ right: "Right", left: "Left" })
          .setValue(this.plugin.settings.narrow.railSide)
          .onChange(async (value) => narrow("railSide", value as NarrowSettings["railSide"])),
      );

    new Setting(containerEl)
      .setName("Rail height")
      .setDesc("Middle is vertically centred. Low sits just above Obsidian's floating toolbar.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ middle: "Middle", low: "Low" })
          .setValue(this.plugin.settings.narrow.railHeight)
          .onChange(async (value) => narrow("railHeight", value as NarrowSettings["railHeight"])),
      );

    new Setting(containerEl)
      .setName("Tapping a rail icon")
      .setDesc("Glide scrolls to the section; jump goes there at once.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ glide: "Glide", jump: "Jump" })
          .setValue(this.plugin.settings.narrow.railTap)
          .onChange(async (value) => narrow("railTap", value as NarrowSettings["railTap"])),
      );

    new Setting(containerEl)
      .setName("Scroll ticks")
      .setDesc("A short buzz when a section header reaches the top.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.narrow.scrollTicks).onChange(async (value) => narrow("scrollTicks", value)),
      );

    new Setting(containerEl)
      .setName("Hold time")
      .setDesc("How long to hold a number or a row before its details open.")
      .addSlider((slider) =>
        slider
          .setLimits(HOLD.minMs, HOLD.maxMs, 10)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.narrow.holdMs)
          .onChange(async (value) => narrow("holdMs", value)),
      );

    new Setting(containerEl)
      .setName("Haptics")
      .setDesc("Short vibrations for rolls, holds and section ticks. Android only; everything has a visual counterpart.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.narrow.haptics).onChange(async (value) => narrow("haptics", value)),
      );

    new Setting(containerEl)
      .setName("Show info buttons")
      .setDesc("Adds a visible button to every holdable row, for when long-pressing is awkward.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.narrow.infoButtons).onChange(async (value) => narrow("infoButtons", value)),
      );

    new Setting(containerEl)
      .setName('"Hold to read" hint')
      .setDesc("Teaches the hold gesture the first couple of times a read-only row is tapped.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.narrow.holdHint).onChange(async (value) => narrow("holdHint", value)),
      );

    containerEl.createEl("h2", { text: "Advanced" });

    new Setting(containerEl)
      .setName("Write delay")
      .setDesc("Milliseconds to wait before writing after a change, so tapping HP in combat doesn't thrash the file.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.writeDebounceMs)).onChange(async (value) => {
          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed < 0) return;
          this.plugin.settings.writeDebounceMs = Math.min(5000, parsed);
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderGithubAccount(containerEl: HTMLElement): void {
    const token = sessionLoginToken();
    const saved = savedLoginExists(this.app);
    const setting = new Setting(containerEl).setName("GitHub account");
    const again = (): void => this.display();
    if (token) {
      const note = saved
        ? "Unlocked until Obsidian closes."
        : "Signed in until Obsidian closes; nothing is saved on this device.";
      setting.setDesc(note);
      void fetchGithubUser(token).then((login) => {
        if (login) setting.setDesc(`Signed in as ${login}. ${note}`);
      });
      setting.addButton((button) =>
        button.setButtonText(saved ? "Lock" : "Sign out").onClick(() => {
          clearSessionLogin();
          again();
        }),
      );
      if (!saved && secretStorageAvailable(this.app))
        setting.addButton((button) =>
          button.setButtonText("Save with a password").onClick(() =>
            new PasswordModal(this.app, "set", (password) => saveLogin(this.app, token, password), again).open(),
          ),
        );
    } else if (saved) {
      setting
        .setDesc("A GitHub login is saved on this device, sealed with your password. Enter it to check private sources for updates.")
        .addButton((button) => button.setButtonText("Enter password").setCta().onClick(() => ensureLogin(this.app, again)));
    } else {
      setting
        .setDesc(
          "Sign in to add a private repo you can read, including ones you don't own, or to update one. " +
            "Fetched sources are cached in the vault, so you only need the login again to check for updates.",
        )
        .addButton((button) =>
          button
            .setButtonText("Sign in")
            .setCta()
            .onClick(() => new GithubLoginModal(this.app, again).open()),
        );
    }
    if (saved)
      setting.addExtraButton((button) =>
        button
          .setIcon("trash")
          .setTooltip("Forget the saved login")
          .onClick(() => {
            forgetLogin(this.app);
            again();
          }),
      );
  }

  private renderSourceAdder(containerEl: HTMLElement): void {
    let input = "";
    let token = "";
    let useLogin = false;
    new Setting(containerEl)
      .setName("Add a source")
      .setDesc(
        "A GitHub repo (owner/repo or a URL), a folder in this vault, or an absolute path (desktop only). " +
          "GitHub sources should be pinned to a tag or commit.",
      )
      .addText((text) =>
        text.setPlaceholder("owner/repo, Sources/my-homebrew, or /home/me/dnd/my-homebrew").onChange((value) => {
          input = value;
        }),
      )
      .addButton((button) =>
        button
          .setButtonText("Add")
          .setCta()
          .onClick(async () => {
            const parsed = parseSourceInput(input);
            if (!parsed) {
              new Notice("Enter a repo, URL or folder.");
              return;
            }
            let auth: SourceRef["auth"];
            if (useLogin) {
              if (parsed.type !== "github") {
                new Notice("A GitHub login is only for a GitHub repo.");
                return;
              }
              auth = { type: "oauth" };
            } else if (token.trim()) {
              if (parsed.type !== "github") {
                new Notice("A token is only for a private GitHub repo.");
                return;
              }
              try {
                auth = saveGithubToken(this.app, parsed.location, token);
              } catch (e) {
                new Notice(e instanceof Error ? e.message : String(e));
                return;
              }
            }
            await this.plugin.addSource({ ...parsed, id: suggestSourceId(parsed), ...(auth ? { auth } : {}) } as SourceRef);
            new Notice(`Added ${describeSource(parsed as SourceRef)}`);
            this.display();
          }),
      );
    if (sessionLoginToken())
      new Setting(containerEl)
        .setName("Use my GitHub login")
        .setDesc("For a private repo your account can read. It is fetched now and cached in the vault. Overrides the token below.")
        .addToggle((toggle) => toggle.onChange((value) => (useLogin = value)));
    const tokenSetting = new Setting(containerEl)
      .setName("Access token (private repos)")
      .setDesc(
        secretStorageAvailable(this.app)
          ? "Optional. A fine-grained personal access token with read-only access to the repo's Contents. Stored in Obsidian's secret storage, not in the vault."
          : SECRET_STORAGE_UPDATE_MESSAGE,
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        text.onChange((value) => {
          token = value;
        });
      });
    if (!secretStorageAvailable(this.app)) tokenSetting.setDisabled(true);
  }

  private renderSourceList(containerEl: HTMLElement): void {
    const sources = this.plugin.settings.sources;
    if (!sources.length) {
      containerEl.createEl("p", {
        cls: "setting-item-description",
        text: "No sources yet. Without one, the builder has no species, classes or items to offer.",
      });
      return;
    }

    sources.forEach((ref, i) => {
      const status = this.plugin.sources.statusFor(ref.id);
      const errors = status?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
      const detail = [
        describeSource(ref),
        status ? `${status.state}${status.elementCount ? `, ${status.elementCount} elements` : ""}` : "not loaded yet",
        errors ? `${errors} errors` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      const setting = new Setting(containerEl).setName(ref.name ?? ref.id).setDesc(detail);

      setting.addText((text) =>
        text
          .setPlaceholder("pin")
          .setValue(ref.pin ?? "")
          .onChange(async (value) => {
            this.plugin.settings.sources[i] = { ...ref, pin: value.trim() || undefined };
            this.plugin.sources.invalidate(ref.id);
            await this.plugin.saveSettings();
          }),
      );

      if (ref.auth?.type === "oauth")
        setting.addExtraButton((button) =>
          button
            .setIcon("refresh-cw")
            .setTooltip("Update from GitHub")
            .onClick(() => void updateFromGithub(this.plugin, ref)),
        );

      if (ref.type === "github" && ref.auth?.type !== "oauth")
        setting.addExtraButton((button) =>
          button
            .setIcon("key-round")
            .setTooltip(ref.auth?.type === "token" ? "Update token" : "Add token")
            .onClick(() =>
              new TokenModal(this.app, ref, async (token) => {
                // Only the secret changes; a source that had no token gains `auth` and nothing else.
                const auth = saveGithubToken(this.app, ref.location, token, ref.auth);
                if (ref.auth?.type !== "token") {
                  this.plugin.settings.sources[i] = { ...ref, auth };
                  await this.plugin.saveSettings();
                }
                this.plugin.sources.invalidate(ref.id);
                await this.plugin.reloadSources();
                new Notice(`Token saved for "${ref.name ?? ref.id}"`);
                this.display();
              }).open(),
            ),
        );

      setting.addToggle((toggle) =>
        toggle
          .setTooltip("Enabled")
          .setValue(ref.enabled !== false)
          .onChange(async (value) => {
            this.plugin.settings.sources[i] = { ...ref, enabled: value };
            await this.plugin.saveSettings();
          }),
      );

      if (i > 0)
        setting.addExtraButton((button) =>
          button
            .setIcon("arrow-up")
            .setTooltip("Raise priority")
            .onClick(async () => {
              const next = [...this.plugin.settings.sources];
              [next[i - 1], next[i]] = [next[i], next[i - 1]];
              this.plugin.settings.sources = next;
              await this.plugin.saveSettings();
              this.display();
            }),
        );

      setting.addExtraButton((button) =>
        button
          .setIcon("trash")
          .setTooltip("Remove")
          .onClick(async () => {
            this.plugin.settings.sources = this.plugin.settings.sources.filter((s) => s.id !== ref.id);
            this.plugin.sources.invalidate(ref.id);
            await this.plugin.saveSettings();
            this.display();
          }),
      );
    });
  }
}

/** Asks for a replacement token, so changing it never means editing the source's entry. */
class TokenModal extends Modal {
  constructor(
    app: App,
    private readonly ref: SourceRef,
    private readonly onSave: (token: string) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    let token = "";
    this.setTitle(this.ref.auth?.type === "token" ? "Update token" : "Add token");
    this.contentEl.createEl("p", {
      text: `A fine-grained token with read-only Contents access to ${this.ref.location}. The pin and the rest of the source stay as they are.`,
    });
    if (!secretStorageAvailable(this.app)) {
      this.contentEl.createEl("p", { text: SECRET_STORAGE_UPDATE_MESSAGE });
      return;
    }
    new Setting(this.contentEl)
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        text.onChange((value) => {
          token = value;
        });
      })
      .addButton((button) =>
        button
          .setButtonText("Save")
          .setCta()
          .onClick(async () => {
            if (!token.trim()) return;
            try {
              await this.onSave(token);
              this.close();
            } catch (e) {
              new Notice(e instanceof Error ? e.message : String(e));
            }
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
