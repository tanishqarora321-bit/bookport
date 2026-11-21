// Security headers on every response (security audit 2026-11). The CSP
// allows only this site's own scripts/styles (Next.js needs inline
// bootstrap scripts, hence 'unsafe-inline') and network calls to Supabase;
// frame-ancestors 'none' stops other sites embedding Ship-Sphere to trick
// clicks (clickjacking).
const supabaseOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").origin; } catch { return ""; }
})();
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^http/, "ws")}`.trim(),
  `frame-src 'self' blob: ${supabaseOrigin}`.trim(),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // booking PDFs are small but leave headroom
    // The Invoice, Fumigation Certificate, Certificate of Origin and Set of
    // Documents are built on the owner's real PDFs + fonts, read from disk at runtime -
    // ship them with those routes.
    outputFileTracingIncludes: {
      "/api/tracking/[id]/fumigation-certificate": ["./lib/pdf/assets/**/*"],
      "/api/tracking/[id]/certificate-of-origin": ["./lib/pdf/assets/**/*"],
      "/api/tracking/[id]/set-of-documents": ["./lib/pdf/assets/**/*"],
      "/api/tracking/[id]/documents": ["./lib/pdf/assets/**/*"],
    },
  },
};

module.exports = nextConfig;
