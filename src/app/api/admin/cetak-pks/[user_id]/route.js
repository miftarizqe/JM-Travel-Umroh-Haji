import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { ambilAtauBuatNomorSurat } from '@/lib/nomorSurat';
import { pastikanSnapshot } from '@/lib/pasalSnapshot';

// GET /api/admin/cetak-pks/[user_id] — data buat cetak Surat Perjanjian
// Kerjasama (perwakilan). ADMIN ONLY.
//
// Nomor surat resmi digenerate & dibekukan DI SINI, endpoint yang cuma
// dipanggil saat halaman cetak beneran dibuka — sengaja dipisah dari
// /api/admin/user-detail (dipakai di banyak tempat lain) supaya buka detail
// user biasa gak ikut "membakar" nomor surat baru.
export async function GET(request, { params }) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { user_id } = await params;
    const [rows] = await pool.query(
      `SELECT id, name, nik, wa, email, alamat, alamat_ktp, alamat_domisili, role, kode_unik,
              no_perjanjian_kerjasama, perekrut_id, tempat_lahir, tanggal_lahir, jenis_kelamin, nama_ibu,
              pekerjaan, kode_pos, bank, no_rekening, nama_pemilik_rekening, created_at,
              dokumen_pks_fisik_path, dokumen_pks_fisik_uploaded_at,
              formulir_pendaftaran_fisik_path, formulir_pendaftaran_fisik_uploaded_at
       FROM users WHERE id = ?`,
      [user_id]
    );
    if (rows.length === 0) {
      return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    }
    const u = rows[0];
    if (u.role !== 'perwakilan') {
      return Response.json({ error: 'Surat perjanjian ini hanya berlaku untuk perwakilan' }, { status: 400 });
    }
    // Surat pakai alamat KTP (data resmi) — fallback ke alamat lama (tunggal)
    // kalau orang ini daftar sebelum field alamat_ktp/domisili dipisah.
    u.alamat = u.alamat_ktp || u.alamat;

    let perekrut = null;
    if (u.perekrut_id) {
      const [pr] = await pool.query('SELECT name, nik, wa, alamat, alamat_ktp FROM users WHERE id = ?', [u.perekrut_id]);
      perekrut = pr[0] || null;
      if (perekrut) perekrut.alamat = perekrut.alamat_ktp || perekrut.alamat;
    }

    // Kode surat perwakilan sesuai draft resmi: "SPKA-Ins" (Ins = Institusi),
    // BUKAN "SPKP" — beda dari dugaan awal sebelum draftnya dikasih.
    const jenis = 'SPKA-Ins';
    const nomor = await ambilAtauBuatNomorSurat(pool, u.id, jenis);
    if (nomor) await pastikanSnapshot(pool, u.id, 'spka_ins');

    return Response.json({ user: u, perekrut, nomor });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
