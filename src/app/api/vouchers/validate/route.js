import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { cariVoucherValid, hitungPotonganItem, porsiPribadi } from '@/lib/voucher';

// POST /api/vouchers/validate  body: { kode, prog_id, items: [{paket, jumlah_jamaah}, ...] }
// Mengembalikan valid/tidak + rincian potongan per item + alasan kalau ditolak.
// Dipakai buat preview live di UI (CartPaketKamar) — TIDAK consume kuota.
//
// POST (bukan GET) karena butuh kirim seluruh keranjang sekaligus: kuota
// sekarang dihitung per HEADCOUNT JAMAAH gabungan semua item, jadi harus
// dicek satu kali terhadap total — bukan per item satu-satu (dulu GET dipanggil
// berkali-kali dari CartPaketKamar, satu per item, yang salah untuk kuota
// headcount: 2 item @3 jamaah masing-masing lolos cek independen padahal
// gabungannya bisa melebihi sisa kuota).
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { kode, prog_id: progId, items, referral_perw_id } = await request.json();

    if (!progId) return Response.json({ valid: false, error: 'prog_id wajib diisi' }, { status: 400 });
    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ valid: false, error: 'Keranjang kosong' }, { status: 400 });
    }

    const totalJamaah = items.reduce((s, it) => s + Number(it.jumlah_jamaah || 0), 0);

    let voucher;
    try {
      voucher = await cariVoucherValid(pool, kode, progId, auth.user, totalJamaah);
    } catch (e) {
      return Response.json({ valid: false, error: e.message }, { status: e.status || 400 });
    }

    const [ps] = await pool.query(`SELECT * FROM programs WHERE id = ?`, [progId]);
    if (ps.length === 0) {
      return Response.json({ valid: false, error: 'Program tidak ditemukan' }, { status: 404 });
    }
    const prog = ps[0];

    const perItem = [];
    let potonganTotal = 0;
    for (const item of items) {
      let potongan;
      try {
        potongan = await hitungPotonganItem(pool, prog, voucher, item, referral_perw_id);
      } catch (e) {
        return Response.json({
          valid: false, error: e.message,
          maks_per_jamaah: await porsiPribadi(pool, prog, item.paket, item.kamar, referral_perw_id),
        }, { status: e.status || 400 });
      }
      perItem.push({ paket: item.paket, jumlah_jamaah: item.jumlah_jamaah, potongan });
      potonganTotal += potongan;
    }

    const sisaKuota = voucher.kuota != null ? Number(voucher.kuota) - Number(voucher.terpakai || 0) : null;

    return Response.json({
      valid: true,
      kode: voucher.kode,
      potongan_per_jamaah: Number(voucher.potongan || 0),
      per_item: perItem,
      potongan_total: potonganTotal,
      sisa_kuota: sisaKuota,
      catatan: voucher.catatan || null,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ valid: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
