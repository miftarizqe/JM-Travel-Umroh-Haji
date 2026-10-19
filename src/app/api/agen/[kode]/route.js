import pool from '@/lib/db';

// GET /api/agen/[kode] — PUBLIK (dipanggil dari /a/[kode] sebelum redirect
// ke landing page, dikonfirmasi user 2026-10-17). Balikin identitas MINIMAL
// (nama + WA) buat di-capture ke localStorage & dipakai nge-swap tombol WA
// di landing page. SENGAJA gak expose field lain (NIK/email/dst).
export async function GET(request, { params }) {
  try {
    const { kode } = await params;
    const [[agen]] = await pool.query(
      "SELECT id, name, wa, jenis_kelamin FROM users WHERE kode_unik = ? AND role = 'agen' AND status = 'active'",
      [String(kode || '').trim().toUpperCase()]
    );
    if (!agen) return Response.json({ error: 'Link tidak ditemukan' }, { status: 404 });
    return Response.json({ id: agen.id, nama: agen.name, wa: agen.wa, jenis_kelamin: agen.jenis_kelamin });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
