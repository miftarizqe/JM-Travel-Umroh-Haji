'use client';
import { useEffect, useState } from 'react';
import InputTanggal from '@/app/components/InputTanggal';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useIsHop } from '@/lib/useIsHop';
import { rp, TabelClosing, TabelForecast } from '@/app/components/LaporanUjrohTable';

// Dipisah dari /admin/laporan/ujroh-closing (dikonfirmasi user 2026-10-12)
// — section Perwakilan sebelumnya numpang di halaman yang sama dengan
// Sahabat Baitullah, "nyasar" begitu dibuka dari menu Sahabat
// Baitullah/HoP. Sekarang halaman sendiri, link-nya di sidebar grup
// "Perwakilan". Admin-only (gak ada versi HoP — HoP itu Sahabat
// Baitullah, gak ada hubungannya sama Perwakilan sama sekali).
// Warna TETAP hijau/amber (gak diubah, cuma yang Sahabat Baitullah yang
// ganti oranye/biru).
export default function LaporanUjrohClosingPerwakilanPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const { isAdmin, checked: hopChecked } = useIsHop(user);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  function muat() {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    fetch(`/api/admin/laporan-ujroh?${qs}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user || !hopChecked) return;
    if (!isAdmin) { router.replace('/login'); }
  }, [user, hopChecked, isAdmin]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (hopChecked) muat(); }, [hopChecked]);

  if (!user || !hopChecked || !isAdmin) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const list = data?.perwakilan || [];
  const t = data?.totals;

  function exportExcel() {
    const qs = new URLSearchParams({ type: 'laporan-ujroh' });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    window.open(`/api/admin/export?${qs}`, '_blank');
  }

  return (
    <Layout title="💰 Closing & Forecast Ujroh — Perwakilan" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Cuma yang punya minimal 1 closing/komisi yang ditampilkan, 1 baris per orang. Tabel Sudah Cair (dipecah Rekening Pribadi vs Tabungan BSI) dan tabel Forecast (proyeksi, belum closing) sengaja tabel terpisah — klik barisnya buat lihat rincian per program. Export Excel berisi rincian transaksi lengkap di sheet terpisah.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Cair Dari Tanggal</label>
          <InputTanggal value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Cair Sampai Tanggal</label>
          <InputTanggal value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
        </div>
        <button onClick={muat}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          Terapkan Filter
        </button>
        <button onClick={exportExcel}
          className="ml-auto bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          ⬇️ Export ke Excel
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : (
        <>
          {t && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-purple-50 rounded-xl p-4">
                <div className="text-xs text-gray-400">Perwakilan — Sudah Cair</div>
                <div className="font-black text-lg mt-0.5 text-green-600">{rp(t.perwakilan_realized)}</div>
              </div>
              <div className="bg-purple-50 rounded-xl p-4">
                <div className="text-xs text-gray-400">Perwakilan — Forecast</div>
                <div className="font-black text-lg mt-0.5 text-[#C9952A]">{rp(t.perwakilan_forecast)}</div>
              </div>
            </div>
          )}

          <div className="mb-8">
            <div className="font-bold text-green-700 mb-3">✅ Perwakilan — Sudah Cair (Wajib Ditransfer)</div>
            <TabelClosing list={list} tema="hijau" />
          </div>
          <div className="mb-8">
            <div className="font-bold text-[#8a6516] mb-3">⏳ Perwakilan — Forecast (Proyeksi)</div>
            <TabelForecast list={list} tema="amber" />
          </div>
        </>
      )}
    </Layout>
  );
}
