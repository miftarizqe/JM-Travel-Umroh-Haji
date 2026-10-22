import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Halaman "Program Kalkulator Biaya" diganti nama jadi "Costing Program"
      // — link/bookmark lama tetap kepandu ke URL barunya.
      { source: '/admin/program-kalkulator-biaya', destination: '/admin/program-costing', permanent: true },
    ];
  },
  async rewrites() {
    // Repo ini FE saja — backend ada di repo jm-travel-api. Di dev/prod Caddy yang mengirim
    // /api/*, /uploads/* & /healthz ke backend; API_URL TIDAK di-set di sana. Untuk `next dev`
    // di laptop, set API_URL (mis. http://localhost:3001, backend lokal) supaya fetch('/api/...')
    // dari halaman diteruskan ke backend.
    const api = process.env.API_URL?.replace(/\/$/, '');
    if (!api) return [];
    return [
      { source: '/api/:path*', destination: `${api}/api/:path*` },
      { source: '/uploads/:path*', destination: `${api}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
