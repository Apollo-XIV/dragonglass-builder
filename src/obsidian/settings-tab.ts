import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type DragonglassPlugin from "../main";
import type { SourceRef } from "../core/types";
import { describeSource, parseSourceInput, suggestSourceId, type CacheTier } from "./settings";

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
      .setName("Start in play mode")
      .setDesc("Hides builder controls when a sheet opens. Useful at the table.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.layout.playMode).onChange(async (value) => {
          this.plugin.settings.layout.playMode = value;
          await this.plugin.saveSettings();
        }),
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

  private renderSourceAdder(containerEl: HTMLElement): void {
    let input = "";
    new Setting(containerEl)
      .setName("Add a source")
      .setDesc(
        "A GitHub repo (owner/repo or a URL), a folder in this vault, or an absolute path (desktop only). " +
          "GitHub sources should be pinned to a tag or commit.",
      )
      .addText((text) =>
        text.setPlaceholder("owner/repo or Sources/my-homebrew").onChange((value) => {
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
            await this.plugin.addSource({ ...parsed, id: suggestSourceId(parsed) } as SourceRef);
            new Notice(`Added ${describeSource(parsed as SourceRef)}`);
            this.display();
          }),
      );
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
