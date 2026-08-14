'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

// Sumber ujroh — bedain closing LANGSUNG (booking sendiri) vs override/leader/
// margin reseller (dari closing orang lain di jaringan bawahnya).
const JENIS_LABEL = {
  closing_pribadi: 'Closing Langsung (Pribadi)',
  closing_bsi: 'Closing Langsung (Tabungan BSI)',
  reseller_perwakilan: 'Margin Reseller (dari downline)',
  margin_pribadi: 'Closing Langsung (Margin Pribadi)',
  margin_reseller: 'Margin Reseller (dari downline)',
};

// Rekap 1 orang punya banyak transaksi per program+sumber jadi 1 baris —
// "kalo 1 program ada beberapa transaksi, totalin diujung" — bukan baris
// mentah per transaksi, tapi tetap kelihatan closing langsung vs override.
function groupByProgram(detail) {
  const map = {};
  for (const item of detail) {
    const key = `${item.prog_name}__${item.jenis}`;
    if (!map[key]) {
      map[key] = {
        prog_name: item.prog_name || '-', jenis: item.jenis,
        sumber: JENIS_LABEL[item.jenis] || item.jenis,
        kategori: item.kategori || '-', bookingSet: new Set(), jumlah_jamaah: 0, nominal: 0,
      };
    }
    map[key].bookingSet.add(item.booking_id);
    map[key].jumlah_jamaah += Number(item.jumlah_jamaah || 0);
    map[key].nominal += Number(item.nominal || 0);
  }
  return Object.values(map)
    .map(g => ({ ...g, jumlah_booking: g.bookingSet.size }))
    .sort((a, b) => b.nominal - a.nominal);
}

