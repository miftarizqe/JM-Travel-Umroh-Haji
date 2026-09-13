import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { ambilAtauBuatNomorSurat } from '@/lib/nomorSurat';
import { pastikanSnapshot } from '@/lib/pasalSnapshot';
import { ambilPasalUntukCetak } from '@/lib/pasalUntukCetak';

// GET /api/admin/cetak-spk-ak/[user_id] — data buat cetak fisik SPK-AK
// (Sahabat Baitullah). Admin ATAU si jamaah sendiri (self-service, pola
// sama /api/sahabat/sk-cif — jalur fisik SPK-AK dipicu dari jamaah sendiri
// di status-pendaftaran-sahabat.jsx, bukan admin). Pola cetak sama persis
// /api/admin/cetak-pks/[user_id] (SPKA-Ins) — nomor surat resmi + snapshot
// pasal dibekukan DI SINI, cuma sekali saat halaman print beneran dibuka.
//
// Pihak Ketiga = Head of Program (pengaturan.head_of_program_user_id),
// BUKAN perekrut_id — dikonfirmasi user 2026-09-09.
export async function GET(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { user_id } = await params;
    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    if (!isAdmin && String(auth.user.id) !== String(user_id)) {
      return Response.json({ error: 'Anda tidak berwenang atas dokumen ini' }, { status: 403 });
    }
    const [rows] = await pool.query(
      `SELECT id, name, nik, wa, email, alamat, alamat_ktp, kode_unik, role, no_paspor,
              no_spk_ak, created_at, dokumen_spk_ak_fisik_path, dokumen_spk_ak_fisik_uploaded_at
       FROM users WHERE id = ?`,
      [user_id]
    );
    if (rows.length === 0) {
      return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    }
    const u = rows[0];
    if (u.role !== 'sahabat_baitullah') {
      return Response.json({ error: 'Surat perjanjian ini hanya berlaku untuk Jamaah Sahabat Baitullah' }, { status: 400 });
    }
    u.alamat = u.alamat_ktp || u.alamat;

    const [[pengaturan]] = await pool.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
    let hop = null;
    if (pengaturan?.head_of_program_user_id) {
      const [hr] = await pool.query('SELECT name, nik, wa, alamat, alamat_ktp FROM users WHERE id = ?', [pengaturan.head_of_program_user_id]);
      hop = hr[0] || null;
      if (hop) hop.alamat = hop.alamat_ktp || hop.alamat;
    }

    const nomor = await ambilAtauBuatNomorSurat(pool, u.id, 'JSB', 'no_spk_ak');
    if (nomor) await pastikanSnapshot(pool, u.id, 'spk_ak');
    const { pasal, signer } = await ambilPasalUntukCetak('spk_ak', u.id);

    // Target paket/harga — diisi jamaah sendiri pas /daftar-sahabat, dipakai
    // buat isian dinamis "Total biaya perjalanan umroh ..." di Pasal 4 (beda
    // per jamaah, BUKAN harga tetap — dikonfirmasi user 2026-09-11).
    const [[target]] = await pool.query(
      'SELECT target_minat, target_estimasi_harga FROM sahabat_pendaftaran WHERE user_id = ?', [u.id]
    );

    return Response.json({ user: u, hop, nomor, pasal, signer, target: target || null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
