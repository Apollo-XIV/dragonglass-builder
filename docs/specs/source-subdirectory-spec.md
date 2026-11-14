# Spec: a source can live in a subdirectory of its location

## Problem

A source is a location with `source.json` and `content/` at its root. `SourceRef` has no way to
say "the source is in `srd/` inside this repo", so one repository cannot hold more than one
source. `Apollo-XIV/dragonglass-source-5e-all` does exactly that: `srd/` (id `srd`, 2014) and
`srd24/` (id `srd24`, 2024), each with its own `source.json` and `content/`. Added as a GitHub
source today it loads empty: `readGithub` looks for `source.json` and `content/…` at the repo
root and finds neither, and no error says why.

Local `path` sources already work for this by pointing `location` at the subdirectory. Nothing
equivalent exists for `github`, and that is the case that matters, because only a GitHub source
can be pinned to a tag.

## Change

`SourceRef` gains one optional field:

```ts
/** A folder inside `location` that holds the source (`source.json` and `content/`), relative, with `/` separators. Absent means the root. */
dir?: string;
```

Resolution, for every type that has a tree (`github`, `vault`, `path`):

> the source's root is `location` joined with `dir`; everything the loader reads or writes is
> relative to that root.

`url` sources are a single file and ignore `dir`; the settings UI does not offer it for them.

