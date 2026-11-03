/**
 * Answers the builder's navigation with the narrow scroller. It sits inside each
 * section's body, where the scroller's own contexts are in reach.
 */

import { useMemo, type ReactNode } from "react";
import { BuilderNavProvider } from "../builder/nav";
import { useScrollController, useStopRegistrar } from "./scroller";

export function NarrowNavBridge({ children }: { children: ReactNode }): ReactNode {
  const controller = useScrollController();
  const register = useStopRegistrar();
  const nav = useMemo(() => ({ register, goTo: (id: string) => controller.goTo(id) }), [register, controller]);
  return <BuilderNavProvider nav={nav}>{children}</BuilderNavProvider>;
}
