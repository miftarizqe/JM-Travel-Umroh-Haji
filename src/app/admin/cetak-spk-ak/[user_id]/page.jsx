'use client';
import { useParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import PdfDokumenResmi from '@/app/components/PdfDokumenResmi';

// Cetak SPK-AK / SPK-AK Non-Muslim anggota Sahabat — PDF template resmi
// (bukan lagi render HTML dari pasal DB, dikonfirmasi user 2026-10-01).
// Akses dijaga di API (admin/super_admin atau anggota itu sendiri).
export default function CetakSpkAk() {
  const params = useParams();
  return (
    <Layout title="🖨️ SPK-AK (Dokumen Resmi)" showBack>
      <PdfDokumenResmi url={`/api/admin/cetak-spk-ak/${params.user_id}`} tinggi="80vh" />
    </Layout>
  );
}
