# Visual testing in a real Obsidian

Unit tests render to static markup, so they cannot tell you how something *looks* or whether a
flag reaches a layout. To check that, run the real plugin in a real Obsidian and screenshot it.
This works on a headless machine (KDE Plasma 6 / Wayland) with no one at the screen.

## Recipe

1. **Build into the test vault.** `npm run build` writes `main.js` to the repo root, which is
   not what Obsidian loads. Run `npm run dev` (it builds into
   `vault/.obsidian/plugins/dragonglass-builder/`); once it prints
   `build finished, watching`, you can stop it. `timeout 25 npm run dev` does this.

2. **Back up `~/.config/obsidian/obsidian.json`** to your scratchpad. Compare with `diff`
   afterwards and restore if it changed: it decides which vault the user's next launch opens.
   A vault that is already registered (`vault/` usually is) needs no change.

3. **Start a private virtual compositor.** `kwin_wayland --virtual` renders to a framebuffer
   and gets its own socket, so it never touches the user's session on `wayland-0`. The size
   is the window size, so pick the layout you want (narrow is below 900px):

   ```sh
   XDG_RUNTIME_DIR=/run/user/$UID setsid kwin_wayland --virtual --socket dg-virt \
     --width 420 --height 900 --no-lockscreen --no-global-shortcuts > kwin.log 2>&1 &
   ```

4. **Start Obsidian on it** with the debugging port open:

   ```sh
   WAYLAND_DISPLAY=dg-virt XDG_RUNTIME_DIR=/run/user/$UID DISPLAY= setsid \
     obsidian --ozone-platform=wayland --remote-debugging-port=9222 > obs.log 2>&1 &
   ```

   Give it about ten seconds; `curl -s localhost:9222/json` lists a page titled
   `vault - Obsidian` when it is ready. Obsidian is single-instance, so if the user has one
   running it will hand off to that instead: check `pgrep -a obsidian` first.

5. **Drive it** with `scripts/obsidian-cdp.mjs`, which evaluates JS in the window and can save
   a screenshot (read the PNG with the Read tool):

   ```sh
   node scripts/obsidian-cdp.mjs '(async () => {
     const f = app.vault.getAbstractFileByPath("Characters/Test/build.5e");
     await app.workspace.getLeaf(false).openFile(f);
     await new Promise(r => setTimeout(r, 4000));
     return document.querySelector(".dg-layout")?.className;
   })()' "$SCRATCH/shot.png"
   ```

   Useful moves: `app.workspace.leftSplit.collapse()` (a 420px window is mostly sidebar
   otherwise), `el.scrollIntoView({block: "center"})` before a screenshot, and counting
   `document.querySelectorAll(".dg-...")` to assert something rendered. Open `sheet.5e` for the
   sheet and `build.5e` for the builder.

6. **Clean up.** Kill Obsidian (`pkill -f ozone-platform=wayland`) and the virtual KWin
   (`pkill -f 'socket dg-virt'`), then `diff` `obsidian.json` against your backup.

## Notes

- The test character is `vault/Characters/Test/`. `vault/` is git-ignored and Obsidian
  writes to it, so a screenshot session that edits the character changes the user's scratch
  data: prefer reading to clicking, and say so if you did edit.
- To see the desktop layout use `--width 1400 --height 900` instead.
- `Xvfb` is also installed, but it would run Obsidian through XWayland; the virtual KWin is
  the better fit.
- CDP is `ws://localhost:9222`; the script uses Node's global `WebSocket` (Node 22+).
