/** @type {import('next').NextConfig} */
const nextConfig = {
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
