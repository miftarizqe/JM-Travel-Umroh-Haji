// PDF Surat Perjanjian Kerjasama Perwakilan (SPKA-Ins) resmi (template
// final, identitas terisi) untuk 1 akun perwakilan — dipakai
// /api/admin/cetak-spka-ins/[user_id]. Nomor surat & tanggal TTD dibekukan
// sekali (ambilAtauBuatNomorSurat/ambilAtauBuatTanggalBeku, idempotent),
// sama persis mekanisme SPK-AK.
import pool from '@/lib/db';
import { generateSpkaInsRangkapPdf } from './spkaInsOverlay';
import { ambilAtauBuatNomorSurat, ambilAtauBuatTanggalBeku } from '@/lib/nomorSurat';
import { formatAlamatDuaBaris } from './alamatDuaBaris';

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const errStatus = (message, status) => Object.assign(new Error(message), { status });

// Jenis "PWK" (sementara, dikonfirmasi user 2026-10-18) — format nomor
// XXXXXX.NN/JMT-PWK/YYYY, mirror format JSB milik Sahabat Baitullah.
const JENIS_NOMOR = 'PWK';

/**
 * @param {'management'|'perwakilan'} [rangkap] - default 'perwakilan' kalau
 *   gak diisi (rangkap yang dipegang/diunduh perwakilan sendiri).
 * @returns {Promise<{ pdfBuffer: Buffer, nomor: string }>}
 */
export async function buatPdfSpkaInsUntukUser(userId, rangkap = 'perwakilan') {
  const [[user]] = await pool.query(
    `SELECT id, name, nik, wa, role, alamat, alamat_ktp, bank, no_rekening, nama_pemilik_rekening,
            alamat_ktp_jalan, alamat_ktp_no_rumah, alamat_ktp_rt, alamat_ktp_rw,
            alamat_ktp_kelurahan, alamat_ktp_kecamatan, alamat_ktp_kota, alamat_ktp_provinsi, alamat_ktp_negara
     FROM users WHERE id = ?`,
    [userId]
  );
  if (!user) throw errStatus('Akun tidak ditemukan', 404);
  if (user.role !== 'perwakilan') throw errStatus('Dokumen ini hanya berlaku untuk Perwakilan', 400);

  const nomor = await ambilAtauBuatNomorSurat(pool, user.id, JENIS_NOMOR);
  const sekarang = await ambilAtauBuatTanggalBeku(pool, user.id, 'tgl_perjanjian_kerjasama');
  const { alamatBaris1, alamatBaris2 } = formatAlamatDuaBaris(user);

  const pdfBuffer = await generateSpkaInsRangkapPdf(rangkap, {
    nomor,
    hari: HARI_ID[sekarang.getDay()],
    tanggal: `${sekarang.getDate()} ${BULAN_ID[sekarang.getMonth()]} ${sekarang.getFullYear()}`,
    nama: user.name,
    nik: user.nik || '-',
    alamatBaris1, alamatBaris2,
    noTelepon: user.wa || '-',
    namaBank: user.bank || '-',
    noRekening: user.no_rekening || '-',
    atasNama: user.nama_pemilik_rekening || '-',
    namaTtd: user.name,
  });

  return { pdfBuffer, nomor };
}

export function responsPdfSpkaIns({ pdfBuffer, nomor }) {
  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="SPKA-Ins-${String(nomor).replace(/\//g, '-')}.pdf"`,
      // Tanpa ini browser bebas nge-cache PDF yang di-generate dinamis —
      // sama alasan kayak responsPdfSpkAk (bug nyata 2026-10-03).
      'Cache-Control': 'no-store',
    },
  });
}
