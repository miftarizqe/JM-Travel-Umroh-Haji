import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { apakahDalamJaringan, kedalamanDownline, GEN_MAKS_DETAIL, samarkanTanpaPersetujuan } from '@/lib/jaringan';

// GET /api/sahabat/downline/[user_id] — drill-down rekursif jaringan
// sahabat (siapa merekrut siapa), TANPA closing/komisi (sahabat gak
// punya itu, beda dari /api/downline/closings punya perwakilan). Otorisasi
// reuse apakahDalamJaringan() yang sudah role-agnostic (jalan-jalan di
// users.perekrut_id) — gak perlu versi khusus sahabat.
export async function GET(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { user_id } = await params;
    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    // Head of Program (dikonfirmasi user 2026-09-07) — boleh liat jaringan
    // SIAPAPUN & tidak kena batas data per generasi. Dicek selalu (bukan cuma
    // kalau target di luar jaringannya) biar aturan Gen1/Gen2-5/Gen6+ di bawah
    // gak keliru dikenakan ke HoP.
    let isHop = false;
    if (!isAdmin) {
      const [[pengaturan]] = await pool.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
      isHop = !!(pengaturan?.head_of_program_user_id && String(pengaturan.head_of_program_user_id) === String(auth.user.id));
    }
    if (!isAdmin && !isHop && auth.user.id !== user_id) {
      const dalamJaringan = await apakahDalamJaringan(pool, auth.user.id, user_id);
      if (!dalamJaringan) return Response.json({ error: 'Anda tidak berwenang melihat jaringan ini' }, { status: 403 });
    }

    const [rows] = await pool.query('SELECT id, name, kode_unik, role, status, setuju_data_pribadi_at FROM users WHERE id = ?', [user_id]);
    if (rows.length === 0) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    const target = rows[0];

    const [rekrutan] = await pool.query(
      `SELECT u.id, u.name, u.role, u.kode_unik, u.wa, u.status, u.created_at, u.setuju_data_pribadi_at,
              kp.status AS funnel_status
       FROM users u
       LEFT JOIN sahabat_pendaftaran kp ON kp.user_id = u.id
       WHERE u.perekrut_id = ?
       ORDER BY u.created_at DESC`,
      [user_id]
    );

    // Aturan data per generasi untuk anggota biasa (lihat src/lib/jaringan.js):
    // rekrutan target = generasi (kedalaman target + 1) dari penampil.
    if (isAdmin || isHop) {
      delete target.setuju_data_pribadi_at;
      for (const r of rekrutan) { delete r.wa; delete r.setuju_data_pribadi_at; }
      return Response.json({ target, rekrutan });
    }
    const kedalaman = await kedalamanDownline(pool, auth.user.id, user_id);
    // Target sendiri (kalau downline, bukan diri sendiri) ikut aturan persetujuan data pribadi.
    let targetTampil = target;
    if (kedalaman) {
      targetTampil = samarkanTanpaPersetujuan(target);
    } else {
      delete target.setuju_data_pribadi_at;
    }
    const genRekrutan = (kedalaman ?? 0) + 1;
    if (genRekrutan === 1) {
      return Response.json({ target: targetTampil, rekrutan: rekrutan.map(samarkanTanpaPersetujuan) });
    }
    for (const r of rekrutan) delete r.wa;
    if (genRekrutan > GEN_MAKS_DETAIL) {
      // Gen6+: jumlah saja. Target sendiri ikut disembunyikan kalau di luar Gen5.
      const targetAman = kedalaman > GEN_MAKS_DETAIL ? { id: target.id } : targetTampil;
      return Response.json({ target: targetAman, rekrutan: [], jumlah_rekrutan: rekrutan.length });
    }
    return Response.json({ target: targetTampil, rekrutan: rekrutan.map(samarkanTanpaPersetujuan) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
