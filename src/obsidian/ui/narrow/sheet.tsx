/**
 * The bottom sheet (spec 3.3). One component, several content types: a roll
 * breakdown, a feature's text, a resource menu, a choice list. Callers supply the
 * body; the host owns the scrim, the rise, the swipe-down and the height cap.
 *
 * The body is a render function rather than an element so that a sheet left open
 * — the resource menu, which deliberately stays up while you spend uses — redraws
 * from the store along with the screen behind it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { UI } from "./constants";

export interface SheetSpec {
  title: ReactNode;
  /** Small line under the title: roll kind, "Wizard 1 · Class feature", "2 of 4 chosen". */
  subtitle?: ReactNode;
  body: () => ReactNode;
  /** Buttons pinned below the body: Roll / Advantage, Use one / Restore all, Done. */
  actions?: () => ReactNode;
  /** Called when the sheet goes away by any route: a button, the scrim, Escape, a swipe. */
  onClose?: () => void;
}

interface SheetController {
  open: (spec: SheetSpec) => void;
  close: () => void;
}

const SheetContext = createContext<SheetController>({ open: () => {}, close: () => {} });

export function useSheet(): SheetController {
  return useContext(SheetContext);
}

/** Dragged this far down, a release dismisses rather than springing back. */
const DISMISS_DISTANCE = 80;

export function SheetHost({ children }: { children: ReactNode }): ReactNode {
  const [spec, setSpec] = useState<SheetSpec | undefined>();
  const [drag, setDrag] = useState(0);
  const pointer = useRef<{ id: number; y: number } | undefined>(undefined);

  const current = useRef<SheetSpec | undefined>(undefined);
  current.current = spec;

  const close = useCallback((): void => {
    const closing = current.current;
    current.current = undefined;
    closing?.onClose?.();
    setSpec(undefined);
    setDrag(0);
    pointer.current = undefined;
  }, []);

  const controller = useMemo<SheetController>(
    () => ({
      open: (next) => {
        setDrag(0);
        setSpec(next);
      },
      close,
    }),
    [close],
  );

  // Escape closes it on desktop and with an attached keyboard.
  useEffect(() => {
    if (!spec) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [spec, close]);

  return (
    <SheetContext.Provider value={controller}>
      {children}
      {spec ? (
        <div className="dg-sheet-layer">
          <div className="dg-sheet-scrim" onPointerDown={close} />
          <div
            className="dg-bottom-sheet"
            role="dialog"
            aria-modal="true"
            style={{
              maxHeight: `${UI.sheetMaxHeightPercent}%`,
              transform: drag ? `translateY(${drag}px)` : undefined,
              transition: pointer.current ? "none" : undefined,
            }}
          >
            <div
              className="dg-sheet-grip"
              onPointerDown={(event) => {
                pointer.current = { id: event.pointerId, y: event.clientY };
              }}
              onPointerMove={(event) => {
                if (pointer.current?.id !== event.pointerId) return;
                // Upward drags do nothing: the sheet has no expanded state.
                setDrag(Math.max(0, event.clientY - pointer.current.y));
              }}
              onPointerUp={() => {
                const dragged = drag;
                pointer.current = undefined;
                if (dragged > DISMISS_DISTANCE) close();
                else setDrag(0);
              }}
              onPointerCancel={() => {
                pointer.current = undefined;
                setDrag(0);
              }}
            >
              <span className="dg-sheet-handle" />
            </div>
            <header className="dg-sheet-head">
              <h3>{spec.title}</h3>
              {spec.subtitle ? <p className="dg-sheet-subtitle">{spec.subtitle}</p> : null}
            </header>
            <div className="dg-sheet-body">{spec.body()}</div>
            {spec.actions ? <footer className="dg-sheet-actions">{spec.actions()}</footer> : null}
          </div>
        </div>
      ) : null}
    </SheetContext.Provider>
  );
}
