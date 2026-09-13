'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';

// Index/pemilih program — halaman kelola status pengiriman sendiri ada di
// /admin/perlengkapan-pengiriman/[program] (butuh nama program di URL).
// Sebelumnya cuma bisa diakses lewat reminder "Perlu Perhatian" atau modal
// detail booking — sekarang ada juga link tetap di sidebar (lihat
// src/app/components/Layout.jsx), jadi butuh halaman pemilih ini biar admin
// bisa masuk ke program mana pun tanpa nunggu ada yang nyangkut dulu.
export default function PerlengkapanPengirimanIndex() {
  const router = useRouter();
  const [programs, setPrograms] = useState(null);
  const [pendingCount, setPendingCount] = useState({});

  useEffect(() => {
    fetch('/api/admin/programs').then(r => r.json()).then(d => setPrograms((d.programs || []).filter(p => p.active !== 0)));
    fetch('/api/admin/dashboard').then(r => r.json()).then(d => {
      const map = {};
      for (const it of (d.pending?.perlengkapan || [])) {
        map[it.prog_name] = (map[it.prog_name] || 0) + 1;
      }
      setPendingCount(map);
    }).catch(() => {});
  }, []);

  return (
    <Layout title="🚚 Status Pengiriman Perlengkapan" showBack>
      <p className="text-xs text-gray-400 mb-4">Pilih program buat kelola status pengiriman perlengkapan (koper, ihrom/mukena, dll) per jamaah.</p>
      {programs === null ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : programs.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Belum ada program aktif.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {programs.map(p => (
            <div key={p.id} onClick={() => router.push(`/admin/perlengkapan-pengiriman/${encodeURIComponent(p.name)}`)}
              className="bg-white rounded-xl border border-[#e0e8f0] p-4 cursor-pointer hover:shadow-md transition-shadow flex items-center justify-between">
              <div>
                <div className="font-bold text-[#0E2F6E] text-sm">{p.name}</div>
                <div className="text-xs text-gray-400">{p.type} · {p.durasi} Hari</div>
              </div>
              {pendingCount[p.name] > 0 && (
                <span className="text-xs font-black px-2 py-1 rounded-full bg-red-500 text-white whitespace-nowrap">
                  {pendingCount[p.name]} perlu dikirim
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
