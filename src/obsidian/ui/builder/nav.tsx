/**
 * What the builder's sections need from whatever scrolls them: a way to register
 * a card Review can jump to, and a way to jump. The narrow layout answers with its
 * scroller, the desktop with its tab shell; the sections know neither.
 */

import { createContext, useCallback, useContext, type ReactNode } from "react";

export interface BuilderNav {
  /** Register (or clear, with null) an element a later `goTo(id)` should reach. */
  register: (id: string, el: HTMLElement | null) => void;
  goTo: (id: string) => void;
}

const NavContext = createContext<BuilderNav>({ register: () => {}, goTo: () => {} });

export function BuilderNavProvider({ nav, children }: { nav: BuilderNav; children: ReactNode }): ReactNode {
  return <NavContext.Provider value={nav}>{children}</NavContext.Provider>;
}

export function useBuilderNav(): BuilderNav {
  return useContext(NavContext);
}

/** A ref callback registering this element as a jump target. */
export function useBuilderStop(id: string): (el: HTMLElement | null) => void {
  const { register } = useContext(NavContext);
  return useCallback((el: HTMLElement | null) => register(id, el), [register, id]);
}
