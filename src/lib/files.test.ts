import { describe, expect, it } from "vitest";
import { precheckFile, sniffMime } from "./files";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const pdf = new TextEncoder().encode("%PDF-1.4\n");

describe("files", () => {
  it("detects the real type from magic bytes", () => {
    expect(sniffMime(png)).toBe("image/png");
    expect(sniffMime(jpg)).toBe("image/jpeg");
    expect(sniffMime(pdf)).toBe("application/pdf");
  });

  it("refuses SVG, HTML and executables whatever their name", () => {
    expect(sniffMime(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffMime(new TextEncoder().encode("<!doctype html>"))).toBeNull();
    expect(sniffMime(new Uint8Array([0x4d, 0x5a, 0x90, 0]))).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });

  it("prechecks extension and size before uploading", () => {
    expect(precheckFile({ name: "a.PNG", size: 10 }, 100)).toEqual({ ok: true, mime: "image/png" });
    expect(precheckFile({ name: "a.jpeg", size: 10 }, 100)).toEqual({ ok: true, mime: "image/jpeg" });
    expect(precheckFile({ name: "a.svg", size: 10 }, 100)).toEqual({ ok: false, code: "UNSUPPORTED_FILE" });
    expect(precheckFile({ name: "a.pdf", size: 0 }, 100)).toEqual({ ok: false, code: "EMPTY_FILE" });
    expect(precheckFile({ name: "a.pdf", size: 101 }, 100)).toEqual({ ok: false, code: "FILE_TOO_LARGE" });
  });
});
