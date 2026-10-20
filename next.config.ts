import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['mysql2'],
  async redirects() {
    return [
      // Halaman "Program Kalkulator Biaya" diganti nama jadi "Costing Program"
      // — link/bookmark lama tetap kepandu ke URL barunya.
      { source: '/admin/program-kalkulator-biaya', destination: '/admin/program-costing', permanent: true },
    ];
  },
  async rewrites() {
    // Hanya untuk `next dev` lokal tanpa Caddy: /api/* yang tidak punya route Next.js dilayani
    // jm-travel-api (Go). Di dev/prod GO_API_URL tidak di-set — Caddy yang membagi (Caddyfile.tahap2).
    const go = process.env.GO_API_URL;
    if (!go) return [];
    return { beforeFiles: [], afterFiles: [], fallback: [{ source: '/api/:path*', destination: `${go.replace(/\/$/, '')}/api/:path*` }] };
  },
};

export default nextConfig;