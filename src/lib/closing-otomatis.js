import pool from '@/lib/db';
import { prosesBookingSelesai } from '@/lib/closing';

const SYSTEM_ACTOR = { id: 'SYSTEM', name: 'Sistem (Otomatis)' };

// Sweep harian: cari semua booking yang sudah memenuhi SEMUA syarat closing
// (lihat cekSyaratClosing di src/lib/closing.js) dan proses satu-satu.
// Query ini sendiri sudah jadi sumber kebenaran syarat "lolos otomatis" —
// prosesBookingSelesai tetap mengecek ulang syarat yang sama sebelum benar-benar
// mencairkan komisi, jadi aman dipanggil berkali-kali (idempoten).
export async function jalankanClosingOtomatis() {
  const [rows] = await pool.query(
    `SELECT b.id FROM bookings b
     JOIN programs p ON p.id = b.prog_id
     WHERE b.status = 'active'
       AND b.pelunasan_status = 'paid'
       AND b.form_filled >= b.form_total
       AND p.tanggal_berangkat IS NOT NULL
       AND p.tanggal_berangkat < CURDATE()
       AND NOT EXISTS (
         SELECT 1 FROM pembatalan pb
         WHERE pb.booking_id = b.id AND pb.status IN ('menunggu','disetujui')
       )`
  );

  const diproses = [];
  const gagal = [];
  for (const { id } of rows) {
    try {
      const hasil = await prosesBookingSelesai(id, SYSTEM_ACTOR);
      if (hasil.ok) diproses.push(id);
      else gagal.push({ id, error: hasil.error });
    } catch (error) {
      gagal.push({ id, error: error?.message || String(error) });
    }
  }

  if (diproses.length > 0 || gagal.length > 0) {
    console.log(`[closing-otomatis] diproses: ${diproses.length}, gagal: ${gagal.length}`, { diproses, gagal });
  }

  return { diproses, gagal };
}
