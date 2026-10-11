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
//
// PENGECUALIAN no_rekening_tabungan_umroh (dikonfirmasi user 2026-10-11):
// selama jamaah BELUM klik "Kirim Pendaftaran" (sahabat_pendaftaran.diajukan_at,
// lihat migrations/219) & dokumen fisik belum dikirim/diterima, boleh ditimpa
// sendiri — sebelumnya langsung kekunci begitu "Simpan" sekali.
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

    const [[user]] = await pool.query(
      `SELECT role, ${field} AS nilai_sekarang, bantuan_bsi_manual_disetujui_at, formulir_bsi_disubmit_at,
              dokumen_fisik_dikirim_at, dokumen_spk_ak_fisik_diterima_at, dokumen_cif_fisik_diterima_at,
              dokumen_pemblokiran_fisik_diterima_at, dokumen_formulir_bsi_fisik_diterima_at
       FROM users WHERE id = ?`, [auth.user.id]
    );
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });

    let bolehTimpa = false;
    if (butuhNamaPemilik) {
      const [[p]] = await pool.query(
        'SELECT status, diajukan_at FROM sahabat_pendaftaran WHERE user_id = ? ORDER BY id DESC LIMIT 1', [auth.user.id]
      );
      const dokumenFisikJalan = user.dokumen_fisik_dikirim_at || user.dokumen_spk_ak_fisik_diterima_at || user.dokumen_cif_fisik_diterima_at
        || user.dokumen_pemblokiran_fisik_diterima_at || user.dokumen_formulir_bsi_fisik_diterima_at;
      bolehTimpa = !!p && !p.diajukan_at && p.status !== 'active' && p.status !== 'ditolak' && !dokumenFisikJalan;
    }
    if (user.nilai_sekarang && !bolehTimpa) {
      return Response.json({ error: 'Nomor rekening ini sudah dikunci. Hubungi admin JM Travel kalau perlu koreksi.' }, { status: 400 });
    }

    if (butuhNamaPemilik) {
      // Udah punya rekening sendiri -> bantuan BSI manual gak perlu lagi,
      // selama formulirnya belum disubmit admin ke bank.
      const batalkanBantuan = bolehTimpa && user.bantuan_bsi_manual_disetujui_at && !user.formulir_bsi_disubmit_at;
      await pool.query(
        `UPDATE users SET ${field} = ?, nama_pemilik_rekening_umroh = ?, ${meta.statusKolom} = 1, ${meta.waktuKolom} = NOW()
                ${batalkanBantuan ? ', bantuan_bsi_manual_disetujui_at = NULL' : ''}
         WHERE id = ? ${bolehTimpa ? '' : `AND ${field} IS NULL`}`,
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
