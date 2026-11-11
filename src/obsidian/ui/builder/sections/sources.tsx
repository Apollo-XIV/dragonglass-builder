/**
 * The builder's sources section: the character's effective source list in priority
 * order, validation errors per source, the attribution every loaded sourcebook
 * requires, and — for a vault folder or a local path — browsing, editing and adding
 * entries, plus scaffolding a brand-new source from nothing.
 */

import { useState, type ReactNode } from "react";
import { Notice } from "obsidian";
import type { Diagnostic, SourceRef } from "../../../../core/types";
import type { CharacterStore } from "../../../character-store";
import { blankSources } from "../../../character-files";
import { createSource } from "../../../content-editor";
import { nativeDialogAvailable, pickFolder } from "../../../native-dialog";
import { SECRET_STORAGE_UPDATE_MESSAGE, saveGithubToken, secretStorageAvailable, sessionLoginToken } from "../../../github-auth";
import { updateFromGithub } from "../../../github-login-modal";
import { describeSource, parseSourceInput, suggestSourceId } from "../../../settings";
import { isWritableSource } from "../../../sources";
import { usePlugin } from "../../context";
import { Diagnostics, Empty, Markdown, Pill, Section } from "../../components";
import { SourceBrowser } from "../../content-browser";

type LocationType = "github" | "vault" | "path";

