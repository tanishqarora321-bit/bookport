/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // booking PDFs are small but leave headroom
    // The Fumigation Certificate is built on the owner's real certificate
    // PDF + fonts, read from disk at runtime - ship them with that route.
    outputFileTracingIncludes: {
      "/api/tracking/[id]/fumigation-certificate": ["./lib/pdf/assets/**/*"],
    },
  },
};

module.exports = nextConfig;
