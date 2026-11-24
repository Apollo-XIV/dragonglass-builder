/**
 * Which slot casting a spell spends. A spell is cast from a slot of its own level or
 * higher: the exact level first, then pact magic (when its slots are high enough), then the
 * lowest higher slot. A cantrip spends nothing, and `undefined` means nothing is left to
 * cast it with.
 */

import type { ResolvedSpellcasting } from "../resolver/resolved";

export interface SlotChoice {
  /** Pool target for the spend event: "slots.2" or "pact". */
  target: string;
  /** The level the spell is cast at. */
  level: number;
  pact: boolean;
  /** Slots of that pool left once this one is spent. */
  remainingAfter: number;
}

export function slotFor(
  casting: Pick<ResolvedSpellcasting, "slots" | "pact"> | undefined,
  spellLevel: number,
): SlotChoice | undefined {
  if (!casting) return undefined;
  const open = casting.slots.filter((s) => s.level >= spellLevel && s.remaining > 0).sort((a, b) => a.level - b.level);
  const regular = (pool: (typeof open)[number]): SlotChoice => ({
    target: `slots.${pool.level}`,
    level: pool.level,
    pact: false,
    remainingAfter: pool.remaining - 1,
  });
  if (open[0]?.level === spellLevel) return regular(open[0]);
  const pact = casting.pact;
  if (pact && pact.level >= spellLevel && pact.remaining > 0)
    return { target: "pact", level: pact.level, pact: true, remainingAfter: pact.remaining - 1 };
  return open[0] ? regular(open[0]) : undefined;
}
