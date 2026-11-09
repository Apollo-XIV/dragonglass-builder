# dragonglass-builder: mobile (narrow layout) UX spec

Version: v0.1 draft, written from design sessions and HTML prototypes.
Companion to the desktop layout spec (separate document). The two layouts share components; this document covers the narrow layout only.

## 0. How to read this

Every behaviour carries a status tag:

- **[Decided]**: agreed by the project owner. Implement as written.
- **[Proposed]**: suggested during design, not yet agreed. Implement it, preferably behind a setting or as an easily changed constant, and expect iteration after the first build.
- **[Open]**: needs a decision before it can be built. Listed again in section 11.

Notes for the implementer:

- The prototypes were HTML mockups that used Tabler icons and non-Obsidian CSS variables. Implement with Obsidian's bundled icons and Obsidian CSS variables (`--background-*`, `--text-*`, `--interactive-accent`, and so on) so the UI follows the user's theme.
- Feature, class and rules text in the prototypes is placeholder wording, not real content.
- Pixel and millisecond values in the text are the values tuned in the prototypes. They are collected in section 10.

## 1. Layout switching

1. **[Decided]** The narrow layout is for phones, vertical tablets and any narrow pane. The desktop layout is for horizontal tablets and wide panes.
2. **[Decided]** The switch is based on the plugin view's own container, not the screen or window. A narrow pane on a desktop therefore gets the narrow layout.
3. **[Decided]** Desktop layout applies when container width is at least 900px. Otherwise the narrow layout applies.
4. **[Decided]** Litmus test: a vertical tablet shows the narrow layout, a horizontal tablet shows the desktop layout.
5. **[Proposed]** The desktop layout also requires width >= height. This keeps a 12.9" tablet held vertically (about 1024px wide) on the narrow layout.
6. **[Proposed]** Hysteresis of about 40px around the 900px boundary, so dragging a pane edge does not flicker between layouts.
7. **[Proposed]** The layout mode is frozen while a text input has focus, because the on-screen keyboard changes the container height.
8. **[Proposed]** Setting "Layout": Auto (default), Narrow, Desktop.
9. Use a `ResizeObserver` on the view container.

## 2. Constraints from Obsidian

1. **[Decided]** No permanent sticky header and no extra persistent bars. Obsidian already provides a top title bar and a floating bottom toolbar, and adding more chrome looks cluttered and costs screen space.
2. **[Decided]** The note/view title carries the HUD.
   - Sheet: `Name · Lv. N · cur/max HP`.
   - Builder: `Name · Lv. N · Class N / Class N`.
3. **[Proposed]** HP text turns amber at half HP or below. In the builder, a leading amber `●` in the title marks unsaved edits (section 7.9).
4. **[Decided]** The vertical axis is the only free axis. Whole-page horizontal swipes are not used, because they conflict with Obsidian's sidebar swipe. Horizontal scrolling inside a section (filter chip rows) is allowed.
5. **[Decided]** No fold-outs or accordions, because closing one means scrolling back up to it. Details are shown on hold (section 3). The single exception is Planned in the builder (section 7.6), whose collapse control lives in its sticky header.
6. **[Decided]** All colours come from Obsidian CSS variables.
7. **[Proposed]** Bottom padding of about 110px on the scroll content, so the last section clears the floating toolbar.

## 3. Interaction language

Core rule **[Decided]**: tapping interacts (select, roll, spend a resource); holding reads or inspects (feature text, where a number comes from).

### 3.1 Targets

1. **[Decided]** Tap targets are confined to the number or control itself. The surrounding row is not a button.
2. **[Decided]** Visual language for tap targets:
   - d20 rolls (ability checks, skills, saves, attack rolls): outlined box.
   - Other dice (damage, healing): filled box.
   - Resource: bordered pill containing the pips. Tapping spends one use.
3. **[Decided]** Holding anywhere on a feature, spell, weapon or item row opens its text popup, not only on the name label.
4. **[Decided]** Rollable boxes inside a row have their own hold behaviour (the breakdown). The innermost target under the finger wins.
5. **[Proposed]** Visible box height about 38px inside rows of at least 48px.

### 3.2 Hold mechanics (all **[Proposed]** values, tuned in the prototype)

