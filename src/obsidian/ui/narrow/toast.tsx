/**
 * Toasts (spec 3.5). They slide in from the top, below Obsidian's title bar: a
 * bottom toast would collide with the floating toolbar and with an open sheet.
 *
 * No action buttons. Undo for a spent resource lives in the resource menu
 * instead, where the number itself can be put back.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { UI } from "./constants";

export interface ToastSpec {
  /** Small line: "Athletics check", "Rage". */
  label: ReactNode;
  /** The dice themselves: "d20 17 + 5", or both dice under advantage. */
  detail?: ReactNode;
  /** Shown large on the right. */
  total?: ReactNode;
  /** A natural 20 or natural 1 gets a coloured tag. */
  tag?: { text: string; tone: "crit" | "fumble" | "warn" };
}

interface ToastController {
  show: (spec: ToastSpec) => void;
}

const ToastContext = createContext<ToastController>({ show: () => {} });

export function useToast(): ToastController {
  return useContext(ToastContext);
}

export function ToastHost({ children }: { children: ReactNode }): ReactNode {
  const [toast, setToast] = useState<{ spec: ToastSpec; key: number } | undefined>();
  const timer = useRef(0);

  const dismiss = useCallback((): void => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = 0;
    setToast(undefined);
  }, []);

  const controller = useMemo<ToastController>(
    () => ({
      show: (spec) => {
        if (timer.current) window.clearTimeout(timer.current);
        // A new key restarts the slide-in, so a second roll reads as a new toast
        // rather than a number changing in place.
        setToast({ spec, key: Date.now() });
        timer.current = window.setTimeout(() => setToast(undefined), UI.toastDuration);
      },
    }),
    [],
  );

  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);

  return (
    <ToastContext.Provider value={controller}>
      {children}
      {toast ? (
        <div className="dg-toast-layer">
          <button key={toast.key} className="dg-toast" onClick={dismiss} aria-live="polite">
            <span className="dg-toast-text">
              <span className="dg-toast-label">{toast.spec.label}</span>
              {toast.spec.detail ? <span className="dg-toast-detail">{toast.spec.detail}</span> : null}
            </span>
            {toast.spec.tag ? (
              <span className={`dg-toast-tag is-${toast.spec.tag.tone}`}>{toast.spec.tag.text}</span>
            ) : null}
            {toast.spec.total !== undefined ? <span className="dg-toast-total">{toast.spec.total}</span> : null}
          </button>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
