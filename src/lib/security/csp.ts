// Content-Security-Policy and static security headers (SECURITY.md › Security decisions).

export function buildCsp({ nonce, supabaseUrl, dev }: { nonce: string; supabaseUrl: string; dev: boolean }): string {
  const sb = new URL(supabaseUrl);
  const http = `${sb.protocol}//${sb.host}`;
  const ws = `${sb.protocol === "https:" ? "wss:" : "ws:"}//${sb.host}`;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // React sets style attributes, which cannot carry a nonce.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Designs are previewed from blob: URLs and opened through short-lived signed storage URLs.
    "img-src": ["'self'", "data:", "blob:", http],
    "font-src": ["'self'"],
    "connect-src": ["'self'", http, ws, ...(dev ? ["ws:"] : [])],
    "frame-src": ["blob:", http],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function staticSecurityHeaders(): { key: string; value: string }[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ];
}
