'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { STATUS_DOKUMEN } from '@/lib/dokumenPendukung';

const FILTER = [
  { key: 'menunggu', label: '⏳ Menunggu' },
  { key: 'ditolak', label: '❌ Ditolak' },
  { key: 'diverifikasi', label: '✅ Terverifikasi' },
  { key: 'semua', label: 'Semua' },
];

// Verifikasi dokumen pendukung jamaah (scan paspor/KK/KTP/vaksin/pas foto),
// dikonfirmasi user 2026-10-01. Jamaah unggah/ganti -> 'menunggu'; di sini
// admin ACC atau tolak (+alasan, jamaah dapat notifikasi buat unggah ulang).
export default function AdminDokumenPendukungPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [filter, setFilter] = useState('menunggu');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  function muat() {
    setLoading(true);
    fetch(`/api/admin/dokumen-pendukung?status=${filter}`).then(r => r.json())
      .then(d => { setItems(d.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);

  async function aksi(it, status) {
    let alasan = '';
    if (status === 'ditolak') {
      alasan = prompt(`Alasan menolak ${it.label} — ${it.nama_jamaah}:`);
      if (alasan === null) return;
      if (!alasan.trim()) { alert('Alasan penolakan wajib diisi.'); return; }
    }
    const id = `${it.booking_id}:${it.idx}:${it.doc_key}`;
    setBusy(id);
    try {
      const res = await fetch('/api/admin/dokumen-pendukung', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: it.booking_id, idx: it.idx, doc_key: it.doc_key, path: it.path, status, alasan }),
      });
      const d = await res.json();
      if (!res.ok) alert(d.error || 'Gagal menyimpan');
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(null);
  }

  return (
    <Layout title="📎 Verifikasi Dokumen Pendukung">
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTER.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full ${filter === f.key ? 'bg-[#1A4FA0] text-white' : 'bg-white border border-[#e0e8f0] text-gray-600'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-400 py-10">Tidak ada dokumen di kategori ini.</div>
      ) : (
        <div className="space-y-2">
          {items.map(it => {
            const id = `${it.booking_id}:${it.idx}:${it.doc_key}`;
            const info = STATUS_DOKUMEN[it.status];
            return (
              <div key={id} className="bg-white rounded-xl border border-[#e0e8f0] p-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#0E2F6E]">{it.label} — {it.nama_jamaah}</div>
                  <div className="text-xs text-gray-500 truncate">{it.prog_name} · Pemesan: {it.pemesan || '-'} · Booking {it.booking_id}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {info && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.cls}`}>{info.ikon} {info.label}</span>}
                    {it.oleh && <span className="text-[10px] text-gray-400">oleh {it.oleh}{it.pada ? ` · ${new Date(it.pada).toLocaleString('id-ID')}` : ''}</span>}
                  </div>
                  {it.status === 'ditolak' && it.alasan && <div className="text-[11px] text-red-600 mt-1">Alasan: {it.alasan}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a href={it.path} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-3 py-1.5 rounded-full">Lihat</a>
                  {it.status !== 'diverifikasi' && (
                    <button disabled={busy === id} onClick={() => aksi(it, 'diverifikasi')}
                      className="text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-full disabled:opacity-50">✅ Verifikasi</button>
                  )}
                  {it.status !== 'ditolak' && (
                    <button disabled={busy === id} onClick={() => aksi(it, 'ditolak')}
                      className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-full disabled:opacity-50">❌ Tolak</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
