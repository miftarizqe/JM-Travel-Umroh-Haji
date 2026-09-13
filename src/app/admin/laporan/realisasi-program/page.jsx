'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

export default function RealisasiProgramPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { router.replace('/admin?tab=dashboard'); }
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'super_admin') return;
    fetch('/api/admin/laporan/realisasi-program')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  if (!user || user.role !== 'super_admin') {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const rows = data?.per_program || [];

  return (
    <Layout title="🎯 Realisasi vs Budget per Program" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        <b>Budget HPP</b> = angka rencana dari HPP program × jamaah yang beneran booking (sama kayak Laporan Keuangan Program).
        <b> Realisasi</b> = duit yang BENERAN keluar/masuk lewat Cashflow yang di-tag ke program ini (input manual di Cashflow, atau otomatis pas belanja Perlengkapan diisi harga).
        Program yang belum ada transaksi ke-tag tetap tampil dengan realisasi Rp 0 — itu bukan berarti gratis, cuma belum sempat dicatat.
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#E8F0FB] text-[#0E2F6E] text-xs uppercase">
                <th className="text-left px-3 py-2.5 font-bold whitespace-nowrap">Program</th>
                <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Jamaah</th>
                <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Budget HPP</th>
                <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Realisasi Keluar</th>
                <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Realisasi Masuk</th>
                <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Selisih</th>
                <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">% Realisasi</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="text-center text-gray-400 py-6">Belum ada data.</td></tr>
              )}
              {rows.map(r => {
                const overBudget = r.budget_hpp > 0 && r.realisasi_keluar > r.budget_hpp;
                return (
                  <tr key={r.prog_id} className={`border-t border-gray-100 ${overBudget ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-2.5 font-semibold text-gray-700 whitespace-nowrap">{r.prog_name}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{r.jumlah_jamaah}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600 whitespace-nowrap">{rp(r.budget_hpp)}</td>
                    <td className="px-3 py-2.5 text-right text-red-600 whitespace-nowrap">{rp(r.realisasi_keluar)}</td>
                    <td className="px-3 py-2.5 text-right text-green-600 whitespace-nowrap">{rp(r.realisasi_masuk)}</td>
                    <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${r.selisih < 0 ? 'text-red-600' : 'text-[#0E2F6E]'}`}>
                      {rp(r.selisih)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${overBudget ? 'text-red-600' : 'text-gray-500'}`}>
                      {r.persen_realisasi == null ? '—' : `${r.persen_realisasi}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
