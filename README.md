# dragonglass-builder

> [!CAUTION]
> **This plugin is not ready for public use.** It is under active development and is
> published in the open for transparency, not as a release. There are **no guarantees**
> about backwards compatibility, stability or functionality: character files may stop
> loading between versions, content formats may change without migration, and things
> will break. **Use it at your own risk**, and keep your own backups of anything you
> care about.

An Obsidian plugin for D&D 5e with two halves: a data-driven character builder that
writes character files, and a character sheet that renders those files as an
interactive, standalone view.

- **Data-driven.** Classes, species, spells and items are content, loaded from vault
  folders, local paths or pinned GitHub repos. The engine knows the rules of the format,
  not the rules of any one book.
- **Degrades gracefully.** Anything the engine doesn't recognise is kept and shown as
  text with a warning rather than failing the load.
- **One engine, two layouts.** The same sheet and builder adapt between a desktop layout
  and a narrow, touch-first one.

## Content and licence

MIT for the code (see [LICENSE](LICENSE)). The SRD content in `content/srd/` is CC-BY-4.0; its attribution is in
`content/srd/content/sourcebook.json` and the plugin shows it for every loaded
sourcebook.

## Contributing and development

See [docs/development.md](docs/development.md) for building, testing and architecture (the [docs index](docs/README.md) lists the rest),
[docs/schema.md](docs/schema.md) for the content format, and
[docs/specs/](docs/specs/) for the design specs. Contributors and coding agents should
also read [CLAUDE.md](CLAUDE.md).
