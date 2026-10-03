import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

const FIELD_KE_STATUS = {
  no_rekening_bsi_biasa: { statusKolom: 'akun_bsi_status', waktuKolom: 'akun_bsi_updated_at' },
  no_rekening_tabungan_umroh: { statusKolom: 'tabungan_haji_status', waktuKolom: 'tabungan_haji_updated_at' },
};

// PATCH /api/sahabat/rekening-bsi  body: { field, no_rekening, nama_pemilik? }
// Self-service — anggota sahabat isi sendiri nomor rekening BSI biasa /
// tabungan umroh begitu beneran udah dibuka (2026-08-30, gantiin toggle
// manual admin lama yang gak ada cara diverifikasi selain nunggu info luar
// sistem). Begitu keisi, status terkait OTOMATIS jadi aktif — TANPA aksi
// admin sama sekali (dikonfirmasi user). Isi SEKALI (WHERE ... IS NULL,
// isi-sekali, WHERE ... IS NULL) — perubahan setelahnya lewat
// PATCH /api/profil (diaudit + notifikasi admin), bukan endpoint ini.
// `nama_pemilik` cuma wajib buat no_rekening_tabungan_umroh (dikonfirmasi
// user 2026-10-03) — rekening umrohnya kadang bukan atas nama sahabat
// sendiri, jadi butuh field terpisah; disimpan ke nama_pemilik_rekening_umroh.
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { field, no_rekening, nama_pemilik } = await request.json();
    const meta = FIELD_KE_STATUS[field];
    if (!meta) return Response.json({ error: 'Field tidak valid' }, { status: 400 });

    const nilai = String(no_rekening || '').trim();
    if (!nilai) return Response.json({ error: 'Nomor rekening wajib diisi' }, { status: 400 });

    const butuhNamaPemilik = field === 'no_rekening_tabungan_umroh';
    const namaPemilikNilai = String(nama_pemilik || '').trim();
    if (butuhNamaPemilik && !namaPemilikNilai) {
      return Response.json({ error: 'Nama pemilik rekening wajib diisi' }, { status: 400 });
    }

    const [[user]] = await pool.query(`SELECT role, ${field} AS nilai_sekarang FROM users WHERE id = ?`, [auth.user.id]);
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    if (user.nilai_sekarang) {
      return Response.json({ error: 'Nomor rekening ini sudah diisi sebelumnya. Ubah lewat halaman Profil kalau perlu koreksi.' }, { status: 400 });
    }

    if (butuhNamaPemilik) {
      await pool.query(
        `UPDATE users SET ${field} = ?, nama_pemilik_rekening_umroh = ?, ${meta.statusKolom} = 1, ${meta.waktuKolom} = NOW()
         WHERE id = ? AND ${field} IS NULL`,
        [nilai, namaPemilikNilai, auth.user.id]
      );
    } else {
      await pool.query(
        `UPDATE users SET ${field} = ?, ${meta.statusKolom} = 1, ${meta.waktuKolom} = NOW()
         WHERE id = ? AND ${field} IS NULL`,
        [nilai, auth.user.id]
      );
    }
    return Response.json({ message: 'Nomor rekening tersimpan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
