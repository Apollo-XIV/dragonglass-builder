# dragonglass desktop sheet spec

Oct 30, 2026 · @Alix

## How to read this spec

The Figma sketch shows arrangement and intent, not measurements. Treat every pixel value in it as approximate and normalise it.

Gaps, paddings, radii, font sizes and colours come from one spacing scale, one radius scale, one type scale and Obsidian's CSS variables. The colours in the sketch were guessed, because Figma has no access to Obsidian's variables. Equal-looking gaps in the sketch should be exactly equal in the build.

Where this spec is silent, make the call a 5e player would expect, and include every piece of relevant character data even if the sketch doesn't show it. The sketch leaves out the Log tab, for example, and it should still be there.

The desktop layout is a sibling of the narrow (mobile) layout, not a separate design. Reuse its components wherever possible, so that presentation changes between the two but behaviour doesn't. When you finish, list the inferences and design decisions you made, so they can be reviewed.

## Overall layout

The desktop layout applies whenever the plugin view is 900px wide or more. Below that, the narrow layout takes over, so this layout never needs to work under 900px.

The sheet has a header band and two columns beneath it. The columns are independent stacks, not rows, so neither one's height sets the other's boundaries:

- **Header band:** avatar, name line, and the Rest and Inspiration buttons. The avatar overlaps down out of the band, and the status chips sit beside its lower half.
- **Left column, top to bottom:** the identity column (abilities, saves, situational notes), then the Skills box beside a stacked pair of Senses and Proficiencies boxes. The Skills box and the stacked pair fill the remaining height.
- **Right column, top to bottom:** the stat cluster and the HP panel, then the tabs panel. The tabs panel takes the remaining height and the remaining width.

Where one column is shorter than the other, its bottom boxes grow upward into the space and no gap is left beneath them. The HP and stat row is sized by its own content and the HP panel's ceiling, so a short readout hands its space to the tabs panel.

The stat cluster's left edge lines up with the tabs panel's left edge, as in the sketch.

Set max widths where the formatting starts to break, and choose them by testing rather than from the sketch's sizes. The identity column, Skills, Senses and Proficiencies should stop growing at a comfortable width, and the tabs panel absorbs extra width up to its own max. Past the overall max width, centre the sheet with empty margins on both sides, the way Obsidian centres readable-width content.

## Header

The name sits on the first line in bold. Beneath it, in italics, is species, class and level ("Dwarf Paladin 5"). Multiclass characters list each class ("Paladin 3 / Sorcerer 2").

The avatar comes from gallery.5e once that exists, which is post-MVP. Until then, show initials on a colour derived from the character, so every character still has a distinct tile.

**Rest** opens a small menu with short and long rest. Rests apply recharges through the existing engine, and a short rest offers hit dice spending.

**Inspiration** is a toggle. Its on and off states must be clearly different at a glance, using an accent fill when on.

The status chips sit under the name line, in this order:

1. Damage resistances, immunities and vulnerabilities, as neutral chips (e.g. "Res. poison").
2. Concentrating, as an orange chip, shown only while concentrating.
3. Active conditions. Exhaustion shows its level ("Exhaustion 2") rather than acting as an on/off condition.
4. A "+ Cond" chip that adds a condition.

Hovering a chip shows its source. Condition and concentration chips can be removed from the chip itself.

## Identity column, skills, senses and proficiencies

**Abilities** are six tiles under a small "Abilities" divider label. Each tile shows the modifier large, with the ability and score below it ("STR 10"). Clicking a tile rolls an ability check.

**Saves** are a row of pills under a "Saves" divider label. Each pill is labelled with its ability and total ("CON +2"), so the pills can reflow in narrower widths and still make sense away from the ability tiles. A pip on the pill's left edge marks proficiency: filled when proficient, hollow when not. The pip is the proficiency marker, though the sketch also gives proficient saves an accent outline. Clicking a pill rolls the save.

**Situational notes** sit under the saves. Each conditional modifier from a feature gets one short line with a small badge, such as an "A" badge for "on CON saves". These are generated from feature data, and hovering one shows its source.

**Skills** fill the tall box. Each of the 18 rows shows a proficiency pip, the skill name, its ability abbreviation, and the total. The pip has states for none, proficient and expertise, plus half proficiency where Jack of All Trades or similar applies. Clicking a row rolls the skill.

