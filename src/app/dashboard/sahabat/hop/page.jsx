'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { CollapsibleSection } from '@/app/components/Collapsible';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useIsHop } from '@/lib/useIsHop';

const STATUS_AKUN = {
  // Tiap status warna + ikon beda (dikonfirmasi user 2026-10-16) — sebelumnya
  // 'rejected' gak terdaftar di sini, jatuh ke abu-abu default & susah
  // dibedain dari yang lain.
  active: { label: '✓ Aktif', cls: 'bg-green-100 text-green-700 border border-green-300' },
  pending: { label: '⏳ Dalam proses', cls: 'bg-amber-100 text-amber-700 border border-amber-300' },
  rejected: { label: '✕ Dibatalkan', cls: 'bg-red-100 text-red-700 border border-red-300' },
  nonaktif: { label: '⏸ Nonaktif', cls: 'bg-slate-200 text-slate-600 border border-slate-300' },
};
// Kode agen (SBJMxxxx) baru dijatah pas akun diaktifkan admin — sahabat yang
// masih dalam proses/ditolak memang belum punya, jangan ditampilin "-" polos
// yang kebaca kayak data hilang.
const KodeAgen = ({ s }) => s.kode_unik
  ? <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-[#1A4FA0] border border-blue-200">{s.kode_unik}</span>
  : <span title="Kode agen terbit otomatis saat akun diaktifkan admin"
      className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-dashed border-gray-300 not-italic">
      Belum ada kode
    </span>;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const namaBulan = (kunci) => {
  const [y, m] = kunci.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'short' });
};

// Pintasan ke halaman Sahabat Baitullah yang boleh dilihat HoP (baca saja).
const PINTASAN = [
  { icon: '📝', label: 'Pendaftaran', path: '/admin/sahabat' },
  { icon: '🗂️', label: 'Database Anggota', path: '/admin/sahabat/database' },
  { icon: '📜', label: 'Riwayat Closing', path: '/admin/sahabat/riwayat-closing' },
  { icon: '💰', label: 'Forecast Ujroh', path: '/admin/laporan/ujroh-closing' },
  { icon: '💸', label: 'Pencairan', path: '/admin/sahabat/pencairan' },
  { icon: '🛡️', label: 'Ringkasan Admin', path: '/admin' },
];

const kartu = 'bg-white rounded-xl border border-[#e0e8f0] p-4';
const judul = 'font-bold text-[#0E2F6E] text-sm';