`dir` is normalised on the way in and the loader never sees an unnormalised one: backslashes to
`/`, no leading or trailing `/`, empty becomes absent. It is rejected with a diagnostic (the source
loads as an error, nothing is read) if any segment is `..` or `.` or if it is absolute. A `dir` that
does not exist in the tree is an error naming it ("`srd24` is not a folder in
`me/repo@v1`"), not an empty source.

## Where it touches the code

One helper does the joining, so no call site invents its own: `sourceRoot(ref)` in
`src/obsidian/sources.ts`, returning `location` or `location/dir` (and a `normalizeDir()` beside
it, pure, in `src/core/` so the node loader and tests can use it).

| File | Change |
| --- | --- |
| `src/core/types.ts` | `dir?: string` on `SourceRef`, documented as above. |
| `src/obsidian/sources.ts` `readGithub` | Tree entries are filtered to the ones under `dir/`, and the prefix is stripped, so `SourceFile.path` is `content/…` exactly as for a root source (the core, the content editor and the cache see no difference). `source.json` is looked up at `dir/source.json`. File fetches use the full path. The `content/` filter becomes `dir/content/`. Every error message carries `dir`. |
| `readVaultFolder`, `readLocalPath` | Root becomes `sourceRoot(ref)`. |
| `listFiles`, `fileExists`, `readFile`, `writeFile`, `createSource` | Same root. Writing into a `dir` source is allowed for vault and path types; `createSource` creates `dir/` if needed. |
| cache | `CacheEntry.key` is `${ref.id}@${ref.pin ?? ""}` and must become `${ref.id}@${ref.pin ?? ""}#${ref.dir ?? ""}`, so changing `dir` is a miss, never a silent reuse. Existing entries (no `#`) are treated as `dir: ""`. |
| `exportRef` | See "Export" below. |
| `src/obsidian/settings.ts` | `describeSource` prints `GitHub me/repo/srd24@v1`. `suggestSourceId` uses the last segment of `dir` when there is one (`srd24`), else of `location`. `parseSourceInput` reads `https://github.com/o/r/tree/<ref>/<dir…>` as pin `<ref>` and dir `<dir…>`: the first segment after `tree/` is always the pin, the rest the dir. A branch name containing `/` is therefore not parseable from a URL, by design; the explicit field below covers it. |
| `src/obsidian/ui/builder/sections/sources.tsx`, `settings-tab.ts` | An optional "Folder in the repository" field next to the location, for github, vault and path. A pin-edit must not clear `dir` (the existing pin update only spreads the ref, so this should hold; add a test). |
| `src/node/load-source.ts`, the `validate` CLI | Nothing: they take a root directory, and `…/repo/srd24` already is one. Mention in `docs/development.md` that this is how to validate a source that lives in a subdirectory. |
| `docs/conversion-guide.md` | A short section: a repository may hold several sources, one directory each, each with its own `source.json`; the user adds each with its own `dir`. |
| Default sources (`settings.ts:105`, `:112`) | Unchanged. |

### Two entries, one repo

Both sources point at the same `location` and `pin` with different `dir` and `id`. The ids are
unique per `SourceRef`, as now. With a `dir` the tree call is for the subtree (see below), so two
different folders are two requests; `readGithub` memoises the response per `owner/repo@pin:dir` for
the duration of one `buildIndex()` (not across builds, or a moved branch would be served stale), so the
same folder under two ids is listed once.

### Truncated trees

The recursive tree call fails for repos too large to list (`tree.truncated`). With a `dir` the
repo as a whole can be large while the source is small, so on `truncated` and a `dir`, walk down by
non-recursive tree calls (`git/trees/<pin>:<dir>?recursive=1` is the one-call way: the API accepts
`<sha>:<path>`, which lists just that subtree). Use that form whenever `dir` is set, which avoids the
truncation for any realistic repo. The paths in that response are already relative to the folder, so
there is no prefix to filter or strip: the file fetches put `dir/` back. A 404 on the subtree call is
the folder or the pin, so the pin is checked alone to say which. Verify the `<ref>:<path>` form with a test against the mocked `requestUrl`; if it
proves unreliable, fall back to filtering and keep the existing truncation error.

## Export

An export pins each source by `ref` and `refType: "git" | "hash"` (`src/core/export/build.ts`,
`schema.ts`, `docs/export-schema.json`). A git pin names a commit of a whole repo; with `dir` that no
longer identifies the source, because the same commit holds several. So the export's source entry
gains an optional `dir`, written whenever the `SourceRef` had one. It is additive and optional, so
existing exports stay valid; follow the schema's own versioning rule for an additive field
(`docs/export-schema.json` and `validate.ts` both need it, and the generated JSON schema must be
regenerated, not hand-edited). Import and the Foundry module ignore it if they do not know it, which is
the same as reading a source at its root, so check `docs/foundry/integration-design.md` for whether the
module resolves sources from git pins and flag it there if so. A `hash` pin is a hash of the files read,
which already excludes the prefix, so it is unchanged.

## Compatibility

- A `SourceRef` with no `dir` behaves exactly as before, in every type, including its cache key
  after the migration above. No settings migration is needed.
- A character's `sources.json` carries `SourceRef`s (`SourcesFile.sources`), so `dir` travels in
  character files too. An older plugin reading one ignores `dir` and loads the repo root, which is
  the empty source described under "Problem". Nothing to do about that beyond saying it in the
  release notes.

## Tests

In `tests/sources.test.ts`, with the existing mocked `requestUrl` and in-memory adapter:

1. A GitHub source with `dir: "srd24"` over a tree holding `srd/…` and `srd24/…` loads only
   `srd24`'s elements, with the manifest id from `srd24/source.json`, and file paths relative to the
   source (`content/…`).
2. Two refs on one repo and pin, `dir: "srd"` and `dir: "srd24"`, load as two sources with their own
   ids and element sets, and make one tree request each (two in all), and the same folder under two ids makes one.
3. `dir` that is absent in the tree is an error naming the dir; `..` and absolute dirs (including a leading `/`) are rejected
   before any request; backslashes and stray slashes normalise.
4. Vault and path sources honour `dir` for read, `listFiles`, `readFile`, `writeFile` and
   `createSource`.
5. Changing `dir` is a cache miss; an old cache entry with no `#` still serves a ref with no `dir`.
6. `parseSourceInput`: `…/tree/v1/srd24` gives pin `v1`, dir `srd24`; `…/tree/main` is as before;
   `describeSource` and `suggestSourceId` as above.
7. Export: a source with `dir` carries it, one without does not, and both validate against the
   schema.
8. Updating a pin leaves `dir` untouched.

Finally, end to end by hand, since the unit tests mock the network: add
`Apollo-XIV/dragonglass-source-5e-all` twice (private repos need the existing GitHub login) with
`dir` `srd` and `srd24`, pinned to commit `d3fe946`, and expect 5312 and 3272 elements and no
diagnostics.

## Out of scope

- Several sources discovered from one `SourceRef` (an index file, or scanning for `source.json`).
  Each source is added by hand with its own `dir`.
- `dir` for `url` sources.
- Any change to the converter. The `5e-all` repo already has the layout this expects.
