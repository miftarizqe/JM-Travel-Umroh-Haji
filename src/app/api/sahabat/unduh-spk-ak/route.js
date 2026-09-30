import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { generateSpkAkPdf } from '@/lib/pdfDokumen/spkAkOverlay';
import { ambilAtauBuatNomorSurat } from '@/lib/nomorSurat';

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// GET /api/sahabat/unduh-spk-ak — self-service, buat cetak fisik SPK-AK
// SELAMA jalur digital dinonaktifkan (SPK_AK_SEMENTARA_FISIK, lihat
// src/lib/spkAkFlag.js). Reuse generateSpkAkPdf() — TEMPLATE SAMA PERSIS yang
// dipakai jalur digital (kirimSpkAkTunggalUntukTtd di
// /api/admin/dokumen-signature/route.js) — SENGAJA bukan halaman lama
// /admin/cetak-spk-ak yang templatenya beda & cuma dukung varian Muslim
// (hardcode 'spk_ak', gak nge-cek agama non_islam sama sekali).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [[user]] = await pool.query(
      'SELECT id, name, wa, email, alamat, alamat_ktp, role, agama, no_paspor FROM users WHERE id = ?',
      [auth.user.id]
    );
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') {
      return Response.json({ error: 'Dokumen ini hanya berlaku untuk Jamaah Sahabat Baitullah' }, { status: 400 });
    }
    user.alamat = user.alamat_ktp || user.alamat;

    const dokumen = user.agama === 'non_islam' ? 'spk_ak_nonis' : 'spk_ak';
    const nomorKolom = dokumen === 'spk_ak' ? 'no_spk_ak' : 'no_spk_ak_nonis';
    const nomorJenis = dokumen === 'spk_ak' ? 'JSB' : 'JSB-NM';
    const nomor = await ambilAtauBuatNomorSurat(pool, user.id, nomorJenis, nomorKolom);

    const sekarang = new Date();
    const pdfBuffer = await generateSpkAkPdf({
      dokumen, nomor,
      nama: user.name, alamat: user.alamat || '-', noTelepon: user.wa || '-', noPaspor: user.no_paspor || '-',
      namaTtd: user.name,
      hari: HARI_ID[sekarang.getDay()],
      tanggal: `${sekarang.getDate()} ${BULAN_ID[sekarang.getMonth()]} ${sekarang.getFullYear()}`,
    });

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="SPK-AK-${nomor.replace(/\//g, '-')}.pdf"`,
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
