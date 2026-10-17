'use client';
import { Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import PdfDokumenResmi from '@/app/components/PdfDokumenResmi';

// Cetak SPK-AK / SPK-AK Non-Muslim anggota Sahabat — PDF template resmi
// (bukan lagi render HTML dari pasal DB, dikonfirmasi user 2026-10-01).
// Akses dijaga di API (admin/super_admin atau anggota itu sendiri).
export default function CetakSpkAk() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Memuat...</div>}>
      <CetakSpkAkInner />
    </Suspense>
  );
}

function CetakSpkAkInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Toggle rangkap (dikonfirmasi user 2026-10-17) -- KHUSUS buat admin, cuma
  // relevan buat metode "kirim" (defaultnya cuma dapat rangkap jamaah,
  // rangkap management harus diambil terpisah di sini buat dicetak & dikirim
  // manual ke jamaah oleh kantor). Metode "kantor" biasanya gak perlu toggle
  // ini (udah dapat 2 rangkap gabung lewat tombol "Rangkap Jamaah" biasa),
  // tapi tombolnya tetap ditampilkan terlepas dari metode -- gak nge-fetch
  // metode_ttd_sahabat dulu di sini biar halaman tetap simpel, dan gak ada
  // ruginya kalau dipencet tetap balik rangkap yang diminta.
  const rangkap = searchParams.get('rangkap') === 'management' ? 'management' : 'jamaah';
  const gantiRangkap = (r) => router.push(`/admin/cetak-spk-ak/${params.user_id}?rangkap=${r}`);

  return (
    <Layout title="🖨️ Surat Perjanjian Jamaah Sahabat Baitullah (Dokumen Resmi)" showBack>
      <div className="flex gap-2 justify-center mb-3">
        <button onClick={() => gantiRangkap('jamaah')}
          className={`text-xs font-bold px-4 py-2 rounded-full ${rangkap === 'jamaah' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
          Rangkap Jamaah
        </button>
        <button onClick={() => gantiRangkap('management')}
          className={`text-xs font-bold px-4 py-2 rounded-full ${rangkap === 'management' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
          Rangkap Management
        </button>
      </div>
      <div className="text-center text-[11px] text-gray-400 mb-3">
        {rangkap === 'management'
          ? 'Rangkap buat kantor — dicetak & dikirim manual ke jamaah metode "kirim sendiri", bukan diunduh jamaah.'
          : 'Rangkap buat jamaah — sama persis yang jamaah unduh sendiri. Dipakai kalau jamaah minta diprintin ulang dari sini.'}
      </div>
      <PdfDokumenResmi url={`/api/admin/cetak-spk-ak/${params.user_id}?rangkap=${rangkap}`} tinggi="80vh" />
    </Layout>
  );
}
