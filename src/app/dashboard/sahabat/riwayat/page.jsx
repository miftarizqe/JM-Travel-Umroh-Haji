'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import UploadBukti from '@/app/components/UploadBukti';
import { useCurrentUser } from '@/lib/useCurrentUser';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

function fmtTanggalJam(iso) {
  const d = new Date(iso);
  const tanggal = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${tanggal}, ${jam}`;
}

function fmtTanggal(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

const FUNNEL_LABEL = {
  pending: 'Upload Bukti TF', menunggu_bsi: 'Menunggu BSI', menunggu_sk_cif: 'Menunggu SK-CIF',
  active: 'Aktif', ditolak: 'Ditolak',
};

const KATEGORI_LABEL = {
  komisi_sahabat: { label: 'Ujroh Rekrutan', warna: 'bg-purple-50 text-purple-700' },
  closing_langsung_sahabat: { label: 'Closing Jamaah', warna: 'bg-blue-50 text-blue-700' },
  tabungan_awal_sahabat: { label: 'Saldo Awal Pendaftaran', warna: 'bg-teal-50 text-teal-700' },
  head_of_program_registrasi: { label: 'Komisi Head of Program', warna: 'bg-amber-50 text-amber-700' },
  pemakaian_saldo_sahabat: { label: 'Pemakaian Saldo', warna: 'bg-red-50 text-red-700' },
  setoran_mandiri_sahabat: { label: 'Setoran Mandiri', warna: 'bg-emerald-50 text-emerald-700' },
  referral_closing_reguler_sahabat: { label: 'Referral Closing Reguler', warna: 'bg-indigo-50 text-indigo-700' },
  koreksi_saldo_sahabat: { label: 'Koreksi Saldo (Admin)', warna: 'bg-red-50 text-red-700' },
};

// Halaman "Riwayat Tabungan Umroh" — dituju dari klik "Total Ujroh
// Terkonfirmasi"/"Ujroh Pending"/"Forecast" di /dashboard/sahabat.
// Restrukturisasi 2026-09-22/23, lalu diluruskan lagi 2026-10-09
// (dikonfirmasi user — definisi final: Total Saldo Tabungan = Ujroh Cair +
// Tabungan Mandiri, SEMUA confirmed; Ujroh Pending = udah KEJADIAN/tercatat
// di ledger tapi belum di-ACC admin; Forecast = BELUM kejadian sama sekali):
//  - "Riwayat Pencairan" = per BATCH pencairan yang beneran kejadian (data
//    payslip/pengajuan_ujroh) — kalau sebulan cuma cair 2x, ya cuma ada 2
//    baris di sini, expand buat lihat rincian item per batch. TIDAK PERNAH
//    ada yang "pending" di sini by design (payslip cuma lahir dari batch
//    yang udah disetujui/dicairkan).
//  - "Cashflow Tabungan" = mutasi yang SUDAH dikonfirmasi admin aja (duit
//    masuk & keluar), satu list kronologis (rekening koran) — confirmed-only.
//  - "Ujroh Pending" = baris ledger yang UDAH BENERAN tercatat (ujroh/setoran
//    mandiri/dll sudah kejadian) tapi belum dikonfirmasi admin. Sempat
//    ditumpuk jadi sub-bagian tab Forecast (2026-10-08) — DIPISAH LAGI jadi
//    tab sendiri (2026-10-09, dikonfirmasi user) karena ini BUKAN proyeksi,
//    bedanya penting: begitu admin confirm, baris ini otomatis pindah masuk
//    Cashflow (sama sumber data, beda filter dikonfirmasi_at aja).
//  - "Forecast" = proyeksi duit yang BELUM kejadian sama sekali — 2 sumber:
//    ujroh 5-generasi dari downline yang masih di funnel, DAN ujroh
//    closing_langsung/referral reguler dari booking jamaah yang masih
//    berjalan (belum 'selesai').
export default function RiwayatSaldoPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>}>
      <RiwayatSaldoContent />
    </Suspense>
  );
}

function RiwayatSaldoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user] = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [targetInfo, setTargetInfo] = useState(null);
  const [tab, setTab] = useState(() => {
    if (searchParams.get('tab') === 'forecast') return 'forecast';
    if (searchParams.get('section') === 'pending') return 'pending';
    return 'pencairan';
  });
  const [payslip, setPayslip] = useState(null);
  const [expandPeriode, setExpandPeriode] = useState(null);
  const [forecast, setForecast] = useState(null);
  // Pengajuan Setoran Mandiri self-service (dikonfirmasi user 2026-09-29) —
  // jamaah nabung ke rekening tabungan umroh PRIBADI mereka sendiri, lalu
  // unggah bukti transfernya di sini biar admin gak perlu ngecek mutasi BSI
  // semua akun satu-satu. Cuma buat akun sendiri (bukan admin liat punya
  // orang lain) — lihat `lihatOrangLain` di bawah.
  const [nominalSetoran, setNominalSetoran] = useState('');
  const [buktiPathSetoran, setBuktiPathSetoran] = useState(null);
  const [buktiNamaSetoran, setBuktiNamaSetoran] = useState(null);
  const [submittingSetoran, setSubmittingSetoran] = useState(false);
  const [pengajuanSaya, setPengajuanSaya] = useState([]);
  const [uploadKeySetoran, setUploadKeySetoran] = useState(0);
  const [expandBatch, setExpandBatch] = useState(null);

  // Item-item yang di-TF BARENG (bukti_tf_admin_path sama persis — admin
  // konfirmasi beberapa baris komisi sekaligus pakai 1 file bukti, lihat
  // konfirmasi-batch) digabung jadi 1 kartu kebuka/tutup, mirror pola
  // "Riwayat Pencairan" di atas (dikonfirmasi user 2026-10-06, sebelumnya
  // tiap baris nongol sendiri-sendiri padahal 1 transfer beneran).
  // Grup isi 1 item (bukti unik, mis. setoran mandiri) ATAU item tanpa
  // bukti sama sekali (pending/pemakaian saldo) TETAP kartu biasa, gak usah
  // dibungkus collapse yang gak perlu.
  const riwayatGrouped = useMemo(() => {
    const list = data?.riwayat || [];
    const byBukti = new Map();
    const result = [];
    for (const r of list) {
      if (r.bukti_tf_admin_path) {
        let g = byBukti.get(r.bukti_tf_admin_path);
        if (!g) {
          g = { bukti: r.bukti_tf_admin_path, items: [], total: 0, dikonfirmasi_at: r.dikonfirmasi_at, saldo_setelah: null };
          byBukti.set(r.bukti_tf_admin_path, g);
          result.push(g);
        }
        g.items.push(r);
        g.total += Number(r.nominal || 0);
        if (r.saldo_setelah !== null && (g.saldo_setelah === null || r.saldo_setelah > g.saldo_setelah)) g.saldo_setelah = r.saldo_setelah;
      } else {
        result.push({ items: [r] });
      }
    }
    return result;
  }, [data]);

  const paramId = searchParams.get('sahabat_id');
  // HoP ikut diizinin liat riwayat sahabat lain (dikonfirmasi user
  // 2026-10-08, sebelumnya role 'hop' gak masuk daftar ini sama sekali --
  // tombol "Riwayat Lengkap" di Database Sahabat jadi nge-redirect HoP ke
  // /dashboard/jamaah lewat guard di bawah, bukan nampilin riwayat).
  const isAdmin = user && ['admin', 'super_admin', 'hop'].includes(user.role);
  const targetId = (paramId && isAdmin) ? paramId : user?.id;
  const lihatOrangLain = isAdmin && paramId && paramId !== user?.id;

  function muatPengajuanSaya() {
    fetch('/api/sahabat/setoran-mandiri-pengajuan')
      .then(r => r.json())
      .then(d => setPengajuanSaya(d.pengajuan || []))
      .catch(() => {});
  }

  useEffect(() => {
    if (!user) return;
    if (!['sahabat_baitullah', 'admin', 'super_admin', 'hop'].includes(user.role)) { router.push('/dashboard/jamaah'); return; }
    if (!targetId) return;
    fetch(`/api/sahabat/riwayat-saldo?sahabat_id=${targetId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    fetch(`/api/sahabat/payslip?sahabat_id=${targetId}`)
      .then(r => r.json())
      .then(d => setPayslip(d.periode || []))
      .catch(() => {});
    fetch(`/api/sahabat/dashboard?sahabat_id=${targetId}`)
      .then(r => r.json())
      .then(d => setForecast(d.forecast || null))
      .catch(() => {});
    if (lihatOrangLain) {
      fetch(`/api/sahabat/downline/${targetId}`)
        .then(r => r.json())
        .then(d => setTargetInfo(d.target || null))
        .catch(() => {});
    } else {
      setTargetInfo(null);
      if (user.role === 'sahabat_baitullah') muatPengajuanSaya();
    }
  }, [user, targetId]);

  async function ajukanSetoranMandiri() {
    const nominalNum = Number(nominalSetoran);
    if (!nominalNum || nominalNum <= 0) { alert('Isi nominal setoran dulu'); return; }
    if (!buktiPathSetoran) { alert('Unggah bukti transfer dulu'); return; }
    setSubmittingSetoran(true);
    try {
      const res = await fetch('/api/sahabat/setoran-mandiri-pengajuan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nominal: nominalNum, bukti_path: buktiPathSetoran, bukti_nama: buktiNamaSetoran }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSubmittingSetoran(false); return; }
      alert(d.message);
      setNominalSetoran(''); setBuktiPathSetoran(null); setBuktiNamaSetoran(null);
      setUploadKeySetoran(k => k + 1);
      muatPengajuanSaya();
    } catch { alert('Terjadi kesalahan'); }
    setSubmittingSetoran(false);
  }

  if (!user || loading || !data) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <Layout title="📜 Riwayat Tabungan Umroh" showBack>
      {lihatOrangLain && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-800">
          👁️ Mode admin — lagi lihat riwayat milik <b>{targetInfo?.name || '...'}</b> {targetInfo?.kode_unik ? `(${targetInfo.kode_unik})` : ''}, bukan riwayat Anda sendiri.
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('pencairan')}
          className={`text-xs font-bold px-4 py-2 rounded-full ${tab === 'pencairan' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
          📜 Riwayat Pencairan
        </button>
        <button onClick={() => setTab('cashflow')}
          className={`text-xs font-bold px-4 py-2 rounded-full ${tab === 'cashflow' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
          🧾 Cashflow Tabungan
        </button>
        <button onClick={() => setTab('pending')}
          className={`text-xs font-bold px-4 py-2 rounded-full ${tab === 'pending' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
          ⏳ Ujroh Pending
        </button>
        <button onClick={() => setTab('forecast')}
          className={`text-xs font-bold px-4 py-2 rounded-full ${tab === 'forecast' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
          📊 Forecast
        </button>
      </div>

      {tab === 'pencairan' && (
        payslip === null ? (
          <div className="text-center text-gray-400 py-10">Memuat...</div>
        ) : payslip.length === 0 ? (
          <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">
            Belum ada pencairan — muncul begitu ujroh Anda dikonfirmasi lewat pengajuan mingguan.
          </div>
        ) : (
          <div className="space-y-2">
            {payslip.map(p => {
              const isOpen = expandPeriode === p.pengajuan_id;
              return (
                <div key={p.pengajuan_id} className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
                  <button onClick={() => setExpandPeriode(isOpen ? null : p.pengajuan_id)}
                    className="w-full flex items-center justify-between p-3 text-left">
                    <div>
                      <div className="text-sm font-bold text-[#0E2F6E]">{fmtTanggal(p.periode_mulai)} – {fmtTanggal(p.periode_selesai)}</div>
                      <div className="text-[10px] text-gray-400">Pengajuan #{p.pengajuan_id} · {p.items.length} item</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-600">{fmtRp(p.total)}</div>
                      <div className="text-[10px] text-gray-300">{isOpen ? '▲' : '▼'}</div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-gray-50 p-3 space-y-1.5">
                      {p.bukti_tf_admin_path && (
                        <a href={p.bukti_tf_admin_path} target="_blank" rel="noopener noreferrer"
                          className="inline-block text-xs font-bold text-[#1A4FA0] mb-1">📎 Lihat Bukti TF</a>
                      )}
                      {p.items.map(it => (
                        <div key={it.id} className="flex justify-between text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
                          <div>
                            <span className="text-[10px] font-bold text-[#1A4FA0]">{it.kategori_label}</span>
                            <div className="text-gray-600">{it.keterangan}</div>
                          </div>
                          <div className="font-bold text-[#0E2F6E] shrink-0">{fmtRp(it.nominal)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'cashflow' && (<>
      {!lihatOrangLain && user.role === 'sahabat_baitullah' && (
        <div className="bg-white rounded-xl border-2 border-emerald-200 p-4 mb-4">
          <div className="font-bold text-emerald-700 text-sm mb-1">💵 Ajukan Setoran Mandiri</div>
          <div className="text-xs text-gray-400 mb-3">Sudah menabung ke rekening tabungan umroh Anda sendiri? Unggah bukti transfernya di sini — admin akan cocokkan dengan mutasi rekening & menambah saldo Anda.</div>
          <div className="space-y-2 mb-3">
            <input value={nominalSetoran} onChange={e => setNominalSetoran(e.target.value.replace(/\D/g, ''))}
              placeholder="Nominal setoran (Rp)" inputMode="numeric"
              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm focus:border-emerald-400 focus:outline-none" />
            <UploadBukti key={uploadKeySetoran}
              onUploaded={(path, nama) => { setBuktiPathSetoran(path); setBuktiNamaSetoran(nama); }}
              label="Klik untuk upload bukti transfer setoran" />
          </div>
          <button onClick={ajukanSetoranMandiri} disabled={submittingSetoran}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-full">
            {submittingSetoran ? 'Mengajukan...' : 'Ajukan Setoran Mandiri'}
          </button>

          {pengajuanSaya.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
              <div className="text-[10px] text-gray-400">Riwayat pengajuan Anda:</div>
              {pengajuanSaya.map(p => (
                <div key={p.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
                  <span className="font-semibold text-gray-600">{fmtRp(p.nominal)}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    p.status === 'disetujui' ? 'bg-green-100 text-green-700' :
                    p.status === 'ditolak' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {p.status === 'disetujui' ? '✅ Disetujui' : p.status === 'ditolak' ? '❌ Ditolak' : '⏳ Menunggu'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-gradient-to-r from-[#0E2F6E] to-[#2060C0] rounded-xl p-4 text-white flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] opacity-70">Saldo Awal</div>
          <div className="text-lg font-bold">{fmtRp(data.saldo_awal)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] opacity-70">Saldo Akhir</div>
          <div className="text-lg font-bold">{fmtRp(data.saldo_akhir)}</div>
        </div>
      </div>

      {riwayatGrouped.length === 0 ? (
        <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">
          Belum ada transaksi tercatat.
        </div>
      ) : (
        <div className="space-y-2">
          {riwayatGrouped.map(entry => {
            // 2+ item share bukti TF yang sama persis — 1 kartu, detail di
            // dalam. Selain itu (1 item, bukti unik/gak ada) tetap kartu
            // biasa kayak sebelumnya.
            if (entry.items.length > 1) {
              const isOpen = expandBatch === entry.bukti;
              return (
                <div key={entry.bukti} className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
                  <button onClick={() => setExpandBatch(isOpen ? null : entry.bukti)}
                    className="w-full flex items-center justify-between p-3 text-left">
                    <div>
                      <div className="text-sm font-bold text-[#0E2F6E]">💸 Transfer {fmtTanggalJam(entry.dikonfirmasi_at)}</div>
                      <div className="text-[10px] text-gray-400">{entry.items.length} item · Saldo setelah: {fmtRp(entry.saldo_setelah)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-green-600">+{fmtRp(entry.total)}</div>
                      <div className="text-[10px] text-gray-300">{isOpen ? '▲' : '▼'}</div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-gray-50 p-3 space-y-1.5">
                      <a href={entry.bukti} target="_blank" rel="noopener noreferrer"
                        className="inline-block text-xs font-bold text-[#1A4FA0] mb-1">📎 Lihat Bukti TF</a>
                      {entry.items.map(r => {
                        const kat = KATEGORI_LABEL[r.jenis] || { label: r.jenis, warna: 'bg-gray-100 text-gray-600' };
                        return (
                          <div key={r.id} className="flex justify-between text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
                            <div className="min-w-0">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kat.warna}`}>{kat.label}</span>
                              {r.level ? <span className="ml-1 text-[10px] font-bold text-[#1A4FA0]">Level {r.level}</span> : null}
                              {r.nama_pendaftar && <div className="text-gray-700 font-semibold mt-0.5">{r.nama_pendaftar}{r.kode_unik_pendaftar && <span className="text-gray-400 font-normal"> ({r.kode_unik_pendaftar})</span>}</div>}
                              <div className="text-gray-500">{r.keterangan}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5">{fmtTanggalJam(r.created_at)} · ID Transaksi #{r.id}</div>
                            </div>
                            <div className="font-bold text-[#0E2F6E] shrink-0">{fmtRp(r.nominal)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const r = entry.items[0];
            const kat = KATEGORI_LABEL[r.jenis] || { label: r.jenis, warna: 'bg-gray-100 text-gray-600' };
            return (
              <div key={r.id} className="bg-white rounded-xl border border-[#e0e8f0] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kat.warna}`}>{kat.label}</span>
                    {r.level ? (
                      <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E8F0FB] text-[#1A4FA0]">Level {r.level}</span>
                    ) : null}
                    {r.nama_pendaftar ? (
                      <div className="text-sm font-semibold text-gray-800 mt-1">{r.nama_pendaftar}{r.kode_unik_pendaftar && <span className="text-gray-400 font-normal"> ({r.kode_unik_pendaftar})</span>}</div>
                    ) : null}
                    <div className="text-sm text-gray-700 mt-1">{r.keterangan}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {fmtTanggalJam(r.created_at)} · ID Transaksi #{r.id}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-bold ${r.nominal < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {r.nominal < 0 ? '-' : '+'}{fmtRp(Math.abs(r.nominal))}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.dikonfirmasi_at ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {r.dikonfirmasi_at ? (r.nominal < 0 ? 'Terpakai' : 'Sudah Masuk') : 'Menunggu'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 text-xs">
                  <div className="text-gray-400">
                    Saldo setelah: <span className="text-gray-600 font-semibold">{r.saldo_setelah !== null ? fmtRp(r.saldo_setelah) : '—'}</span>
                  </div>
                  {r.bukti_tf_admin_path ? (
                    <a href={r.bukti_tf_admin_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">
                      📎 Lihat Bukti TF
                    </a>
                  ) : (
                    <span className="text-gray-400">Belum ada lampiran</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>)}

      {tab === 'forecast' && (
        !forecast ? (
          <div className="text-center text-gray-400 py-10">Memuat...</div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="font-bold text-[#0E2F6E] text-sm mb-2">🌳 Ujroh 5-Generasi — Rekrutan dalam Funnel</div>
              <div className="bg-gradient-to-r from-[#0E2F6E] to-[#1A4FA0] text-white rounded-xl p-4 mb-2">
                <div className="text-[10px] opacity-75 uppercase tracking-wider">Total Potensi</div>
                <div className="text-2xl font-black text-[#C9952A]">{fmtRp(forecast.potensi_total)}</div>
              </div>
              {forecast.calon_ujroh.length === 0 ? (
                <div className="bg-[#E8F0FB] rounded-xl p-4 text-center text-sm text-[#1A4FA0]">Semua downline dalam 5 generasi sudah aktif, atau belum ada downline sama sekali.</div>
              ) : (
                <div className="space-y-2">
                  {forecast.calon_ujroh.map(c => (
                    <div key={c.id} className="bg-white rounded-xl border border-[#e0e8f0] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-[#0E2F6E] text-sm truncate">{c.name} <span className="text-gray-400 font-normal">({c.kode_unik})</span></div>
                          <div className="text-[10px] text-gray-400">Gen{c.level} · {FUNNEL_LABEL[c.funnel_status] || 'Menunggu'}</div>
                        </div>
                        <div className="font-bold text-[#C9952A] shrink-0">{fmtRp(c.potensi_nominal)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="font-bold text-[#0E2F6E] text-sm mb-2">💳 Closing Jamaah Umroh Biasa — Booking Berjalan</div>
              <div className="bg-gradient-to-r from-[#0E2F6E] to-[#1A4FA0] text-white rounded-xl p-4 mb-2">
                <div className="text-[10px] opacity-75 uppercase tracking-wider">Total Potensi</div>
                <div className="text-2xl font-black text-[#C9952A]">{fmtRp(forecast.closing_jamaah_total)}</div>
              </div>
              {(forecast.closing_jamaah || []).length === 0 ? (
                <div className="bg-[#E8F0FB] rounded-xl p-4 text-center text-sm text-[#1A4FA0]">Belum ada booking berjalan yang bakal ngasih ujroh closing.</div>
              ) : (
                <div className="space-y-2">
                  {forecast.closing_jamaah.map(c => {
                    const kat = KATEGORI_LABEL[c.jenis] || { label: c.jenis, warna: 'bg-gray-100 text-gray-600' };
                    return (
                      <div key={`${c.jenis}-${c.id}`} className="bg-white rounded-xl border border-[#e0e8f0] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kat.warna}`}>{kat.label}</span>
                            <div className="text-sm text-gray-700 mt-1 truncate">{c.prog_name}</div>
                            <div className="text-[10px] text-gray-400">{c.jumlah_jamaah} jamaah · {c.pemesan_nama || '-'}{c.via ? ` · Via: ${c.via}` : ''}</div>
                          </div>
                          <div className="font-bold text-[#C9952A] shrink-0">{fmtRp(c.potensi_nominal)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )
      )}

      {/* "Ujroh Pending" — baris ledger yang UDAH BENERAN tercatat (beda
          dari tab Forecast yang isinya proyeksi/belum kejadian), cuma belum
          di-acc admin. Sempat ditumpuk sebagai sub-bagian tab Forecast
          (2026-10-08), dipisah jadi tab sendiri lagi (dikonfirmasi user
          2026-10-09) — bukan proyeksi, ini duit yang beneran udah "kejadian"
          cuma nunggu konfirmasi, jadi gak cocok digabung sama Forecast. */}
      {tab === 'pending' && (
        !forecast ? (
          <div className="text-center text-gray-400 py-10">Memuat...</div>
        ) : (
          <div>
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl p-4 mb-2">
              <div className="text-[10px] opacity-75 uppercase tracking-wider">Total Menunggu Konfirmasi Admin</div>
              <div className="text-2xl font-black">{fmtRp(forecast.menunggu_konfirmasi_total)}</div>
            </div>
            {(forecast.menunggu_konfirmasi || []).length === 0 ? (
              <div className="bg-[#E8F0FB] rounded-xl p-4 text-center text-sm text-[#1A4FA0]">Tidak ada yang menunggu konfirmasi admin saat ini.</div>
            ) : (
              <div className="space-y-2">
                {forecast.menunggu_konfirmasi.map(k => {
                  const kat = KATEGORI_LABEL[k.jenis] || { label: k.jenis, warna: 'bg-gray-100 text-gray-600' };
                  return (
                    <div key={k.id} className="bg-white rounded-xl border border-[#e0e8f0] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kat.warna}`}>{kat.label}</span>
                          {k.keterangan && <div className="text-sm text-gray-700 mt-1 truncate">{k.keterangan}</div>}
                          <div className="text-[10px] text-gray-400">{fmtTanggalJam(k.created_at)}</div>
                        </div>
                        <div className="font-bold text-amber-600 shrink-0">{fmtRp(k.nominal)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )
      )}
    </Layout>
  );
}
