'use client';
import { useEffect, useState } from 'react';
import InputTanggal from '@/app/components/InputTanggal';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { rp, TabelClosing, TabelForecast } from '@/app/components/LaporanUjrohTable';

// Forecast Ujroh Agen — mirror /admin/laporan/ujroh-closing-perwakilan, TAPI
// endpoint sendiri (/api/admin/agen/forecast-ujroh), gak ikut digabung ke
// hitungLaporanUjroh() punya Perwakilan/Sahabat — rumus ujroh Agen flat
// (3,5jt/jamaah - voucher), gak butuh cost-basis lookup kayak Perwakilan.
// showBsi=false di TabelClosing — Agen gak punya skema Tabungan BSI.
export default function ForecastUjrohAgenPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  function muat() {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    fetch(`/api/admin/agen/forecast-ujroh?${qs}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user || !['admin', 'super_admin'].includes(user.role)) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const list = data?.agen || [];
  const t = data?.totals;

  return (
    <Layout title="💰 Forecast Ujroh — Agen" backHref="/admin/agen">
      <div className="text-xs text-gray-400 mb-4">
        Cuma agen yang punya minimal 1 closing/ujroh yang ditampilkan, 1 baris per orang. Tabel Pending (wajib ditransfer) dan tabel Forecast (proyeksi, belum closing) tabel terpisah — klik barisnya buat lihat rincian per program.
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
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : (
        <>
          {t && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-purple-50 rounded-xl p-4">
                <div className="text-xs text-gray-400">Agen — Pending</div>
                <div className="font-black text-lg mt-0.5 text-orange-600">{rp(t.realized)}</div>
              </div>
              <div className="bg-purple-50 rounded-xl p-4">
                <div className="text-xs text-gray-400">Agen — Forecast</div>
                <div className="font-black text-lg mt-0.5 text-[#1A4FA0]">{rp(t.forecast)}</div>
              </div>
            </div>
          )}

          <div className="mb-8">
            <div className="font-bold text-orange-700 mb-3">⏳ Agen — Pending (Wajib Ditransfer)</div>
            <TabelClosing list={list} showBsi={false} showRekening={false} />
          </div>
          <div className="mb-8">
            <div className="font-bold text-[#1A4FA0] mb-3">📊 Agen — Forecast (Proyeksi)</div>
            <TabelForecast list={list} />
          </div>
        </>
      )}
    </Layout>
  );
}
