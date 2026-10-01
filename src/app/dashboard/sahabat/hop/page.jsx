'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useIsHop } from '@/lib/useIsHop';

const STATUS_AKUN = {
  active: { label: 'Aktif', cls: 'bg-green-100 text-green-700' },
  pending: { label: 'Dalam proses', cls: 'bg-yellow-100 text-yellow-700' },
  nonaktif: { label: 'Nonaktif', cls: 'bg-gray-200 text-gray-500' },
};
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

// Dashboard Head of Program Sahabat (dikonfirmasi user 2026-10-01):
//  - cari sahabat;
//  - total sahabat & jumlah relasi Gen1-Gen5 tiap sahabat (ANGKA SAJA — gak
//    ada no. telepon/NIK/rekening/saldo di sini);
//  - bantu cek data bermasalah: tandai + catatan -> admin yang verifikasi;
//  - gak ada log aktivitas (cuma report).
// Admin/super_admin juga bisa buka (lihat saja, tombol tandai khusus HoP).
export default function DashboardHopPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const { isHop, checked } = useIsHop(user);
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [laporan, setLaporan] = useState([]);
  const [tandai, setTandai] = useState(null); // sahabat yang sedang ditandai
  const [catatan, setCatatan] = useState('');
  const [mengirim, setMengirim] = useState(false);

  const boleh = isAdmin || isHop;

  useEffect(() => {
    if (!user) return;
    if (!isAdmin && checked && !isHop) router.replace('/dashboard/sahabat');
  }, [user, isAdmin, isHop, checked, router]);

  function muatLaporan() {
    fetch('/api/hop/laporan').then(r => r.json()).then(d => setLaporan(d.laporan || [])).catch(() => {});
  }

  // Pencarian didebounce 300ms.
  useEffect(() => {
    if (!boleh) return;
    const t = setTimeout(() => {
      fetch(`/api/hop/sahabat?q=${encodeURIComponent(q)}`).then(r => r.json())
        .then(d => setData(d.items ? d : { ringkasan: null, items: [] }))
        .catch(() => setData({ ringkasan: null, items: [] }));
    }, 300);
    return () => clearTimeout(t);
  }, [q, boleh]);

  useEffect(() => { if (boleh) muatLaporan(); }, [boleh]);

  async function kirimLaporan() {
    if (catatan.trim().length < 5) { alert('Jelaskan data apa yang bermasalah (minimal 5 karakter).'); return; }
    setMengirim(true);
    try {
      const res = await fetch('/api/hop/laporan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sahabat_id: tandai.id, catatan }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal mengirim laporan'); setMengirim(false); return; }
      setTandai(null); setCatatan('');
      setData(prev => prev && ({
        ...prev,
        ringkasan: prev.ringkasan && { ...prev.ringkasan, laporan_terbuka: prev.ringkasan.laporan_terbuka + 1 },
        items: prev.items.map(s => s.id === tandai.id ? { ...s, laporan_terbuka: s.laporan_terbuka + 1 } : s),
      }));
      muatLaporan();
    } catch { alert('Terjadi kesalahan'); }
    setMengirim(false);
  }

  if (!user || (!isAdmin && !checked)) {
    return <Layout title="📊 Dashboard Head of Program"><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;
  }

  const r = data?.ringkasan;
  return (
    <Layout title="📊 Dashboard Head of Program">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Sahabat aktif', val: r?.total_sahabat_aktif, cls: 'text-green-700' },
            { label: 'Dalam proses', val: r?.total_dalam_proses, cls: 'text-yellow-700' },
            { label: 'Laporan terbuka', val: r?.laporan_terbuka, cls: 'text-red-600' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-[#e0e8f0] p-3 text-center">
              <div className={`text-2xl font-black ${k.cls}`}>{k.val ?? '–'}</div>
              <div className="text-[11px] text-gray-500">{k.label}</div>
            </div>
          ))}
        </div>

        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Cari nama atau kode sahabat..."
          className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />

        <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#E8F0FB] text-[#0E2F6E] text-xs">
              <tr>
                <th className="text-left px-3 py-2">Sahabat</th>
                {[1, 2, 3, 4, 5].map(g => <th key={g} className="px-2 py-2 text-center">Gen{g}</th>)}
                <th className="px-2 py-2 text-center">Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-8">Memuat...</td></tr>
              ) : data.items.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-8">{q ? 'Tidak ada sahabat yang cocok.' : 'Belum ada sahabat.'}</td></tr>
              ) : data.items.map((s, i) => {
                const st = STATUS_AKUN[s.status] || { label: s.status, cls: 'bg-gray-100 text-gray-500' };
                return (
                  <tr key={s.id} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="px-3 py-2 min-w-[160px]">
                      <div className="font-semibold text-[#0E2F6E]">{s.name}</div>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-gray-400">{s.kode_unik || '-'}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                        {s.laporan_terbuka > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">⚠️ {s.laporan_terbuka} laporan</span>}
                      </div>
                    </td>
                    {s.gen.map((n, g) => <td key={g} className={`px-2 py-2 text-center ${n ? 'font-bold text-[#0E2F6E]' : 'text-gray-300'}`}>{n}</td>)}
                    <td className="px-2 py-2 text-center font-black text-[#0E2F6E]">{s.total}</td>
                    <td className="px-3 py-2 text-right">
                      {isHop && (
                        <button onClick={() => { setTandai(s); setCatatan(''); }}
                          className="text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                          ⚠️ Tandai
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-gray-400">
          Relasi = sahabat <b>aktif</b> di bawahnya (sudah bayar registrasi &amp; di-ACC). Gen1 = diajak langsung. Gen6 dst. tidak dihitung (di luar batas ujroh).
        </div>

        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
          <div className="font-bold text-[#0E2F6E] text-sm mb-2">⚠️ Laporan Data Bermasalah</div>
          {laporan.length === 0 ? (
            <div className="text-xs text-gray-400">Belum ada laporan.</div>
          ) : (
            <div className="space-y-2">
              {laporan.map(l => (
                <div key={l.id} className="border border-gray-100 rounded-lg p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#0E2F6E]">{l.sahabat_nama || '-'} <span className="text-gray-400 font-normal">{l.sahabat_kode || ''}</span></span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${l.status === 'selesai' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {l.status === 'selesai' ? '✅ Selesai' : '⏳ Menunggu admin'}
                    </span>
                  </div>
                  <div className="text-gray-600 mt-1 whitespace-pre-wrap">{l.catatan}</div>
                  <div className="text-[10px] text-gray-400 mt-1">Dilaporkan {tgl(l.created_at)}</div>
                  {l.status === 'selesai' && (
                    <div className="mt-1.5 bg-green-50 rounded p-2 text-green-700">
                      <b>Tindak lanjut admin{l.ditangani_oleh_nama ? ` (${l.ditangani_oleh_nama})` : ''}:</b> {l.catatan_admin} · {tgl(l.selesai_at)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {tandai && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !mengirim && setTandai(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-[#0E2F6E]">⚠️ Tandai Data Bermasalah</div>
            <div className="text-xs text-gray-500 mt-0.5 mb-3">{tandai.name} ({tandai.kode_unik || '-'}) — laporan dikirim ke admin untuk diverifikasi. Data sahabat tidak berubah.</div>
            <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={4} maxLength={1000}
              placeholder="Jelaskan data apa yang bermasalah, mis. 'No. rekening tabungan umroh tidak sesuai buku tabungan'"
              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setTandai(null)} disabled={mengirim} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-full text-sm">Batal</button>
              <button onClick={kirimLaporan} disabled={mengirim} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-full text-sm disabled:opacity-50">
                {mengirim ? 'Mengirim...' : 'Kirim ke Admin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
