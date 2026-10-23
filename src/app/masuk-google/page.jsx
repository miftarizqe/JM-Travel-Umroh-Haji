'use client';
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { dashboardPathForRole } from '@/lib/dashboardPath';

// Tujuan /api/auth/google/callback setelah login Google berhasil (cookie sesi udah di-set
// server). Isi cache user dari /api/auth/sesi, lalu arahkan dengan aturan yang sama kayak
// handleLogin di login/page.jsx. Sengaja BUKAN /login: proxy ngelempar user yang udah login
// dari /login ke `/`.
export default function MasukGooglePage() {
  return (
    <Suspense fallback={<Memuat />}>
      <MasukGoogleInner />
    </Suspense>
  );
}

function Memuat() {
  return <div className="flex items-center justify-center min-h-screen text-gray-400">Memproses login Google...</div>;
}

function MasukGoogleInner() {
  const searchParams = useSearchParams();
  useEffect(() => {
    fetch('/api/auth/sesi', { cache: 'no-store' }).then(r => r.json()).then(d => {
      if (!d.aktif || !d.user) {
        window.location.replace('/login?google_error=gagal');
        return;
      }
      try { localStorage.setItem('user', JSON.stringify(d.user)); } catch {}
      const u = d.user;
      const kembali = searchParams.get('kembali');
      const aman = kembali && kembali.startsWith('/') && !kembali.startsWith('//');
      const ditolak = u.status === 'rejected' && u.role === 'sahabat_baitullah';
      const tujuan = ditolak
        ? '/status-pendaftaran-sahabat'
        : u.perlu_perbaikan_akun
        ? '/perbaiki-data-akun'
        : (aman ? kembali : dashboardPathForRole(u.role));
      window.location.replace(tujuan);
    }).catch(() => window.location.replace('/login?google_error=gagal'));
  }, [searchParams]);
  return <Memuat />;
}
