// PDF Surat Perjanjian Jamaah Umroh (SPJ) resmi (template final, identitas
// terisi) untuk 1 booking — dipakai /api/admin/cetak-spj/[booking_id].
// Nomor surat dibekukan sekali per BOOKING (ambilAtauBuatNomorSurat, 1
// jamaah bisa booking berkali-kali, masing-masing booking butuh nomor
// sendiri) -- tanggal TIDAK pakai mekanisme beku terpisah, langsung pakai
// bookings.created_at (dikonfirmasi lewat komentar existing di
// /api/admin/cetak-perjanjian/[booking_id]/route.js, dokumen ini emang
// sudah "beku dari dulu" di titik booking dibuat).
//
// 1 LEMBAR PER JAMAAH AKTIF (dikonfirmasi user 2026-10-13) -- booking
// dengan >1 jamaah aktif digabung jadi 1 PDF multi-lembar, SATU nomor
// surat yang sama dipakai di semua lembar (dikonfirmasi user 2026-10-13).
import { generateJamaahPdf } from './jamaahOverlay';
import { mergePdfBuffers } from './dokumenSahabatGabungan';
import { ambilAtauBuatNomorSurat } from '@/lib/nomorSurat';
import { splitAlamatGenerik } from './alamatDuaBaris';
import { resolveJamaahHarga } from '@/lib/jamaahHarga';

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const errStatus = (message, status) => Object.assign(new Error(message), { status });

export async function buatPdfJamaahUntukBooking(pool, bookingId) {
  const [[booking]] = await pool.query(
    `SELECT id, prog_name, jamaah_data, pemesan_nama, pemesan_wa, total_harga, created_at
     FROM bookings WHERE id = ?`,
    [bookingId]
  );
  if (!booking) throw errStatus('Booking tidak ditemukan', 404);

  let jamaahArr = booking.jamaah_data;
  if (typeof jamaahArr === 'string') { try { jamaahArr = JSON.parse(jamaahArr || '[]'); } catch { jamaahArr = []; } }
  if (!Array.isArray(jamaahArr)) jamaahArr = [];
  const jamaahAktif = jamaahArr.filter(j => j?.status_jamaah !== 'dibatalkan');
  if (jamaahAktif.length === 0) throw errStatus('Belum ada jamaah aktif di booking ini', 400);

  const nomor = await ambilAtauBuatNomorSurat(pool, booking.id, 'SPJ', 'no_perjanjian_jamaah', 'bookings');
  const tglBooking = new Date(booking.created_at);
  const hari = HARI_ID[tglBooking.getDay()];
  const tanggal = `${tglBooking.getDate()} ${BULAN_ID[tglBooking.getMonth()]} ${tglBooking.getFullYear()}`;

  // DP booking-level (bukan per-jamaah -- gak ada split DP per orang di
  // data model) -- Program Sahabat Baitullah Eksklusif checkout langsung
  // lunas, gak ada tahap DP terpisah sama sekali (lihat checkout-mandiri/
  // route.js), jadi query ini WAJAR gak nemu baris & dp dibiarkan kosong
  // (dikonfirmasi user 2026-10-18, bukan dipaksa dari publish_type).
  const [[dpRow]] = await pool.query(
    `SELECT amount FROM payments WHERE booking_id = ? AND type = 'dp' ORDER BY created_at ASC LIMIT 1`,
    [bookingId]
  );
  const dp = dpRow?.amount ? Number(dpRow.amount).toLocaleString('id-ID') : '';

  const buffers = [];
  for (const j of jamaahAktif) {
    const kombo = resolveJamaahHarga(booking, j);
    const { baris1: alamatBaris1, baris2: alamatBaris2 } = splitAlamatGenerik(j.alamat);
    buffers.push(await generateJamaahPdf({
      nomor, hari, tanggal,
      nama: j.nama || '-', nik: j.nik || '-', alamatBaris1, alamatBaris2,
      noPaspor: j.paspor || '-', noTelepon: j.wa || booking.pemesan_wa || '-',
      programPilihan: `${booking.prog_name}${kombo.paket && kombo.kamar ? ` (${kombo.paket} / ${kombo.kamar})` : ''}`,
      totalBiaya: Number(kombo.hargaJual || 0).toLocaleString('id-ID'),
      dp,
    }));
  }

  const pdfBuffer = buffers.length === 1 ? buffers[0] : await mergePdfBuffers(buffers);
  return { pdfBuffer, nomor };
}

export function responsPdfJamaah({ pdfBuffer, nomor }) {
  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="SPJ-${String(nomor).replace(/\//g, '-')}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
