'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { STATUS_DOKUMEN } from '@/lib/dokumenPendukung';

const FILTER = [
  { key: 'menunggu', label: '⏳ Menunggu' },
  { key: 'ditolak', label: '❌ Ditolak' },
  { key: 'diverifikasi', label: '✅ Terverifikasi' },
  { key: 'semua', label: 'Semua' },
];

const kunciJamaah = (it) => `${it.booking_id}:${it.idx}`;
// Warna kartu per status (dikonfirmasi user 2026-10-12): hijau terverifikasi,
// kuning menunggu, merah ditolak.
const WARNA_KARTU = {
  diverifikasi: 'border-green-300 bg-green-50',
  menunggu: 'border-amber-300 bg-amber-50',
  ditolak: 'border-red-300 bg-red-50',
};
// Kartu jamaah (level 1) ikut status yang paling butuh perhatian: ada yang
// ditolak -> merah, ada yang menunggu -> kuning, semua beres -> hijau.
const statusJamaah = (docs) => docs.some(d => d.status === 'ditolak') ? 'ditolak'
  : docs.some(d => d.status === 'menunggu') ? 'menunggu' : 'diverifikasi';
const isGambar = (path) => /\.(jpe?g|png|webp|gif)$/i.test(path || '');

// Verifikasi dokumen pendukung jamaah (scan paspor/KK/KTP/vaksin/pas foto),
// dikonfirmasi user 2026-10-01. Jamaah unggah/ganti -> 'menunggu'; di sini
// admin ACC atau tolak (+alasan, jamaah dapat notifikasi buat unggah ulang).
//
// 2 level (dikonfirmasi user 2026-10-12): dulu daftar datar per DOKUMEN, jadi
// 1 jamaah bisa muncul 5 baris terpisah. Sekarang daftar per JAMAAH dulu
// (yang punya dokumen sesuai filter), klik -> semua dokumen jamaah itu.
// Data tetap 1x fetch status=semua, dikelompokkan di sini.
//
// useSearchParams() WAJIB dibungkus <Suspense> buat `next build` (dikonfirmasi
// user 2026-10-15) -- tanpa ini lolos di `next dev` tapi gagal total pas
// production build ("should be wrapped in a suspense boundary"), sempat
// bikin deploy ke main gagal. Pola sama persis admin/page.jsx &
// dashboard/sahabat/riwayat/page.jsx.
export default function AdminDokumenPendukungPage() {
  return (
    <Suspense fallback={<Layout title="📎 Verifikasi Dokumen Pendukung"><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>}>
      <AdminDokumenPendukungContent />
    </Suspense>
  );
}

function AdminDokumenPendukungContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user] = useCurrentUser();
  // Deep-link dari kartu booking di Kelola Program (dikonfirmasi user
  // 2026-10-15, "nempel di masing-masing programnya") — ?booking_id=xxx
  // isi awal `cari` (booking_id ikut dicocokkan di filter pencarian yang
  // udah ada di bawah) + default filter 'semua' biar yang udah diverifikasi/
  // ditolak ikut kebaca, gak kepotong default 'menunggu'. Lazy initializer
  // (bukan useEffect+setState) biar gak kena cascading-render lint error.
  const bookingIdDeepLink = searchParams.get('booking_id') || '';
  const [filter, setFilter] = useState(() => bookingIdDeepLink ? 'semua' : 'menunggu');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [cari, setCari] = useState(() => bookingIdDeepLink);
  const [pilih, setPilih] = useState(null); // kunciJamaah yang lagi dibuka

  function muat() {
    return fetch('/api/admin/dokumen-pendukung?status=semua').then(r => r.json())
      .then(d => { setItems(d.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function aksi(it, status, { tanpaReload = false } = {}) {
    let alasan = '';
    if (status === 'ditolak') {
      alasan = prompt(`Alasan menolak ${it.label} — ${it.nama_jamaah}:`);
      if (alasan === null) return false;
      if (!alasan.trim()) { alert('Alasan penolakan wajib diisi.'); return false; }
    }
    const id = `${kunciJamaah(it)}:${it.doc_key}`;
    setBusy(id);
    try {
      const res = await fetch('/api/admin/dokumen-pendukung', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: it.booking_id, idx: it.idx, doc_key: it.doc_key, path: it.path, status, alasan }),
      });
      const d = await res.json();
      if (!res.ok) { alert(`${it.label}: ${d.error || 'Gagal menyimpan'}`); return false; }
      return true;
    } catch { alert('Terjadi kesalahan'); return false; }
    finally {
      setBusy(null);
      if (!tanpaReload) await muat();
    }
  }

  async function verifikasiSemua(docs) {
    const belum = docs.filter(d => d.status === 'menunggu');
    if (belum.length === 0) return;
    if (!confirm(`Verifikasi ${belum.length} dokumen yang menunggu milik ${belum[0].nama_jamaah}?`)) return;
    setBusy('semua');
    for (const d of belum) await aksi(d, 'diverifikasi', { tanpaReload: true });
    await muat();
    setBusy(null);
  }

  // Kelompokkan per jamaah (booking + index jamaah di booking itu).
  const grupMap = new Map();
  for (const it of items) {
    const k = kunciJamaah(it);
    if (!grupMap.has(k)) grupMap.set(k, { kunci: k, ...it, docs: [] });
    grupMap.get(k).docs.push(it);
  }
  const semuaGrup = [...grupMap.values()];
  const q = cari.trim().toLowerCase();
  const grupTampil = semuaGrup
    .filter(g => filter === 'semua' || g.docs.some(d => d.status === filter))
    .filter(g => !q || [g.nama_jamaah, g.pemesan, g.booking_id, g.prog_name].some(v => String(v || '').toLowerCase().includes(q)));
  const hitung = (g, st) => g.docs.filter(d => d.status === st).length;
  const terpilih = pilih ? grupMap.get(pilih) : null;

  return (
    <Layout title="📎 Verifikasi Dokumen Pendukung">
      {terpilih ? (
        <div className="space-y-3">
          <button onClick={() => setPilih(null)} className="text-sm font-bold text-[#1A4FA0] hover:underline">← Kembali ke daftar jamaah</button>
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[#0E2F6E]">{terpilih.nama_jamaah}</div>
              <div className="text-xs text-gray-500">{terpilih.prog_name} · Pemesan: {terpilih.pemesan || '-'} · Booking {terpilih.booking_id}</div>
            </div>
            {hitung(terpilih, 'menunggu') > 0 && (
              <button disabled={!!busy} onClick={() => verifikasiSemua(terpilih.docs)}
                className="text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-4 py-2 rounded-full disabled:opacity-50 whitespace-nowrap">
                {busy === 'semua' ? 'Memproses...' : `✅ Verifikasi Semua yang Menunggu (${hitung(terpilih, 'menunggu')})`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {terpilih.docs.map(it => {
              const id = `${kunciJamaah(it)}:${it.doc_key}`;
              const info = STATUS_DOKUMEN[it.status];
              return (
                <div key={id} className={`rounded-xl border-2 p-3 space-y-2 ${WARNA_KARTU[it.status] || 'bg-white border-[#e0e8f0]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-bold text-[#0E2F6E]">{it.label}</div>
                    {info && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${info.cls}`}>{info.ikon} {info.label}</span>}
                  </div>
                  {isGambar(it.path) && (
                    <a href={it.path} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.path} alt={it.label} className="w-full h-40 object-contain bg-white rounded-lg border border-gray-100" />
                    </a>
                  )}
                  {it.oleh && <div className="text-[10px] text-gray-400">oleh {it.oleh}{it.pada ? ` · ${new Date(it.pada).toLocaleString('id-ID')}` : ''}</div>}
                  {it.status === 'ditolak' && it.alasan && <div className="text-[11px] text-red-600">Alasan: {it.alasan}</div>}
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={it.path} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-3 py-1.5 rounded-full">Lihat</a>
                    {it.status !== 'diverifikasi' && (
                      <button disabled={!!busy} onClick={() => aksi(it, 'diverifikasi')}
                        className="text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-full disabled:opacity-50">✅ Verifikasi</button>
                    )}
                    {it.status !== 'ditolak' && (
                      <button disabled={!!busy} onClick={() => aksi(it, 'ditolak')}
                        className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-full disabled:opacity-50">❌ Tolak</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="flex flex-wrap gap-2">
              {FILTER.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full ${filter === f.key ? 'bg-[#1A4FA0] text-white' : 'bg-white border border-[#e0e8f0] text-gray-600'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <input value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama jamaah, pemesan, booking, program..."
              className="flex-1 px-3 py-1.5 rounded-full border border-[#e0e8f0] focus:border-[#1A4FA0] focus:outline-none text-sm" />
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-10">Memuat...</div>
          ) : grupTampil.length === 0 ? (
            <div className="text-center text-gray-400 py-10">Tidak ada jamaah di kategori ini.</div>
          ) : (
            <div className="space-y-2">
              {grupTampil.map(g => {
                const nMenunggu = hitung(g, 'menunggu');
                const nDitolak = hitung(g, 'ditolak');
                const nOk = hitung(g, 'diverifikasi');
                return (
                  <div key={g.kunci} onClick={() => setPilih(g.kunci)}
                    className={`rounded-xl border-2 p-3 flex flex-col md:flex-row md:items-center gap-2 cursor-pointer hover:brightness-95 transition ${WARNA_KARTU[statusJamaah(g.docs)]}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[#0E2F6E]">{g.nama_jamaah}</div>
                      <div className="text-xs text-gray-500 truncate">{g.prog_name} · Pemesan: {g.pemesan || '-'} · Booking {g.booking_id}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {nMenunggu > 0 && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_DOKUMEN.menunggu.cls}`}>⏳ {nMenunggu} menunggu</span>}
                      {nDitolak > 0 && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_DOKUMEN.ditolak.cls}`}>❌ {nDitolak} ditolak</span>}
                      {nOk > 0 && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_DOKUMEN.diverifikasi.cls}`}>✅ {nOk} terverifikasi</span>}
                      <span className="text-xs font-bold text-[#1A4FA0] ml-1">Buka →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
