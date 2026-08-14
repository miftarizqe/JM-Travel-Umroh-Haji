import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/audit-log?target_type=&limit= — riwayat approval admin, terbaru dulu
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const targetType = searchParams.get('target_type');
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];
    if (targetType) {
      query += ' AND target_type = ?';
      params.push(targetType);
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await pool.query(query, params);
    return Response.json({ audit_log: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
