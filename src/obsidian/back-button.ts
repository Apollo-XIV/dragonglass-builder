import { Modal, type App } from "obsidian";

/**
 * Android's back gesture, for things Obsidian does not know are open.
 *
 * Obsidian's back handler closes the topmost modal, menu or suggester, and only
 * when there is none does it collapse a sidebar, go back in the tab's history and
 * finally offer to exit. That stack is internal: the only public way onto it is
 * to open one of those things. So a claim is an invisible `Modal` (hidden by
 * `.dg-back-proxy`), and anything that closes it other than the release — back,
 * or Escape through the modal's own scope — calls back.
 */
class BackProxy extends Modal {
  released = false;

  constructor(
    app: App,
    private readonly onBack: () => void,
  ) {
    super(app);
    this.shouldRestoreSelection = false;
    this.containerEl.addClass("dg-back-proxy");
  }

  /** Not in the public API; without it a phone animates the hidden modal and closes late. */
  canAnimate(): boolean {
    return false;
  }

  open(): void {
    // Opening a modal blurs whatever has focus: keep a search field typing.
    const focused = activeDocument.activeElement;
    super.open();
    if (focused instanceof HTMLElement && focused !== activeDocument.body) focused.focus({ preventScroll: true });
  }

  onClose(): void {
    if (!this.released) this.onBack();
  }
}

/**
 * Claims the back gesture until released: until then, back calls `onBack`
 * instead of leaving. Claims stack, the latest first. Releasing one that back
 * already took is a no-op.
 */
export function claimBack(app: App, onBack: () => void): () => void {
  const proxy = new BackProxy(app, onBack);
  proxy.open();
  return () => {
    proxy.released = true;
    proxy.close();
  };
}
