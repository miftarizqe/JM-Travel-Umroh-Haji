import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { ambilAtauBuatNomorSurat } from '@/lib/nomorSurat';
import { pastikanSnapshot } from '@/lib/pasalSnapshot';
import { ambilPasalUntukCetak } from '@/lib/pasalUntukCetak';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function tglIndo(d) {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

// GET /api/sahabat/surat-pemblokiran — data buat halaman print Surat
// Pernyataan Kuasa Blokir Rekening & Instruksi Pemindahbukuan milik sendiri.
// SELALU fisik (gak lewat pipeline TTD digital), pola sama persis
// /api/sahabat/sk-cif — nomor surat resmi + snapshot pasal dibekukan DI SINI
// (cuma sekali, saat halaman print beneran dibuka).
//
// Nominal/jangka waktu/tanggal mulai blokir diisi sendiri oleh anggota
// sahabat lewat PATCH /api/sahabat/blokir-rekening SEBELUM endpoint ini bisa
// dipakai — diformat Rupiah/tanggal Indonesia DI SINI sebelum di-merge ke
// pasal (renderPasalMarkup cuma substitusi string apa adanya, gak format).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      `SELECT id, name, nik, wa, email, alamat, alamat_ktp, kode_unik, role,
              no_rekening_tabungan_umroh, no_surat_pemblokiran,
              nominal_blokir_tabungan, jangka_waktu_blokir_hari, tanggal_mulai_blokir
       FROM users WHERE id = ?`,
      [auth.user.id]
    );
    const user = rows[0];
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    if (!user.no_rekening_tabungan_umroh) return Response.json({ error: 'Isi nomor rekening tabungan umroh terlebih dahulu' }, { status: 400 });
    if (!user.nominal_blokir_tabungan || !user.jangka_waktu_blokir_hari || !user.tanggal_mulai_blokir) {
      return Response.json({ error: 'Isi nominal, jangka waktu, dan tanggal mulai blokir terlebih dahulu' }, { status: 400 });
    }
    user.alamat = user.alamat_ktp || user.alamat;

    const nomor = await ambilAtauBuatNomorSurat(pool, user.id, 'SURAT-PEMBLOKIRAN', 'no_surat_pemblokiran');
    if (nomor) await pastikanSnapshot(pool, user.id, 'surat_pemblokiran');
    const { pasal } = await ambilPasalUntukCetak('surat_pemblokiran', user.id);

    const mergeData = {
      nama: user.name,
      nik: user.nik || '-',
      alamat: user.alamat || '-',
      no_rekening: user.no_rekening_tabungan_umroh,
      nominal_blokir: Number(user.nominal_blokir_tabungan).toLocaleString('id-ID'),
      jangka_waktu_hari: String(user.jangka_waktu_blokir_hari),
      tanggal_mulai_blokir: tglIndo(new Date(user.tanggal_mulai_blokir)),
    };

    return Response.json({ user, nomor, pasal, mergeData });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
