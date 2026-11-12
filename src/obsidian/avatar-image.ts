/**
 * Avatar images: what counts as one, and fitting one to a size. The vault stores
 * the original picture or a sensible copy of it; an export carries a smaller one
 * still, because it travels inside a JSON file.
 *
 * Resizing needs a canvas, so it only works in the webview. Anywhere else (the
 * tests) `fitImage` hands the bytes back untouched.
 */

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

/** The longest side of a picture saved into the character's folder. */
export const STORED_MAX_PX = 1024;
/** The longest side, and the encoded size, of a picture carried in an export. */
export const EXPORT_MAX_PX = 512;
export const EXPORT_MAX_BYTES = 512 * 1024;

export function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(path));
}

export function mimeOf(path: string): string | undefined {
  return MIME[extensionOf(path)];
}

/** The size that fits `width` × `height` inside a `max` square, never enlarging. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface FittedImage {
  mime: string;
  bytes: ArrayBuffer;
  /** The extension that matches `mime`. */
  ext: string;
}

/**
 * Shrinks a raster picture to fit `maxPx`, re-encoding as WebP. A picture already
 * small enough, an SVG or a GIF (which would lose its frames) comes back as it was.
 */
export async function fitImage(bytes: ArrayBuffer, mime: string, maxPx: number): Promise<FittedImage> {
  const original: FittedImage = { mime, bytes, ext: Object.keys(MIME).find((k) => MIME[k] === mime) ?? "png" };
  if (mime === "image/svg+xml" || mime === "image/gif") return original;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return original;
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    const size = fitWithin(bitmap.width, bitmap.height, maxPx);
    if (size.width === bitmap.width && size.height === bitmap.height) {
      bitmap.close();
      return original;
    }
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
    if (!blob) return original;
    return { mime: "image/webp", bytes: await blob.arrayBuffer(), ext: "webp" };
  } catch {
    return original;
  }
}

export function toDataUrl(mime: string, bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}
