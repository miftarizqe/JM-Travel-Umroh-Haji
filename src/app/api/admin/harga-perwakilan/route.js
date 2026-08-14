import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const KAMAR = ['quad', 'triple', 'double'];
const PAKET = ['deluxe', 'eksekutif', 'signature'];

function gridFromRow(row) {
  const g = {};
  for (const paket of PAKET) for (const kamar of KAMAR) g[`${paket}_${kamar}`] = Number(row?.[`jual_${paket}_${kamar}`] || 0);
  return g;
}

// GET /api/admin/harga-perwakilan?perw_id=xxx&prog_id=yyy
// Admin melihat harga jual perwakilan tsb utk 1 program, PLUS harga upline-nya
// (kalau perwakilan ini direkrut perwakilan lain) — admin yang atur semua.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const perwId = searchParams.get('perw_id');
    const progId = searchParams.get('prog_id');
    if (!perwId || !progId) {
      return Response.json({ error: 'perw_id dan prog_id wajib diisi' }, { status: 400 });
    }

    const [progRows] = await pool.query(
      `SELECT hpp_deluxe_quad, hpp_deluxe_triple, hpp_deluxe_double,
              hpp_eksekutif_quad, hpp_eksekutif_triple, hpp_eksekutif_double,
              hpp_signature_quad, hpp_signature_triple, hpp_signature_double
       FROM programs WHERE id = ?`, [progId]
    );
    if (progRows.length === 0) return Response.json({ error: 'Program tidak ditemukan' }, { status: 404 });
    const hppKantor = {};
    for (const paket of PAKET) for (const kamar of KAMAR) hppKantor[`${paket}_${kamar}`] = Number(progRows[0][`hpp_${paket}_${kamar}`] || 0);

    const [perwRows] = await pool.query(
      'SELECT id, name, kode_unik, perekrut_id FROM users WHERE id = ? AND role = ?', [perwId, 'perwakilan']
    );
    if (perwRows.length === 0) return Response.json({ error: 'Perwakilan tidak ditemukan' }, { status: 404 });
    const perwakilan = perwRows[0];

    const [ownRows] = await pool.query('SELECT * FROM perwakilan_harga WHERE perw_id = ? AND prog_id = ?', [perwId, progId]);
    const hargaPerwakilan = gridFromRow(ownRows[0]);

    let upline = null;
    let hargaUpline = null;
    if (perwakilan.perekrut_id) {
      const [uplineRows] = await pool.query(
        'SELECT id, name, kode_unik, role FROM users WHERE id = ?', [perwakilan.perekrut_id]
      );
      if (uplineRows.length > 0 && uplineRows[0].role === 'perwakilan') {
        upline = uplineRows[0];
        const [r] = await pool.query('SELECT * FROM perwakilan_harga WHERE perw_id = ? AND prog_id = ?', [upline.id, progId]);
        hargaUpline = gridFromRow(r[0]);
      }
    }

    return Response.json({
      perwakilan: { id: perwakilan.id, name: perwakilan.name, kode_unik: perwakilan.kode_unik },
      upline: upline ? { id: upline.id, name: upline.name, kode_unik: upline.kode_unik, role: upline.role } : null,
      hpp_kantor: hppKantor,
      harga_perwakilan: hargaPerwakilan,
      harga_upline: hargaUpline,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/harga-perwakilan
// body: { perw_id, prog_id, harga_perwakilan: {9 combo}, harga_upline: {9 combo} | null }
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { perw_id, prog_id, harga_perwakilan, harga_upline } = await request.json();
    if (!perw_id || !prog_id || !harga_perwakilan) {
      return Response.json({ error: 'perw_id, prog_id, dan harga_perwakilan wajib diisi' }, { status: 400 });
    }

    async function upsert(table, idCol, idVal, grid) {
      const cols = [];
      const vals = [];
      for (const paket of PAKET) for (const kamar of KAMAR) {
        cols.push(`jual_${paket}_${kamar}`);
        vals.push(Number(grid[`${paket}_${kamar}`] || 0));
      }
      const placeholders = cols.map(() => '?').join(', ');
      const updateClause = cols.map(c => `${c} = VALUES(${c})`).join(', ');
      await pool.query(
        `INSERT INTO ${table} (${idCol}, prog_id, ${cols.join(', ')})
         VALUES (?, ?, ${placeholders})
         ON DUPLICATE KEY UPDATE ${updateClause}`,
        [idVal, prog_id, ...vals]
      );
    }

    await upsert('perwakilan_harga', 'perw_id', perw_id, harga_perwakilan);

    // Harga upline: cari role uplinenya dulu, tulis kalau upline itu perwakilan.
    if (harga_upline) {
      const [perwRows] = await pool.query('SELECT perekrut_id FROM users WHERE id = ?', [perw_id]);
      const perekrutId = perwRows[0]?.perekrut_id;
      if (perekrutId) {
        const [uplineRows] = await pool.query('SELECT role FROM users WHERE id = ?', [perekrutId]);
        const uplineRole = uplineRows[0]?.role;
        if (uplineRole === 'perwakilan') {
          await upsert('perwakilan_harga', 'perw_id', perekrutId, harga_upline);
        }
      }
    }

    return Response.json({ message: 'Harga berhasil disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
