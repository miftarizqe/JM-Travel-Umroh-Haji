// PDF SPK-AK / SPK-AK Non-Muslim resmi (template final, identitas terisi)
// untuk 1 anggota Sahabat Baitullah — SATU fungsi yang dipakai semua jalur
// "lihat/cetak" (dikonfirmasi user 2026-10-01): /api/sahabat/unduh-spk-ak
// (anggota sendiri) dan /api/admin/cetak-spk-ak/[user_id] (admin/super_admin/
// HoP). Varian dipilih dari agama akun, nomor surat dibekukan sekali
// (ambilAtauBuatNomorSurat, idempotent). Jalur TTD digital punya generator
// sendiri di /api/admin/dokumen-signature tapi template-nya sama persis.
import { generateSpkAkPdf } from './spkAkOverlay';
import { ambilAtauBuatNomorSurat } from '@/lib/nomorSurat';

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const errStatus = (message, status) => Object.assign(new Error(message), { status });

/** @returns {Promise<{ pdfBuffer: Uint8Array, nomor: string, dokumen: string }>} */
export async function buatPdfSpkAkUntukUser(pool, userId) {
  const [[user]] = await pool.query(
    'SELECT id, name, wa, email, alamat, alamat_ktp, role, agama, no_paspor FROM users WHERE id = ?',
    [userId]
  );
  if (!user) throw errStatus('Akun tidak ditemukan', 404);
  if (user.role !== 'sahabat_baitullah') throw errStatus('Dokumen ini hanya berlaku untuk Jamaah Sahabat Baitullah', 400);

  const dokumen = user.agama === 'non_islam' ? 'spk_ak_nonis' : 'spk_ak';
  const nomorKolom = dokumen === 'spk_ak' ? 'no_spk_ak' : 'no_spk_ak_nonis';
  const nomorJenis = dokumen === 'spk_ak' ? 'JSB' : 'JSB-NM';
  const nomor = await ambilAtauBuatNomorSurat(pool, user.id, nomorJenis, nomorKolom);

  const sekarang = new Date();
  const pdfBuffer = await generateSpkAkPdf({
    dokumen, nomor,
    nama: user.name, alamat: user.alamat_ktp || user.alamat || '-', noTelepon: user.wa || '-', noPaspor: user.no_paspor || '-',
    namaTtd: user.name,
    hari: HARI_ID[sekarang.getDay()],
    tanggal: `${sekarang.getDate()} ${BULAN_ID[sekarang.getMonth()]} ${sekarang.getFullYear()}`,
  });
  return { pdfBuffer, nomor, dokumen };
}

export function responsPdfSpkAk({ pdfBuffer, nomor }) {
  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="SPK-AK-${String(nomor).replace(/\//g, '-')}.pdf"`,
    },
  });
}
