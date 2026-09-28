import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { ambilAtauBuatNomorSurat } from '@/lib/nomorSurat';
import { pastikanSnapshot } from '@/lib/pasalSnapshot';
import { ambilPasalUntukCetak } from '@/lib/pasalUntukCetak';
import { mergeTemplateKePdf } from '@/lib/googleDocsMerge';

// POST /api/sahabat/sk-cif/pdf-percobaan — PERCOBAAN mail-merge Google Docs
// buat SK-CIF (dikonfirmasi user 2026-09-28). SENGAJA terpisah dari
// GET /api/sahabat/sk-cif yang asli (dipakai alur baca/scroll-gate/checkbox
// setuju yang ada sekarang) — endpoint ini TIDAK ganti apa pun di alur itu,
// cuma nawarin PDF hasil merge Google Docs sebagai alternatif buat dicetak.
// Generate LANGSUNG tiap dipanggil (gak di-cache/disimpan) — ini masih tahap
// coba-coba, kalau lanjut ke produksi baru dipikirin caching-nya.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      'SELECT id, name, nik, wa, email, alamat, alamat_ktp, role, no_rekening_tabungan_umroh, no_sk_cif FROM users WHERE id = ?',
      [auth.user.id]
    );
    const user = rows[0];
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    user.alamat = user.alamat_ktp || user.alamat;

    const nomor = await ambilAtauBuatNomorSurat(pool, user.id, 'SK-CIF', 'no_sk_cif');
    if (nomor) await pastikanSnapshot(pool, user.id, 'sk_cif');
    const { signer } = await ambilPasalUntukCetak('sk_cif', user.id);

    const [[pengaturan]] = await pool.query('SELECT alamat_kantor FROM pengaturan WHERE id = 1');
    const mergeData = {
      nomor: nomor || '-',
      nama: user.name,
      nik: user.nik || '-',
      alamat: user.alamat || '-',
      no_rekening: user.no_rekening_tabungan_umroh || '-',
      alamat_kantor: pengaturan?.alamat_kantor || '-',
      nama_wakil: signer?.nama || '-',
      nik_wakil: signer?.nik || '-',
      jabatan_wakil: signer?.jabatan || '-',
    };

    const pdfBuffer = await mergeTemplateKePdf({
      templateDocId: process.env.SK_CIF_TEMPLATE_DOC_ID,
      driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
      mergeData,
      namaFile: `SK-CIF-percobaan-${user.id}`,
    });

    return new Response(pdfBuffer, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="SK-CIF-percobaan.pdf"' },
    });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
