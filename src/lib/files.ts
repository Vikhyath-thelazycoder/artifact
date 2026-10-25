// Submission files (D-006). The extension and the browser's MIME type are only hints: the finalize route
// checks the file's first bytes, and the storage bucket enforces the type list and the 10 MB cap again.

export const ACCEPT = ".png,.jpg,.jpeg,.pdf";
export const MIME_BY_EXT: Record<string, "image/png" | "image/jpeg" | "application/pdf"> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
};
export const STORAGE_EXT: Record<string, "png" | "jpg" | "pdf"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Client-side pre-check so a participant learns at once, before uploading. */
export function precheckFile(f: { name: string; size: number }, maxBytes: number): { ok: true; mime: string } | { ok: false; code: string } {
  const mime = MIME_BY_EXT[extensionOf(f.name)];
  if (!mime) return { ok: false, code: "UNSUPPORTED_FILE" };
  if (f.size <= 0) return { ok: false, code: "EMPTY_FILE" };
  if (f.size > maxBytes) return { ok: false, code: "FILE_TOO_LARGE" };
  return { ok: true, mime };
}

/** The real type from the file's magic bytes, or null. SVG, HTML and executables never match. */
export function sniffMime(bytes: Uint8Array): "image/png" | "image/jpeg" | "application/pdf" | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "application/pdf";
  return null;
}
