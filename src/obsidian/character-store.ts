/**
 * One store per open character. Files on disk stay the source of truth; the store
 * holds the parsed copies while any of the character's views are open, so two panes
 * showing the same character stay in sync.
 *
 * Writes from frequent state changes are debounced, so tapping HP buttons in combat
 * doesn't thrash the file. Changes that span files are staged and flushed together.
 */

import { normalizePath, type App, type EventRef, type TAbstractFile } from "obsidian";
import type { ContentIndex } from "../core/content";
import { resolve, type ResolvedCharacter } from "../core/index";
import type {
  BuildFile,
  Diagnostic,
  FileKind,
  InventoryFile,
  SheetFile,
  SourcesFile,
  SpellsFile,
  StateEvent,
  StateFile,
} from "../core/types";
import { appendEvent, takeCheckpoint, undoLast, type FoldRules } from "../core/state/fold";
import {
  blankState,
  parseDetails,
  parseJsonFile,
  resolvePaths,
  serialiseDetails,
  serialiseJson,
  type CharacterPaths,
  type DetailsDocument,
} from "./character-files";

export interface CharacterData {
  sheet?: SheetFile;
  build?: BuildFile;
  state?: StateFile;
  spells?: SpellsFile;
  inventory?: InventoryFile;
  sources?: SourcesFile;
  details?: DetailsDocument;
}

export interface StoreHost {
  app: App;
  /** Builds an index for this character, honouring its own source overrides. */
  indexFor(sources?: SourcesFile): Promise<ContentIndex>;
  enforceRequirements(): boolean;
  writeDebounceMs(): number;
}

export type StoreListener = () => void;

export class CharacterStore {
  readonly paths: CharacterPaths;
  data: CharacterData = {};
  index?: ContentIndex;
  resolved?: ResolvedCharacter;
  /** Problems reading or parsing the character's own files. */
  fileDiagnostics: Diagnostic[] = [];
  loading = true;
  /** Bumped on every change, so React can subscribe without deep comparison. */
  version = 0;
  /** Unflushed changes, so a view can warn before closing. */
  get dirty(): boolean {
    return this.pending.size > 0;
  }

  private listeners = new Set<StoreListener>();
  private pending = new Map<string, string>();
  private lastWritten = new Map<string, string>();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private vaultRefs: EventRef[] = [];
  private reloading = false;

  constructor(
    private readonly host: StoreHost,
    readonly folder: string,
  ) {
    this.paths = resolvePaths(folder);
  }

  // -- lifecycle -------------------------------------------------------------

  async load(): Promise<void> {
    this.loading = true;
    this.fileDiagnostics = [];
    const adapter = this.host.app.vault.adapter;

    // The manifest decides which file supplies each data type, so it is read first.
    const manifestPath = normalizePath(`${this.folder}/sheet.5e`);
    let manifest: SheetFile | undefined;
    if (await adapter.exists(manifestPath)) {
      const text = await adapter.read(manifestPath);
      const parsed = parseJsonFile<SheetFile>(text, "sheet");
      if (parsed.error) this.fileError(manifestPath, parsed.error);
      manifest = parsed.data;
      this.lastWritten.set(manifestPath, text);
    }
    const paths = resolvePaths(this.folder, manifest);
    Object.assign(this.paths, paths);

    const data: CharacterData = { sheet: manifest };
    for (const kind of ["build", "state", "spells", "inventory", "sources"] as const) {
      const path = paths.byKind[kind];
      if (!path || !(await adapter.exists(path))) continue;
      const text = await adapter.read(path);
      this.lastWritten.set(path, text);
      const overrideKind = manifest?.kinds?.[path] ?? manifest?.kinds?.[path.slice(this.folder.length + 1)];
      const parsed = parseJsonFile(text, kind, overrideKind);
      if (parsed.error) this.fileError(path, parsed.error);
      else data[kind] = parsed.data as never;
    }

    const detailsPath = paths.byKind.details;
    if (detailsPath && (await adapter.exists(detailsPath))) {
      const text = await adapter.read(detailsPath);
      this.lastWritten.set(detailsPath, text);
      data.details = parseDetails(text);
    }

    this.data = data;
    this.index = await this.host.indexFor(data.sources);
    this.recompute();
    this.loading = false;
    this.notify();
  }

  /** Called when the vault-wide source list changes. */
  async reloadContent(): Promise<void> {
    this.index = await this.host.indexFor(this.data.sources);
    this.recompute();
    this.notify();
  }

  watch(): void {
    const { vault } = this.host.app;
    const onChange = (file: TAbstractFile) => void this.onExternalChange(file.path);
    this.vaultRefs.push(vault.on("modify", onChange));
    this.vaultRefs.push(vault.on("rename", onChange));
    this.vaultRefs.push(vault.on("create", onChange));
    this.vaultRefs.push(vault.on("delete", onChange));
  }

