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

// Pintasan ke halaman Sahabat Baitullah yang boleh dilihat HoP (baca saja).
const PINTASAN = [
  { icon: '📝', label: 'Pendaftaran', path: '/admin/sahabat' },
  { icon: '🗂️', label: 'Database Anggota', path: '/admin/sahabat/database' },
  { icon: '📜', label: 'Riwayat Closing', path: '/admin/sahabat/riwayat-closing' },
  { icon: '💸', label: 'Pencairan', path: '/admin/sahabat/pencairan' },
  { icon: '🛡️', label: 'Ringkasan Admin', path: '/admin' },
];

// Dashboard Head of Program (HoP = management di bawah admin, role 'hop' —
// dikonfirmasi user 2026-10-03; aturan isi 2026-10-01):
//  - cari sahabat;
//  - total sahabat & jumlah relasi Gen1-Gen5 tiap sahabat (ANGKA SAJA — gak
//    ada no. telepon/NIK/rekening/saldo di sini);
//  - bantu cek data bermasalah: tandai + catatan -> admin yang verifikasi;
//  - gak ada log aktivitas (cuma report).
// Admin/super_admin juga bisa buka (lihat saja, tombol tandai khusus HoP).
export default function DashboardHopPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const { isHop, isAdmin, checked } = useIsHop(user);
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [laporan, setLaporan] = useState([]);
  const [tandai, setTandai] = useState(null); // sahabat yang sedang ditandai
  const [catatan, setCatatan] = useState('');
  const [mengirim, setMengirim] = useState(false);
  const [tersalin, setTersalin] = useState(false);

  const boleh = isAdmin || isHop;

  useEffect(() => {
    if (checked && !boleh) router.replace('/');
  }, [checked, boleh, router]);

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

  const linkRekrut = data?.kode_undangan && typeof window !== 'undefined'
    ? `${window.location.origin}/register?role=sahabat_baitullah&ref=${data.kode_undangan}`
    : '';

  function salinLink() {
    if (!linkRekrut) return;
    navigator.clipboard?.writeText(linkRekrut).then(() => {
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2000);
    }).catch(() => {});
  }

  if (!user || !checked || !boleh) {
    return <Layout><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;
  }

  const r = data?.ringkasan;
  const tombolTandai = (s, cls = '') => isHop && (
    <button onClick={() => { setTandai(s); setCatatan(''); }}
      className={`text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}>
      ⚠️ Tandai
    </button>
  );
  const badge = (s) => {
    const st = STATUS_AKUN[s.status] || { label: s.status, cls: 'bg-gray-100 text-gray-500' };
    return (
      <>
        <span className="text-[10px] text-gray-400">{s.kode_unik || '-'}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
        {s.laporan_terbuka > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">⚠️ {s.laporan_terbuka} laporan</span>}
      </>
    );
  };

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0E2F6E] to-[#1A4FA0] text-white rounded-2xl p-5 md:p-6">
          <div className="text-xs font-semibold opacity-75">🛡️ Head of Program · Management</div>
          <h1 className="text-xl md:text-2xl font-bold mt-1">Halo, {user.name?.split(' ')[0] || 'Head of Program'}</h1>
          <p className="text-sm opacity-80 mt-1">Pengawasan jaringan Jamaah Sahabat Baitullah. Semua data di sini <b>baca saja</b> — perubahan data dilakukan admin.</p>
        </div>

        {/* Ringkasan */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Sahabat aktif', val: r?.total_sahabat_aktif, cls: 'text-green-700', bg: 'bg-green-50' },
            { label: 'Dalam proses', val: r?.total_dalam_proses, cls: 'text-amber-700', bg: 'bg-amber-50' },
            { label: 'Laporan terbuka', val: r?.laporan_terbuka, cls: 'text-red-600', bg: 'bg-red-50' },
          ].map(k => (
            <div key={k.label} className={`${k.bg} rounded-xl p-3 md:p-4`}>
              <div className="text-[11px] md:text-xs text-gray-500">{k.label}</div>
              <div className={`text-2xl font-black ${k.cls}`}>{k.val ?? '–'}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {/* Link rekrut HoP */}
          {isHop && (
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
              <div className="font-bold text-[#0E2F6E] text-sm">🔗 Link Rekrut Sahabat Baru</div>
              <div className="text-[11px] text-gray-400 mt-0.5 mb-2">Pendaftar lewat link ini tercatat di bawah Management (tidak ada ujroh ke atas).</div>
              {linkRekrut ? (
                <div className="flex gap-2">
                  <input readOnly value={linkRekrut} onFocus={e => e.target.select()}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border-2 border-gray-100 bg-gray-50 text-xs text-gray-600" />
                  <button onClick={salinLink}
                    className="shrink-0 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-4 rounded-lg">
                    {tersalin ? '✓ Tersalin' : 'Salin'}
                  </button>
                </div>
              ) : <div className="text-xs text-gray-400">Memuat...</div>}
            </div>
          )}

          {/* Pintasan */}
          <div className={`bg-white rounded-xl border border-[#e0e8f0] p-4 ${isHop ? '' : 'md:col-span-2'}`}>
            <div className="font-bold text-[#0E2F6E] text-sm mb-2">📂 Data Sahabat Baitullah</div>
            <div className="flex flex-wrap gap-2">
              {PINTASAN.map(p => (
                <button key={p.path} onClick={() => router.push(p.path)}
                  className="text-xs font-semibold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d6e4f7] px-3 py-1.5 rounded-full">
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Daftar sahabat + relasi */}
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <div className="font-bold text-[#0E2F6E] text-sm">👥 Sahabat &amp; Jumlah Relasi</div>
              <div className="text-[11px] text-gray-400">Relasi = sahabat <b>aktif</b> di bawahnya, Gen1 (diajak langsung) s/d Gen5.</div>
            </div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Cari nama atau kode..."
              className="w-full sm:w-64 px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
          </div>

          {!data ? (
            <div className="text-center text-gray-400 py-8 text-sm">Memuat...</div>
          ) : data.items.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">{q ? 'Tidak ada sahabat yang cocok.' : 'Belum ada Jamaah Sahabat Baitullah.'}</div>
          ) : (
            <>
              {/* Desktop: tabel */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#E8F0FB] text-[#0E2F6E] text-xs">
                    <tr>
                      <th className="text-left px-3 py-2 rounded-l-lg">Sahabat</th>
                      {[1, 2, 3, 4, 5].map(g => <th key={g} className="px-2 py-2 text-center">Gen{g}</th>)}
                      <th className="px-2 py-2 text-center">Total</th>
                      <th className="px-3 py-2 rounded-r-lg"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map(s => (
                      <tr key={s.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-[#0E2F6E]">{s.name}</div>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">{badge(s)}</div>
                        </td>
                        {s.gen.map((n, g) => <td key={g} className={`px-2 py-2 text-center ${n ? 'font-bold text-[#0E2F6E]' : 'text-gray-300'}`}>{n}</td>)}
                        <td className="px-2 py-2 text-center font-black text-[#0E2F6E]">{s.total}</td>
                        <td className="px-3 py-2 text-right">{tombolTandai(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* HP: kartu */}
              <div className="md:hidden space-y-2">
                {data.items.map(s => (
                  <div key={s.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-[#0E2F6E] text-sm truncate">{s.name}</div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">{badge(s)}</div>
                      </div>
                      {tombolTandai(s, 'shrink-0')}
                    </div>
                    <div className="grid grid-cols-6 gap-1 mt-2 text-center">
                      {s.gen.map((n, g) => (
                        <div key={g} className="bg-gray-50 rounded-lg py-1">
                          <div className="text-[9px] text-gray-400">Gen{g + 1}</div>
                          <div className={`text-sm ${n ? 'font-bold text-[#0E2F6E]' : 'text-gray-300'}`}>{n}</div>
                        </div>
                      ))}
                      <div className="bg-[#E8F0FB] rounded-lg py-1">
                        <div className="text-[9px] text-[#1A4FA0]">Total</div>
                        <div className="text-sm font-black text-[#0E2F6E]">{s.total}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Laporan data bermasalah */}
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
          <div className="font-bold text-[#0E2F6E] text-sm">⚠️ Laporan Data Bermasalah</div>
          <div className="text-[11px] text-gray-400 mb-2">Tandai sahabat yang datanya bermasalah — admin yang memverifikasi &amp; memperbaiki.</div>
          {laporan.length === 0 ? (
            <div className="text-xs text-gray-400 py-2">Belum ada laporan.</div>
          ) : (
            <div className="space-y-2">
              {laporan.map(l => (
                <div key={l.id} className="border border-gray-100 rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#0E2F6E] truncate">{l.sahabat_nama || '-'} <span className="text-gray-400 font-normal">{l.sahabat_kode || ''}</span></span>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${l.status === 'selesai' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
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
