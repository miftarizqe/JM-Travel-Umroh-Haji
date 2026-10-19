// PDF Surat Perjanjian Jamaah Umroh (SPJ) resmi (template final, identitas
// terisi) untuk 1 booking — dipakai /api/admin/cetak-spj/[booking_id].
//
// 1 JAMAAH = 1 PERJANJIAN = 1 NOMOR SENDIRI (dikonfirmasi user 2026-10-18,
// gantiin skema lama 1 nomor dipakai bareng semua jamaah dalam 1 booking)
// -- lihat ambilAtauBuatNomorSuratJamaah di nomorSurat.js. Booking dengan
// >1 jamaah aktif tetap digabung jadi 1 PDF multi-lembar (dikonfirmasi user
// 2026-10-13) buat kemudahan unduh, tapi tiap lembar bawa nomornya sendiri.
//
// Tanggal TIDAK pakai mekanisme beku terpisah, langsung pakai
// bookings.created_at (dikonfirmasi lewat komentar existing di
// /api/admin/cetak-perjanjian/[booking_id]/route.js, dokumen ini emang
// sudah "beku dari dulu" di titik booking dibuat) -- sama buat semua jamaah
// dalam booking yang sama (satu transaksi, satu tanggal pemesanan).
import { generateJamaahPdf } from './jamaahOverlay';
import { mergePdfBuffers } from './dokumenSahabatGabungan';
import { ambilAtauBuatNomorSuratJamaah } from '@/lib/nomorSurat';
import { splitAlamatGenerik } from './alamatDuaBaris';
import { resolveJamaahHarga } from '@/lib/jamaahHarga';
import { hitungUmur } from '@/lib/umur';

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
  // idx dari array ASLI (bukan index setelah difilter) -- ambilAtauBuatNomorSuratJamaah
  // kunci nomornya ke (booking_id, jamaah_idx) ini, harus stabil & match
  // posisi entry di jamaah_data walau ada entry lain yang dibatalkan.
  const jamaahAktif = jamaahArr
    .map((j, idx) => ({ j, idx }))
    .filter(({ j }) => j?.status_jamaah !== 'dibatalkan');
  if (jamaahAktif.length === 0) throw errStatus('Belum ada jamaah aktif di booking ini', 400);

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
  for (const { j, idx } of jamaahAktif) {
    const nomor = await ambilAtauBuatNomorSuratJamaah(pool, booking.id, idx);
    const kombo = resolveJamaahHarga(booking, j);
    const { baris1: alamatBaris1, baris2: alamatBaris2 } = splitAlamatGenerik(j.alamat);
    // Jamaah di bawah 17 tahun diwakili walinya (dikonfirmasi user
    // 2026-10-18) -- template gak punya baris "Diwakili oleh" terpisah,
    // jadi digabung ke field Nama. NIK/Paspor/Telepon TETAP punya si
    // jamaah sendiri (identitas yang dipakai buat dokumen perjalanan),
    // bukan wali.
    const umur = hitungUmur(j.ttl);
    const diwakiliWali = umur !== null && umur < 17;
    const nama = diwakiliWali
      ? `${j.nama || '-'} (diwakili Wali — ${j.wali_hub || '-'}: ${j.wali_nama || '-'})`
      : (j.nama || '-');
    buffers.push(await generateJamaahPdf({
      nomor, hari, tanggal,
      nama, nik: j.nik || '-', alamatBaris1, alamatBaris2,
      noPaspor: j.paspor || '-', noTelepon: j.wa || booking.pemesan_wa || '-',
      programPilihan: `${booking.prog_name}${kombo.paket && kombo.kamar ? ` (${kombo.paket} / ${kombo.kamar})` : ''}`,
      totalBiaya: Number(kombo.hargaJual || 0).toLocaleString('id-ID'),
      dp,
      namaTtd: nama,
    }));
  }

  const pdfBuffer = buffers.length === 1 ? buffers[0] : await mergePdfBuffers(buffers);
  return { pdfBuffer, bookingId: booking.id };
}

export function responsPdfJamaah({ pdfBuffer, bookingId }) {
  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="SPJ-${bookingId}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
