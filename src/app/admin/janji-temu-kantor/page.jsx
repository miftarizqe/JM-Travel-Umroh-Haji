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

// Janji temu "Datang ke Kantor" LINTAS ROLE (dikonfirmasi user 2026-10-05 —
// sebelumnya cuma Sahabat Baitullah, dipindah dari /admin/sahabat/kunjungan
// & dikeluarkan dari section role spesifik karena perwakilan juga punya
// pilihan metode pendaftaran "kantor" yang sama butuh dipantau). Sumber data
// TETAP di tabel masing-masing (users.metode_ttd_sahabat untuk Sahabat,
// agen_pendaftaran.metode untuk Perwakilan) — digabung di sini doang,
// bukan tabel baru (dikonfirmasi user, belum ada kebutuhan role lain lagi).
export default function JanjiTemuKantorPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [sahabat, setSahabat] = useState(null);
  const [perwakilan, setPerwakilan] = useState(null);
  const [cari, setCari] = useState('');

  const isAdmin = ['admin', 'super_admin'].includes(user?.role);

  useEffect(() => {
    if (user && !isAdmin) router.replace('/');
  }, [user, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/admin/sahabat/database').then(r => r.json()).then(d => setSahabat(d.jamaah || [])).catch(() => setSahabat([]));
    fetch('/api/admin/perwakilan/database').then(r => r.json()).then(d => setPerwakilan(d.perwakilan || [])).catch(() => setPerwakilan([]));
  }, [isAdmin]);

  if (!user || !isAdmin) return <Layout><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

  const loading = sahabat === null || perwakilan === null;
  const gabungan = loading ? [] : [
    ...sahabat.filter(j => j.metode_ttd_sahabat === 'kantor').map(j => ({
      user_id: j.user_id, nama: j.nama, kode_unik: j.kode_unik, wa: j.wa, tanggal: j.rencana_kunjungan_kantor_at,
      sumber: 'Sahabat Baitullah', keperluan: 'TTD Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF & Surat Pemblokiran',
      cetak: `/api/sahabat/dokumen-legal/unduh-lengkap?user_id=${j.user_id}`,
    })),
    ...perwakilan.filter(j => j.pendaftaran_metode === 'kantor' && j.jadwal_kunjungan).map(j => ({
      user_id: j.user_id, nama: j.nama, kode_unik: j.kode_unik, wa: j.wa, tanggal: j.jadwal_kunjungan,
      sumber: 'Perwakilan', keperluan: 'TTD Perjanjian Kerjasama Perwakilan', cetak: null,
    })),
  ];

  const q = cari.trim().toLowerCase();
  const kunjungan = gabungan
    .filter(j => !q || (j.nama || '').toLowerCase().includes(q) || (j.kode_unik || '').toLowerCase().includes(q) || (j.wa || '').includes(q))
    .sort((a, b) => new Date(a.tanggal || 0) - new Date(b.tanggal || 0));

  const terlewat = kunjungan.filter(j => j.tanggal && hariLagi(j.tanggal) < 0);
  const hariIni = kunjungan.filter(j => j.tanggal && hariLagi(j.tanggal) === 0);
  const akanDatang = kunjungan.filter(j => j.tanggal && hariLagi(j.tanggal) > 0);

  const Baris = ({ j, warna }) => (
    <div className={`border rounded-xl p-4 ${warna}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-bold text-[#0E2F6E]">{j.nama} <span className="text-gray-400 font-normal text-xs">({j.kode_unik || '-'})</span></div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 text-gray-500 whitespace-nowrap">{j.sumber}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{fmtTanggal(j.tanggal)}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{j.keperluan}</div>
          {j.wa && (
            <a href={waLink(j.wa)} target="_blank" rel="noopener noreferrer" className="text-xs text-green-700 font-semibold hover:underline">💬 {j.wa}</a>
          )}
        </div>
        {j.cetak && (
          <button onClick={() => window.open(j.cetak, '_blank')}
            className="text-[11px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full hover:bg-blue-100 shrink-0 whitespace-nowrap">
            🖨️ Cetak Dokumen
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Layout title="🏢 Janji Temu Datang ke Kantor" backHref="/admin">
      <div className="space-y-4">
        <div className="text-xs text-gray-500">
          Semua yang pilih datang langsung ke kantor (Sahabat Baitullah &amp; Perwakilan), diurutkan dari tanggal rencana kunjungan terdekat.
        </div>

        {gabungan.length > 0 && (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input value={cari} onChange={e => setCari(e.target.value)}
              placeholder="Cari nama, kode, atau WA..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-10 text-sm">Memuat...</div>
        ) : kunjungan.length === 0 ? (
          <div className="text-center text-gray-400 py-10 text-sm">
            {gabungan.length === 0 ? 'Belum ada yang pilih datang ke kantor.' : `Tidak ada yang cocok dengan pencarian "${cari}".`}
          </div>
        ) : (
          <div className="space-y-5">
            {terlewat.length > 0 && (
              <div>
                <div className="text-[11px] font-black text-red-500 uppercase tracking-wide mb-2">⏰ Terlewat ({terlewat.length})</div>
                <div className="space-y-2">{terlewat.map(j => <Baris key={`${j.sumber}-${j.user_id}`} j={j} warna="border-red-200 bg-red-50" />)}</div>
              </div>
            )}
            {hariIni.length > 0 && (
              <div>
                <div className="text-[11px] font-black text-amber-600 uppercase tracking-wide mb-2">📍 Hari Ini ({hariIni.length})</div>
                <div className="space-y-2">{hariIni.map(j => <Baris key={`${j.sumber}-${j.user_id}`} j={j} warna="border-amber-200 bg-amber-50" />)}</div>
              </div>
            )}
            {akanDatang.length > 0 && (
              <div>
                <div className="text-[11px] font-black text-gray-400 uppercase tracking-wide mb-2">🗓️ Akan Datang ({akanDatang.length})</div>
                <div className="space-y-2">{akanDatang.map(j => <Baris key={`${j.sumber}-${j.user_id}`} j={j} warna="border-blue-200 bg-blue-50" />)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
