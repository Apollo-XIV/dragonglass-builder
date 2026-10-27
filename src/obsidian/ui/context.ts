import { createContext, useContext, useSyncExternalStore } from "react";
import type { App, Component } from "obsidian";
import type DragonglassPlugin from "../../main";
import type { CharacterStore } from "../character-store";

export interface PluginContextValue {
  plugin: DragonglassPlugin;
  app: App;
  /** The owning view, used as the component for MarkdownRenderer. */
  view: Component;
}

export const PluginContext = createContext<PluginContextValue | undefined>(undefined);

export function usePlugin(): PluginContextValue {
  const value = useContext(PluginContext);
  if (!value) throw new Error("PluginContext is missing");
  return value;
}

/**
 * Subscribes to a character store. The store is mutable and owns the data; the
 * version counter is what React re-renders on.
 */
export function useStoreVersion(store: CharacterStore): number {
  return useSyncExternalStore(
    (onChange) => store.subscribe(onChange),
    () => store.version,
    // Static rendering (the render tests, and any future print-to-HTML export)
    // reads the same snapshot rather than failing.
    () => store.version,
  );
}

export const StoreContext = createContext<CharacterStore | undefined>(undefined);

export function useStore(): CharacterStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("StoreContext is missing");
  useStoreVersion(store);
  return store;
}
