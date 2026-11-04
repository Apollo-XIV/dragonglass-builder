/** The drag handle's mark: a dotted hex grid. */

import { type ReactNode } from "react";

const DOTS: [number, number][] = [
  [5, 3],
  [11, 3],
  [2, 8],
  [8, 8],
  [14, 8],
  [5, 13],
  [11, 13],
];

export function HexGrid(): ReactNode {
  return (
    <svg className="dg-hex-grid" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      {DOTS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.35" fill="currentColor" />
      ))}
    </svg>
  );
}
