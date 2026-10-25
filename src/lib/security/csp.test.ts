import { describe, expect, it } from "vitest";
import { buildCsp, staticSecurityHeaders } from "./csp";

const parse = (csp: string) => Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

describe("security headers", () => {
  const prod = parse(buildCsp({ nonce: "n0", supabaseUrl: "https://abc.supabase.co", dev: false }));

  it("locks scripts to self + nonce without unsafe-eval in production", () => {
    expect(prod["script-src"]).toEqual(expect.arrayContaining(["'self'", "'nonce-n0'", "'strict-dynamic'"]));
    expect(prod["script-src"]).not.toContain("'unsafe-eval'");
    expect(prod["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("only talks to Supabase", () => {
    expect(prod["connect-src"]).toEqual(["'self'", "https://abc.supabase.co", "wss://abc.supabase.co"]);
  });

  it("forbids framing and plugins", () => {
    expect(prod["frame-ancestors"]).toEqual(["'none'"]);
    expect(prod["object-src"]).toEqual(["'none'"]);
  });

  it("sets the static headers", () => {
    const h = Object.fromEntries(staticSecurityHeaders().map((x) => [x.key, x.value]));
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
  });
});
