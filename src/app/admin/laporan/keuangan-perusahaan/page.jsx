'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const namaBulan = (b) => {
  if (!b) return '-';
  const [y, m] = b.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

export default function LaporanKeuanganPerusahaanHub() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [periodeList, setPeriodeList] = useState([]);
  const [tahun, setTahun] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { router.replace('/admin?tab=dashboard'); }
  }, [user]);

  useEffect(() => {
    fetch('/api/admin/cashflow/periode').then(r => r.json())
      .then(p => {
        const list = p.periode || [];
        setPeriodeList(list);
        if (list.length > 0) setTahun(list[0].bulan.slice(0, 4));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (!user || user.role !== 'super_admin') {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const daftarTahun = [...new Set(periodeList.map(p => p.bulan.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const bulanTahunIni = periodeList.filter(p => p.bulan.slice(0, 4) === tahun).sort((a, b) => b.bulan.localeCompare(a.bulan));

  return (
    <Layout title="🔒 Laporan Keuangan Perusahaan" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Khusus super admin. Menggabungkan pendapatan &amp; komisi dari Laporan Keuangan Program dengan pengeluaran operasional (gaji, sewa, marketing, dll) — jadi laba/rugi bersih PERUSAHAAN yang sesungguhnya, bukan cuma per booking. Riwayat di sini ikut bulan-bulan yang sudah dibuat di{' '}
        <Link href="/admin/laporan/cashflow" className="text-[#1A4FA0] font-semibold hover:underline">Cashflow Bulanan</Link>{' '}
        (kategori yang ditandai &quot;Termasuk Laba Rugi&quot; juga dikelola di sana).
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : periodeList.length === 0 ? (
        <div className="text-center text-gray-400 py-10 text-sm">
          Belum ada Cashflow Bulanan.{' '}
          <Link href="/admin/laporan/cashflow" className="text-[#1A4FA0] font-semibold hover:underline">Buat dulu di Cashflow</Link>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Tahun</label>
              <select value={tahun} onChange={e => setTahun(e.target.value)}
                className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                {daftarTahun.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button onClick={() => router.push(`/admin/laporan/keuangan-perusahaan/${tahun}`)}
              className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl">
              📊 Lihat Laba Rugi Setahun Penuh ({tahun})
            </button>
          </div>

          <div className="space-y-3">
            {bulanTahunIni.map(p => (
              <button key={p.id} onClick={() => router.push(`/admin/laporan/keuangan-perusahaan/${p.bulan}`)}
                className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-[#1A4FA0] p-4 flex items-center justify-between">
                <div className="font-bold text-[#0E2F6E]">{namaBulan(p.bulan)}</div>
                <div className="text-xs text-gray-400">
                  {p.status === 'submitted' ? `🔒 Terkunci · disubmit ${new Date(p.submitted_at).toLocaleDateString('id-ID')}` : '📝 Draft'}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}
