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
      'SELECT id, name, nik, wa, email, alamat, alamat_ktp, kode_unik, role, cif_bsi, no_rekening_tabungan_umroh, no_sk_cif FROM users WHERE id = ?',
      [auth.user.id]
    );
    const user = rows[0];
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    if (!user.cif_bsi) return Response.json({ error: 'Isi nomor CIF BSI terlebih dahulu' }, { status: 400 });
    user.alamat = user.alamat_ktp || user.alamat;

    const nomor = await ambilAtauBuatNomorSurat(pool, user.id, 'SK-CIF', 'no_sk_cif');
    if (nomor) await pastikanSnapshot(pool, user.id, 'sk_cif');
    const { pasal, signer } = await ambilPasalUntukCetak('sk_cif', user.id);

    // SK-CIF 2-pihak (Pemberi Kuasa/jamaah vs Penerima Kuasa — penandatangan
    // SENDIRI, BUKAN Head of Program, lihat signerKolom.js ambilSignerSkCif)
    // — mergeData isi token {{...}} di isi pasal (lihat
    // migration-sk-cif-samain-referensi.sql), pola sama persis
    // surat_pemblokiran punya mergeData sendiri.
    const [[pengaturan]] = await pool.query('SELECT alamat_kantor FROM pengaturan WHERE id = 1');
    const mergeData = {
      nama: user.name,
      nik: user.nik || '-',
      alamat: user.alamat || '-',
      no_rekening: user.no_rekening_tabungan_umroh || '-',
      alamat_kantor: pengaturan?.alamat_kantor || '-',
      nama_wakil: signer?.nama || '-',
      nik_wakil: signer?.nik || '-',
      jabatan_wakil: signer?.jabatan || '-',
    };

    return Response.json({ user, nomor, pasal, signer, mergeData });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
