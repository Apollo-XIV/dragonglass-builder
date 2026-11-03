import { type ReactNode, useEffect, useRef, useState } from "react";

export function ChipRow({
  chips,
  active,
  onPick,
}: {
  chips: { id: string; label: string }[];
  active: string;
  onPick: (id: string) => void;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (): void => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [chips.length]);

  return (
    <div ref={ref} className={more ? "dg-n-chips has-more" : "dg-n-chips"} role="tablist">
      {chips.map((chip) => (
        <button
          key={chip.id}
          role="tab"
          aria-selected={chip.id === active}
          className={chip.id === active ? "dg-n-chip is-active" : "dg-n-chip"}
          onClick={() => onPick(chip.id)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
