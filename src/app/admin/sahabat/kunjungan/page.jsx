'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

function fmtTanggal(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function hariLagi(iso) {
  const target = new Date(iso); target.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}
function waLink(wa) {
  if (!wa) return null;
  const digit = wa.replace(/\D/g, '');
  return `https://wa.me/${digit.startsWith('0') ? '62' + digit.slice(1) : digit}`;
}

// Daftar jamaah Sahabat Baitullah yang pilih "Datang ke Kantor" buat TTD
// fisik Surat Perjanjian Jamaah Sahabat Baitullah/SK-CIF/Surat Pemblokiran
// (lihat src/app/api/sahabat/metode-ttd/route.js). Sebelumnya notifikasi
// admin cuma nyebut nama & tanggal doang tanpa ada halaman buat lihat
// SIAPA AJA yang udah janji datang & kapan (dikonfirmasi user 2026-10-04)
// — dipisah dari Database Jamaah biar admin gak perlu nyisir satu-satu.
// Data source SAMA dengan /admin/sahabat/database (filter metode_ttd_sahabat
// === 'kantor' di client, data gak digandakan).
export default function KunjunganKantorPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [jamaah, setJamaah] = useState(null);
  const [cari, setCari] = useState('');

  const isAdmin = ['admin', 'super_admin'].includes(user?.role);

  useEffect(() => {
    if (user && !isAdmin) router.replace('/');
  }, [user, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/admin/sahabat/database').then(r => r.json())
      .then(d => setJamaah(d.jamaah || []))
      .catch(() => setJamaah([]));
  }, [isAdmin]);

  if (!user || !isAdmin) return <Layout><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

  const q = cari.trim().toLowerCase();
  const kunjungan = (jamaah || [])
    .filter(j => j.metode_ttd_sahabat === 'kantor')
    .filter(j => !q || (j.nama || '').toLowerCase().includes(q) || (j.kode_unik || '').toLowerCase().includes(q) || (j.wa || '').includes(q))
    .sort((a, b) => new Date(a.rencana_kunjungan_kantor_at || 0) - new Date(b.rencana_kunjungan_kantor_at || 0));

  const terlewat = kunjungan.filter(j => j.rencana_kunjungan_kantor_at && hariLagi(j.rencana_kunjungan_kantor_at) < 0);
  const hariIni = kunjungan.filter(j => j.rencana_kunjungan_kantor_at && hariLagi(j.rencana_kunjungan_kantor_at) === 0);
  const akanDatang = kunjungan.filter(j => j.rencana_kunjungan_kantor_at && hariLagi(j.rencana_kunjungan_kantor_at) > 0);

  const Baris = ({ j, warna }) => (
    <div className={`border rounded-xl p-4 ${warna}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-bold text-[#0E2F6E]">{j.nama} <span className="text-gray-400 font-normal text-xs">({j.kode_unik || '-'})</span></div>
          <div className="text-xs text-gray-500 mt-0.5">{fmtTanggal(j.rencana_kunjungan_kantor_at)}</div>
          {j.wa && (
            <a href={waLink(j.wa)} target="_blank" rel="noopener noreferrer" className="text-xs text-green-700 font-semibold hover:underline">💬 {j.wa}</a>
          )}
        </div>
        <button onClick={() => window.open(`/api/sahabat/dokumen-legal/unduh-lengkap?user_id=${j.user_id}`, '_blank')}
          className="text-[11px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full hover:bg-blue-100 shrink-0 whitespace-nowrap">
          🖨️ Cetak Dokumen
        </button>
      </div>
    </div>
  );

  return (
    <Layout title="🏢 Janji Temu — Datang ke Kantor" backHref="/admin/sahabat/database">
      <div className="space-y-4">
        <div className="text-xs text-gray-500">
          Jamaah Sahabat Baitullah yang pilih TTD fisik langsung di kantor (Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF &amp; Surat Pemblokiran), diurutkan dari tanggal rencana kunjungan terdekat.
        </div>

        {jamaah && jamaah.filter(j => j.metode_ttd_sahabat === 'kantor').length > 0 && (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input value={cari} onChange={e => setCari(e.target.value)}
              placeholder="Cari nama, kode, atau WA..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
          </div>
        )}

        {jamaah === null ? (
          <div className="text-center text-gray-400 py-10 text-sm">Memuat...</div>
        ) : kunjungan.length === 0 ? (
          <div className="text-center text-gray-400 py-10 text-sm">
            {jamaah.filter(j => j.metode_ttd_sahabat === 'kantor').length === 0 ? 'Belum ada jamaah yang pilih datang ke kantor.' : `Tidak ada yang cocok dengan pencarian "${cari}".`}
          </div>
        ) : (
          <div className="space-y-5">
            {terlewat.length > 0 && (
              <div>
                <div className="text-[11px] font-black text-red-500 uppercase tracking-wide mb-2">⏰ Terlewat ({terlewat.length})</div>
                <div className="space-y-2">{terlewat.map(j => <Baris key={j.user_id} j={j} warna="border-red-200 bg-red-50" />)}</div>
              </div>
            )}
            {hariIni.length > 0 && (
              <div>
                <div className="text-[11px] font-black text-amber-600 uppercase tracking-wide mb-2">📍 Hari Ini ({hariIni.length})</div>
                <div className="space-y-2">{hariIni.map(j => <Baris key={j.user_id} j={j} warna="border-amber-200 bg-amber-50" />)}</div>
              </div>
            )}
            {akanDatang.length > 0 && (
              <div>
                <div className="text-[11px] font-black text-gray-400 uppercase tracking-wide mb-2">🗓️ Akan Datang ({akanDatang.length})</div>
                <div className="space-y-2">{akanDatang.map(j => <Baris key={j.user_id} j={j} warna="border-blue-200 bg-blue-50" />)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