  async dispose(): Promise<void> {
    for (const ref of this.vaultRefs) this.host.app.vault.offref(ref);
    this.vaultRefs = [];
    await this.flush();
    this.listeners.clear();
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  private fileError(path: string, message: string): void {
    this.fileDiagnostics.push({
      severity: "error",
      code: "invalid-element",
      message,
      subject: path,
      file: path,
    });
  }

  private async onExternalChange(path: string): Promise<void> {
    if (this.reloading) return;
    const mine = Object.values(this.paths.byKind).includes(path);
    if (!mine) return;
    try {
      const adapter = this.host.app.vault.adapter;
      const text = (await adapter.exists(path)) ? await adapter.read(path) : "";
      // Our own write comes back as a modify event; ignore it.
      if (this.lastWritten.get(path) === text) return;
    } catch {
      return;
    }
    this.reloading = true;
    try {
      await this.load();
    } finally {
      this.reloading = false;
    }
  }

  // -- resolution ------------------------------------------------------------

  /** Level state: what the character is at this level, ignoring play state. */
  resolveLevelState(): ResolvedCharacter | undefined {
    if (!this.index || !this.data.build) return undefined;
    return resolve({
      content: this.index,
      build: this.data.build,
      inventory: this.data.inventory,
      spells: this.data.spells,
      details: this.detailsSummary(),
      options: { enforceRequirements: this.host.enforceRequirements() },
    });
  }

  private detailsSummary(): { name?: string; avatar?: string } {
    return {
      // The build owns the name, so editing it in the builder takes effect. The
      // manifest's name is only a fallback for a folder with no readable build.
      name: this.data.build?.name ?? this.data.sheet?.name,
      avatar: this.data.details?.frontmatter.avatar,
    };
  }

  private recompute(): void {
    if (!this.index || !this.data.build) {
      this.resolved = undefined;
      return;
    }
    this.resolved = resolve({
      content: this.index,
      build: this.data.build,
      inventory: this.data.inventory,
      spells: this.data.spells,
      state: this.data.state ?? blankState(),
      details: this.detailsSummary(),
      options: { enforceRequirements: this.host.enforceRequirements() },
    });
  }

  /** Pool rules for the event log, taken from the resolved character. */
  foldRules(): FoldRules {
    const character = this.resolved;
    if (!character) return { pools: [], hitDice: [], maxHp: 0 };
    return {
      maxHp: character.hp.max.value,
      hitDice: character.hp.hitDice.map((h) => ({ die: h.die, max: h.max })),
      pools: [
        ...character.resources.map((r) => ({
          key: `resources.${r.key}`,
          max: r.max,
          recharge: r.recharge,
          rechargeAmount: r.rechargeAmount,
        })),
        ...(character.spellcasting?.slots ?? []).map((s) => ({
          key: `slots.${s.level}`,
          max: s.max,
          recharge: "long-rest" as const,
        })),
      ],
    };
  }

  // -- mutations -------------------------------------------------------------

  /** Updates one JSON file and reresolves. Several calls in a tick write together. */
  update<K extends keyof CharacterData>(kind: K, next: CharacterData[K]): void {
    this.data = { ...this.data, [kind]: next };
    const path = this.paths.byKind[kind as FileKind];
    if (!path) return;
    const text = kind === "details" ? serialiseDetails(next as DetailsDocument) : serialiseJson(next);
    this.pending.set(path, text);
    this.recompute();
    this.notify();
    this.scheduleFlush();
  }

  /**
   * Stages a change across several files and writes them together. Used by actions
   * like a level-up that adds spell choices and new resources at once.
   */
  updateMany(changes: Partial<CharacterData>): void {
    this.data = { ...this.data, ...changes };
    for (const [kind, value] of Object.entries(changes)) {
      const path = this.paths.byKind[kind as FileKind];
      if (!path || value === undefined) continue;
      const text = kind === "details" ? serialiseDetails(value as DetailsDocument) : serialiseJson(value);
      this.pending.set(path, text);
    }
    this.recompute();
    this.notify();
    this.scheduleFlush();
  }

  mutateBuild(mutate: (build: BuildFile) => BuildFile): void {
    if (!this.data.build) return;
    this.update("build", mutate(structuredClone(this.data.build)));
  }

  /** Appends a live-state event. The sheet's HP, slot and resource controls use this. */
  appendEvents(...events: StateEvent[]): void {
    let state = this.data.state ?? blankState();
    for (const event of events) state = appendEvent(state, event);
    this.update("state", state);
  }

  undoLastEvent(): StateEvent | undefined {
    const state = this.data.state;
    if (!state) return undefined;
    const { state: next, undone } = undoLast(state);
    if (undone) this.update("state", next);
    return undone;
  }

  /**
   * A checkpoint is taken at every rest, short or long, and the events it replaces
   * are archived as a session record.
   */
  rest(kind: "short" | "long"): void {
    const state = appendEvent(this.data.state ?? blankState(), {
      t: new Date().toISOString(),
      type: kind === "short" ? "rest.short" : "rest.long",
    });
    // Fold with the rules from before the rest, then start a fresh log.
    this.update("state", takeCheckpoint(state, this.foldRules()));
  }

  // -- writing ---------------------------------------------------------------

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), this.host.writeDebounceMs());
  }

  /** Writes every staged change. Serialisation is done before any write begins. */
  async flush(): Promise<void> {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (!this.pending.size) return;
    const batch = [...this.pending.entries()];
    this.pending.clear();

    const adapter = this.host.app.vault.adapter;
    const failures: string[] = [];
    for (const [path, text] of batch) {
      try {
        this.lastWritten.set(path, text);
        await adapter.write(path, text);
      } catch (e) {
        failures.push(`${path}: ${e instanceof Error ? e.message : String(e)}`);
        this.lastWritten.delete(path);
      }
    }
    if (failures.length) {
      for (const message of failures) this.fileError(this.folder, message);
      this.notify();
    }
  }
}