**Senses** shows passive Perception, Investigation and Insight, then special senses with ranges ("Darkvision 60 ft").

**Proficiencies** lists armour, weapons, tools and languages, each under a small group label.

## Stat cluster

The stat cluster is a compact grid between the identity column and the HP panel. Small tiles hold a large value with a small label below it.

- **Speed:** walking speed with its unit ("25 ft"). Other movement types (fly, swim, climb) appear smaller when present.
- **AC:** hover shows how it's built (armour, Dex, shield, features).
- **Initiative:** rollable.
- **Proficiency bonus:** display only.
- **Hit dice:** a wide tile showing remaining over total ("4 / 5d10"). The remaining count is directly editable. Multiclass characters get one line per die size ("4 / 5d10", "1 / 2d8") inside the same tile.
- **Pinned resources:** a wide tile under hit dice, split into two side-by-side slots.

Each pinned slot shows the resource's name, its uses remaining (as pips, or a count when uses are high), and its die where it has one. Bardic Inspiration, for example, shows both its d6 and its uses. Clicking a use spends it.

Pins are chosen in three layers, and the most specific layer wins:

1. **Class data:** each resource can carry a pin weight.
2. **Plugin settings:** overrides for every character.
3. **layout.5e:** per-character overrides, including explicit pins.

The two highest-ranked resources fill the slots. When a character has fewer than two pinnable resources, choose a sensible fallback (spell slots for a caster, say) or leave a quiet empty slot.

## HP panel

The HP panel is the same component as in the narrow layout: a vial on the left and a register on the right. Reuse it rather than rebuilding it. On desktop the calc is typed with the physical keyboard, so there is no symbol strip.

### Register

The register reads like a till roll or bank statement. Each row has the running balance on the left (current HP, with temp HP after it in the temp colour) and the delta on the right, joined by dotted leaders.

A sticky header row shows max HP, followed by temp max HP in its colour when it's non-zero ("42 +5"). The rows scroll, and they fade towards the top by design: the fade signals that older entries are still there. HP changes go through the plugin's existing log and undo system. The panel has no separate undo.

At the bottom, a large readout shows current HP and temp HP ("35 +4"), with a "+/-" control on the right. Clicking either one opens the calc input in place of "+/-".

### Calc syntax

| Input | Effect | Colour |
| --- | --- | --- |
| `-7` | Damage. Temp HP absorbs first, logged as a split ("-t4 -3") | Red, temp part blue |
| `+3` | Heal, capped at effective max | Green |
| `-` or `+` | Damage or heal 1 | Red or green |
| `35` or `=35` | Set current HP, capped at effective max | Orange |
| `+t4`, `-t4` | Gain or lose temp HP | Blue |
| `=t4` | Set temp HP | Blue |
| `+m4`, `-m4` | Raise or lower temp max HP | Purple |
| `=m4` | Set temp max HP | Purple |

Tokens can be chained (`+m5 +5`, `-9 +t5`). A chain commits as one register row carrying all of its deltas. Invalid input shows a short inline hint and commits nothing.

### Live preview

While you type, the calc text colours each token by its role. The readout shows the resulting values, dimmed while uncommitted. The vial shows the pending change as a diff: lost HP and temp HP become dashed ghosts at their old levels, and gained HP shows in green above the existing fill.

The diff stays visible if the input loses focus with text still in it, so a forgotten entry is obviously still pending.

### Committing and closing

Enter commits, and the input stays focused afterwards, ready for the next entry. Enter on an empty input does nothing. Esc cancels and closes. Clicking away closes the input only when it's empty.

### Temp max HP

Temp max HP moves the vial's ceiling. When positive, a tinted band in the temp max colour sits above a dashed line at base max. When negative, the top of the vial is blocked off down to the reduced max, and current HP caps at the new effective max. Every change is logged as its own row.

### Death saves

At 0 HP, the vial is replaced by six pips: three successes and three failures, with a divider between them. Choose the implementation details, following the 5e rules. Death save events are logged in the register.

## Tabs panel

The tabs panel holds everything that doesn't need to be visible at all times. Its contents mirror the narrow layout's sections: Actions keeps its filter chips, and the other tabs keep their mobile structure. Reuse those components, adapting density and columns to the extra width rather than redesigning them.