- Use pointer events on the scroll container.
- Default hold time 450ms. Setting range 300 to 600ms.
- Cancel the hold if the pointer moves more than 10px or the container scrolls.
- Feedback while holding: a flat (not gradient) accent fill sweeps across the target, starting 120ms after press and finishing at the hold time. The target scales to about 0.97.
- A 14ms haptic fires when the hold registers. Releasing after a registered hold must not also trigger the tap.
- Suppress native long-press behaviour on interactive elements: `user-select: none`, `-webkit-touch-callout: none`, and prevent the `contextmenu` event.

### 3.3 Hold popup (bottom sheet)

**[Decided]** All hold popups are bottom sheets that rise from the bottom. One component with several content types.

1. **Roll breakdown** (abilities, skills, saves, attack rolls, damage). **[Decided]**
   - Title, roll kind, large total.
   - One line per contribution: label, signed value, source. Example: "Proficiency bonus +2, Sage background".
   - Conditional effects as amber notes (example: "Advantage on saves against being charmed, Fey ancestry").
   - d20 rolls: buttons Disadvantage / Roll / Advantage.
   - Damage: Roll and Roll critical (critical **[Proposed]**).
2. **Feature, spell, weapon or item text.** **[Decided]**
   - Title, source line (for example "Wizard 1 · Class feature"), body text.
   - Where the text refers to a derived number, show how it is calculated, for example "Save DC 13 = 8 + 2 proficiency + 3 Intelligence". The engine supplies this (section 8).
3. **Resource menu.** **[Decided]** Shown on hold of the pips pill or of the feature row.
   - Feature text, then a "Uses left" control: stepper (minus and plus buttons), pips, "N of M" label.
   - Buttons "Use one" and "Restore all".
   - Changes apply live to the main screen behind the sheet, and the sheet stays open.
   - This replaces any undo button on toasts.
4. **Option preview inside builder choice sheets.** **[Proposed]** Tapping an option selects it, holding an option shows its text so people can read before choosing.

Dismissal: tap the scrim. **[Proposed]** swipe down also dismisses.
The sheet's maximum height is about 75% of the view so a top toast never overlaps it.

### 3.4 Tap outcomes

- **[Decided]** Roll: show a toast with the result.
- **[Decided]** Resource pill: spend one use and show a toast "N of M left". If none remain, the toast says "No uses left".
- **[Proposed]** Tapping read-only content shows the toast "Hold to read" the first two times only, as a teaching hint.

### 3.5 Toast

- **[Decided]** Toasts slide in from the top, below the title bar. A bottom toast collides with Obsidian's floating toolbar and with open sheets.
- Content **[Proposed]**: label line (small), dice detail line, large total on the right. Natural 20 and natural 1 get a coloured tag. Advantage and disadvantage show both dice.
- No action buttons. Tap to dismiss. Auto-dismiss after about 3.6s.

### 3.6 Haptics

- **[Proposed]** Roll tap 10ms, hold registration 14ms, rail detent 6ms, scroll tick 8ms.
- `navigator.vibrate` only works on Android. Haptics must sit behind an interface in the shell so other platforms can plug in. Never rely on haptics alone: every haptic has a visual counterpart.

### 3.7 Accessibility (all **[Proposed]**)

- Hold time is a setting.
- Optional setting "Show info buttons" adds a visible info affordance to holdable rows, for people who cannot or prefer not to long-press.
- Screen readers get a custom action "View details" on every holdable element.

### 3.8 Desktop equivalent

**[Proposed]** Click acts. Hover (with delay) or right-click reads. Defined in the desktop spec.

## 4. Navigation rail

A vertical icon rail on the thumb side of the screen. It scrolls to sections and shows where you are.

### 4.1 Geometry and placement

