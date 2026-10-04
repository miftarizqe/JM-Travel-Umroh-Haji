'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const fmtRp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const fmtTgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-';
const fmtJam = (t) => t ? new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
const angka = (v) => { const d = String(v ?? '').split(',')[0].replace(/\D/g, ''); return d === '' ? null : Number(d); };

// Pencocokan saldo web vs rekening tabungan umroh BSI tiap anggota Sahabat,
// setiap hari kerja (catatan SYSTEM UJROH, dikonfirmasi user 2026-10-03):
// per anggota, bukti dari BSI WAJIB dilampirkan. Backend: Go
// (/api/admin/sahabat/rekonsiliasi). Saldo web dihitung server saat simpan.
export default function RekonsiliasiSaldoPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [data, setData] = useState(null);
  const [riwayat, setRiwayat] = useState([]);
  const [tanggal, setTanggal] = useState(''); // '' = hari ini
  const [isian, setIsian] = useState({}); // user_id -> { bsi, catatan }
  const [catatan, setCatatan] = useState('');
  const [bukti, setBukti] = useState(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [cari, setCari] = useState('');

  const isAdmin = ['admin', 'super_admin'].includes(user?.role);

  useEffect(() => {
    if (user && !isAdmin) router.replace('/');
  }, [user, isAdmin, router]);

  function muat(tgl = tanggal) {
    setData(null);
    fetch(`/api/admin/sahabat/rekonsiliasi${tgl ? `?tanggal=${tgl}` : ''}`).then(r => r.json()).then(d => {
      setData(d);
      const awal = {};
      for (const a of d.anggota || []) awal[a.user_id] = { bsi: a.saldo_bsi ?? null, catatan: a.catatan || '' };
      setIsian(awal);
      setCatatan(d.sesi?.catatan || '');
      setBukti(null);
    }).catch(() => setData({ error: 'Gagal memuat data' }));
  }
  function muatRiwayat() {
    fetch('/api/admin/sahabat/rekonsiliasi/riwayat').then(r => r.json()).then(d => setRiwayat(d.riwayat || [])).catch(() => {});
  }

  useEffect(() => {
    if (!isAdmin) return;
    muat(); muatRiwayat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!user || !isAdmin) return <Layout><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

  const hariIni = !data?.tanggal || data.tanggal === data.hari_ini;
  const bisaIsi = hariIni && !data?.error;
  const anggota = data?.anggota || [];
  const q = cari.trim().toLowerCase();
  const tampilAnggota = !q ? anggota : anggota.filter(a =>
    (a.nama || '').toLowerCase().includes(q) ||
    (a.kode_unik || '').toLowerCase().includes(q) ||
    (a.no_rekening_tabungan_umroh || '').toLowerCase().includes(q)
  );
  const selisihOf = (a) => {
    const bsi = isian[a.user_id]?.bsi;
    return bsi == null ? null : bsi - a.saldo_web;
  };
  const belumDiisi = anggota.filter(a => isian[a.user_id]?.bsi == null).length;
  const jumlahSelisih = anggota.filter(a => { const s = selisihOf(a); return s != null && s !== 0; }).length;

  function ubah(id, field, val) {
    setIsian(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  }

  async function simpan() {
    if (belumDiisi > 0) { alert(`Masih ada ${belumDiisi} anggota yang saldo BSI-nya belum diisi.`); return; }
    if (!bukti) { alert('Bukti dari BSI (mutasi/laporan saldo) wajib dilampirkan.'); return; }
    const ringkas = jumlahSelisih > 0 ? `${jumlahSelisih} anggota SELISIH.` : 'Semua saldo cocok.';
    if (!confirm(`Simpan pencocokan saldo hari ini untuk ${anggota.length} anggota?\n${ringkas}`)) return;
    setMenyimpan(true);
    try {
      const fd = new FormData();
      fd.append('data', JSON.stringify({
        catatan,
        items: anggota.map(a => ({ user_id: a.user_id, saldo_bsi: isian[a.user_id]?.bsi, catatan: isian[a.user_id]?.catatan || '' })),
      }));
      fd.append('bukti', bukti);
      const res = await fetch('/api/admin/sahabat/rekonsiliasi', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setMenyimpan(false); return; }
      alert(d.message);
      muat(''); muatRiwayat();
    } catch { alert('Terjadi kesalahan'); }
    setMenyimpan(false);
  }

  function lihatTanggal(tgl) {
    setTanggal(tgl);
    muat(tgl);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const inputBsi = (a) => (
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">Rp</span>
      <input inputMode="numeric" disabled={!bisaIsi}
        value={isian[a.user_id]?.bsi != null ? isian[a.user_id].bsi.toLocaleString('id-ID') : ''}
        onChange={e => ubah(a.user_id, 'bsi', angka(e.target.value))}
        placeholder="Saldo di BSI"
        className="w-full pl-7 pr-2 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm disabled:bg-gray-50" />
    </div>
  );
  const badgeSelisih = (a) => {
    const s = data?.sudah_dicocokkan && !bisaIsi ? a.selisih : selisihOf(a);
    if (s == null) return <span className="text-[11px] text-gray-300">—</span>;
    if (s === 0) return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">✓ Cocok</span>;
    return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 whitespace-nowrap">Selisih {s > 0 ? '+' : '-'}{fmtRp(Math.abs(s))}</span>;
  };

  return (
    <Layout title="🏦 Pencocokan Saldo BSI" backHref="/admin/sahabat/database">
      <div className="space-y-4">
        <div className="text-xs text-gray-500">
          Cocokkan saldo tabungan umroh di web dengan saldo rekening BSI <b>tiap anggota</b> setiap hari kerja.
          Bukti dari BSI (mutasi/laporan saldo) wajib dilampirkan. Saldo web dihitung otomatis oleh sistem.
        </div>

        {/* Status */}
        {data && !data.error && (
          <div className={`rounded-xl p-4 border ${data.sudah_dicocokkan ? 'bg-green-50 border-green-200' : data.hari_kerja ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-gray-500">{hariIni ? 'Hari ini' : 'Tanggal'}</div>
                <div className="font-bold text-[#0E2F6E]">{fmtTgl(data.tanggal)}</div>
              </div>
              {data.sudah_dicocokkan ? (
                <div className="text-sm text-green-700 text-right">
                  ✅ Sudah dicocokkan oleh <b>{data.sesi.dibuat_oleh_nama || 'admin'}</b> · {fmtJam(data.sesi.updated_at)}
                  <div className="text-xs">{data.sesi.jumlah_anggota} anggota · {data.sesi.jumlah_selisih > 0 ? <b className="text-red-600">{data.sesi.jumlah_selisih} selisih</b> : 'semua cocok'} · <a href={data.sesi.bukti_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">📎 Bukti BSI</a></div>
                </div>
              ) : (
                <div className={`text-sm font-semibold ${data.hari_kerja ? 'text-amber-700' : 'text-gray-500'}`}>
                  {hariIni ? (data.hari_kerja ? '⏳ Belum dicocokkan hari ini' : 'Hari libur — pencocokan tidak wajib') : 'Tidak ada pencocokan di tanggal ini'}
                </div>
              )}
            </div>
            {!hariIni && (
              <button onClick={() => lihatTanggal('')} className="mt-2 text-xs font-bold text-[#1A4FA0] underline">← Kembali ke hari ini</button>
            )}
          </div>
        )}

        {/* Daftar anggota */}
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="font-bold text-[#0E2F6E] text-sm">👥 Anggota Aktif ({anggota.length})</div>
            {bisaIsi && anggota.length > 0 && (
              <div className="text-[11px] text-gray-500">{belumDiisi > 0 ? `${belumDiisi} belum diisi` : 'Semua sudah diisi'} · {jumlahSelisih} selisih</div>
            )}
          </div>
          {anggota.length > 0 && (
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input value={cari} onChange={e => setCari(e.target.value)}
                placeholder="Cari nama, kode, atau no. rekening..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
            </div>
          )}
          {!data ? (
            <div className="text-center text-gray-400 py-8 text-sm">Memuat...</div>
          ) : data.error ? (
            <div className="text-center text-red-500 py-8 text-sm">{data.error}</div>
          ) : anggota.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">{hariIni ? 'Belum ada anggota Sahabat aktif.' : 'Tidak ada data.'}</div>
          ) : tampilAnggota.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">Tidak ada anggota yang cocok dengan pencarian "{cari}".</div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#E8F0FB] text-[#0E2F6E] text-xs">
                    <tr>
                      <th className="text-left px-3 py-2 rounded-l-lg">Anggota</th>
                      <th className="text-right px-3 py-2">Saldo Web</th>
                      <th className="text-left px-3 py-2 w-48">Saldo BSI</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2 rounded-r-lg">Catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tampilAnggota.map(a => (
                      <tr key={a.user_id} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-[#0E2F6E]">{a.nama}</div>
                          <div className="text-[10px] text-gray-400">{a.kode_unik || '-'} · Rek. {a.no_rekening_tabungan_umroh || 'belum ada'}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{fmtRp(a.saldo_web)}</td>
                        <td className="px-3 py-2">{inputBsi(a)}</td>
                        <td className="px-3 py-2">{badgeSelisih(a)}</td>
                        <td className="px-3 py-2">
                          <input disabled={!bisaIsi} value={isian[a.user_id]?.catatan || ''} maxLength={255}
                            onChange={e => ubah(a.user_id, 'catatan', e.target.value)} placeholder={bisaIsi ? 'Opsional' : ''}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-100 focus:border-[#1A4FA0] focus:outline-none text-xs disabled:bg-gray-50" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* HP */}
              <div className="md:hidden space-y-2">
                {tampilAnggota.map(a => (
                  <div key={a.user_id} className="border border-gray-100 rounded-xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-[#0E2F6E] text-sm truncate">{a.nama}</div>
                        <div className="text-[10px] text-gray-400">{a.kode_unik || '-'} · Rek. {a.no_rekening_tabungan_umroh || 'belum ada'}</div>
                      </div>
                      {badgeSelisih(a)}
                    </div>
                    <div className="grid grid-cols-2 gap-2 items-center">
                      <div>
                        <div className="text-[10px] text-gray-400">Saldo Web</div>
                        <div className="font-bold text-sm">{fmtRp(a.saldo_web)}</div>
                      </div>
                      {inputBsi(a)}
                    </div>
                    <input disabled={!bisaIsi} value={isian[a.user_id]?.catatan || ''} maxLength={255}
                      onChange={e => ubah(a.user_id, 'catatan', e.target.value)} placeholder={bisaIsi ? 'Catatan (opsional)' : ''}
                      className="w-full px-2 py-2 rounded-lg border-2 border-gray-100 focus:border-[#1A4FA0] focus:outline-none text-xs disabled:bg-gray-50" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Simpan */}
        {bisaIsi && anggota.length > 0 && (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">📎 Bukti dari BSI <span className="text-red-500">*</span></label>
              <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => setBukti(e.target.files?.[0] || null)}
                className="block w-full text-xs text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[#E8F0FB] file:text-[#1A4FA0] file:font-bold" />
              <div className="text-[10px] text-gray-400 mt-1">Mutasi / laporan saldo rekening tabungan umroh dari BSI. JPG, PNG, atau PDF, maks. 10MB.</div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Catatan sesi</label>
              <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={2} maxLength={500}
                placeholder="Opsional, mis. penyebab selisih & tindak lanjut"
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
            </div>
            {data?.sudah_dicocokkan && (
              <div className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Pencocokan hari ini sudah ada — menyimpan lagi akan mengganti rinciannya (tetap tercatat di Audit Log).</div>
            )}
            <button onClick={simpan} disabled={menyimpan}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white font-bold py-3 rounded-full text-sm">
              {menyimpan ? 'Menyimpan...' : '💾 Simpan Pencocokan Hari Ini'}
            </button>
          </div>
        )}

        {/* Riwayat */}
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
          <div className="font-bold text-[#0E2F6E] text-sm mb-2">🗓️ Riwayat Pencocokan</div>
          {riwayat.length === 0 ? (
            <div className="text-xs text-gray-400 py-2">Belum ada riwayat.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {riwayat.map(s => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                  <button onClick={() => lihatTanggal(String(s.tanggal).slice(0, 10))} className="text-left">
                    <div className="font-semibold text-[#1A4FA0] hover:underline">{fmtTgl(s.tanggal)}</div>
                    <div className="text-gray-400">oleh {s.dibuat_oleh_nama || 'admin'} · {fmtJam(s.updated_at)}</div>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{s.jumlah_anggota} anggota</span>
                    {s.jumlah_selisih > 0
                      ? <span className="font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">{s.jumlah_selisih} selisih</span>
                      : <span className="font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Cocok</span>}
                    <a href={s.bukti_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">📎</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
