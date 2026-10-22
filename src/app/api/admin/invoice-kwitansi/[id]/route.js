import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { ambilDokumenCetak } from '@/lib/invoiceKwitansi';

// GET /api/admin/invoice-kwitansi/[id] — detail 1 dokumen buat halaman cetak.
// Admin selalu boleh. Pemilik booking-nya (jamaah) JUGA boleh, HANYA kalau
// dokumennya udah terkirim (dikonfirmasi user 2026-10-13 — jamaah butuh
// lihat Tanda Terima Uang/Kwitansi/Invoice miliknya sendiri yang udah
// dikirim admin via "✅ Setuju", sebelumnya cuma bisa diakses admin sama
// sekali, bikin jamaah gak bisa lihat dokumennya meski udah terkirim).
// Dokumen tanpa booking_id (manual, gak nempel akun manapun) cuma admin.
// Ikut sertakan data booking (kalau ada) buat konteks tambahan di cetakan
// (program, paket, kamar) — dokumen manual tanpa booking_id ya cuma null.
// Logic data (booking/jamaah_breakdown/gerbang akses) DIPINDAH ke
// ambilDokumenCetak (2026-10-22) — dipakai ULANG persis sama di
// .../pdf/route.js (PDF asli react-pdf), biar dua jalur gak pernah nyimpang.
export async function GET(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const hasil = await ambilDokumenCetak(pool, id, auth);
    if (hasil.status === 404) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });
    if (hasil.status === 403) return Response.json({ error: 'Akses ditolak.' }, { status: 403 });
    return Response.json({ dokumen: hasil.dokumen, booking: hasil.booking, payment: hasil.payment });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
