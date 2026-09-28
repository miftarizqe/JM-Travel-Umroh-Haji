import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { pastikanSnapshot } from '@/lib/pasalSnapshot';
import { ambilPasalUntukCetak } from '@/lib/pasalUntukCetak';
import { generateDokumenGabunganPdf } from '@/lib/pdfDokumen/dokumenSahabatGabungan';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function tglIndo(d) {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

// POST /api/sahabat/dokumen-legal/pdf-otomatis — PDF gabungan SK-CIF +
// Surat Pemblokiran dengan identitas jamaah terisi otomatis, ditempel di
// atas template PDF final (dikonfirmasi user 2026-09-28, satu file PDF
// biar sama kayak alur cetak fisiknya yang emang dibarengin — lihat tombol
// "Print Kedua Surat" yang sudah ada). SENGAJA gak ganti alur baca/
// scroll-gate/checkbox setuju & tombol Print lama — murni tambahan.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      `SELECT id, name, nik, alamat, alamat_ktp, role, no_rekening_tabungan_umroh,
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

    // Freeze pasal/signer (idempotent) tetap dijalankan biar konsisten sama
    // GET /api/sahabat/sk-cif — nama Penerima Kuasa yang dicetak di sini
    // ngikut versi yang sama yang udah/bakal dibekukan buat user ini.
    await pastikanSnapshot(pool, user.id, 'sk_cif');
    const { signer } = await ambilPasalUntukCetak('sk_cif', user.id);

    const pdfBuffer = await generateDokumenGabunganPdf({
      skCif: {
        nama: user.name,
        nik: user.nik || '-',
        alamat: user.alamat || '-',
        noRekening: user.no_rekening_tabungan_umroh || '-',
        namaWakil: signer?.nama || '-',
      },
      pemblokiran: {
        nama: user.name,
        nik: user.nik || '-',
        alamat: user.alamat || '-',
        noRekening: user.no_rekening_tabungan_umroh || '-',
        nominalBlokir: Number(user.nominal_blokir_tabungan).toLocaleString('id-ID'),
        jangkaWaktuHari: String(user.jangka_waktu_blokir_hari),
        tanggalMulai: tglIndo(new Date(user.tanggal_mulai_blokir)),
      },
    });

    return new Response(pdfBuffer, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="SK-CIF-dan-Surat-Pemblokiran.pdf"' },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