| Tab | Shown when | Contents |
| --- | --- | --- |
| Actions | Always | As in the mobile Actions section, filter chips included |
| Spells | The character has spellcasting | As in the mobile spellbook section, level filter chips included |
| Features | Always | All features and resources, including the pinned ones |
| Inventory | Always | Items, equipment, attunement and currency, as on mobile |
| Details | Always | Backstory, traits and appearance from details.5e |
| Log | Always | The plugin's existing log and undo history |

The active tab is attached to the panel body, folder-style, as in the sketch. When the tabs don't fit horizontally, the tab bar scrolls sideways, with edge fades showing there's more and the active tab scrolled into view. Add any further tab the character data needs on the same rules.

## Interaction on desktop

Desktop maps mobile's touch language onto mouse and keyboard, so both layouts behave the same way:

- **Click** does what a tap does on mobile: roll, spend a use, toggle.
- **Hover** shows a quick breakdown for any computed number, such as an ability, save, skill, AC or initiative ("+2 from proficiency").
- **Right-click** opens what a long-press opens on mobile: the detail menu with feature text, roll with advantage or disadvantage, and overriding uses left.

Rolls appear as toasts, carried over from the narrow layout.

Rollable things have no permanent outline at rest. On hover they show a pointer cursor and an accent outline, and the target is the value itself, not the whole row. The audience is players who know the game, so lean on intuition rather than labelling every affordance.

## Theming and normalisation

Every colour, surface, border, radius and font size comes from Obsidian's CSS variables, so the sheet follows the user's theme in light and dark modes. No hex values from the sketch go into the build.

Use one spacing scale for every gap and padding, so all boxes are separated by the same gutter. Use one radius scale for tiles, panels and chips, and one type scale for values, labels and small print. Big values (ability modifiers, AC, the HP readout) share a size, and labels share a smaller size.

Colour roles must match the narrow layout exactly, using the same tokens:

| Role | Used for |
| --- | --- |
| Red | Current HP fill, damage |
| Green | Healing, gained HP in the vial diff |
| Blue | Temp HP |
| Purple | Temp max HP |
| Orange | Set values (`=`), concentration |
| Accent | Proficiency pips, active tab, Inspiration when on |

Map these to Obsidian's palette variables (`--color-red`, `--color-green`, `--color-blue`, `--color-purple`, `--color-orange`) and to its accent variable.

### Icons

The sketch has no icons only because they were awkward to add in Figma. Use icons wherever they make something faster to recognise.

Obsidian ships the Lucide set through `setIcon`. Register any game-specific icons it lacks with `addIcon`, and keep them in the same outline style. Examples:

- A d20 outline for advantage and disadvantage markers, such as the situational save notes
- Icons in the resistance, concentration and condition chips
- Icons on stat tiles where they help, such as a shield for AC

Icons support labels rather than replacing them, except where the meaning is unambiguous to a 5e player. Icons take their colour from the role they sit in, using the colour roles above.

## Your calls, and what's out of scope

These are deliberately left to you. List what you chose for each when you finish:

- The max widths and breakpoints
- The death save implementation details
- The fallback for the pinned resource slots
- Empty states, such as no senses or no languages
- The exact values of the spacing, radius and type scales
- How each mobile tab's contents adapt to the extra width

The following are out of scope:

- Gallery images for the avatar, since gallery.5e is post-MVP
- Colour and background theming from layout.5e, which is also post-MVP (pin overrides from layout.5e are in scope)
- The builder's arrangement is no longer out of scope: see "The builder" below. (It was once excluded.)

Changes to the narrow layout are limited to extracting shared components.


## The builder

The desktop builder is the narrow builder's sections arranged for width, not a second builder: the same
sections, pickers, change confirmation, session, drafts and save flow (`ui/builder/`).

- **Tabs** for the sections: Origin, Levels (with Planned below it), Spells (casters), Equipment,
  Details, Review, then Browse and Sources. A dot on a tab means a decision is waiting there.
- **A sidebar** for reading. Hovering a feature, option or item shows its name, source and page, rules
  text, tags and any override; clicking keeps it. In a picker dialog the same text fills a second column.
- **The header** carries the name, level and class line, an unsaved dot, and Save changes (n) / Discard
  while editing an existing character, and the way back to the sheet.
- **Desktop-only for now**, each a shared component behind a flag: per-level HP, XP hint, the enforcement
  switch, search and filter chips in pickers, removing spells and items, custom items, typed ability
  scores, the Notes block, Browse and Sources.
