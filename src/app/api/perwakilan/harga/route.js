import pool from '@/lib/db';
import { wajibPemilikAtauAdmin, wajibRole } from '@/lib/auth';

const KAMAR = ['quad', 'triple', 'double'];
const PAKET = ['deluxe', 'eksekutif', 'signature'];

// GET /api/perwakilan/harga?perw_id=xxx
// Daftar program + HPP per 9 kombinasi + harga jual perwakilan (kalau sudah diatur)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const perwId = searchParams.get('perw_id');
    if (!perwId) return Response.json({ error: 'perw_id wajib diisi' }, { status: 400 });

    const auth = wajibPemilikAtauAdmin(request, perwId);
    if (auth.error) return auth.error;

    // Kalau perwakilan ini direkrut perwakilan lain, HPP-nya bukan HPP kantor
    // lagi tapi harga reseller upline (skema berjenjang).
    const [perekrutRows] = await pool.query('SELECT perekrut_id FROM users WHERE id = ?', [perwId]);
    const perekrutId = perekrutRows[0]?.perekrut_id || null;
    let upline = null;
    let uplineHargaMap = {};
    if (perekrutId) {
      const [pr] = await pool.query('SELECT id, name, kode_unik, role FROM users WHERE id = ?', [perekrutId]);
      if (pr[0]?.role === 'perwakilan') {
        upline = pr[0];
        const [uh] = await pool.query('SELECT * FROM perwakilan_harga WHERE perw_id = ?', [upline.id]);
        for (const h of uh) uplineHargaMap[h.prog_id] = h;
      }
    }

    // publish_type='private' gak pernah tampil di sini (cuma admin yang
    // daftarin, gak lewat perwakilan). publish_type='perwakilan' cuma tampil
    // kalau perwakilan INI ada di daftar yang diotorisasi (program_perwakilan).
    const [programs] = await pool.query(
      `SELECT id, name,
              hpp_deluxe_quad, hpp_deluxe_triple, hpp_deluxe_double,
              hpp_eksekutif_quad, hpp_eksekutif_triple, hpp_eksekutif_double,
              hpp_signature_quad, hpp_signature_triple, hpp_signature_double,
              harga_deluxe_quad, harga_deluxe_triple, harga_deluxe_double,
              harga_eksekutif_quad, harga_eksekutif_triple, harga_eksekutif_double,
              harga_signature_quad, harga_signature_triple, harga_signature_double
       FROM programs p WHERE p.publish_type = 'public'
          OR (p.publish_type = 'perwakilan' AND EXISTS (
            SELECT 1 FROM program_perwakilan pp WHERE pp.program_id = p.id AND pp.perw_id = ?
          ))
       ORDER BY created_at DESC`,
      [perwId]
    );

    const [hargaRows] = await pool.query(
      'SELECT * FROM perwakilan_harga WHERE perw_id = ?',
      [perwId]
    );
    const hargaMap = {};
    for (const h of hargaRows) hargaMap[h.prog_id] = h;

    const result = programs.map(p => {
      const custom = hargaMap[p.id] || null;
      const uplineHarga = uplineHargaMap[p.id] || null;
      const jual = {};
      const hpp = {};
      const hppSource = {};
      for (const paket of PAKET) {
        for (const kamar of KAMAR) {
          const key = `${paket}_${kamar}`;
          const hppKantor = Number(p[`hpp_${key}`] || 0);
          const hargaDariUpline = uplineHarga ? Number(uplineHarga[`jual_${key}`] || 0) : 0;
          hpp[key] = hargaDariUpline > 0 ? hargaDariUpline : hppKantor;
          hppSource[key] = hargaDariUpline > 0 ? 'upline' : 'kantor';
          jual[key] = custom ? Number(custom[`jual_${key}`] || 0) : Number(p[`harga_${key}`] || 0);
        }
      }
      return {
        prog_id: p.id,
        prog_name: p.name,
        hpp,
        hpp_source: hppSource,
        sudah_diatur: !!custom,
        jual,
      };
    });

    return Response.json({
      programs: result,
      upline: upline ? { id: upline.id, name: upline.name, kode_unik: upline.kode_unik } : null,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/perwakilan/harga
// body: { perw_id, prog_id, jual: { deluxe_quad, ... } }
// Admin-only — perwakilan tidak lagi atur harga sendiri (skema reseller berjenjang
// butuh admin yang koordinasikan harga upline & downline). Lihat juga
// /api/admin/harga-perwakilan untuk layar admin yang menangani rantai upline.
export async function POST(request) {
  const authRole = wajibRole(request, ['admin']);
  if (authRole.error) return authRole.error;
  try {
    const { perw_id, prog_id, jual } = await request.json();
    if (!perw_id || !prog_id || !jual) {
      return Response.json({ error: 'perw_id, prog_id, dan jual wajib diisi' }, { status: 400 });
    }

    const cols = [];
    const vals = [];
    for (const paket of PAKET) {
      for (const kamar of KAMAR) {
        const key = `${paket}_${kamar}`;
        cols.push(`jual_${key}`);
        vals.push(Number(jual[key] || 0));
      }
    }

    const placeholders = cols.map(() => '?').join(', ');
    const updateClause = cols.map(c => `${c} = VALUES(${c})`).join(', ');

    await pool.query(
      `INSERT INTO perwakilan_harga (perw_id, prog_id, ${cols.join(', ')})
       VALUES (?, ?, ${placeholders})
       ON DUPLICATE KEY UPDATE ${updateClause}`,
      [perw_id, prog_id, ...vals]
    );

    return Response.json({ message: 'Harga jual berhasil disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
