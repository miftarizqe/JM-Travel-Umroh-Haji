import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { generateKwitansiSetoranPendaftaranSahabat } from '@/lib/invoiceKwitansi';

// POST /api/admin/sahabat/[user_id]/kwitansi-pendaftaran — generate manual
// (dikonfirmasi user 2026-10-21). Normalnya Kwitansi ini sudah otomatis
// lahir pas unggah bukti TF pertama (lihat generateKwitansiSetoranPendaftaranSahabat
// yang dipanggil di /api/sahabat/upload-bukti-tf) -- tombol ini jaring
// pengaman buat akun LAMA yang bukti TF-nya sudah masuk SEBELUM fitur ini
// ada (kwitansi_setoran_pendaftaran_id masih NULL). Idempoten: kalau sudah
// ada, fungsi shared-nya balikin yang existing, bukan bikin dobel.
export async function POST(request, { params }) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { user_id } = await params;
    const [[pendaftaran]] = await pool.query(
      'SELECT bukti_tf_path FROM sahabat_pendaftaran WHERE user_id = ?', [user_id]
    );
    if (!pendaftaran) return Response.json({ error: 'Pendaftaran tidak ditemukan' }, { status: 404 });
    if (!pendaftaran.bukti_tf_path) {
      return Response.json({ error: 'Bukti transfer Rp1.000.000 belum diunggah jamaah ini.' }, { status: 400 });
    }

    const hasil = await generateKwitansiSetoranPendaftaranSahabat(pool, user_id);
    if (!hasil) return Response.json({ error: 'Gagal membuat kwitansi' }, { status: 500 });
    return Response.json({ message: 'Kwitansi berhasil dibuat.', id: hasil.id });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
