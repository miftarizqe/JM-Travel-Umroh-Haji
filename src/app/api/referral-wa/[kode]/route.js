import pool from '@/lib/db';

// GET /api/referral-wa/[kode] — PUBLIK, mirror /api/agen/[kode] tapi buat
// Perwakilan & Sahabat Baitullah (dikonfirmasi user 2026-10-21, perluasan
// WA-switching landing page yang sebelumnya cuma buat agen). Dipanggil dari
// referralCapture.js (bukan halaman masuk khusus kayak /a/[kode] — link
// Perwakilan/Sahabat gak punya gerbang tunggal, ?ref=kode nempel langsung
// di program/[id], programs, register). Balikin identitas MINIMAL (nama +
// WA + jenis kelamin), SENGAJA gak expose field lain (NIK/email/dst) —
// sama kebijakan kayak endpoint agen.
export async function GET(request, { params }) {
  try {
    const { kode } = await params;
    const [[row]] = await pool.query(
      `SELECT name, wa, jenis_kelamin FROM users
       WHERE kode_unik = ? AND role IN ('perwakilan', 'sahabat_baitullah') AND status = 'active'`,
      [String(kode || '').trim().toUpperCase()]
    );
    if (!row) return Response.json({ error: 'Tidak ditemukan' }, { status: 404 });
    return Response.json({ nama: row.name, wa: row.wa, jenis_kelamin: row.jenis_kelamin });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
