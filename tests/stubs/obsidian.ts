/**
 * A stub of the Obsidian API, so the plugin's UI and store can be rendered and
 * exercised in unit tests. Only the surface the plugin actually uses is here.
 */

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/|\/$/g, "");
}

export const Platform = { isDesktopApp: true, isPhone: false, isMobile: false };

export class Notice {
  static messages: string[] = [];
  constructor(message: string) {
    Notice.messages.push(message);
  }
}

export const MarkdownRenderer = {
  calls: [] as { source: string; sourcePath: string }[],
  async render(_app: unknown, source: string, el: HTMLElement, sourcePath: string): Promise<void> {
    MarkdownRenderer.calls.push({ source, sourcePath });
    el.textContent = source;
  },
};

export function setIcon(el: HTMLElement, name: string): void {
  el.setAttribute("data-icon", name);
}

export function requestUrl(): Promise<never> {
  throw new Error("requestUrl is not available in tests");
}

export class Component {
  load(): void {}
  unload(): void {}
}

export class FileView extends Component {}
export class Modal extends Component {}
export class Plugin extends Component {}
export class PluginSettingTab extends Component {}
export class Setting {}
export class TFile {}
export class TFolder {}
export class TAbstractFile {}

export type App = unknown;
export type DataAdapter = unknown;
export type EventRef = unknown;
export type WorkspaceLeaf = unknown;
