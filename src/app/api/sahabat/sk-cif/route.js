import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { ambilAtauBuatNomorSurat } from '@/lib/nomorSurat';
import { pastikanSnapshot } from '@/lib/pasalSnapshot';
import { ambilPasalUntukCetak } from '@/lib/pasalUntukCetak';

// GET /api/sahabat/sk-cif — data buat halaman print SK-CIF milik sendiri.
// SK-CIF SELALU fisik (gak lewat pipeline TTD digital di
// admin/dokumen-signature sama sekali) — nomor surat resmi + snapshot pasal
// dibekukan DI SINI, pola sama persis dengan /api/admin/cetak-pks/[user_id]
// buat SPKA-Ins (endpoint yang cuma kepanggil saat halaman print beneran
// dibuka, biar gak "membakar" nomor surat sebelum waktunya).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      'SELECT id, name, nik, wa, email, alamat, alamat_ktp, kode_unik, role, no_rekening_tabungan_umroh, no_sk_cif FROM users WHERE id = ?',
      [auth.user.id]
    );
    const user = rows[0];
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    user.alamat = user.alamat_ktp || user.alamat;

    const nomor = await ambilAtauBuatNomorSurat(pool, user.id, 'SK-CIF', 'no_sk_cif');
    if (nomor) await pastikanSnapshot(pool, user.id, 'sk_cif');
    // Teks surat dari template PDF resmi (lihat src/lib/dokumenTemplate.js),
    // jadi endpoint ini gak ngirim pasal/mergeData lagi — tugasnya tinggal
    // bekukan nomor surat + penandatangan (dikonfirmasi user 2026-10-01).
    const { signer } = await ambilPasalUntukCetak('sk_cif', user.id);
    return Response.json({ user, nomor, signer });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