function DetailProgram({ grouped, adaKategori }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-gray-400 uppercase">
            <th className="text-left px-2 py-1.5 font-bold">Program</th>
            <th className="text-left px-2 py-1.5 font-bold">Sumber</th>
            {adaKategori && <th className="text-left px-2 py-1.5 font-bold">Kategori</th>}
            <th className="text-right px-2 py-1.5 font-bold">Jml Booking</th>
            <th className="text-right px-2 py-1.5 font-bold">Jml Jamaah</th>
            <th className="text-right px-2 py-1.5 font-bold">Nominal</th>
          </tr>
        </thead>
        <tbody>
          {grouped.length === 0 && (
            <tr><td colSpan={adaKategori ? 6 : 5} className="text-center text-gray-400 py-3">Tidak ada data.</td></tr>
          )}
          {grouped.map((g, i) => (
            <tr key={i} className="border-t border-gray-200">
              <td className="px-2 py-1.5 text-gray-700">{g.prog_name}</td>
              <td className="px-2 py-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${g.jenis.startsWith('closing_') || g.jenis === 'margin_pribadi' ? 'bg-[#E8F0FB] text-[#1A4FA0]' : 'bg-amber-100 text-amber-700'}`}>
                  {g.sumber}
                </span>
              </td>
              {adaKategori && <td className="px-2 py-1.5 text-gray-500">{g.kategori}</td>}
              <td className="px-2 py-1.5 text-right text-gray-500">{g.jumlah_booking}</td>
              <td className="px-2 py-1.5 text-right text-gray-500">{g.jumlah_jamaah}</td>
              <td className="px-2 py-1.5 text-right font-bold text-[#0E2F6E]">{rp(g.nominal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ==================== TABEL CLOSING (sudah cair) ====================
function BarisClosing({ orang }) {
  const [buka, setBuka] = useState(false);
  const grouped = groupByProgram(orang.realized_detail);
  return (
    <>
      <tr onClick={() => setBuka(b => !b)} className="cursor-pointer hover:bg-[#F8F9FD] border-t border-gray-100">
        <td className="px-3 py-2.5">
          <div className="font-semibold text-gray-700">{orang.name}</div>
          <div className="text-[10px] text-gray-400">
            {orang.kode_unik} {orang.bank ? `· ${orang.bank} ${orang.no_rekening || ''}` : <span className="text-red-400">· rekening belum diisi</span>}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right text-gray-600 whitespace-nowrap">{rp(orang.realized_pribadi)}</td>
        <td className="px-3 py-2.5 text-right text-purple-600 whitespace-nowrap">{rp(orang.realized_bsi)}</td>
        <td className="px-3 py-2.5 text-right font-black text-green-600 whitespace-nowrap">{rp(orang.realized_total)}</td>
        <td className="px-3 py-2.5 text-center text-gray-400 w-6">{buka ? '▲' : '▼'}</td>
      </tr>
      {buka && (
        <tr>
          <td colSpan={5} className="bg-gray-50 border-t border-gray-100 p-3">
            <DetailProgram grouped={grouped} adaKategori />
          </td>
        </tr>
      )}
    </>
  );
}

function TabelClosing({ list }) {
  const total = list.reduce((acc, o) => ({
    realized_pribadi: acc.realized_pribadi + o.realized_pribadi,
    realized_bsi: acc.realized_bsi + o.realized_bsi,
    realized_total: acc.realized_total + o.realized_total,
  }), { realized_pribadi: 0, realized_bsi: 0, realized_total: 0 });

  return (
    <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-green-50 text-green-700 text-xs uppercase">
            <th className="text-left px-3 py-2.5 font-bold whitespace-nowrap">Nama</th>
            <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Rekening Pribadi</th>
            <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Tabungan BSI</th>
            <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Total Closing</th>
            <th className="w-6"></th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr><td colSpan={5} className="text-center text-gray-400 py-8">Belum ada yang cair pada periode ini.</td></tr>
          )}
          {list.map(o => <BarisClosing key={o.id} orang={o} />)}
        </tbody>
        {list.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-green-600 bg-green-50/60 font-bold">
              <td className="px-3 py-2.5 text-green-700">TOTAL</td>
              <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">{rp(total.realized_pribadi)}</td>
              <td className="px-3 py-2.5 text-right text-purple-700 whitespace-nowrap">{rp(total.realized_bsi)}</td>
              <td className="px-3 py-2.5 text-right text-green-700 whitespace-nowrap">{rp(total.realized_total)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ==================== TABEL FORECAST (belum closing) ====================
function BarisForecast({ orang }) {
  const [buka, setBuka] = useState(false);
  const grouped = groupByProgram(orang.forecast_detail);
  return (
    <>
      <tr onClick={() => setBuka(b => !b)} className="cursor-pointer hover:bg-[#F8F9FD] border-t border-gray-100">
        <td className="px-3 py-2.5">
          <div className="font-semibold text-gray-700">{orang.name}</div>
          <div className="text-[10px] text-gray-400">{orang.kode_unik}</div>
        </td>
        <td className="px-3 py-2.5 text-right font-black text-[#C9952A] whitespace-nowrap">{rp(orang.forecast_total)}</td>
        <td className="px-3 py-2.5 text-center text-gray-400 w-6">{buka ? '▲' : '▼'}</td>
      </tr>
      {buka && (
        <tr>
          <td colSpan={3} className="bg-gray-50 border-t border-gray-100 p-3">
            <DetailProgram grouped={grouped} adaKategori={false} />
          </td>
        </tr>
      )}
    </>
  );
}

function TabelForecast({ list }) {
  const total = list.reduce((s, o) => s + o.forecast_total, 0);

  return (
    <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#FEF3DC] text-[#8a6516] text-xs uppercase">
            <th className="text-left px-3 py-2.5 font-bold whitespace-nowrap">Nama</th>
            <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Total Forecast</th>
            <th className="w-6"></th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr><td colSpan={3} className="text-center text-gray-400 py-8">Tidak ada potensi ujroh yang belum closing.</td></tr>
          )}
          {list.map(o => <BarisForecast key={o.id} orang={o} />)}
        </tbody>
        {list.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-[#C9952A] bg-[#FEF3DC]/60 font-bold">
              <td className="px-3 py-2.5 text-[#8a6516]">TOTAL</td>
              <td className="px-3 py-2.5 text-right text-[#8a6516] whitespace-nowrap">{rp(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function LaporanUjrohClosingPage() {
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
    fetch(`/api/admin/laporan-ujroh?${qs}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); }
  }, [user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { muat(); }, []);

  if (!user || !['admin','super_admin'].includes(user.role)) {
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
    <Layout title="💰 Closing & Forecast Ujroh" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Cuma perwakilan yang punya minimal 1 closing yang ditampilkan, 1 baris per orang. Tabel <b>Closing</b> (sudah cair, dipecah Rekening Pribadi vs Tabungan BSI) dan tabel <b>Forecast</b> (proyeksi, belum closing) sengaja tabel terpisah — klik barisnya buat lihat rincian per program (jumlah jamaah, dll). Export Excel berisi rincian transaksi lengkap di sheet terpisah.
      </div>

      {/* Filter periode + export */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Cair Dari Tanggal</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Cair Sampai Tanggal</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
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
          {/* Grand total */}
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
            <div className="font-bold text-green-700 mb-3">✅ Closing — Sudah Cair (Wajib Ditransfer)</div>
            <TabelClosing list={list} />
          </div>

          <div className="mb-4">
            <div className="font-bold text-[#8a6516] mb-3">⏳ Forecast — Belum Closing (Proyeksi)</div>
            <TabelForecast list={list} />
          </div>
        </>
      )}
    </Layout>
  );
}
