import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// POST /api/perwakilan/kalkulator/simpan  body: { id?, template_id, paket, kamar,
//   tanggal_berangkat?, addon_config, hpp_snapshot, margin_perwakilan, nama_quote?, catatan_perwakilan? }
// Simpan (atau update) quote sebagai draft — belum diajukan ke admin, cuma
// nyimpen hasil eksplorasi kalkulator buat ditawarkan ke jamaah dulu.
// harga_jual_perwakilan dihitung SERVER-SIDE (hpp + margin), gak pernah
// dipercaya mentah dari client. Kalau `id` dikirim & masih status 'draft'
// milik perwakilan ini, di-UPDATE (bukan bikin baris baru) — draft yang
// sudah diajukan/diproses TIDAK bisa diedit lagi lewat sini.
export async function POST(request) {
  const auth = wajibRole(request, ['perwakilan']);
  if (auth.error) return auth.error;
  try {
    const {
      id, template_id, paket, kamar, tanggal_berangkat, addon_config,
      hpp_snapshot, margin_perwakilan, nama_quote, catatan_perwakilan,
    } = await request.json();

    if (!template_id || !paket || !kamar) {
      return Response.json({ error: 'template_id, paket, dan kamar wajib diisi' }, { status: 400 });
    }
    const hpp = Number(hpp_snapshot);
    const margin = Number(margin_perwakilan);
    if (!Number.isFinite(hpp) || hpp < 0) {
      return Response.json({ error: 'hpp_snapshot tidak valid' }, { status: 400 });
    }
    if (!Number.isFinite(margin) || margin < 0) {
      return Response.json({ error: 'Margin/ujroh wajib diisi (boleh 0, gak boleh negatif)' }, { status: 400 });
    }
    const hargaJual = hpp + margin;

    if (id) {
      const [[existing]] = await pool.query('SELECT id, perwakilan_id, status FROM kalkulator_perwakilan_lead WHERE id = ?', [id]);
      if (!existing) return Response.json({ error: 'Quote tidak ditemukan' }, { status: 404 });
      if (String(existing.perwakilan_id) !== String(auth.user.id)) {
        return Response.json({ error: 'Akses ditolak. Quote ini bukan milik Anda.' }, { status: 403 });
      }
      if (existing.status !== 'draft') {
        return Response.json({ error: 'Quote yang sudah diajukan/diproses tidak bisa diedit lagi.' }, { status: 400 });
      }
      await pool.query(
        `UPDATE kalkulator_perwakilan_lead SET
           template_id=?, paket=?, kamar=?, tanggal_berangkat=?, addon_config=?,
           hpp_snapshot=?, margin_perwakilan=?, harga_jual_perwakilan=?, nama_quote=?, catatan_perwakilan=?
         WHERE id = ?`,
        [template_id, paket, kamar, tanggal_berangkat || null, JSON.stringify(addon_config || {}),
         hpp, margin, hargaJual, nama_quote || null, catatan_perwakilan || null, id]
      );
      return Response.json({ message: 'Quote diperbarui!', id });
    }

    const [result] = await pool.query(
      `INSERT INTO kalkulator_perwakilan_lead
         (perwakilan_id, template_id, paket, kamar, tanggal_berangkat, addon_config,
          hpp_snapshot, margin_perwakilan, harga_jual_perwakilan, nama_quote, catatan_perwakilan, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      [auth.user.id, template_id, paket, kamar, tanggal_berangkat || null, JSON.stringify(addon_config || {}),
       hpp, margin, hargaJual, nama_quote || null, catatan_perwakilan || null]
    );
    return Response.json({ message: 'Quote disimpan!', id: result.insertId }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
