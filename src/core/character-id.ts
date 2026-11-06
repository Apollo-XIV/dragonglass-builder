/** A character's id: made once, kept in its sheet.5e, and never derived from its folder. */
export function newCharacterId(): string {
  return globalThis.crypto.randomUUID();
}
