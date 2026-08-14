import pool from '@/lib/db';
import { wajibRole, wajibLogin } from '@/lib/auth';
import { kirimNotifikasi, kirimNotifikasiAdmin } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';

// GET /api/custom-harga            -> semua (untuk admin)
// GET /api/custom-harga?pengaju_id=xxx -> milik satu pengaju
// GET /api/custom-harga?status=pending
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const pengajuId = searchParams.get('pengaju_id');
    const status = searchParams.get('status');

    let query = 'SELECT * FROM custom_harga_request WHERE 1=1';
    const params = [];
    if (pengajuId) { query += ' AND pengaju_id = ?'; params.push(pengajuId); }
    if (status) { query += ' AND status = ?'; params.push(status); }
    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.query(query, params);
    return Response.json({ requests: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/custom-harga  — perwakilan mengajukan harga custom
// body: { pengaju_id, prog_id, paket, kamar, harga_diajukan, alasan }
export async function POST(request) {
  const auth = wajibRole(request, ['perwakilan']);
  if (auth.error) return auth.error;
  try {
    const { pengaju_id, prog_id, paket, kamar, harga_diajukan, alasan } = await request.json();
    if (!pengaju_id || !prog_id || !harga_diajukan) {
      return Response.json({ error: 'pengaju_id, prog_id, dan harga_diajukan wajib diisi' }, { status: 400 });
    }

    // Ambil nama & role pengaju + nama program
    const [u] = await pool.query('SELECT name, role FROM users WHERE id = ?', [pengaju_id]);
    const [p] = await pool.query('SELECT name FROM programs WHERE id = ?', [prog_id]);
    if (u.length === 0) return Response.json({ error: 'Pengaju tidak ditemukan' }, { status: 404 });
    if (p.length === 0) return Response.json({ error: 'Program tidak ditemukan' }, { status: 404 });

    await pool.query(
      `INSERT INTO custom_harga_request
       (pengaju_id, pengaju_nama, pengaju_role, prog_id, prog_name, paket, kamar, harga_diajukan, alasan, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [pengaju_id, u[0].name, u[0].role, prog_id, p[0].name, paket || null, kamar || null, Number(harga_diajukan), alasan || null]
    );

    await kirimNotifikasiAdmin(pool, {
      tipe: 'custom_harga_baru',
      judul: 'Pengajuan Custom Harga Baru',
      pesan: `${u[0].name} mengajukan custom harga untuk ${p[0].name} (${paket || '-'} ${kamar || ''}).`,
      link: '/admin?tab=customharga',
    });

    return Response.json({ message: 'Pengajuan custom harga terkirim! Menunggu persetujuan admin.' }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/custom-harga  — admin approve/reject
// body: { id, action: 'approve'|'reject', catatan_admin }
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id, action, catatan_admin } = await request.json();
    if (!id || !action) {
      return Response.json({ error: 'id dan action wajib diisi' }, { status: 400 });
    }
    if (!['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'Action harus approve atau reject' }, { status: 400 });
    }

    const [rows] = await pool.query('SELECT * FROM custom_harga_request WHERE id = ?', [id]);
    if (rows.length === 0) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });
    const req = rows[0];

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await pool.query(
      'UPDATE custom_harga_request SET status = ?, catatan_admin = ? WHERE id = ?',
      [newStatus, catatan_admin || null, id]
    );

    // Kalau di-approve & pengaju perwakilan & ada paket+kamar -> terapkan ke perwakilan_harga
    if (action === 'approve' && req.pengaju_role === 'perwakilan' && req.paket && req.kamar) {
      const key = `jual_${String(req.paket).toLowerCase()}_${String(req.kamar).toLowerCase()}`;
      // Kolom valid saja
      const valid = ['jual_deluxe_quad','jual_deluxe_triple','jual_deluxe_double',
        'jual_eksekutif_quad','jual_eksekutif_triple','jual_eksekutif_double',
        'jual_signature_quad','jual_signature_triple','jual_signature_double'];
      if (valid.includes(key)) {
        await pool.query(
          `INSERT INTO perwakilan_harga (perw_id, prog_id, ${key})
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE ${key} = VALUES(${key})`,
          [req.pengaju_id, req.prog_id, Number(req.harga_diajukan)]
        );
      }
    }

    await kirimNotifikasi(pool, {
      user_id: req.pengaju_id,
      tipe: action === 'approve' ? 'custom_harga_disetujui' : 'custom_harga_ditolak',
      judul: action === 'approve' ? 'Custom Harga Disetujui' : 'Custom Harga Ditolak',
      pesan: `Pengajuan custom harga untuk ${req.prog_name} ${action === 'approve' ? 'disetujui' : 'ditolak'}.${catatan_admin ? ' Catatan: ' + catatan_admin : ''}`,
      link: req.pengaju_role === 'perwakilan' ? '/perwakilan/harga' : '/profil',
    });

    await catatAudit(pool, {
      actor: auth.user,
      aksi: action === 'approve' ? 'approve_custom_harga' : 'reject_custom_harga',
      target_type: 'custom_harga',
      target_id: id,
      keterangan: `${req.pengaju_nama} — ${req.prog_name} Rp ${Number(req.harga_diajukan).toLocaleString('id-ID')}${catatan_admin ? ', catatan: ' + catatan_admin : ''}`,
    });

    return Response.json({ message: action === 'approve' ? 'Pengajuan disetujui!' : 'Pengajuan ditolak.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
