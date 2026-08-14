'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const NAMA_BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const RE_BULAN = /^\d{4}-\d{2}$/;
const RE_TAHUN = /^\d{4}$/;

// Path param 'periode' bisa 'YYYY-MM' (1 bulan, samain kayak periode Cashflow)
// ATAU 'YYYY' (1 tahun penuh, Jan-Des) — dua mode dari satu halaman biar gak
// duplikat tampilan laporan.
function hitungRentang(periode) {
  if (RE_BULAN.test(periode)) {
    const [y, m] = periode.split('-').map(Number);
    const akhirBulan = new Date(y, m, 0).getDate(); // handle Feb kabisat dkk
    const namaBulanStr = new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    return { tipe: 'bulan', from: `${periode}-01`, to: `${periode}-${String(akhirBulan).padStart(2, '0')}`, judul: namaBulanStr };
  }
  if (RE_TAHUN.test(periode)) {
    return { tipe: 'tahun', from: `${periode}-01-01`, to: `${periode}-12-31`, judul: `Tahun ${periode}` };
  }
  return null;
}

export default function LaporanKeuanganPerusahaanDetailPage() {
  const router = useRouter();
  const params = useParams();
  const periode = params?.periode;
  const [user] = useCurrentUser();
  const [pl, setPl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusKunci, setStatusKunci] = useState(null); // row laba_rugi_periode | null
  const [alasanBelumBisaKunci, setAlasanBelumBisaKunci] = useState('');
  const [busy, setBusy] = useState(false);
  const rentang = periode ? hitungRentang(periode) : null;

  function muat() {
    if (!rentang) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/laba-rugi-periode?periode=${periode}`).then(r => r.json()),
      fetch('/api/admin/cashflow/periode').then(r => r.json()),
    ]).then(([statusRes, cashflowRes]) => {
      const row = statusRes.periode;
      setStatusKunci(row);

      const periodeList = cashflowRes.periode || [];
      let alasan = '';
      if (rentang.tipe === 'bulan') {
        const p = periodeList.find(x => x.bulan === periode);
        if (!p) alasan = `Belum ada Cashflow bulan ${periode}.`;
        else if (p.status !== 'submitted') alasan = `Cashflow bulan ${periode} masih draft, submit dulu di Cashflow.`;
      } else {
        const bulanTahunIni = periodeList.filter(p => p.bulan.startsWith(`${periode}-`));
        if (bulanTahunIni.length === 0) alasan = `Belum ada Cashflow bulan mana pun di tahun ${periode}.`;
        else if (bulanTahunIni.some(p => p.status !== 'submitted')) alasan = `Masih ada bulan draft di tahun ${periode}, submit semua dulu di Cashflow.`;
      }
      setAlasanBelumBisaKunci(alasan);

      if (row?.status === 'submitted') {
        setPl(row.data_snapshot);
        setLoading(false);
        return;
      }

      const qs = rentang.tipe === 'tahun' ? new URLSearchParams({ tahun: periode }) : new URLSearchParams({ from: rentang.from, to: rentang.to });
      fetch(`/api/admin/laporan-keuangan-perusahaan?${qs}`).then(r => r.json())
        .then(a => { setPl(a); setLoading(false); })
        .catch(() => setLoading(false));
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { router.replace('/admin?tab=dashboard'); }
  }, [user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { muat(); }, [periode]);

  async function submitKunci() {
    if (!confirm(`Kunci Laba Rugi ${rentang.judul}? Nominal gak akan berubah lagi walau data Cashflow diedit belakangan.`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/laba-rugi-periode', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periode, tipe: rentang.tipe, data_snapshot: pl }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal mengunci'); setBusy(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  async function bukaKembali() {
    if (!confirm('Buka kembali Laba Rugi ini untuk dihitung ulang secara live?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/laba-rugi-periode?periode=${periode}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal membuka kembali'); setBusy(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  if (!user || user.role !== 'super_admin') {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  if (!rentang) {
    return (
      <Layout title="🔒 Laporan Keuangan Perusahaan" backHref="/admin/laporan/keuangan-perusahaan">
        <div className="text-center text-gray-400 py-10 text-sm">
          Periode &quot;{periode}&quot; gak valid.{' '}
          <Link href="/admin/laporan/keuangan-perusahaan" className="text-[#1A4FA0] font-semibold hover:underline">Balik ke daftar</Link>
        </div>
      </Layout>
    );
  }

  const terkunci = statusKunci?.status === 'submitted';

  return (
    <Layout title={`🔒 Laba Rugi — ${rentang.judul}`} backHref="/admin/laporan/keuangan-perusahaan">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className={`text-xs font-bold px-2.5 py-1 rounded ${terkunci ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
          {terkunci ? `🔒 Terkunci · disubmit ${new Date(statusKunci.submitted_at).toLocaleDateString('id-ID')}` : '📝 Belum dikunci — angka masih live'}
        </div>
        <div className="flex gap-2">
          <a href={`/admin/cetak-laba-rugi?${rentang.tipe === 'tahun' ? `tahun=${periode}` : `from=${rentang.from}&to=${rentang.to}`}`}
            target="_blank" rel="noopener noreferrer"
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold px-5 py-2.5 rounded-xl">
            🖨️ Cetak / PDF
          </a>
          {terkunci ? (
            <button onClick={bukaKembali} disabled={busy} className="bg-amber-100 hover:bg-amber-200 disabled:opacity-50 text-amber-700 text-sm font-bold px-4 py-2 rounded-xl">Buka Kembali</button>
          ) : (
            <button onClick={submitKunci} disabled={busy || !!alasanBelumBisaKunci} title={alasanBelumBisaKunci}
              className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl">
              ✅ Submit & Kunci
            </button>
          )}
        </div>
      </div>
      {!terkunci && alasanBelumBisaKunci && (
        <div className="text-xs text-amber-600 mb-4">⚠️ {alasanBelumBisaKunci}</div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : rentang.tipe === 'tahun' ? (
        <TabelTahunan pl={pl} judul={rentang.judul} />
      ) : (
        <LaporanBulanan pl={pl} judul={rentang.judul} />
      )}
    </Layout>
  );
}

function LaporanBulanan({ pl, judul }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="font-bold text-[#0E2F6E] mb-3">📊 Laporan Laba Rugi — {judul}</div>
      <div className="text-sm">
        <div className="font-bold text-gray-500 uppercase text-xs mb-1">Pendapatan</div>
        <div className="flex justify-between py-1"><span className="text-gray-600">Pendapatan Booking (bersih)</span><span className="font-semibold">{rp(pl?.pendapatan_booking)}</span></div>
        {pl?.pendapatan_lain_detail?.map(k => (
          <div key={k.label} className="flex justify-between py-1">
            <span className="text-gray-600">{k.label} <span className="text-gray-300 text-xs">({k.jumlah} transaksi)</span></span>
            <span className="font-semibold">{rp(k.total)}</span>
          </div>
        ))}
        <div className="flex justify-between py-1.5 border-t-2 border-gray-200 mt-1 font-bold text-[#0E2F6E]">
          <span>Total Pendapatan</span><span>{rp(pl?.pendapatan_total)}</span>
        </div>

        <div className="font-bold text-gray-500 uppercase text-xs mb-1 mt-5">Biaya</div>
        <div className="flex justify-between py-1"><span className="text-gray-600">Komisi/Ujroh</span><span className="font-semibold">{rp(pl?.komisi)}</span></div>
        <div className="flex justify-between py-1"><span className="text-gray-600">HPP (Hotel/Maskapai/Vendor)</span><span className="font-semibold">{rp(pl?.hpp)}</span></div>
        {pl?.pengeluaran_operasional?.map(k => (
          <div key={k.label} className="flex justify-between py-1">
            <span className="text-gray-600">{k.label} <span className="text-gray-300 text-xs">({k.jumlah} transaksi)</span></span>
            <span className="font-semibold">{rp(k.total)}</span>
          </div>
        ))}
        {pl?.reimburse_pending_detail?.length > 0 && (
          <>
            <div className="text-[10px] font-bold text-amber-600 uppercase mt-2">⏳ Reimburse belum dibayar (estimasi per hari ini)</div>
            {pl.reimburse_pending_detail.map((k, i) => (
              <div key={i} className="flex justify-between py-1">
                <span className="text-amber-700">{k.label}</span>
                <span className="font-semibold text-amber-700">{rp(k.total)}</span>
              </div>
            ))}
          </>
        )}
        <div className="flex justify-between py-1.5 border-t-2 border-gray-200 mt-1 font-bold text-[#0E2F6E]">
          <span>Total Biaya</span>
          <span>{rp(Number(pl?.komisi || 0) + Number(pl?.hpp || 0) + Number(pl?.total_pengeluaran_operasional || 0) + Number(pl?.total_reimburse_pending || 0))}</span>
        </div>

        <div className={`flex justify-between items-center mt-5 px-3 py-3 rounded-lg ${pl?.laba_bersih_perusahaan >= 0 ? 'bg-yellow-200' : 'bg-red-100'}`}>
          <span className="font-black text-[#0E2F6E]">LABA / RUGI</span>
          <span className={`font-black text-lg ${pl?.laba_bersih_perusahaan >= 0 ? 'text-green-700' : 'text-red-600'}`}>{rp(pl?.laba_bersih_perusahaan)}</span>
        </div>
        {pl?.total_reimburse_pending > 0 && (
          <div className="text-[10px] text-gray-400 mt-2">
            * Angka Laba/Rugi sudah termasuk estimasi reimburse belum dibayar — begitu company beneran bayar,
            baris estimasi ini otomatis hilang & digantikan transaksi cashflow asli di bulan pembayarannya
            (gak dobel kehitung).
          </div>
        )}
      </div>
    </div>
  );
}

function TabelTahunan({ pl, judul }) {
  if (!pl) return null;
  const th = "border border-gray-200 px-2 py-1.5 text-xs font-bold text-[#0E2F6E] bg-[#E8F0FB] text-right whitespace-nowrap";
  const thLabel = "border border-gray-200 px-2 py-1.5 text-xs font-bold text-[#0E2F6E] bg-[#E8F0FB] text-left";
  const td = "border border-gray-200 px-2 py-1 text-xs text-right whitespace-nowrap";
  const tdLabel = "border border-gray-200 px-2 py-1 text-xs text-left";

  const baris = (label, arr, total, bold) => (
    <tr key={label}>
      <td className={`${tdLabel} ${bold ? 'font-bold text-[#0E2F6E]' : 'text-gray-600'}`}>{label}</td>
      {arr.map((v, i) => <td key={i} className={`${td} ${bold ? 'font-bold text-[#0E2F6E]' : ''}`}>{rp(v)}</td>)}
      <td className={`${td} font-bold text-[#0E2F6E]`}>{rp(total)}</td>
    </tr>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 overflow-x-auto">
      <div className="font-bold text-[#0E2F6E] mb-3">📊 Laporan Laba Rugi — {judul}</div>
      <table className="border-collapse w-full">
        <thead>
          <tr>
            <th className={thLabel}>Keterangan</th>
            {pl.bulan_list.map(b => <th key={b} className={th}>{NAMA_BULAN_SINGKAT[Number(b.slice(5, 7)) - 1]}</th>)}
            <th className={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colSpan={pl.bulan_list.length + 2} className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase bg-gray-50">Pendapatan</td></tr>
          {baris('Pendapatan Booking (bersih)', pl.pendapatan_booking, pl.pendapatan_booking.reduce((s, v) => s + Number(v || 0), 0))}
          {pl.pendapatan_lain_rows.map(k => baris(k.label, k.per_bulan, k.total))}
          {baris('Total Pendapatan', pl.pendapatan_total, pl.pendapatan_total.reduce((s, v) => s + Number(v || 0), 0), true)}

          <tr><td colSpan={pl.bulan_list.length + 2} className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase bg-gray-50">Biaya</td></tr>
          {baris('Komisi/Ujroh', pl.komisi, pl.komisi.reduce((s, v) => s + Number(v || 0), 0))}
          {baris('HPP (Hotel/Maskapai/Vendor)', pl.hpp, pl.hpp.reduce((s, v) => s + Number(v || 0), 0))}
          {pl.pengeluaran_rows.map(k => baris(k.label, k.per_bulan, k.total))}
          {pl.reimburse_rows.map(k => baris(`⏳ ${k.label} (belum dibayar)`, k.per_bulan, k.total))}
          {baris('Total Biaya', pl.total_biaya, pl.total_biaya.reduce((s, v) => s + Number(v || 0), 0), true)}

          <tr className="bg-yellow-100">
            <td className="border border-gray-200 px-2 py-1.5 text-xs font-black text-[#0E2F6E]">LABA / RUGI</td>
            {pl.laba_rugi.map((v, i) => <td key={i} className="border border-gray-200 px-2 py-1.5 text-xs font-black text-right whitespace-nowrap">{rp(v)}</td>)}
            <td className="border border-gray-200 px-2 py-1.5 text-xs font-black text-right whitespace-nowrap">{rp(pl.laba_rugi.reduce((s, v) => s + Number(v || 0), 0))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
