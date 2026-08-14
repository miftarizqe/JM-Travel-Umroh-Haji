'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

const KOLOM = [
  { key: 'jumlah_booking', label: 'Booking' },
  { key: 'jumlah_jamaah', label: 'Jamaah' },
  { key: 'pendapatan_program', label: 'Pendapatan Program', rp: true },
  { key: 'opsi_tambahan', label: 'Opsi Tambahan', rp: true },
  { key: 'diskon_voucher', label: 'Diskon Voucher', rp: true, minus: true },
  { key: 'pendapatan_bersih', label: 'Pendapatan Bersih', rp: true },
  { key: 'hpp', label: 'HPP', rp: true },
  { key: 'laba_kotor', label: 'Laba Kotor', rp: true },
  { key: 'komisi', label: 'Komisi/Ujroh', rp: true },
  { key: 'laba_bersih', label: 'Laba Bersih', rp: true, bold: true },
];

function Tabel({ judul, rows, labelKolom }) {
  return (
    <div className="mb-8">
      <div className="font-bold text-[#0E2F6E] mb-3">{judul}</div>
      <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#E8F0FB] text-[#0E2F6E] text-xs uppercase">
              <th className="text-left px-3 py-2.5 font-bold whitespace-nowrap">{labelKolom}</th>
              {KOLOM.map(k => (
                <th key={k.key} className="text-right px-3 py-2.5 font-bold whitespace-nowrap">{k.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={KOLOM.length + 1} className="text-center text-gray-400 py-6">Tidak ada data.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.key} className="border-t border-gray-100">
                <td className="px-3 py-2.5 font-semibold text-gray-700 whitespace-nowrap">{r.label}</td>
                {KOLOM.map(k => (
                  <td key={k.key} className={`text-right px-3 py-2.5 whitespace-nowrap ${k.bold ? 'font-bold text-[#0E2F6E]' : 'text-gray-600'}`}>
                    {k.rp ? `${k.minus && r[k.key] > 0 ? '−' : ''}${rp(r[k.key])}` : r[k.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LaporanKeuanganProgramPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [programs, setPrograms] = useState([]);
  const [progId, setProgId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); }
  }, [user]);

  useEffect(() => {
    fetch('/api/admin/programs').then(r => r.json()).then(d => setPrograms(d.programs || []));
  }, []);

  function muat() {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (progId) qs.set('prog_id', progId);
    fetch(`/api/admin/laporan-keuangan-program?${qs}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { muat(); }, []);

  if (!user || !['admin','super_admin'].includes(user.role)) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const g = data?.grand_total;

  function exportExcel() {
    const qs = new URLSearchParams({ type: 'laporan-keuangan-program' });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (progId) qs.set('prog_id', progId);
    window.open(`/api/admin/export?${qs}`, '_blank');
  }

  return (
    <Layout title="📊 Laporan Keuangan Program" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Pendapatan dipecah eksplisit (harga program, opsi tambahan, diskon voucher) supaya tidak ada yang tersembunyi, ditambah HPP dan komisi/ujroh yang sudah dicairkan — dari booking yang DP-nya sudah dikonfirmasi & tidak dibatalkan. Rincian siapa yang harus ditransfer & ke rekening mana ada di Laporan Closing &amp; Forecast Ujroh.
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Dari Tanggal</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Sampai Tanggal</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Program</label>
          <select value={progId} onChange={e => setProgId(e.target.value)}
            className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm min-w-[200px]">
            <option value="">Semua Program</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
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
          {g && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'Pendapatan Bersih', val: g.pendapatan_bersih, color: 'text-[#0E2F6E]' },
                { label: 'HPP', val: g.hpp, color: 'text-gray-600' },
                { label: 'Komisi/Ujroh', val: g.komisi, color: 'text-[#C9952A]' },
                { label: 'Laba Bersih', val: g.laba_bersih, color: 'text-green-600' },
              ].map(c => (
                <div key={c.label} className="bg-[#E8F0FB] rounded-xl p-4">
                  <div className="text-xs text-gray-400">{c.label}</div>
                  <div className={`font-black text-lg mt-0.5 ${c.color}`}>{rp(c.val)}</div>
                </div>
              ))}
            </div>
          )}

          <Tabel judul="📅 Per Bulan" rows={data?.per_bulan || []} labelKolom="Bulan" />
          <Tabel judul="🕋 Per Program" rows={data?.per_program || []} labelKolom="Program" />
        </>
      )}
    </Layout>
  );
}
