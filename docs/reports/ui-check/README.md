# UI check

Screenshots of the plugin in a real Obsidian 1.14.5, driven over the Chrome DevTools protocol, taken on
2026-11-08 against a **scratch copy of `vault/`** (the walk characters and, at the time, a `Sources/walk-patches` source since removed, with the
plugin as built at the time). Obsidian was started with its own `--user-data-dir`, so `~/.config/obsidian/obsidian.json`
was never opened by it; its checksum was compared afterwards and is unchanged.

| File | Shows |
| --- | --- |
| `01-desktop-sheet.png` | The desktop layout of *Walk Paladin 2024*, Actions tab. Lay on Hands carries the unverified marker (a dashed ring beside the title) and reads "heals X". |
| `02-chosen-amount-picker.png` | Use on Lay on Hands: the picker takes the row, shows 7 points left after 18 were spent, and 9 is refused ("Only 7 left", Spend disabled). |
| `03-chosen-amount-blocked.png` | The same with 30 chosen against a full pool of 25. |
| `04-after-spending-18.png` | After choosing 18 and Spend: the toast reads "Spent 18 · heals 18". |
| `05-rage-toggle-on.png` | *Walk Barbarian 2024* after Use on Rage: the effect is listed with End, the resistances are chips, Rages shows two of three. AC 11 is the missing Unarmored Defense in `docs/reports/walk-report.md`. |
| `06-rest-dialog.png` | The Rest menu. |
| `07-after-short-rest.png` | After a short rest: Rages back to three of three (2024: one back on a short rest). Rage is still on, which is also in the report. |
| `08-unverified-marker.png` | The marker at 3×, on the converter-style `prose` / `unreviewed` part. Its tooltip is "Read from the feature's text, not yet reviewed". |
| `09-narrow-picker.png` | The picker in the narrow layout (430px wide). |

The tooltip itself is a native `title`, which a screenshot does not capture; its text was read back from the DOM.