// Dashboard Head of Program (HoP = management di bawah admin, role 'hop' —
// dikonfirmasi user 2026-10-03; aturan isi 2026-10-01):
//  - ringkasan jaringan (KPI, pertumbuhan, kedalaman Gen1-Gen5, top perekrut)
//    — SENGAJA gak nge-list semua sahabat (dikonfirmasi user 2026-10-15);
//    nama cuma muncul lewat cari, daftar lengkap di Database Anggota;
//  - ANGKA SAJA — gak ada no. telepon/NIK/rekening/saldo di sini;
//  - bantu cek data bermasalah: tandai + catatan -> admin yang verifikasi;
//  - gak ada log aktivitas (cuma report).
// Admin/super_admin juga bisa buka (lihat saja, tombol tandai khusus HoP).
export default function DashboardHopPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const { isHop, isAdmin, checked } = useIsHop(user);
  const [data, setData] = useState(null);
  const [gagal, setGagal] = useState(false);
  const [q, setQ] = useState('');
  const [cari, setCari] = useState(null); // { kata, total, items } — hasil cari terakhir
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

  useEffect(() => {
    if (!boleh) return;
    fetch('/api/hop/sahabat')
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) setData(d); else setGagal(true); })
      .catch(() => setGagal(true));
    muatLaporan();
  }, [boleh]);

  // Pencarian didebounce 300ms; kosong = sembunyikan hasil.
  useEffect(() => {
    if (!boleh) return;
    const kata = q.trim();
    if (!kata) return;
    const t = setTimeout(() => {
      fetch(`/api/hop/sahabat?q=${encodeURIComponent(kata)}`).then(r => r.json())
        .then(d => setCari({ kata, ...(d.hasil_cari || { total: 0, items: [] }) }))
        .catch(() => setCari({ kata, total: 0, items: [] }));
    }, 300);
    return () => clearTimeout(t);
  }, [q, boleh]);

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
      const tambah = (s) => s.id === tandai.id ? { ...s, laporan_terbuka: s.laporan_terbuka + 1 } : s;
      setTandai(null); setCatatan('');
      setData(prev => prev && ({
        ...prev,
        ringkasan: { ...prev.ringkasan, laporan_terbuka: prev.ringkasan.laporan_terbuka + 1 },
        top: prev.top.map(tambah),
      }));
      setCari(prev => prev && ({ ...prev, items: prev.items.map(tambah) }));
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
  const laporanTerbuka = laporan.filter(l => l.status === 'terbuka');
  const hasilCari = cari?.kata === q.trim() ? cari : null; // null = masih mencari
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
        <span className="text-[10px] text-gray-400"><KodeAgen s={s} /></span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
        {s.laporan_terbuka > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">⚠️ {s.laporan_terbuka} laporan</span>}
      </>
    );
  };

  const selisih = r ? r.baru_bulan_ini - r.baru_bulan_lalu : 0;
  const kpi = [
    { label: 'Sahabat aktif', val: r?.total_sahabat_aktif, cls: 'text-green-700', bg: 'bg-green-50' },
    { label: 'Dalam proses', val: r?.total_dalam_proses, cls: 'text-amber-700', bg: 'bg-amber-50' },
    {
      label: 'Baru bulan ini', val: r?.baru_bulan_ini, cls: 'text-[#1A4FA0]', bg: 'bg-[#E8F0FB]',
      sub: r && (selisih === 0 ? `sama dgn bulan lalu (${r.baru_bulan_lalu})` : `${selisih > 0 ? '▲' : '▼'} ${Math.abs(selisih)} dari bulan lalu`),
    },
    { label: 'Laporan terbuka', val: r?.laporan_terbuka, cls: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header + cari */}
        <div className="bg-gradient-to-r from-[#0E2F6E] to-[#1A4FA0] text-white rounded-2xl p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold opacity-75">🛡️ Head of Program · Management</div>
              <h1 className="text-xl md:text-2xl font-bold mt-1">Halo, {user.name?.split(' ')[0] || 'Head of Program'}</h1>
              <p className="text-sm opacity-80 mt-1">Pengawasan jaringan Jamaah Sahabat Baitullah — <b>baca saja</b>, perubahan data dilakukan admin.</p>
            </div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Cari sahabat (nama / kode)..."
              className="w-full md:w-72 shrink-0 px-3 py-2 rounded-lg bg-white text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/60" />
          </div>
        </div>

        {/* Hasil cari — cuma muncul saat ada kata kunci */}
        {q.trim() && (
          <div className={kartu}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className={judul}>Hasil cari “{q.trim()}”</div>
              <button onClick={() => setQ('')} className="text-xs text-gray-400 hover:text-gray-600">✕ Tutup</button>
            </div>
            {!hasilCari ? (
              <div className="text-xs text-gray-400 py-3">Mencari...</div>
            ) : hasilCari.items.length === 0 ? (
              <div className="text-xs text-gray-400 py-3">Tidak ada sahabat yang cocok.</div>
            ) : (
              <>
                <div className="divide-y divide-gray-50">
                  {hasilCari.items.map(s => (
                    <div key={s.id} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-[#0E2F6E] text-sm truncate">{s.name}</div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">{badge(s)}</div>
                        <div className="text-[11px] text-gray-500 mt-1">
                          {s.gen.map((n, g) => <span key={g} className="mr-2">Gen{g + 1} <b className={n ? 'text-[#0E2F6E]' : 'text-gray-300'}>{n}</b></span>)}
                          <span>· Total <b className="text-[#0E2F6E]">{s.total}</b></span>
                        </div>
                      </div>
                      {tombolTandai(s, 'shrink-0')}
                    </div>
                  ))}
                </div>
                {hasilCari.total > hasilCari.items.length && (
                  <button onClick={() => router.push('/admin/sahabat/database')} className="text-xs font-semibold text-[#1A4FA0] mt-2">
                    {hasilCari.total - hasilCari.items.length} hasil lainnya — buka Database Anggota →
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {gagal && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            Gagal memuat data dashboard. Coba muat ulang halaman; kalau masih gagal, hubungi admin.
          </div>
        )}

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpi.map(k => (
            <div key={k.label} className={`${k.bg} rounded-xl p-3 md:p-4`}>
              <div className="text-[11px] md:text-xs text-gray-500">{k.label}</div>
              <div className={`text-2xl font-black ${k.cls}`}>{k.val ?? '–'}</div>
              {k.sub && <div className="text-[10px] text-gray-500 mt-0.5">{k.sub}</div>}
            </div>
          ))}
        </div>

        {/* Grafik */}
        <div className="grid md:grid-cols-2 gap-3">
          <div className={kartu}>
            <div className={judul}>📈 Pendaftar Baru per Bulan</div>
            <div className="text-[11px] text-gray-400 mb-3">Sahabat yang mendaftar, 6 bulan terakhir.</div>
            {data ? <GrafikPertumbuhan data={data.pertumbuhan} /> : <Memuat />}
          </div>
          <div className={kartu}>
            <div className={judul}>🌳 Kedalaman Jaringan</div>
            <div className="text-[11px] text-gray-400 mb-3">Sahabat <b>aktif</b> di bawah Head of Program, per generasi.</div>
            {!data ? <Memuat /> : !data.kedalaman ? (
              <div className="text-xs text-gray-400 py-4">Head of Program belum ditetapkan di pengaturan komisi.</div>
            ) : <GrafikKedalaman kedalaman={data.kedalaman} />}
          </div>
        </div>

        {/* Top perekrut + perlu perhatian */}
        <div className="grid md:grid-cols-2 gap-3">
          <div className={kartu}>
            <div className={judul}>🏆 Top {data?.top?.length || 5} Perekrut</div>
            <div className="text-[11px] text-gray-400 mb-2">Berdasarkan total relasi aktif Gen1–Gen5.</div>
            {!data ? <Memuat /> : data.top.length === 0 ? (
              <div className="text-xs text-gray-400 py-3">Belum ada sahabat yang punya relasi aktif.</div>
            ) : (
              <ol className="divide-y divide-gray-50">
                {data.top.map((s, i) => (
                  <li key={s.id} className="py-2 flex items-center gap-3">
                    <span className="w-5 text-center text-xs font-black text-gray-400">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[#0E2F6E] text-sm truncate">{s.name}</div>
                      <div className="text-[10px] text-gray-400"><KodeAgen s={s} /> · Gen1 {s.gen[0]}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-[#0E2F6E]">{s.total}</div>
                      <div className="text-[10px] text-gray-400">relasi</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <button onClick={() => router.push('/admin/sahabat/database')} className="text-xs font-semibold text-[#1A4FA0] mt-2">
              Lihat semua anggota →
            </button>
          </div>

          <div className={kartu}>
            <div className={judul}>⏳ Perlu Perhatian</div>
            <div className="text-[11px] text-gray-400 mb-2">Hal yang menunggu tindak lanjut.</div>
            {!data ? <Memuat /> : (
              <div className="space-y-2">
                <button onClick={() => router.push('/admin/sahabat')}
                  className="w-full text-left flex items-center justify-between gap-2 bg-amber-50 hover:bg-amber-100 rounded-lg p-3">
                  <div>
                    <div className="text-sm font-semibold text-amber-800">{data.perhatian.dalam_proses} pendaftaran masih dalam proses</div>
                    {data.perhatian.tertua_hari !== null && (
                      <div className="text-[11px] text-amber-700">Terlama: {data.perhatian.tertua_hari} hari sejak daftar</div>
                    )}
                  </div>
                  <span className="text-amber-700 text-sm">→</span>
                </button>
                {laporanTerbuka.length === 0 ? (
                  <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">✅ Tidak ada laporan data yang menunggu admin.</div>
                ) : (
                  <div className="bg-red-50 rounded-lg p-3">
                    <div className="text-sm font-semibold text-red-700">{laporanTerbuka.length} laporan menunggu admin</div>
                    <ul className="mt-1 space-y-1">
                      {laporanTerbuka.slice(0, 3).map(l => (
                        <li key={l.id} className="text-[11px] text-red-700 truncate">
                          <b>{l.sahabat_nama || '-'}</b> — {l.catatan}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Link rekrut + pintasan */}
        <div className={`${kartu} flex flex-col md:flex-row md:items-center gap-3`}>
          {isHop && (
            <div className="md:flex-1 min-w-0">
              <div className="text-xs font-bold text-[#0E2F6E] mb-1">🔗 Link Rekrut Sahabat Baru</div>
              {linkRekrut ? (
                <div className="flex gap-2">
                  <input readOnly value={linkRekrut} onFocus={e => e.target.select()}
                    className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border-2 border-gray-100 bg-gray-50 text-xs text-gray-600" />
                  <button onClick={salinLink}
                    className="shrink-0 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-4 rounded-lg">
                    {tersalin ? '✓ Tersalin' : 'Salin'}
                  </button>
                </div>
              ) : <div className="text-xs text-gray-400">Memuat...</div>}
            </div>
          )}
          <div className={isHop ? 'md:flex-1' : ''}>
            <div className="text-xs font-bold text-[#0E2F6E] mb-1">📂 Data Sahabat Baitullah</div>
            <div className="flex flex-wrap gap-1.5">
              {PINTASAN.map(p => (
                <button key={p.path} onClick={() => router.push(p.path)}
                  className="text-[11px] font-semibold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d6e4f7] px-2.5 py-1 rounded-full">
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Riwayat laporan — tertutup default */}
        <CollapsibleSection className={kartu} defaultOpen={false} badge={laporan.length}
          title={<span className={judul}>⚠️ Riwayat Laporan Data Bermasalah</span>}>
          <div className="text-[11px] text-gray-400 mb-2">Tandai sahabat lewat kolom cari di atas — admin yang memverifikasi &amp; memperbaiki.</div>
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
        </CollapsibleSection>
      </div>

      {tandai && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !mengirim && setTandai(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-[#0E2F6E]">⚠️ Tandai Data Bermasalah</div>
            <div className="text-xs text-gray-500 mt-0.5 mb-3">{tandai.name} (<KodeAgen s={tandai} />) — laporan dikirim ke admin untuk diverifikasi. Data sahabat tidak berubah.</div>
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

function Memuat() {
  return <div className="text-xs text-gray-400 py-6 text-center">Memuat...</div>;
}

// Kolom satu seri (satu warna brand), puncak membulat, nilai di atas batang.
function GrafikPertumbuhan({ data }) {
  const maks = Math.max(1, ...data.map(d => d.baru));
  return (
    <div className="flex items-end gap-2 h-36" role="img"
      aria-label={`Pendaftar baru per bulan: ${data.map(d => `${namaBulan(d.bulan)} ${d.baru}`).join(', ')}`}>
      {data.map((d, i) => {
        const terakhir = i === data.length - 1;
        return (
          <div key={d.bulan} className="flex-1 h-full flex flex-col items-center justify-end group" title={`${namaBulan(d.bulan)}: ${d.baru} pendaftar`}>
            <div className="text-[10px] font-bold text-[#0E2F6E] mb-0.5">{d.baru}</div>
            <div className={`w-full max-w-8 rounded-t ${terakhir ? 'bg-[#1A4FA0]' : 'bg-[#1A4FA0]/60'} group-hover:bg-[#0E2F6E] transition-colors`}
              style={{ height: `${Math.max(2, (d.baru / maks) * 100)}px` }} />
            <div className="w-full border-t border-gray-200" />
            <div className={`text-[10px] mt-1 ${terakhir ? 'font-bold text-[#0E2F6E]' : 'text-gray-400'}`}>{namaBulan(d.bulan)}</div>
          </div>
        );
      })}
    </div>
  );
}

// Batang horizontal per generasi, skala ke generasi terbesar.
function GrafikKedalaman({ kedalaman }) {
  const { gen, di_luar_jaringan } = kedalaman;
  const maks = Math.max(1, ...gen);
  const total = gen.reduce((a, b) => a + b, 0);
  return (
    <div>
      <div className="space-y-2">
        {gen.map((n, g) => (
          <div key={g} className="flex items-center gap-2" title={`Gen${g + 1}: ${n} sahabat aktif`}>
            <span className="w-10 text-[11px] text-gray-500">Gen{g + 1}</span>
            <div className="flex-1 h-3 bg-gray-50 rounded">
              {n > 0 && <div className="h-3 bg-[#1A4FA0] rounded" style={{ width: `${(n / maks) * 100}%` }} />}
            </div>
            <span className={`w-6 text-right text-xs ${n ? 'font-bold text-[#0E2F6E]' : 'text-gray-300'}`}>{n}</span>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-gray-500 mt-3">
        Total di jaringan: <b className="text-[#0E2F6E]">{total}</b>
        {di_luar_jaringan > 0 && <> · <span className="text-amber-700">{di_luar_jaringan} sahabat aktif di luar jaringan HoP</span></>}
      </div>
    </div>
  );
}
