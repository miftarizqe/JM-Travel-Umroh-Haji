'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const FILTER = [
  { key: 'terbuka', label: '⏳ Terbuka' },
  { key: 'selesai', label: '✅ Selesai' },
  { key: 'semua', label: 'Semua' },
];
const waktu = (t) => t ? new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

// Antrean "data bermasalah" yang ditandai Head of Program Sahabat
// (dikonfirmasi user 2026-10-01). HoP cuma menandai + catatan; admin yang
// verifikasi, memperbaiki data di halaman Sahabat terkait bila perlu, lalu
// menandai selesai dengan catatan tindak lanjut (HoP dapat notifikasi).
export default function AdminLaporanDataSahabatPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [filter, setFilter] = useState('terbuka');
  const [laporan, setLaporan] = useState(null);
  const [busy, setBusy] = useState(null);

  function muat() {
    setLaporan(null);
    fetch(`/api/admin/sahabat/laporan-data?status=${filter}`).then(r => r.json())
      .then(d => setLaporan(d.laporan || [])).catch(() => setLaporan([]));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);

  async function selesaikan(l) {
    const catatan = prompt(`Tindak lanjut untuk laporan "${l.sahabat_nama}":\n(akan terlihat oleh Head of Program)`);
    if (catatan === null) return;
    if (!catatan.trim()) { alert('Catatan tindak lanjut wajib diisi.'); return; }
    setBusy(l.id);
    try {
      const res = await fetch('/api/admin/sahabat/laporan-data', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: l.id, catatan_admin: catatan }),
      });
      const d = await res.json();
      if (!res.ok) alert(d.error || 'Gagal menyimpan');
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(null);
  }

  return (
    <Layout title="⚠️ Laporan Data dari Head of Program">
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTER.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full ${filter === f.key ? 'bg-[#1A4FA0] text-white' : 'bg-white border border-[#e0e8f0] text-gray-600'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {laporan === null ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : laporan.length === 0 ? (
        <div className="text-center text-gray-400 py-10">Tidak ada laporan di kategori ini.</div>
      ) : (
        <div className="space-y-2">
          {laporan.map(l => (
            <div key={l.id} className="bg-white rounded-xl border border-[#e0e8f0] p-3">
              <div className="flex flex-col md:flex-row md:items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#0E2F6E]">
                    {l.sahabat_nama || '-'} <span className="text-gray-400 font-normal text-xs">{l.sahabat_kode || ''}{l.sahabat_wa ? ` · ${l.sahabat_wa}` : ''}</span>
                  </div>
                  <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{l.catatan}</div>
                  <div className="text-[11px] text-gray-400 mt-1">Dilaporkan {l.dilapor_oleh_nama || '-'} · {waktu(l.created_at)}</div>
                  {l.status === 'selesai' && (
                    <div className="mt-2 bg-green-50 rounded-lg p-2 text-xs text-green-700">
                      <b>Tindak lanjut ({l.ditangani_oleh_nama || '-'}, {waktu(l.selesai_at)}):</b> {l.catatan_admin}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => router.push('/admin/sahabat/database')}
                    className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-3 py-1.5 rounded-full">Buka Database Sahabat</button>
                  {l.status === 'terbuka' && (
                    <button disabled={busy === l.id} onClick={() => selesaikan(l)}
                      className="text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-full disabled:opacity-50">✅ Tandai Selesai</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
