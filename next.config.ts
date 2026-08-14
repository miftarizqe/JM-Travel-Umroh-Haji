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
};

export default nextConfig;