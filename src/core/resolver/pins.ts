/**
 * Which resources get the sheet's pinned slots (desktop spec, "Stat cluster").
 *
 * Three layers, most specific first: the character's own `layout.5e`, the plugin's
 * settings, then the pin weight the content itself carries. An explicit pin is an
 * order, not a hint, so the layers are concatenated rather than merged — the first
 * mention of a pool wins its place.
 *
 * Pure, and in core, because "which two does a paladin want on screen" is a
 * reading of the resolved character rather than a layout decision.
 */

import type { ResolvedCharacter, ResolvedResource } from "./resolved";

export interface PinnedSlot {
  /** Pool target for the event log: "resources.srd:paladin:rages", "slots.3", "pact". */
  target: string;
  name: string;
  remaining: number;
  max: number;
  /** "d6" for Bardic Inspiration; absent for a plain count. */
  die?: string;
  /** Present when the slot came from a resource, for its text and source line. */
  resource?: ResolvedResource;
  /** Why it is here, for the hover line. */
  reason: "pinned" | "weighted" | "fallback";
}

/**
 * Short rests come back often enough that their pools are what a player reaches
 * for mid-fight; a long-rest pool of one use is the other thing worth seeing.
 * Content that disagrees says so with a `pin` weight.
 */
function weightOf(resource: ResolvedResource): number {
  if (resource.pin !== undefined) return resource.pin;
  let weight = 0;
  if (resource.recharge === "short-rest") weight += 3;
  if (resource.recharge === "long-rest") weight += 1;
  // A pool of two or three uses reads as pips and is spent by hand; a pool of
  // sixty hit points is a number you look up rather than watch.
  if (resource.max > 0 && resource.max <= 6) weight += 2;
  if (resource.max > 20) weight -= 2;
  return weight;
}

/** Normalises what a pin can name: a resource key, its bare id, or a pool target. */
function matches(resource: ResolvedResource, pin: string): boolean {
  return pin === resource.key || pin === `resources.${resource.key}` || pin === resource.id;
}

export function choosePins(
  character: ResolvedCharacter,
  layers: { character?: string[]; plugin?: string[] } = {},
  count = 2,
): PinnedSlot[] {
  const slots: PinnedSlot[] = [];
  const taken = new Set<string>();

  const push = (slot: PinnedSlot): void => {
    if (taken.has(slot.target) || slots.length >= count) return;
    taken.add(slot.target);
    slots.push(slot);
  };

  const fromResource = (resource: ResolvedResource, reason: PinnedSlot["reason"]): PinnedSlot => ({
    target: `resources.${resource.key}`,
    name: resource.name,
    remaining: resource.remaining,
    max: resource.max,
    die: resource.die,
    resource,
    reason,
  });

  // 1 and 2: explicit pins, the character's before the plugin's.
  for (const pin of [...(layers.character ?? []), ...(layers.plugin ?? [])]) {
    const resource = character.resources.find((r) => matches(r, pin));
    if (resource) push(fromResource(resource, "pinned"));
    else {
      const pool = poolFor(character, pin);
      if (pool) push({ ...pool, reason: "pinned" });
    }
  }

  // 3: the content's own weighting, strongest first.
  const weighted = character.resources
    .filter((r) => r.max > 0)
    .map((r) => ({ resource: r, weight: weightOf(r) }))
    .sort((a, b) => b.weight - a.weight || a.resource.name.localeCompare(b.resource.name));
  for (const { resource, weight } of weighted) if (weight > 0) push(fromResource(resource, "weighted"));

  // The fallback: a caster with nothing else to show watches its slots. Pact
  // magic first, since a warlock has little else, then the highest level that
  // still has slots in it.
  if (slots.length < count) {
    const casting = character.spellcasting;
    if (casting?.pact)
      push({
        target: "pact",
        name: `Pact magic ${casting.pact.level}`,
        remaining: casting.pact.remaining,
        max: casting.pact.max,
        reason: "fallback",
      });
    const highest = [...(casting?.slots ?? [])].filter((s) => s.max > 0).sort((a, b) => b.level - a.level)[0];
    if (highest)
      push({
        target: `slots.${highest.level}`,
        name: `Level ${highest.level} slots`,
        remaining: highest.remaining,
        max: highest.max,
        reason: "fallback",
      });
  }

  // Anything left over, even a long list of points: better a quiet count than an
  // empty slot.
  for (const { resource } of weighted) push(fromResource(resource, "fallback"));

  return slots;
}

function poolFor(character: ResolvedCharacter, pin: string): Omit<PinnedSlot, "reason"> | undefined {
  const casting = character.spellcasting;
  if (!casting) return undefined;
  if (pin === "pact" && casting.pact)
    return {
      target: "pact",
      name: `Pact magic ${casting.pact.level}`,
      remaining: casting.pact.remaining,
      max: casting.pact.max,
    };
  const level = pin.match(/^slots\.(\d+)$/);
  const slot = level ? casting.slots.find((s) => s.level === Number(level[1])) : undefined;
  return slot
    ? { target: `slots.${slot.level}`, name: `Level ${slot.level} slots`, remaining: slot.remaining, max: slot.max }
    : undefined;
}
