import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

function rangeClause(column, from, to, params) {
  let clause = '';
  if (from) { clause += ` AND ${column} >= ?`; params.push(`${from} 00:00:00`); }
  if (to) { clause += ` AND ${column} <= ?`; params.push(`${to} 23:59:59`); }
  return clause;
}

// GET /api/admin/hierarchy?from=&to=
// Hierarki perwakilan (berdasar perekrut_id) + performa closing tiap orang,
// dipakai untuk tree hierarki DAN laporan closing (leaderboard).
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const [users] = await pool.query(
      `SELECT u.id, u.name, u.role, u.kode_unik, u.status, u.perekrut_id, u.wilayah,
              p.name AS perekrut_nama
       FROM users u LEFT JOIN users p ON p.id = u.perekrut_id
       WHERE u.role = 'perwakilan'`
    );

    const bookingParams = [];
    let bookingWhere = ' WHERE referral_perw_id IS NOT NULL';
    bookingWhere += rangeClause('created_at', from, to, bookingParams);
    const [bookingRows] = await pool.query(
      `SELECT referral_perw_id AS penerima_id,
              COUNT(*) AS jumlah_booking, COALESCE(SUM(jumlah_jamaah),0) AS jumlah_jamaah
       FROM bookings ${bookingWhere} GROUP BY referral_perw_id`,
      bookingParams
    );
    const bookingMap = {};
    bookingRows.forEach(r => { bookingMap[r.penerima_id] = r; });

    const komisiParams = [];
    let komisiWhere = ' WHERE 1=1';
    komisiWhere += rangeClause('created_at', from, to, komisiParams);
    const [komisiRows] = await pool.query(
      `SELECT penerima_id, jenis, SUM(nominal) AS total, COUNT(*) AS jumlah
       FROM komisi_ledger ${komisiWhere} GROUP BY penerima_id, jenis`,
      komisiParams
    );
    const komisiMap = {};
    komisiRows.forEach(r => {
      if (!komisiMap[r.penerima_id]) komisiMap[r.penerima_id] = { total: 0, breakdown: [] };
      komisiMap[r.penerima_id].total += Number(r.total);
      komisiMap[r.penerima_id].breakdown.push({ jenis: r.jenis, total: Number(r.total), jumlah: r.jumlah });
    });

    const enriched = users.map(u => ({
      ...u,
      jumlah_booking: bookingMap[u.id]?.jumlah_booking || 0,
      jumlah_jamaah: bookingMap[u.id]?.jumlah_jamaah || 0,
      total_komisi: komisiMap[u.id]?.total || 0,
      komisi_breakdown: komisiMap[u.id]?.breakdown || [],
    }));

    // Tree hierarki berdasar perekrut_id
    const byId = {};
    enriched.forEach(u => { byId[u.id] = { ...u, children: [] }; });
    const roots = [];
    enriched.forEach(u => {
      if (u.perekrut_id && byId[u.perekrut_id]) {
        byId[u.perekrut_id].children.push(byId[u.id]);
      } else {
        roots.push(byId[u.id]);
      }
    });

    function hitungTotalDownline(node) {
      let n = node.children.length;
      for (const c of node.children) n += hitungTotalDownline(c);
      node.total_downline = n;
      return n;
    }
    roots.forEach(hitungTotalDownline);

    // Laporan flat, urut komisi terbesar
    const flat = [...enriched].sort((a, b) => b.total_komisi - a.total_komisi);

    return Response.json({ tree: roots, flat });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
