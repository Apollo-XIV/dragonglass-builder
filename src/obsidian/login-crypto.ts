/**
 * Seals the GitHub login with a password the user types, so what sits in secret storage
 * (a store every installed plugin can read) is useless without it. PBKDF2 stretches the password
 * into an AES-GCM key; GCM's tag is what tells a wrong password from a damaged blob.
 * This slows guessing, it does not stop it: the password has to be worth guessing.
 */

const VERSION = "v1";
/** OWASP's figure for PBKDF2-HMAC-SHA256. Stored in the blob, so it can be raised later. */
export const PBKDF2_ITERATIONS = 600_000;

export class WrongPasswordError extends Error {
  constructor() {
    super("Wrong password");
  }
}

const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function keyFor(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** `v1.<iterations>.<salt>.<iv>.<ciphertext>`, each part base64. Fresh salt and iv every time. */
export async function sealToken(token: string, password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt, iterations);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token)));
  return [VERSION, iterations, b64(salt), b64(iv), b64(sealed)].join(".");
}

export async function openToken(blob: string, password: string): Promise<string> {
  const [version, iterations, salt, iv, sealed] = blob.split(".");
  if (version !== VERSION || !iterations || !salt || !iv || !sealed) throw new Error("The saved GitHub login is unreadable; forget it and sign in again");
  try {
    const key = await keyFor(password, unb64(salt), Number(iterations));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(sealed)));
  } catch {
    throw new WrongPasswordError();
  }
}
