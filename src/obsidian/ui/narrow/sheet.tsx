/**
 * The bottom sheet (spec 3.3). One component, several content types: a roll
 * breakdown, a feature's text, a resource menu, a choice list. Callers supply the
 * body; the host owns the scrim, the rise, the swipe-down and the height cap.
 *
 * The body is a render function rather than an element so that a sheet left open
 * — the resource menu, which deliberately stays up while you spend uses — redraws
 * from the store along with the screen behind it.
 *
 * Sheets stack. One opened from inside a sheet (holding a picker's option to
 * read it) goes on top of that sheet, and dismissing it goes back to the one
 * below, which stayed mounted and kept its selection, search and scroll. One
 * opened from the page replaces the whole stack. `close` closes the sheet its
 * own `useSheet` opened, with whatever is on top of it, so a picker that closes
 * itself after a pick never takes the confirmation that pick opened with it.
 *
 * Each open layer claims the phone's back gesture, so back closes the top sheet
 * and goes back to the one below rather than leaving the app.
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
import { useShell } from "./platform";
import { closeLayer, pushLayer, type Layer } from "./sheet-stack";

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

interface HostContext {
  /** The layer this context sits in: -1 on the page, 0 inside the bottom sheet. */
  depth: number;
  push: (depth: number, spec: SheetSpec) => number;
  close: (id: number) => void;
}

const SheetContext = createContext<HostContext>({ depth: -1, push: () => 0, close: () => {} });

/** Opens a sheet, and closes the one it opened. Each call has its own. */
export function useSheet(): SheetController {
  const host = useContext(SheetContext);
  const mine = useRef<number | undefined>(undefined);
  return useMemo<SheetController>(
    () => ({
      open: (spec) => {
        mine.current = host.push(host.depth, spec);
      },
      close: () => {
        if (mine.current !== undefined) host.close(mine.current);
      },
    }),
    [host],
  );
}

/** Dragged this far down, a release dismisses rather than springing back. */
const DISMISS_DISTANCE = 80;

export function SheetHost({ children }: { children: ReactNode }): ReactNode {
  // The ref is the truth, read and written synchronously: one tap can open a
  // confirmation and close the picker it came from before React renders.
  const stack = useRef<Layer<SheetSpec>[]>([]);
  const [layers, setLayers] = useState<Layer<SheetSpec>[]>([]);
  const nextId = useRef(1);

  const settle = useCallback((next: Layer<SheetSpec>[], removed: Layer<SheetSpec>[]): void => {
    stack.current = next;
    setLayers(next);
    for (const layer of removed) layer.spec.onClose?.();
  }, []);

  const push = useCallback(
    (depth: number, spec: SheetSpec): number => {
      const id = nextId.current++;
      const { next, removed } = pushLayer(stack.current, depth, { id, spec });
      settle(next, removed);
      return id;
    },
    [settle],
  );

  const close = useCallback(
    (id: number): void => {
      const { next, removed } = closeLayer(stack.current, id);
      if (removed.length) settle(next, removed);
    },
    [settle],
  );

  // Escape closes the top sheet, on desktop and with an attached keyboard. One
  // already handled closed it through the layer's back claim.
  const open = layers.length > 0;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      const top = stack.current[stack.current.length - 1];
      if (event.key === "Escape" && !event.defaultPrevented && top) close(top.id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const page = useMemo<HostContext>(() => ({ depth: -1, push, close }), [push, close]);

  return (
    <SheetContext.Provider value={page}>
      {children}
      {layers.map((layer, depth) => (
        <SheetLayer key={layer.id} layer={layer} depth={depth} push={push} close={close} />
      ))}
    </SheetContext.Provider>
  );
}

function SheetLayer({
  layer,
  depth,
  push,
  close,
}: {
  layer: Layer<SheetSpec>;
  depth: number;
  push: HostContext["push"];
  close: HostContext["close"];
}): ReactNode {
  const spec = layer.spec;
  const [drag, setDrag] = useState(0);
  const pointer = useRef<{ id: number; y: number } | undefined>(undefined);
  // Whether the press now ending began on the scrim. Only such a press dismisses:
  // a hold that opened a shorter sheet over this one is released over the scrim,
  // and that release is not a request to close.
  const scrimPressed = useRef(false);
  const dismiss = (): void => close(layer.id);
  const shell = useShell();
  // Layers mount bottom first, so the claims stack in the same order as the sheets.
  useEffect(() => shell.claimBack(() => close(layer.id)), [shell, close, layer.id]);
  const context = useMemo<HostContext>(() => ({ depth, push, close }), [depth, push, close]);

  return (
    <SheetContext.Provider value={context}>
      {/* `data-ignore-swipe`, as on the rail: swiping the sheet down to close it
          must not also pull down Obsidian's command palette. */}
      <div className="dg-sheet-layer" data-ignore-swipe="true">
        {/* Closes on the click, the tap's last event, not on the press: a scrim
            gone at `pointerdown` leaves the release and the click to land on
            whatever is under it, and a tap meant to dismiss opens something. */}
        <div
          className="dg-sheet-scrim"
          onPointerDown={() => {
            scrimPressed.current = true;
          }}
          onClick={() => {
            const pressed = scrimPressed.current;
            scrimPressed.current = false;
            if (pressed) dismiss();
          }}
        />
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
              if (dragged > DISMISS_DISTANCE) dismiss();
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
    </SheetContext.Provider>
  );
}
