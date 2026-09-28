import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { pastikanSnapshot } from '@/lib/pasalSnapshot';
import { ambilPasalUntukCetak } from '@/lib/pasalUntukCetak';
import { generateSkCifPdf } from '@/lib/pdfDokumen/skCifOverlay';

// POST /api/sahabat/sk-cif/pdf-otomatis — PDF SK-CIF dengan identitas jamaah
// terisi otomatis (nama/NIK/alamat/no. rekening + nama Penerima Kuasa di
// kolom TTD), ditempel di atas template PDF final (dikonfirmasi user
// 2026-09-28, lihat src/lib/pdfDokumen/skCifOverlay.js). SENGAJA gak ganti
// alur baca/scroll-gate/checkbox setuju & tombol Print yang ada di
// GET /api/sahabat/sk-cif — endpoint ini murni tambahan pilihan cetak yang
// lebih rapi, bukan pengganti.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      'SELECT id, name, nik, alamat, alamat_ktp, role, no_rekening_tabungan_umroh FROM users WHERE id = ?',
      [auth.user.id]
    );
    const user = rows[0];
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    user.alamat = user.alamat_ktp || user.alamat;

    // Freeze pasal/signer (idempotent) tetap dijalankan biar konsisten sama
    // GET /api/sahabat/sk-cif — nama Penerima Kuasa yang dicetak di sini
    // ngikut versi yang sama yang udah/bakal dibekukan buat user ini.
    await pastikanSnapshot(pool, user.id, 'sk_cif');
    const { signer } = await ambilPasalUntukCetak('sk_cif', user.id);

    const pdfBuffer = await generateSkCifPdf({
      nama: user.name,
      nik: user.nik || '-',
      alamat: user.alamat || '-',
      noRekening: user.no_rekening_tabungan_umroh || '-',
      namaWakil: signer?.nama || '-',
    });

    return new Response(pdfBuffer, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="SK-CIF.pdf"' },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
