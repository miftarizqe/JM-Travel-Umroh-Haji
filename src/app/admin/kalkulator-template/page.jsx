'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Digabung ke tab "🎯 Paket Tematik" di /admin/master-data (dikonfirmasi
// user 2026-08-18, "gausah misah2 tuh kalkulator estimasi publik") — halaman
// ini cuma redirect biar link/bookmark lama tetap kepakai.
export default function KalkulatorTemplateRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/master-data?tab=tematik'); }, [router]);
  return <div className="flex items-center justify-center min-h-screen text-gray-400">Mengalihkan ke Master Data...</div>;
}
