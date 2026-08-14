import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const KOLOM = ['wa_kantor', 'bank_nama', 'bank_rekening', 'bank_atas_nama', 'alamat_kantor', 'ig_url', 'tiktok_url', 'fb_url', 'nama_penandatangan', 'jabatan_penandatangan', 'nama_head_of_agency', 'jabatan_head_of_agency', 'nama_perusahaan', 'telepon_kantor', 'email_kantor', 'nama_penandatangan_keuangan', 'jabatan_penandatangan_keuangan'];

// GET /api/admin/pengaturan
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query('SELECT * FROM pengaturan WHERE id = 1');
    return Response.json({ pengaturan: rows[0] || null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/admin/pengaturan — update baris tunggal (id=1). Partial update:
// cuma kolom yang beneran ada di body yang di-SET, biar halaman Pengaturan
// Umum & Pengaturan Dokumen bisa save independen tanpa saling nge-null-kan
// field punya halaman lain.
export async function PUT(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const kolomDikirim = KOLOM.filter(k => k in body);
    if (kolomDikirim.length === 0) {
      return Response.json({ error: 'Tidak ada field yang dikirim' }, { status: 400 });
    }
    const setClause = kolomDikirim.map(k => `${k} = ?`).join(', ');
    const vals = kolomDikirim.map(k => body[k] || null);
    await pool.query(`UPDATE pengaturan SET ${setClause} WHERE id = 1`, vals);
    return Response.json({ message: 'Pengaturan disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
