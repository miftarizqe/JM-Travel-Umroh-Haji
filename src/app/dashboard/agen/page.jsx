'use client';
import { useEffect, useState } from 'react';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

// Dashboard akun "agen" — SENGAJA cuma 1 kartu, gak ada menu/booking/stat
// apa pun (dikonfirmasi user 2026-10-17). Satu-satunya alasan akun ini bisa
// login adalah buat ambil link referral pribadi mereka.
export default function DashboardAgenPage() {
  const [user] = useCurrentUser();
  const [disalin, setDisalin] = useState(false);
  // Fallback self-heal -- bug nyata 2026-10-19: akun yang kode_unik-nya
  // NULL (mis. dibuat lewat jalur lain selain POST /api/admin/agen, satu-
  // satunya tempat pastikanKodeUnik('agen') sebelumnya dipanggil) nyangkut
  // selamanya di "Memuat..." krn link gak pernah ke-generate. Sekali load,
  // kalau user ada tapi kode_unik kosong, minta server bekukan kodenya
  // sendiri (idempotent, aman dipanggil berkali-kali).
  const [kodeFallback, setKodeFallback] = useState(null);
  useEffect(() => {
    if (!user || user.kode_unik || kodeFallback) return;
    fetch('/api/agen/kode-unik', { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (!d.kode_unik) return;
        setKodeFallback(d.kode_unik);
        try {
          const cached = JSON.parse(localStorage.getItem('user') || '{}');
          localStorage.setItem('user', JSON.stringify({ ...cached, kode_unik: d.kode_unik }));
        } catch {}
      })
      .catch(() => {});
  }, [user, kodeFallback]);

  if (!user) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const kodeUnik = user.kode_unik || kodeFallback;
  const link = typeof window !== 'undefined' && kodeUnik
    ? `${window.location.origin}/a/${kodeUnik}` : '';

  function salin() {
    navigator.clipboard.writeText(link).then(() => { setDisalin(true); setTimeout(() => setDisalin(false), 2000); });
  }

  return (
    <Layout title="🔗 Link Referral Kamu">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl border border-[#e0e8f0] p-6 text-center space-y-3">
          <div className="text-3xl">🔗</div>
          <div className="font-bold text-[#0E2F6E]">Halo, {user.name}</div>
          <p className="text-sm text-gray-500">
            Ini link referral pribadi kamu. Bagikan ke siapa pun — setiap yang booking program lewat link ini otomatis tercatat sebagai bawaan kamu.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-[#1A4FA0] break-all">
            {link || 'Memuat...'}
          </div>
          <button onClick={salin} disabled={!link}
            className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full disabled:opacity-50">
            {disalin ? '✅ Tersalin!' : '📋 Salin Link'}
          </button>
          <div className="text-[10px] text-gray-400">Kode kamu: {kodeUnik || '-'}</div>
        </div>
      </div>
    </Layout>
  );
}