export function SourcesPanel({ store }: { store: CharacterStore }): ReactNode {
  const { plugin } = usePlugin();
  const index = store.index;
  const own = store.data.sources?.sources ?? [];
  const disabled = new Set(store.data.sources?.disabled ?? []);
  const [addType, setAddType] = useState<LocationType>("github");
  const [addValue, setAddValue] = useState("");
  const [addToken, setAddToken] = useState("");
  const [addUseLogin, setAddUseLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [browsing, setBrowsing] = useState<{ ref: SourceRef; startNew?: boolean } | undefined>();
  const vaultFolders = useVaultFolderOptions();

  const addOwn = async (): Promise<void> => {
    const value = addValue.trim();
    if (!value) return;
    // GitHub still accepts a pasted URL; vault and path are explicit, since
    // guessing from one free-text box is exactly what made this confusing.
    const parsed: Omit<SourceRef, "id"> | undefined =
      addType === "github" ? parseSourceInput(value) : { type: addType, location: value, enabled: true };
    if (!parsed || parsed.type !== addType) {
      new Notice(addType === "github" ? "Enter owner/repo or a GitHub URL." : "Enter a location.");
      return;
    }
    let auth: SourceRef["auth"];
    if (addType === "github" && addUseLogin) {
      auth = { type: "oauth" };
    } else if (addType === "github" && addToken.trim()) {
      try {
        auth = saveGithubToken(plugin.app, parsed.location, addToken);
      } catch (e) {
        new Notice(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    const file = store.data.sources ?? blankSources();
    const id = uniqueId(suggestSourceId(parsed), [...own.map((s) => s.id), ...plugin.settings.sources.map((s) => s.id)]);
    store.update("sources", { ...file, sources: [...own, { ...parsed, id, ...(auth ? { auth } : {}) } as SourceRef] });
    setAddValue("");
    setAddToken("");
    setAddUseLogin(false);
    setBusy(true);
    await plugin.reloadSources();
    setBusy(false);
  };

  const removeOwn = async (id: string): Promise<void> => {
    const file = store.data.sources ?? blankSources();
    store.update("sources", { ...file, sources: own.filter((s) => s.id !== id) });
    await plugin.reloadSources();
  };

  const toggleOwn = async (id: string, on: boolean): Promise<void> => {
    const file = store.data.sources ?? blankSources();
    store.update("sources", { ...file, sources: own.map((s) => (s.id === id ? { ...s, enabled: on } : s)) });
    await plugin.reloadSources();
  };

  const toggleVaultSource = async (id: string, on: boolean): Promise<void> => {
    const file = store.data.sources ?? blankSources();
    const next = on ? [...disabled].filter((d) => d !== id) : [...disabled, id];
    store.update("sources", { ...file, disabled: next });
    await plugin.reloadSources();
  };

  const statusFor = (id: string) => plugin.sources.statusFor(id);

  // Replaces only the secret. A source that had no token yet gains `auth`, and that is the
  // only field of its entry that changes, so a pin is never touched by a token update.
  const saveToken = async (ref: SourceRef, token: string): Promise<void> => {
    const auth = saveGithubToken(plugin.app, ref.location, token, ref.auth);
    if (ref.auth?.type !== "token") {
      if (own.some((s) => s.id === ref.id)) {
        const file = store.data.sources ?? blankSources();
        store.update("sources", { ...file, sources: own.map((s) => (s.id === ref.id ? { ...s, auth } : s)) });
      } else {
        plugin.settings.sources = plugin.settings.sources.map((s) => (s.id === ref.id ? { ...s, auth } : s));
        await plugin.saveSettings();
      }
    }
    await plugin.reloadSources();
    new Notice(`Token saved for "${ref.name ?? ref.id}"`);
  };

  if (browsing && index)
    return (
      <SourceBrowser
        index={index}
        sourceRef={browsing.ref}
        startNew={browsing.startNew}
        onClose={() => setBrowsing(undefined)}
      />
    );

  return (
    <>
      <Section title="This character's sources">
        <p className="dg-muted">
          A character's own sources take priority over the vault-wide list, and can switch a vault-wide source off
          for this character only. More specific always wins.
        </p>
        <LocationField
          type={addType}
          onTypeChange={(t) => {
            setAddType(t);
            setAddValue("");
            setAddToken("");
            setAddUseLogin(false);
          }}
          value={addValue}
          onChange={setAddValue}
          token={addToken}
          onTokenChange={setAddToken}
          useLogin={addUseLogin}
          onUseLoginChange={setAddUseLogin}
          vaultFolderOptions={vaultFolders}
          allowGithub
          onEnter={() => void addOwn()}
        />
        <div className="dg-filters">
          <button className="dg-button" onClick={() => void addOwn()} disabled={!addValue.trim() || busy}>
            Add
          </button>
          <button className="dg-button is-quiet" onClick={() => setCreating((v) => !v)}>
            {creating ? "Cancel new source" : "Create a new source from scratch"}
          </button>
        </div>
        {creating ? (
          <NewSourceForm
            store={store}
            onCreated={(ref) => {
              setCreating(false);
              setBrowsing({ ref, startNew: true });
            }}
          />
        ) : null}
        {own.length === 0 ? (
          <Empty>No per-character sources. This character uses the vault-wide list.</Empty>
        ) : (
          <ul className="dg-source-list">
            {own.map((ref) => (
              <SourceRow
                key={ref.id}
                ref_={ref}
                status={statusFor(ref.id)}
                enabled={ref.enabled !== false}
                onToggle={(on) => void toggleOwn(ref.id, on)}
                onRemove={() => void removeOwn(ref.id)}
                onSaveToken={(token) => saveToken(ref, token)}
                onBrowse={index ? () => setBrowsing({ ref }) : undefined}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Vault-wide sources"
        action={
          <button className="dg-button is-quiet" onClick={() => void plugin.reloadSources()}>
            Reload
          </button>
        }
      >
        {plugin.settings.sources.length === 0 ? (
          <Empty>No vault-wide sources. Add one in the plugin settings.</Empty>
        ) : (
          <ul className="dg-source-list">
            {plugin.settings.sources.map((ref) => (
              <SourceRow
                key={ref.id}
                ref_={ref}
                status={statusFor(ref.id)}
                enabled={!disabled.has(ref.id)}
                onToggle={(on) => void toggleVaultSource(ref.id, on)}
                onSaveToken={(token) => saveToken(ref, token)}
                onBrowse={index ? () => setBrowsing({ ref }) : undefined}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Pinning">
        <p className="dg-muted">
          GitHub sources are pinned to a tag or commit, so a fix pushed upstream can't silently change anyone's AC.
          Updating a pin is a deliberate action.
        </p>
        {[...plugin.settings.sources, ...own]
          .filter((ref) => ref.type === "github")
          .map((ref) => (
            <PinEditor key={ref.id} ref_={ref} store={store} />
          ))}
      </Section>

      <Section title="Attribution">
        {index?.allSourcebooks().length ? (
          <ul className="dg-attribution">
            {index.allSourcebooks().map((book) => (
              <li key={book.id}>
                <strong>{book.name}</strong> <Pill>{book.abbreviation}</Pill>
                {book.version ? <span className="dg-muted"> v{book.version}</span> : null}
                {book.license ? <Pill tone="info">{book.license}</Pill> : null}
                {book.attribution ? <Markdown source={book.attribution} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No sourcebooks loaded.</Empty>
        )}
      </Section>

      <Section title="Validation">
        <SourceDiagnostics store={store} />
      </Section>
    </>
  );
}

/**
 * A path, a type and an id is all a source needs to exist: this writes
 * `source.json` and an empty `content/` folder, adds the source to this
 * character, and hands back the new ref so the caller can open the wizard
 * straight into "new entry".
 */
function NewSourceForm({
  store,
  onCreated,
}: {
  store: CharacterStore;
  onCreated: (ref: SourceRef) => void;
}): ReactNode {
  const { plugin } = usePlugin();
  const [type, setType] = useState<LocationType>("vault");
  const [location, setLocation] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const vaultFolders = useVaultFolderOptions();

  const create = async (): Promise<void> => {
    const loc = location.trim();
    if (!loc) {
      new Notice("Give the source a folder or path.");
      return;
    }
    const taken = [...plugin.settings.sources, ...(store.data.sources?.sources ?? [])].map((s) => s.id);
    const id = uniqueId(suggestSourceId({ type, location: loc } as SourceRef), taken);
    setBusy(true);
    try {
      const ref = await createSource(plugin.sources, {
        type: type === "github" ? "vault" : type,
        location: loc,
        id,
        name: name.trim() || undefined,
      });
      const file = store.data.sources ?? blankSources();
      const existing = file.sources ?? [];
      store.update("sources", { ...file, sources: [...existing, ref] });
      await plugin.reloadSources();
      new Notice(`Created "${ref.name ?? ref.id}"`);
      onCreated(ref);
    } catch (e) {
      new Notice(`Could not create the source: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dg-new-source">
      <LocationField
        type={type}
        onTypeChange={(t) => {
          setType(t);
          setLocation("");
        }}
        value={location}
        onChange={setLocation}
        vaultFolderOptions={vaultFolders}
        allowGithub={false}
      />
      <div className="dg-field">
        <span>Name</span>
        <input type="text" placeholder="My Homebrew" value={name} onChange={(e) => setName(e.currentTarget.value)} />
      </div>
      <button className="dg-button is-cta" onClick={() => void create()} disabled={busy || !location.trim()}>
        Create and add the first entry
      </button>
    </div>
  );
}

/** Every vault folder, for the "vault folder" location field's suggestions. */
function useVaultFolderOptions(): string[] {
  const { app } = usePlugin();
  return app.vault
    .getAllFolders()
    .map((f) => f.path)
    .sort();
}

/**
 * The location half of "add a source" and "create a source": an explicit type
 * picker plus a type-appropriate input, so the field never has to guess what a
 * pasted string means. A vault folder gets autocomplete from the vault's own
 * folders; a local path gets a native folder picker where Obsidian provides one.
 */
function LocationField({
  type,
  onTypeChange,
  value,
  onChange,
  vaultFolderOptions,
  allowGithub,
  token,
  onTokenChange,
  useLogin,
  onUseLoginChange,
  onEnter,
}: {
  type: LocationType;
  onTypeChange: (type: LocationType) => void;
  value: string;
  onChange: (value: string) => void;
  vaultFolderOptions: string[];
  allowGithub: boolean;
  /** A GitHub token for a private repo; omit both to hide the field. */
  token?: string;
  onTokenChange?: (token: string) => void;
  /** Offered only while signed in to GitHub. */
  useLogin?: boolean;
  onUseLoginChange?: (on: boolean) => void;
  onEnter?: () => void;
}): ReactNode {
  const [browsing, setBrowsing] = useState(false);
  const { plugin } = usePlugin();
  const canStoreToken = secretStorageAvailable(plugin.app);

  const browse = async (): Promise<void> => {
    setBrowsing(true);
    try {
      const picked = await pickFolder(value || undefined);
      if (picked) onChange(picked);
      else new Notice("No folder was picked. You can also type the path directly.");
    } finally {
      setBrowsing(false);
    }
  };

  return (
    <>
      <div className="dg-field">
        <span>Where</span>
        <select className="dg-select is-inline" value={type} onChange={(e) => onTypeChange(e.currentTarget.value as LocationType)}>
          {allowGithub ? <option value="github">A GitHub repo</option> : null}
          <option value="vault">A folder in this vault</option>
          <option value="path">An absolute path on this computer (desktop only)</option>
        </select>
      </div>
      <div className="dg-field">
        <span>{type === "github" ? "Repo" : type === "vault" ? "Folder" : "Path"}</span>
        <input
          type="text"
          className="dg-location-input"
          list={type === "vault" ? "dg-vault-folders" : undefined}
          placeholder={
            type === "github"
              ? "owner/repo or https://github.com/owner/repo"
              : type === "vault"
                ? "Sources/my-homebrew"
                : "/home/me/dnd/my-homebrew"
          }
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
        />
        {type === "vault" ? (
          <datalist id="dg-vault-folders">
            {vaultFolderOptions.map((folder) => (
              <option key={folder} value={folder} />
            ))}
          </datalist>
        ) : null}
        {type === "path" && nativeDialogAvailable() ? (
          <button type="button" className="dg-button is-quiet" onClick={() => void browse()} disabled={browsing}>
            Browse…
          </button>
        ) : null}
      </div>
      {type === "github" && onUseLoginChange && sessionLoginToken() ? (
        <label className="dg-field">
          <input type="checkbox" checked={useLogin ?? false} onChange={(e) => onUseLoginChange(e.currentTarget.checked)} />
          <span>Use my GitHub login (a private repo your account can read; fetched now, then cached)</span>
        </label>
      ) : null}
      {type === "github" && onTokenChange && !useLogin ? (
        <>
          <div className="dg-field">
            <span>Token</span>
            <input
              type="password"
              className="dg-location-input"
              autoComplete="off"
              placeholder="Only for a private repo: a fine-grained token with read access to Contents"
              value={token ?? ""}
              onChange={(e) => onTokenChange(e.currentTarget.value)}
            />
          </div>
          {!canStoreToken ? <p className="dg-muted">{SECRET_STORAGE_UPDATE_MESSAGE}</p> : null}
        </>
      ) : null}
      <p className="dg-muted">
        {type === "github"
          ? "Pinned to a tag or commit once added, so an upstream change can't silently shift anyone's numbers."
          : type === "vault"
            ? "A folder inside this vault, holding a source.json and a content/ folder of its own JSON files."
            : "A folder anywhere on this computer, outside the vault. Desktop only — mobile has no filesystem access beyond the vault."}
      </p>
    </>
  );
}

function SourceRow({
  ref_,
  status,
  enabled,
  onToggle,
  onRemove,
  onBrowse,
  onSaveToken,
}: {
  ref_: SourceRef;
  status?: { state: string; elementCount: number; diagnostics: Diagnostic[]; origin?: string };
  enabled?: boolean;
  onToggle?: (on: boolean) => void;
  onRemove?: () => void;
  onBrowse?: () => void;
  /** Replaces this GitHub source's token (or gives it one) without touching the rest of its entry. */
  onSaveToken?: (token: string) => Promise<void>;
}): ReactNode {
  const { plugin } = usePlugin();
  const [editingToken, setEditingToken] = useState(false);
  const [token, setToken] = useState("");
  const errors = status?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
  return (
    <li className="dg-source">
      <div className="dg-source-head">
        {onToggle ? (
          <input type="checkbox" checked={enabled ?? true} onChange={(e) => onToggle(e.currentTarget.checked)} />
        ) : null}
        <strong>{ref_.name ?? ref_.id}</strong>
        <span className="dg-muted">{describeSource(ref_)}</span>
        {isWritableSource(ref_) ? null : <Pill tone="info">read-only</Pill>}
        {ref_.auth ? <Pill tone="info">{ref_.auth.type === "oauth" ? "GitHub login" : "private"}</Pill> : null}
        {status ? (
          <Pill tone={status.state === "error" ? "error" : status.state === "cached" ? "warn" : undefined}>
            {status.state}
            {status.state === "loaded" || status.state === "cached" ? ` · ${status.elementCount} elements` : ""}
          </Pill>
        ) : (
          <Pill tone="info">not loaded yet</Pill>
        )}
        {errors ? <Pill tone="error">{errors} errors</Pill> : null}
        {onBrowse ? (
          <button className="dg-button is-quiet" onClick={onBrowse}>
            Browse
          </button>
        ) : null}
        {ref_.auth?.type === "oauth" ? (
          <button className="dg-button is-quiet" onClick={() => void updateFromGithub(plugin, ref_)}>
            Update from GitHub
          </button>
        ) : null}
        {onSaveToken && ref_.type === "github" && ref_.auth?.type !== "oauth" ? (
          <button className="dg-button is-quiet" onClick={() => setEditingToken((v) => !v)}>
            {ref_.auth?.type === "token" ? "Update token" : "Add token"}
          </button>
        ) : null}
        {onRemove ? (
          <button className="dg-button is-quiet" onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>
      {editingToken && onSaveToken ? (
        <div className="dg-field">
          <span>Token</span>
          <input
            type="password"
            className="dg-location-input"
            autoComplete="off"
            placeholder="A new fine-grained token. The pin and everything else stay as they are."
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
          />
          <button
            className="dg-button"
            disabled={!token.trim()}
            onClick={() => {
              onSaveToken(token)
                .then(() => {
                  setToken("");
                  setEditingToken(false);
                })
                .catch((e) => new Notice(e instanceof Error ? e.message : String(e)));
            }}
          >
            Save token
          </button>
        </div>
      ) : null}
      {status?.origin ? <div className="dg-muted">{status.origin}</div> : null}
      {status?.diagnostics.length ? <Diagnostics diagnostics={status.diagnostics} title="Source problems" /> : null}
    </li>
  );
}

function PinEditor({ ref_, store }: { ref_: SourceRef; store: CharacterStore }): ReactNode {
  const { plugin } = usePlugin();
  const [pin, setPin] = useState(ref_.pin ?? "");

  const save = async (): Promise<void> => {
    const own = store.data.sources?.sources ?? [];
    if (own.some((s) => s.id === ref_.id)) {
      const file = store.data.sources ?? blankSources();
      store.update("sources", {
        ...file,
        sources: own.map((s) => (s.id === ref_.id ? { ...s, pin: pin.trim() || undefined } : s)),
      });
    } else {
      plugin.settings.sources = plugin.settings.sources.map((s) =>
        s.id === ref_.id ? { ...s, pin: pin.trim() || undefined } : s,
      );
      await plugin.saveSettings();
    }
    plugin.sources.invalidate(ref_.id);
    await plugin.reloadSources();
    new Notice(`${ref_.id} pinned to ${pin.trim() || "its default branch"}`);
  };

  return (
    <label className="dg-field">
      <span>{ref_.id}</span>
      <input
        type="text"
        value={pin}
        placeholder="tag or commit SHA"
        onChange={(e) => setPin(e.currentTarget.value)}
      />
      <button className="dg-button is-quiet" onClick={() => void save()} disabled={pin === (ref_.pin ?? "")}>
        Update pin
      </button>
    </label>
  );
}

function SourceDiagnostics({ store }: { store: CharacterStore }): ReactNode {
  const index = store.index;
  if (!index) return <Empty>No content loaded.</Empty>;
  const bySource = new Map<string, Diagnostic[]>();
  for (const d of index.diagnostics) {
    const key = d.source ?? (d.subject ? index.origin(d.subject)?.source : undefined) ?? "unknown";
    const list = bySource.get(key) ?? [];
    list.push(d);
    bySource.set(key, list);
  }
  if (!bySource.size) return <p>Every element in every loaded source validated cleanly.</p>;
  return (
    <>
      {[...bySource.entries()].map(([source, diagnostics]) => (
        <div key={source}>
          <strong>{source}</strong>
          <Diagnostics diagnostics={diagnostics} title="Problems" />
        </div>
      ))}
      <p className="dg-muted">
        Invalid elements are skipped; valid elements from the same source still load. Anything the engine doesn't
        recognise is kept and shown as text.
      </p>
    </>
  );
}

function uniqueId(base: string, taken: string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 100; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now()}`;
}
