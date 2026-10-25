import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security/csp";

const nextConfig: NextConfig = {
  // `npm run dev` builds into .next-dev so a verification build (.next) never breaks a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders() }];
  },
};

export default nextConfig;
