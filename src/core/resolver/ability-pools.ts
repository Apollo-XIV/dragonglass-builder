/**
 * Diagnostics for a build's rolled pools and the chips its abilities were assigned from.
 * Hand-edited files can name a pool that is gone, a slot that does not exist, or one chip
 * twice. The builder already ignores such a chip; this says so, and the scores still resolve
 * from `abilities.base`, which is the only thing the resolver reads.
 */

import { ABILITIES, type BuildAbilities, type Diagnostic } from "../types";

const POOL_SIZE = 6;
const STANDARD_POOL = "standard";

export function abilityPoolDiagnostics(abilities: BuildAbilities | undefined): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (!abilities) return out;
  const warn = (path: string, message: string): void => {
    out.push({ severity: "warning", code: "ability-pool-invalid", message, path });
  };

  const known = new Map<string, readonly (number | null)[]>();
  (abilities.pools ?? []).forEach((pool, i) => {
    const at = `abilities.pools[${i}]`;
    if (typeof pool?.id !== "string" || pool.id === "" || pool.id.includes(":")) {
      warn(at, `Pool ${i + 1} needs an id without a colon.`);
      return;
    }
    if (pool.id === STANDARD_POOL || known.has(pool.id)) warn(at, `Pool id "${pool.id}" is used twice.`);
    const values = Array.isArray(pool.values) ? pool.values : [];
    if (values.length !== POOL_SIZE) warn(at, `Pool "${pool.id}" has ${values.length} values, not ${POOL_SIZE}.`);
    known.set(pool.id, values);
  });

  const claimed = new Map<string, string>();
  for (const ability of ABILITIES) {
    const chip = abilities.assigned?.[ability];
    if (chip === undefined) continue;
    const at = `abilities.assigned.${ability}`;
    const colon = chip.lastIndexOf(":");
    const pool = chip.slice(0, colon);
    const slot = Number(chip.slice(colon + 1));
    if (colon <= 0 || !Number.isInteger(slot) || slot < 0 || slot >= POOL_SIZE) {
      warn(at, `"${chip}" is not a chip: expected pool:slot with a slot from 0 to ${POOL_SIZE - 1}.`);
      continue;
    }
    // A standard-array chip is always well-formed; only a rolled pool can be missing.
    if (pool !== STANDARD_POOL) {
      const values = known.get(pool);
      if (!values) {
        warn(at, `${ability.toUpperCase()} was assigned from pool "${pool}", which does not exist.`);
        continue;
      }
      if (values[slot] == null) {
        warn(at, `${ability.toUpperCase()} was assigned from "${chip}", which holds no value.`);
        continue;
      }
    }
    const other = claimed.get(chip);
    if (other) warn(at, `${ability.toUpperCase()} and ${other.toUpperCase()} were both assigned from "${chip}".`);
    else claimed.set(chip, ability);
  }
  return out;
}
