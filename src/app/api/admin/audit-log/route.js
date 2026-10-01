import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

// GET /api/admin/audit-log?target_type=&limit= — riwayat approval admin, terbaru dulu
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const targetType = searchParams.get('target_type');
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

    // Filter khusus 'saldo_sahabat' = semua log perubahan saldo Sahabat
    // (yang punya subjek & saldo sebelum/sesudah — catatan sistem ujroh #10).
    let query = `SELECT a.*, s.name AS subjek_nama FROM audit_log a
                 LEFT JOIN users s ON s.id = a.subjek_user_id WHERE 1=1`;
    const params = [];
    if (targetType === 'saldo_sahabat') {
      query += ' AND a.subjek_user_id IS NOT NULL';
    } else if (targetType) {
      query += ' AND a.target_type = ?';
      params.push(targetType);
    }
    query += ' ORDER BY a.created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await pool.query(query, params);
    return Response.json({ audit_log: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