- **[Decided]** Icons 40px wide by 48px high. Glyphs are not stretched. No gap between icons and no padding around the group, so the highlight behind the active icon is flush with the container's edges and the first and last are shaped by its corners. Rounded container, `--radius-m`.
- **[Decided]** Side (left or right) and height are settings. Height options: Middle (vertically centred) and Low (just above Obsidian's floating toolbar).
- **[Proposed]** Default side: right. On the left, inset the rail about 14px from the edge to stay clear of Android's back gesture and Obsidian's sidebar swipe.
- **[Proposed]** Defaults: side right, height middle. Both are settings.
- **[Decided]** Content never sits under the rail: reserve right padding (or left, when the rail is on the left) of icon width plus about 28px. Sticky section headers extend full width beneath the rail (section 5).
- **[Decided]** No position track on the rail edge. The spotlight behind the active icon is the only position indicator; a second, thinner rail inside the pill read as a scrollbar and competed with it.

### 4.2 Behaviour

- **[Decided]** Fade when idle: about 0.4 opacity at rest, full opacity during touch or scroll, returning after about 1.6s.
- **[Decided]** The icon for the section currently at the top is highlighted.
- **[Decided]** Tap an icon: glide to that section's start. Default is glide, and a setting allows jump. Glide is an exponential ease-out (about 20% of remaining distance per frame, roughly 250 to 300ms).
- **[Decided]** Drag is a continuous scrub, not a discrete jump.
  - Each icon owns a zone of its own height (48px). Within zone *i*, finger position *t* (0 to 1) maps linearly onto the scroll range from the start of section *i* to the start of section *i+1*. The last zone ends at maximum scroll. The mapping is continuous across zone boundaries.
  - Detents: within about 28px of scroll distance of any section start, scroll position snaps to that start and a short haptic fires on entry.
  - Smoothing: scroll chases the mapped target (about 40% of remaining distance per frame while dragging).
  - On release: if within about 90px of a section start, glide to it. Otherwise stay put.
- **[Decided]** Hold on the rail (without moving) for about 350ms to show a label bubble beside the icon. While scrubbing, the label of the zone under the finger shows continuously.
- **[Decided]** Status pips: an amber dot (10px) at the top right of an icon when its section needs attention.
  - Builder: Levels has unresolved choices, Equipment has an unmade starting equipment choice.
  - Sheet: Spells while concentrating, Features while a once-per-rest feature is unused.
- Touching the rail must work on the first touch even while faded.

### 4.3 Scroll ticks and snapping

- **[Decided]** Scroll ticks are on by default. When a section header reaches the top during ordinary scrolling, fire a short haptic and flash the section label beside the rail for about 650ms. The label is the visual fallback where haptics are unavailable.
- **[Proposed]** Rate limit ticks to one per 70ms. Do not tick during programmatic scrolling or rail scrubbing (scrubbing has its own detents).
- **[Decided]** Individual level cards in the builder do **not** tick or detent. Tried on a phone: a stop every card made scrolling the builder a fight, and the cards are close enough together that the feedback said nothing. They stay addressable by id so Review can jump to one (section 7.3), but scrolling past one is not an event.
- **[Decided]** Snapping is on by default and optional. The grab must be wider than the browser's native proximity snap.
- **[Proposed]** Implementation: do not use CSS scroll-snap. On `scrollend`, if a section start is within the grab distance, glide to it. Default grab distance 20 to 25% of viewport height, exposed as a setting. Suspend while the rail is being touched and during programmatic scrolls.

### 4.4 Icon sets and order

- **[Decided]** Icon order is a setting, plugin-wide with an optional per-character override.
- Sheet icons, default order **[Proposed from mockup]**: Overview, Actions, Spells, Inventory, Features, Skills and saves, Details.
- Builder icons, default order **[Proposed from mockup]**: Origin, Levels, Planned, Spells, Equipment, Details, Review.
- **[Decided]** Sections that do not apply (Spells for a non-caster) disappear from the page and from the rail.
- **[Decided]** Individual levels do not get rail icons.

## 5. Sticky section headers

**[Decided]** Each section has a header that stays pinned while you are inside that section and is pushed out by the next header when the section ends ("left behind").

- The header is the section's own heading element, positioned sticky. At rest it costs no extra space.
- About 38px high, full width (extends under the rail area), opaque surface colour, hairline bottom border.
- Left: section icon and title. Right: a short status text (secondary colour, 12px).
- Only one strip is ever pinned. Do not stack nested sticky headers.
- **[Proposed]** Levels header status shows "Level N of M", tracking the level card currently at the top.
- **[Decided]** Planned header (builder) carries the collapse chevron. See section 7.6.
- The plugin view must own the scrolling container so sticky positioning works.

## 6. Character sheet (narrow)

Single vertical scroll in the section order of section 4.4. Content in the prototype, to be iterated after the first build:

- **Overview**: HP controls, AC, initiative, speed, proficiency bonus, six abilities in a 3 by 2 grid. Each ability shows its modifier in an outlined roll box and its score as plain text.
- **Actions**: action, bonus action and reaction toggles. Attack rows: weapon or spell name (hold to read), outlined hit box, filled damage box.
- **Spells** (casters only): save DC and spell attack, concentration banner with End control, slot pips, a horizontally scrolling chip row (All, Cantrip, level chips, Ritual, Concentration) filtering the spell list.
- **Inventory**: weight and currency summary, item rows with Use where relevant.
- **Features**: feature rows. Features with uses show the pips pill.
- **Skills and saves**: plain name with a proficiency marker, outlined roll box with the total.
- **Details**: embedded backstory note and traits.

Horizontal filter chip rows inside sections are **[Decided]**. Everything else above is the mockup layout and **[Proposed]** in detail.

## 7. Builder (narrow)

### 7.1 Principles

- **[Decided]** One vertical scroll in dependency order. It sits between a guided character wizard and a freeform editor: new users scroll down and pick as they go, experienced users jump with the rail.
- **[Decided]** Section order: Origin, Levels, Planned (collapsed by default), Spells (casters only), Equipment, Details, Review.
- **[Decided]** The sheet and builder share one visual design and component set.
- **[Decided]** The builder's sections, pickers, confirmations and save flow are shared with the desktop layout (`ui/builder/`); this section describes the narrow arrangement of them. Features the desktop has first (per-level HP, picker search, row removal) are shared flags, ready to switch on here.

### 7.2 Origin

Species, Background, ability scores and other things that rarely change. Rows open choice sheets (section 7.7).

### 7.3 Levels

- **[Decided]** A vertical scroll of level cards, one per level taken, with every choice visible.
- Level card **[Proposed from mockup]**:
  - Header: "Level N", class chip ("Wizard 3"), amber "N to choose" tag when choices are unresolved.
  - One plain line listing automatic features. Each is holdable for its text.
  - A choice row per decision: label, current selection or "Choose", chevron. Empty choices use a dashed accent border.
- **[Decided]** A level's class cannot be changed in place. To change a level's class, remove that level and add a new one with the level buttons (section 7.4).
- **[Proposed]** Any level can be removed. Holding a level card opens a bottom sheet for that level (its features and choices, plus a destructive "Remove level" button). The most recent level may also show a quick "Undo level" button on its card.
- **[Proposed]** Removal semantics:
  - Features derive from how many levels of each class the character has, so removing any level of a class has the same effect on features as removing that class's highest class level. The remaining levels renumber.
  - The picks that belonged to the removed class level are demoted to that class's Planned queue, not deleted. Anything that depended on them follows the invalidation rules in section 7.8.
  - The confirmation popup from section 7.8 appears whenever removal affects other choices.
  - Removing level 1 changes the starting class (starting proficiencies and starting equipment). The popup must say so.
- **[Decided]** Level cards participate in scroll ticks and rail detents but have no rail icons.

### 7.4 Level buttons

Below the last level card:

- **[Decided]** One class: a single full-width button "+ {Class} level".
- **[Decided]** Two classes: the class button splits into two side by side.
- **[Decided]** Three or more classes: class buttons stack vertically, each full width. There is no horizontal snapping or scrolling.
- **[Decided]** A "+ Multiclass" button always sits below the class buttons.
- **[Proposed]** Buttons 48px high. Class buttons use a tinted accent fill. "+ Multiclass" uses a dashed outline.
- "+ Multiclass" opens a choice sheet listing classes not yet taken, at level 1. **[Proposed]** Prerequisites are shown (unmet ones with an amber tag) and enforced only if the existing optional dependency enforcement setting is on.

### 7.5 Level up

Pressing a class level button appends a level for that class and applies any queued picks for that class level. **[Decided]** that queued picks are applied on level-up. **[Decided]** that the scroll stays where it is: the level buttons sit directly below the last card, so the new one appears where the player is already looking, and carrying them to it read as the view jumping ahead of them. A brief highlight on the new card is still **[Proposed]**.

### 7.6 Planned

- **[Decided]** Below the level buttons, a divider labelled Planned, then the upcoming levels for each current class, so players can plan builds.
- **[Decided]** Selections made here are saved but not applied until the character reaches that class level (a queued build).
- **[Decided]** The queue is per class (Wizard 4 and Fighter 2 are both "next"). The class button pressed decides what comes next. A single ordered "queue levels" option may come later and is not designed around.
- **[Proposed]** Ordering across classes is not part of the first build. Keep the data model open for it: `levels` is an ordered list of class ids, and the per-class queue is derived from counts. A later ordered plan can then be an optional extra list (for example `plan: ClassId[]`, empty by default) without changing how picks are keyed.
- **[Decided]** Collapsed by default. The header carries a chevron.
- **[Proposed]** Collapsed summary text in the header: "1 queued · Wizard 4+, Fighter 2+".
- **[Proposed]** Expanded: the header stays pinned, so the player can collapse from anywhere inside it. After collapsing, scroll to the header if it was pinned.
- **[Proposed]** With two or more classes, a chip row filters the planned list (All plus each class). Show the next 3 levels per class with "Show more levels" adding 3 at a time, up to the highest level present in loaded data.
- Planned cards are visually lighter (dashed border, transparent fill). Holding a feature shows its text (look-ahead).

### 7.7 Choice sheets

- **[Decided]** All selection happens in bottom sheets.
- Single choice: tapping an option selects it and closes the sheet. Multiple choice: tapping toggles, a "Done" button commits. The subtitle shows "N of M chosen". Choosing more than M drops the oldest selection **[Proposed]**.
- Options show source abbreviations as small tags (SRD, PHB, etc.) where known **[Proposed]**.
- Planned choices say "planned, applies when you reach it" in the sheet subtitle.

### 7.8 Editing earlier levels and invalidation

Stored picks are keyed by class, class level and feature slot, not by total character level.
Validity is derived from the current selections by the engine. It is not a stored flag.

1. **[Decided]** Earlier levels can be edited. Before committing an edit that affects later choices, show a confirmation popup: "Editing this feature will remove or invalidate the following choices:" with the affected choices listed.
2. **[Decided]** Deselecting or clearing an option **invalidates** later picks that depend on it. Invalid picks are kept but inactive, and are flagged in the UI with a reason. They do not contribute to the character.
3. **[Decided]** Reselecting the same option **revalidates** them (A, none, A restores everything).
4. **[Decided]** Selecting a different option re-evaluates all stored picks under the new option. Picks that remain valid stay, and picks that cannot be valid under the new option are **permanently removed** and forgotten. A, B, A starts fresh from A. The app never keeps every build ever considered.
5. **[Decided]** Invalid picks are saved with the character, so a player interrupted mid-rebuild can resume later.
6. **[Proposed]** The confirmation popup separates the two groups: "Will be removed" and "Invalid until you reselect X".
7. **[Proposed]** Invalid picks render muted with an "Invalid" tag and the dependency that failed. They are tappable so they can be reselected.

### 7.9 Save behaviour

- **[Decided]** First character creation saves live as choices are made. "Finish" closes the builder and opens the sheet.
- **[Decided]** Editing an existing character is ephemeral. Finish becomes "Save changes". Nothing is written to the character until the player saves, so someone exploring a different build or checking features does not overwrite anything.
- **[Decided]** Leaving the builder mid-edit saves a draft. The draft is stored separately from the character file, so the sheet continues to show the last saved version.
- **[Proposed]** Reopening the builder with a draft shows a banner: "Resume draft" and "Discard".
- **[Proposed]** The draft records the version of the character it started from. If the character changed since (sync, a sheet edit, another device), resuming warns the player before merging or discarding.
- **[Proposed]** "Save changes" shows a count of changes. A "Discard" button sits beside it. An amber `●` in the title marks unsaved edits.
- **[Proposed]** A short diff of what a save will change, if the engine can report it cheaply.

### 7.10 Review

- **[Proposed]** The last section lists open choices as links that scroll to the relevant card, then the Finish or Save changes controls. Finish is placed here because Obsidian mobile hides view actions in an overflow menu.
- Finish is never blocked by open choices. It reports how many remain.

### 7.11 Spells, Equipment, Details

Sketch only, to be iterated:

- **Spells** (casters only): spells known from level choices plus a "+ Add spells" action.
- **Equipment**: starting equipment choice (class kit or gold), then items with "+ Add items".
- **Details**: name, alignment, traits, flaw, backstory (embedded note).

## 8. Engine requirements

The UI is a thin layer over the engine. The engine must provide:

1. **Explain value** **[Proposed]**: for any derived number (ability modifier, skill total, attack bonus, save DC, damage), return the total plus an ordered list of contributions: `{ label, value, source, conditional? }`, and any advantage, disadvantage or conditional notes. Roll breakdowns and feature text popups both use this.
2. **Roll definitions** **[Proposed]**: each rollable declares its kind (d20 or damage or other dice), formula and conditional notes.
3. **Resources** **[Proposed]**: current uses, maximum, restore rules, and a setter for the manual override.
4. **Derived validity** **[Decided]**: validity of every stored pick is a pure function of current selections, with a dependency graph. API shape **[Proposed]**:
   - `previewChange(change)` returns `{ invalidated[], removed[] }` for the confirmation popup.
   - `commitChange(change)` applies it, including the permanent removal rule from section 7.8.
   - Adding a level, removing a level and editing a choice all go through the same two calls.
5. **Queued picks** **[Decided]**: picks addressed by class, class level and slot, retained when above current class level, applied on level-up.
6. **Draft store** **[Proposed]**: separate from the character, with a base-version identifier.
7. **Platform boundary** **[Proposed]**: engine and UI components import nothing from `obsidian`. Only the plugin shell may. Storage, settings, theme, haptics, title and note embeds sit behind small interfaces. This keeps an optional standalone build possible later and is not a current goal.

## 9. Settings summary

| Setting | Default | Status |
| --- | --- | --- |
| Layout (Auto, Narrow, Desktop) | Auto | Proposed |
| Rail side | Right | Decided as a setting, default proposed |
| Rail height (Middle, Low) | Middle | Decided as a setting, default proposed |
| Rail icon order | Per spec 4.4 | Decided (plugin-wide, per-character override) |
| Tap on rail icon | Glide (alternative: Jump) | Decided |
| Scroll ticks | On | Decided |
| Snap | On | Decided |
| Snap grab distance | 20 to 25% of viewport height | Proposed |
| Hold time | 450ms (300 to 600) | Proposed |
| Haptics | On | Proposed |
| Show info buttons | Off | Proposed |
| Hold hint ("Hold to read") | On, first two taps | Proposed |

## 10. Reference values from the prototypes

| Item | Value |
| --- | --- |
| Rail icon | 40w × 48h, no gap, no padding |
| Rail idle opacity, idle delay | 0.4, 1.6s |
| Rail label hold | 350ms |
| Rail scrub detent radius | 28px of scroll distance |
| Rail release settle distance | 90px |
| Scrub chase, glide factors | 0.4, 0.2 per frame |
| Haptics | detent 6ms, tick 8ms, roll 10ms, hold 14ms |
| Scroll tick rate limit | 70ms |
| Scroll tick label flash | 650ms |
| Sticky header height | 38px |
| Hold time, cancel distance | 450ms, 10px |
| Hold fill delay | 120ms |
| Roll box | min width 56px, height 38px |
| Level and multiclass buttons | 48px high |
| Hold sheet max height | 75% of the view |
| Toast duration | about 3.6s |
| Content bottom padding | about 110px |
| Layout switch | width >= 900px (plus width >= height proposed), hysteresis 40px |

## 11. Open items and out of scope

- **[Open]** Whether removing a level demotes its picks to Planned (proposed in 7.3) or discards them.
- **[Open]** Exact content and layout of Spells, Equipment and Details in the builder, and of Inventory and Details on the sheet. The prototypes only sketch them.
- **[Open]** Ordered planning across classes (a single ordered queue). Deferred past the first build. Only the data-model room described in section 7.6 is reserved for it.
- **[Open]** Rail default height and side defaults need a real-device test.
- Out of scope here: the desktop layout (separate spec), an optional standalone web or Tauri build (not a current goal beyond the platform boundary in 8.7), dice-log history.
