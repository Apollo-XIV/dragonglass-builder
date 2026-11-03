import { type ReactNode } from "react";

export function ChipRow({
  chips,
  active,
  onPick,
}: {
  chips: { id: string; label: string }[];
  active: string;
  onPick: (id: string) => void;
}): ReactNode {
  return (
    <div className="dg-n-chips" role="tablist">
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
