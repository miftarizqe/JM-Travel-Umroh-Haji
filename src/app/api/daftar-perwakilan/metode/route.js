import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// PATCH /api/daftar-perwakilan/metode — langkah TERAKHIR pendaftaran
// kemitraan, baru muncul SETELAH calon perwakilan TTD digital formulir
// (dokumen_signature dokumen='formulir') & setuju PKS (users.setuju_pks) —
// dipindah ke sini dari step 3 formulir lama (dikonfirmasi user 2026-08-19).
// Divalidasi ULANG di server (bukan cuma diblok di client) karena ini
// endpoint terpisah yang bisa dipanggil langsung.
export async function PATCH(req) {
  const auth = wajibLogin(req);
  if (auth.error) return auth.error;
  const user_id = auth.user.id;

  try {
    const body = await req.json();
    // kp_kirim (kode pos) sengaja gak disimpan terpisah — sama kayak kp_dom
    // di formulir utama, cuma dikumpulkan di client, gak masuk string alamat
    // gabungan (lihat pola alamatDomisili di api/daftar-perwakilan/route.js).
    const { metode, jadwal, sama_domisili_kirim, jalan_kirim, norumah_kirim, rt_kirim, rw_kirim, kel_kirim, kec_kirim, kota_kirim, provinsi_kirim, negara_kirim } = body;

    if (!['kantor', 'paket'].includes(metode)) {
      return NextResponse.json({ error: 'Metode pendaftaran wajib dipilih' }, { status: 400 });
    }
    if (metode === 'kantor' && !jadwal) {
      return NextResponse.json({ error: 'Jadwal kunjungan kantor wajib diisi' }, { status: 400 });
    }

    const [[pendaftaran]] = await db.query(
      'SELECT id FROM agen_pendaftaran WHERE user_id = ? AND status != "ditolak" ORDER BY id DESC LIMIT 1',
      [user_id]
    );
    if (!pendaftaran) {
      return NextResponse.json({ error: 'Belum ada pendaftaran — isi formulir kemitraan dulu' }, { status: 404 });
    }

    const [[u]] = await db.query('SELECT setuju_pks, alamat_domisili FROM users WHERE id = ?', [user_id]);
    if (!u?.setuju_pks) {
      return NextResponse.json({ error: 'Setujui Perjanjian Kerjasama (PKS) dulu sebelum memilih metode pendaftaran' }, { status: 400 });
    }
    const [[sig]] = await db.query(
      `SELECT fase FROM dokumen_signature WHERE dokumen = 'formulir' AND ref_id = ?`,
      [user_id]
    );
    if (!sig || sig.fase !== 'selesai') {
      return NextResponse.json({ error: 'Selesaikan TTD digital formulir dulu sebelum memilih metode pendaftaran' }, { status: 400 });
    }

    let alamatKirim = null;
    if (metode === 'paket') {
      if (sama_domisili_kirim) {
        alamatKirim = u.alamat_domisili || null;
        if (!alamatKirim) {
          return NextResponse.json({ error: 'Alamat domisili Anda belum lengkap, isi alamat pengiriman manual' }, { status: 400 });
        }
      } else {
        const alamatOk = (j, nr, r, rw_, kl, kc, kt, p, n) =>
          !!(j?.trim() && nr?.trim() && r?.trim() && rw_?.trim() && kl?.trim() && kc?.trim() && kt?.trim() && p?.trim() && n?.trim());
        if (!alamatOk(jalan_kirim, norumah_kirim, rt_kirim, rw_kirim, kel_kirim, kec_kirim, kota_kirim, provinsi_kirim, negara_kirim)) {
          return NextResponse.json({ error: 'Alamat pengiriman wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)' }, { status: 400 });
        }
        alamatKirim = [jalan_kirim, norumah_kirim, rt_kirim, rw_kirim, kel_kirim, kec_kirim, kota_kirim, provinsi_kirim, negara_kirim]
          .filter(Boolean).join(', ');
      }
    }

    const jadwalFinal = metode === 'kantor' ? jadwal : null;

    await db.query(
      'UPDATE agen_pendaftaran SET metode = ?, jadwal_kunjungan = ?, alamat_kirim = ? WHERE id = ?',
      [metode, jadwalFinal, alamatKirim, pendaftaran.id]
    );
    await db.query(
      'UPDATE users SET reg_metode = ?, reg_jadwal = ?, alamat_kirim = ? WHERE id = ?',
      [metode, jadwalFinal, alamatKirim, user_id]
    );

    return NextResponse.json({ success: true, message: 'Metode pendaftaran tersimpan.' });
  } catch (err) {
    console.error('Error daftar-perwakilan/metode:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
