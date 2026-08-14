import pool from '@/lib/db';
import { wajibPemilikAtauAdmin } from '@/lib/auth';

// GET /api/profil?user_id=xxx — ambil data user TERKINI dari DB
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    if (!userId) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });

    const auth = wajibPemilikAtauAdmin(request, userId);
    if (auth.error) return auth.error;

    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.wa, u.nik, u.role, u.kode_unik, u.status, u.wilayah, u.foto_path,
              u.points, u.tabungan_bsi, u.perekrut_id, p.name AS perekrut_nama, u.reg_status, u.reg_metode, u.reg_jadwal,
              u.created_at
       FROM users u LEFT JOIN users p ON p.id = u.perekrut_id
       WHERE u.id = ?`, [userId]
    );
    if (rows.length === 0) return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });

    const user = rows[0];

    // Cek apakah sudah pernah umroh (punya booking selesai) -> syarat upgrade perwakilan
    const [sel] = await pool.query(
      "SELECT COUNT(*) AS jml FROM bookings WHERE user_id = ? AND status = 'selesai'", [userId]
    );
    user.sudah_umroh = Number(sel[0]?.jml || 0) > 0;

    // Apakah user BENAR-BENAR punya pengajuan pendaftaran perwakilan?
    // Jangan andalkan reg_status saja — kolom itu bisa terisi sisa data lama,
    // sehingga blok "Status Pendaftaran" muncul pada jamaah biasa
    // yang tidak pernah mendaftar jadi perwakilan.
    let sedangDaftarAgen = false;
    try {
      const [ap] = await pool.query(
        "SELECT id FROM agen_pendaftaran WHERE user_id = ? AND status <> 'ditolak' LIMIT 1",
        [userId]
      );
      sedangDaftarAgen = ap.length > 0;
    } catch {
      // tabel belum ada -> anggap tidak sedang mendaftar
      sedangDaftarAgen = false;
    }
    user.sedang_daftar_agen = sedangDaftarAgen;

    return Response.json({ user });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/profil — update nama, email, wa (cek duplikat)
export async function PATCH(request) {
  try {
    const { user_id, name, email, wa } = await request.json();
    if (!user_id) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });

    const auth = wajibPemilikAtauAdmin(request, user_id);
    if (auth.error) return auth.error;
    if (!name || !String(name).trim()) {
      return Response.json({ error: 'Nama wajib diisi' }, { status: 400 });
    }
    if (!wa || !String(wa).trim()) {
      return Response.json({ error: 'No. WhatsApp wajib diisi' }, { status: 400 });
    }

    // Email & WA harus unik (kecuali milik sendiri)
    const [dupe] = await pool.query(
      'SELECT id FROM users WHERE (wa = ? OR (email = ? AND email IS NOT NULL)) AND id <> ?',
      [wa, email || null, user_id]
    );
    if (dupe.length > 0) {
      return Response.json({ error: 'Email atau No. WhatsApp sudah dipakai akun lain' }, { status: 400 });
    }

    await pool.query(
      'UPDATE users SET name = ?, email = ?, wa = ? WHERE id = ?',
      [String(name).trim(), email || null, String(wa).trim(), user_id]
    );

    const [rows] = await pool.query(
      'SELECT id, name, email, wa, nik, role, kode_unik, status, points, tabungan_bsi FROM users WHERE id = ?',
      [user_id]
    );

    return Response.json({ message: 'Profil berhasil diperbarui!', user: rows[0] });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
