import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { generateOrUpdateKwitansi } from '@/lib/invoiceKwitansi';

// POST { booking_id, jenis } — generate OTOMATIS dari data booking/payment.
// Cuma buat jenis 'kwitansi' — Invoice sekarang SELALU dibuat manual (admin
// isi Judul + Nominal sendiri lewat POST /api/admin/invoice-kwitansi, biar
// fleksibel buat DP/Pelunasan/cicilan berapa kali pun), jadi gak ada lagi
// jalur auto-generate invoice_dp/invoice_pelunasan di sini.
//
// kwitansi: biasanya udah otomatis kebuat sendiri dari hook di
// PATCH /api/payments pas pelunasan (LUNAS TOTAL) di-approve — endpoint ini
// cuma jalur manual/retroaktif kalau hook itu kelewat, pakai fungsi bersama
// yang sama (generateOrUpdateKwitansi, di src/lib/invoiceKwitansi.js) biar
// perilakunya identik: 1 kwitansi per booking, cuma keluar pas lunas total,
// nomor beku.
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { booking_id, jenis } = await request.json();
    if (!booking_id || jenis !== 'kwitansi') {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    const hasil = await generateOrUpdateKwitansi(pool, booking_id, auth.user.id);
    if (!hasil) return Response.json({ error: 'Booking ini belum lunas total' }, { status: 400 });
    if (hasil.isNew) {
      await catatAudit(pool, {
        actor: auth.user, aksi: 'buat_invoice_kwitansi_auto', target_type: 'invoice_kwitansi',
        target_id: hasil.id, keterangan: `${hasil.nomor} — kwitansi — booking ${booking_id}`,
      });
    }
    return Response.json({ message: hasil.isNew ? 'Dokumen dibuat!' : 'Dokumen sudah ada (diperbarui kalau ada perubahan)', id: hasil.id, nomor: hasil.nomor }, { status: hasil.isNew ? 201 : 200 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
