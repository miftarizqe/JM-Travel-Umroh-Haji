import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';
import { absolutePathDariUrl } from '@/lib/dokumenProteksi';

const TIPE_FOTO_OK = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png' };
const MAKS_FOTO = 5 * 1024 * 1024;
// Nomor resi kurir (JNE/J&T/SiCepat/Pos, dst) — huruf/angka/strip, 6-40.
const POLA_RESI = /^[A-Za-z0-9-]{6,40}$/;

// PATCH /api/sahabat/konfirmasi-kirim  (multipart: resi, foto?)
// Self-service -- jamaah yang pilih metode TTD 'kirim' nandain sendiri
// "sudah kirim" paket dokumen fisik ke kantor (dikonfirmasi user
// 2026-10-08). Nomor resi + foto resi WAJIB (dikonfirmasi user 2026-10-08,
// sebelumnya resi opsional) — foto wajib di konfirmasi PERTAMA, pas ubah
// (salah ketik resi) boleh gak kirim foto baru = foto lama dipertahankan.
//
// Gak bikin data dobel: semuanya kolom di baris users milik jamaah sendiri
// (1 jamaah = 1 paket), jadi kirim ulang cuma NIMPA nilai lama. Foto lama
// dihapus dari disk begitu diganti biar gak numpuk file yatim.
// dokumen_fisik_dikirim_at cuma diisi SEKALI (konfirmasi pertama) — itu
// juga yang ngunci ganti metode TTD (lihat src/lib/kunciMetodeTtdSahabat.js).
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const resi = String(formData.get('resi') || '').trim().toUpperCase();
    const foto = formData.get('foto');
    const adaFoto = foto && typeof foto !== 'string' && foto.size > 0;

    if (!resi) return Response.json({ error: 'Nomor resi wajib diisi' }, { status: 400 });
    if (!POLA_RESI.test(resi)) {
      return Response.json({ error: 'Nomor resi harus 6-40 karakter huruf/angka (boleh pakai tanda -)' }, { status: 400 });
    }
    if (adaFoto) {
      if (!TIPE_FOTO_OK[foto.type]) return Response.json({ error: 'Foto resi harus JPG atau PNG' }, { status: 400 });
      if (foto.size > MAKS_FOTO) return Response.json({ error: 'Ukuran foto resi maksimal 5MB' }, { status: 400 });
    }

    const [[user]] = await pool.query(
      `SELECT name, role, metode_ttd_sahabat, dokumen_fisik_dikirim_at, dokumen_fisik_resi_foto_path,
              dokumen_spk_ak_fisik_diterima_at, dokumen_cif_fisik_diterima_at,
              dokumen_pemblokiran_fisik_diterima_at, dokumen_formulir_bsi_fisik_diterima_at
       FROM users WHERE id = ?`, [auth.user.id]
    );
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    if (user.metode_ttd_sahabat !== 'kirim') {
      return Response.json({ error: 'Cuma relevan buat metode "Cetak & Kirim Sendiri"' }, { status: 400 });
    }
    if (user.dokumen_spk_ak_fisik_diterima_at || user.dokumen_cif_fisik_diterima_at
      || user.dokumen_pemblokiran_fisik_diterima_at || user.dokumen_formulir_bsi_fisik_diterima_at) {
      return Response.json({ error: 'Dokumen sudah mulai diterima kantor, data pengiriman tidak bisa diubah lagi. Hubungi admin kalau ada yang perlu dikoreksi.' }, { status: 400 });
    }
    if (!adaFoto && !user.dokumen_fisik_resi_foto_path) {
      return Response.json({ error: 'Foto resi wajib diunggah' }, { status: 400 });
    }

    let fotoPath = user.dokumen_fisik_resi_foto_path;
    if (adaFoto) {
      // Format `resi_<userId>_<timestamp>.<ext>` — kategori ini terdaftar di
      // USER_ID_DI_NAMA_FILE (dokumenProteksi.js), jamaah cuma bisa buka
      // foto resinya sendiri.
      const dir = path.join(process.cwd(), 'private-uploads', 'resi-dokumen-sahabat');
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });
      const nama = `resi_${auth.user.id}_${Date.now()}${TIPE_FOTO_OK[foto.type]}`;
      await writeFile(path.join(dir, nama), Buffer.from(await foto.arrayBuffer()));
      fotoPath = `/api/dokumen/resi-dokumen-sahabat/${nama}`;
    }

    const pertama = !user.dokumen_fisik_dikirim_at;
    await pool.query(
      `UPDATE users SET dokumen_fisik_dikirim_at = COALESCE(dokumen_fisik_dikirim_at, NOW()),
              dokumen_fisik_resi = ?, dokumen_fisik_resi_foto_path = ?
       WHERE id = ?`,
      [resi, fotoPath, auth.user.id]
    );

    if (adaFoto && user.dokumen_fisik_resi_foto_path && user.dokumen_fisik_resi_foto_path !== fotoPath) {
      await unlink(absolutePathDariUrl(user.dokumen_fisik_resi_foto_path)).catch(() => {});
    }

    await kirimNotifikasiAdmin(pool, {
      tipe: 'sahabat_dokumen_dikirim',
      judul: pertama ? 'Jamaah Sahabat Baitullah Konfirmasi Kirim Dokumen' : 'Data Pengiriman Dokumen Sahabat Baitullah Diperbarui',
      pesan: pertama
        ? `${user.name} konfirmasi sudah mengirim dokumen fisik (Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF & Surat Pemblokiran) ke kantor. Resi: ${resi}.`
        : `${user.name} memperbarui data pengiriman dokumen fisik. Resi: ${resi}.`,
      link: '/admin/sahabat',
    }).catch(() => {});

    return Response.json({ message: 'Konfirmasi pengiriman dokumen tersimpan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
