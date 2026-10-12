import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { generateOrUpdateKwitansi, generateTandaTerimaUntukPayment } from '@/lib/invoiceKwitansi';

// POST { booking_id, jenis } — generate OTOMATIS dari data booking/payment.
// Invoice sekarang SELALU dibuat manual (admin isi Judul + Nominal sendiri
// lewat POST /api/admin/invoice-kwitansi, biar fleksibel buat DP/Pelunasan/
// cicilan berapa kali pun), jadi gak ada jalur auto-generate invoice di sini.
//
// kwitansi (body: booking_id): biasanya udah otomatis kebuat sendiri dari
// hook di PATCH /api/payments pas pelunasan (LUNAS TOTAL) di-approve —
// endpoint ini cuma jalur manual/retroaktif kalau hook itu kelewat, pakai
// fungsi bersama yang sama (generateOrUpdateKwitansi) biar perilakunya
// identik: 1 kwitansi per booking, cuma keluar pas lunas total, nomor beku.
//
// tanda_terima (body: payment_id): sama polanya, jalur retroaktif kalau
// generateTandaTerimaUntukPayment kelewat dipanggil pas payment di-approve
// (dikonfirmasi user 2026-10-13 — dipakai tombol "Buat Sekarang" di
// rekomendasi /admin/invoice-kwitansi, lihat daftarPaymentPerluTandaTerima).
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { booking_id, payment_id, jenis } = await request.json();

    if (jenis === 'kwitansi') {
      if (!booking_id) return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
      const hasil = await generateOrUpdateKwitansi(pool, booking_id, auth.user.id);
      if (!hasil) return Response.json({ error: 'Booking ini belum lunas total' }, { status: 400 });
      if (hasil.isNew) {
        await catatAudit(pool, {
          actor: auth.user, aksi: 'buat_invoice_kwitansi_auto', target_type: 'invoice_kwitansi',
          target_id: hasil.id, keterangan: `${hasil.nomor} — kwitansi — booking ${booking_id}`,
        });
      }
      return Response.json({ message: hasil.isNew ? 'Dokumen dibuat!' : 'Dokumen sudah ada (diperbarui kalau ada perubahan)', id: hasil.id, nomor: hasil.nomor }, { status: hasil.isNew ? 201 : 200 });
    }

    if (jenis === 'tanda_terima') {
      if (!payment_id) return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
      const hasil = await generateTandaTerimaUntukPayment(pool, payment_id, auth.user.id);
      if (!hasil) return Response.json({ error: 'Pembayaran ini belum confirmed atau tidak ditemukan' }, { status: 400 });
      if (hasil.isNew) {
        await catatAudit(pool, {
          actor: auth.user, aksi: 'buat_invoice_kwitansi_auto', target_type: 'invoice_kwitansi',
          target_id: hasil.id, keterangan: `${hasil.nomor} — tanda terima — payment ${payment_id}`,
        });
      }
      return Response.json({ message: hasil.isNew ? 'Dokumen dibuat!' : 'Dokumen sudah ada', id: hasil.id, nomor: hasil.nomor }, { status: hasil.isNew ? 201 : 200 });
    }

    return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
