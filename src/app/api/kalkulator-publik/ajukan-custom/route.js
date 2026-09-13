import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

// POST /api/kalkulator-publik/ajukan-custom — fallback buat pengunjung yang
// gak nemu template yang cocok di /kalkulator: deskripsi bebas apa yang
// mereka mau, TANPA perlu pilih template/paket/kamar/hotel dari katalog.
// Beda dari POST /hitung (yang selalu 'estimasi' dulu, ada harga_jual),
// baris ini LANGSUNG 'diajukan' — gak ada harga yang dihitung otomatis,
// admin yang quote manual lewat WA. body: { catatan, tanggal_berangkat?, jumlah_pax? }
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { catatan, tanggal_berangkat, jumlah_pax } = await request.json();
    const catatanTrim = String(catatan || '').trim();
    if (!catatanTrim) {
      return Response.json({ error: 'Ceritain dulu paket seperti apa yang kamu mau' }, { status: 400 });
    }

    const [[user]] = await pool.query('SELECT name FROM users WHERE id = ?', [auth.user.id]);

    const [hasil] = await pool.query(
      `INSERT INTO kalkulator_lead
       (user_id, tipe, tanggal_berangkat, catatan_custom, jumlah_pax, status, diajukan_at)
       VALUES (?, 'custom', ?, ?, ?, 'diajukan', CURRENT_TIMESTAMP)`,
      [auth.user.id, tanggal_berangkat || null, catatanTrim, jumlah_pax != null ? Number(jumlah_pax) || null : null]
    );

    await kirimNotifikasiAdmin(pool, {
      tipe: 'kalkulator_ajuan_custom',
      judul: 'Ajuan Custom dari Kalkulator Publik',
      pesan: `${user?.name || 'Pengunjung'} mengajukan permintaan custom: "${catatanTrim.slice(0, 120)}${catatanTrim.length > 120 ? '...' : ''}"`,
      link: '/admin/kalkulator-leads',
    });

    return Response.json({ message: 'Permintaan custom terkirim! Tim kami akan segera menghubungi kamu.', lead_id: hasil.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
