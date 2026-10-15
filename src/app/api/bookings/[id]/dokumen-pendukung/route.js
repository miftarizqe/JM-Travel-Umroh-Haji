import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { DOC_KEYS, labelDokumen, parseJamaahData } from '@/lib/dokumenPendukung';

// POST /api/bookings/[id]/dokumen-pendukung  body: { idx, doc_key, path }
// Ganti SATU dokumen pendukung yang berstatus 'ditolak' admin dengan file
// baru — SENGAJA endpoint sempit terpisah dari PATCH /api/bookings/[id]
// (dikonfirmasi user 2026-10-15, lihat [UI] Booking - Dokumen pendukung).
// Gerbang lunas-dikunci-total di PATCH itu TETAP UTUH (dikonfirmasi user
// 2026-10-12) — endpoint ini CUMA boleh ganti path 1 dokumen yang statusnya
// PERSIS 'ditolak' & reset ke 'menunggu', TIDAK BISA dipakai ubah field lain
// (nama/NIK/paket/dst) walau booking udah lunas. `path` sendiri didapat dari
// POST /api/upload-dokumen-jamaah (upload generik, gak tersentuh lock ini).
export async function POST(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { idx, doc_key, path: pathBaru } = body;
  if (!Number.isInteger(idx) || !DOC_KEYS.includes(doc_key) || !pathBaru) {
    return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[bk]] = await conn.query(
      'SELECT user_id, ordered_by, jamaah_data FROM bookings WHERE id = ? FOR UPDATE', [id]
    );
    if (!bk) {
      await conn.rollback();
      return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
    }

    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    const boleh = isAdmin || bk.user_id === auth.user.id || bk.ordered_by === auth.user.id;
    if (!boleh) {
      await conn.rollback();
      return Response.json({ error: 'Anda tidak punya akses ke booking ini' }, { status: 403 });
    }

    const jd = parseJamaahData(bk.jamaah_data);
    const j = jd[idx];
    if (!j) {
      await conn.rollback();
      return Response.json({ error: 'Jamaah tidak ditemukan' }, { status: 404 });
    }
    if (j.doc_status?.[doc_key]?.status !== 'ditolak') {
      await conn.rollback();
      return Response.json({ error: 'Dokumen ini belum/tidak ditolak admin — ganti lewat formulir jamaah biasa.' }, { status: 400 });
    }

    const pathLama = j[doc_key];
    jd[idx] = { ...j, [doc_key]: pathBaru, doc_status: { ...j.doc_status, [doc_key]: { status: 'menunggu' } } };
    await conn.query('UPDATE bookings SET jamaah_data = ? WHERE id = ?', [JSON.stringify(jd), id]);

    const label = labelDokumen(doc_key);
    await catatAudit(conn, {
      actor: auth.user, aksi: 'ganti_dokumen_pendukung_ditolak',
      target_type: 'booking', target_id: id,
      keterangan: `${label} — ${j.nama || `Jamaah ${idx + 1}`} diunggah ulang setelah ditolak admin`,
    });

    await conn.commit();
    return Response.json({ message: 'Dokumen berhasil diganti, menunggu verifikasi admin lagi.', path_lama: pathLama });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  } finally {
    conn.release();
  }
}
