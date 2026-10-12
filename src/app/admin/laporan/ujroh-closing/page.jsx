'use client';
import { useEffect, useState } from 'react';
import InputTanggal from '@/app/components/InputTanggal';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useIsHop } from '@/lib/useIsHop';
import { rp, TabelClosing, TabelForecast } from '@/app/components/LaporanUjrohTable';

// Khusus Sahabat Baitullah (dikonfirmasi user 2026-10-12) — section
// Perwakilan DIPINDAH ke halaman sendiri
// (/admin/laporan/ujroh-closing-perwakilan, link di sidebar grup
// "Perwakilan") biar gak "nyasar" nongol di halaman yang diakses dari
// menu Sahabat Baitullah/HoP. Label & warna section pertama juga diganti
// dari "Sudah Cair" (hijau) jadi "Pending" (oranye) -- baris di sini
// MASIH "Wajib Ditransfer" alias BELUM beneran ditransfer, jadi "Sudah
// Cair" kesannya keliru. Forecast tetap namanya, cuma warna hijau->biru.
export default function LaporanUjrohClosingPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const { isAdminOrHop, isHop, checked: hopChecked } = useIsHop(user);
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
    if (!isAdminOrHop) { router.replace('/login'); }
  }, [user, hopChecked, isAdminOrHop]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (hopChecked) muat(); }, [hopChecked]);

  if (!user || !hopChecked || !isAdminOrHop) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const sahabatList = data?.sahabat || [];
  // HoP (role 'hop') itu sendiri ikut muncul di sahabatList kalau pernah
  // dapat bagian 'Bagian Head of Program' — ditonjolkan terpisah biar HoP
  // gampang lihat forecast PRIBADINYA tanpa harus nyari di tabel panjang
  // (dikonfirmasi user 2026-10-08: "forecast yang dia dapet pribadi brp").
  const meForecast = isHop ? sahabatList.find(o => o.id === data?.me_id) : null;
  const t = data?.totals;

  function exportExcel() {
    const qs = new URLSearchParams({ type: 'laporan-ujroh' });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    window.open(`/api/admin/export?${qs}`, '_blank');
  }

  return (
    <Layout title="💰 Closing & Forecast Ujroh — Sahabat Baitullah" backHref={isHop ? '/dashboard/sahabat/hop' : '/admin?tab=dashboard'}>
      <div className="text-xs text-gray-400 mb-4">
        {isHop
          ? 'Ujroh Sahabat Baitullah dari 2 sumber: closing booking program reguler, DAN komisi generasi (Gen1-5 + registrasi HOP) dari rekrutan baru — baris Anda sendiri ditandai badge "HOP". Forecast closing dihitung dari booking yang masih aktif; forecast generasi dihitung dari pendaftaran yang masih dalam proses (belum di-ACC admin). Tabel Pending (wajib ditransfer) dan Forecast (proyeksi) terpisah — klik barisnya buat lihat rincian.'
          : 'Cuma yang punya minimal 1 closing/komisi yang ditampilkan, 1 baris per orang. Sahabat Baitullah mencakup 2 sumber ujroh: closing booking program, dan komisi generasi (Gen1-5 + registrasi HOP) dari rekrutan baru. Tabel Pending (wajib ditransfer) dan tabel Forecast (proyeksi, belum closing/belum aktif) sengaja tabel terpisah — klik barisnya buat lihat rincian per program/rekrutan. Export Excel berisi rincian transaksi lengkap di sheet terpisah.'}
      </div>

      {/* Filter periode + export */}
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
        {!isHop && (
          <button onClick={exportExcel}
            className="ml-auto bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
            ⬇️ Export ke Excel
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : (
        <>
          {/* Kartu forecast pribadi HoP — paling atas, paling nonjol */}
          {isHop && meForecast && (
            <div className="bg-[#0E2F6E] rounded-xl p-4 mb-6 text-white">
              <div className="text-xs text-blue-100">🎖️ Forecast &amp; Closing Anda Pribadi (Head of Program)</div>
              <div className="flex gap-6 mt-1">
                <div><div className="text-[10px] text-blue-200">Pending</div><div className="font-black text-lg text-orange-300">{rp(meForecast.realized_total)}</div></div>
                <div><div className="text-[10px] text-blue-200">Forecast</div><div className="font-black text-lg text-blue-300">{rp(meForecast.forecast_total)}</div></div>
              </div>
            </div>
          )}

          {t && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-[#E8F0FB] rounded-xl p-4">
                <div className="text-xs text-gray-400">Sahabat Baitullah — Pending</div>
                <div className="font-black text-lg mt-0.5 text-orange-600">{rp(t.sahabat_realized)}</div>
              </div>
              <div className="bg-[#E8F0FB] rounded-xl p-4">
                <div className="text-xs text-gray-400">Sahabat Baitullah — Forecast</div>
                <div className="font-black text-lg mt-0.5 text-[#1A4FA0]">{rp(t.sahabat_forecast)}</div>
              </div>
            </div>
          )}

          <div className="mb-8">
            <div className="font-bold text-orange-700 mb-3">⏳ Sahabat Baitullah — Pending (Wajib Ditransfer)</div>
            <TabelClosing list={sahabatList} showBsi={false} tema="oranye" />
          </div>

          <div className="mb-4">
            <div className="font-bold text-[#1A4FA0] mb-3">📊 Sahabat Baitullah — Forecast (Proyeksi)</div>
            <TabelForecast list={sahabatList} tema="biru" />
          </div>
        </>
      )}
    </Layout>
  );
}
