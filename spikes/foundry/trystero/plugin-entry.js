// THROWAWAY: a minimal Obsidian plugin with one view that runs the pairing.
import { Plugin, ItemView } from "obsidian";
import { run, makeLogger } from "./pair.js";
const VIEW = "dg-trystero-spike-view";
class SpikeView extends ItemView {
  getViewType() { return VIEW; }
  getDisplayText() { return "Trystero spike"; }
  async onOpen() {
    this.contentEl.setText("pairing…");
    const cfg = JSON.parse(await this.app.vault.adapter.read(".obsidian/plugins/dg-trystero-spike/cfg.json"));
    const log = makeLogger("obsidian");
    log("view open", { mobile: this.app.isMobile, platform: navigator.platform, csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]') });
    const r = await run({ role: cfg.role, key: cfg.key, who: "obsidian", waitMs: cfg.waitMs ?? 40000, ice: cfg.ice, relays: cfg.relays });
    this.contentEl.setText("done: " + r);
  }
}
export default class SpikePlugin extends Plugin {
  async onload() {
    this.registerView(VIEW, (leaf) => new SpikeView(leaf));
    this.app.workspace.onLayoutReady(() => this.app.workspace.getLeaf(true).setViewState({ type: VIEW, active: true }));
  }
}
