/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "10mb" } } // booking PDFs are small but leave headroom
};

module.exports = nextConfig;
