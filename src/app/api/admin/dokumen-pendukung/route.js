import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { kirimNotifikasi } from '@/lib/notifikasi';
import { DOC_KEYS, labelDokumen, statusDokumen } from '@/lib/dokumenPendukung';

// Verifikasi dokumen pendukung jamaah oleh admin (dikonfirmasi user
// 2026-10-01). Status disimpan di jamaah_data[i].doc_status — lihat
// src/lib/dokumenPendukung.js. Dibuat di Next.js atas permintaan user; nanti
// ikut dipindah ke Go bersama /api/bookings.

const parseJd = (jd) => {
  if (typeof jd === 'string') { try { return JSON.parse(jd); } catch { return []; } }
  return Array.isArray(jd) ? jd : [];
};

// GET /api/admin/dokumen-pendukung?status=menunggu|diverifikasi|ditolak|semua
// Daftar datar per dokumen (booking aktif saja), default yang 'menunggu'.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const filter = new URL(request.url).searchParams.get('status') || 'menunggu';
    const [rows] = await pool.query(
      `SELECT b.id, b.prog_name, b.jamaah_data, b.created_at, u.name AS pemesan
       FROM bookings b LEFT JOIN users u ON u.id = b.user_id
       WHERE b.status NOT IN ('dibatalkan') AND b.jamaah_data IS NOT NULL
       ORDER BY b.created_at DESC`
    );
    const items = [];
    for (const b of rows) {
      parseJd(b.jamaah_data).forEach((j, idx) => {
        for (const key of DOC_KEYS) {
          const st = statusDokumen(j, key);
          if (!st) continue;
          if (filter !== 'semua' && st.status !== filter) continue;
          items.push({
            booking_id: b.id, prog_name: b.prog_name, pemesan: b.pemesan,
            idx, nama_jamaah: j.nama || `Jamaah ${idx + 1}`,
            doc_key: key, label: labelDokumen(key), path: j[key],
            status: st.status, alasan: st.alasan || null, oleh: st.oleh || null, pada: st.pada || null,
          });
        }
      });
    }
    return Response.json({ items });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/admin/dokumen-pendukung
// body: { booking_id, idx, doc_key, path, status: 'diverifikasi'|'ditolak', alasan? }
// `path` wajib sama dengan yang tersimpan — biar admin gak memverifikasi file
// lama kalau jamaah barusan menggantinya.
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { booking_id, idx, doc_key, path, status } = body;
  const alasan = String(body.alasan || '').trim();
  if (!booking_id || !Number.isInteger(idx) || !DOC_KEYS.includes(doc_key) || !path) {
    return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
  }
  if (!['diverifikasi', 'ditolak'].includes(status)) {
    return Response.json({ error: 'Status tidak valid' }, { status: 400 });
  }
  if (status === 'ditolak' && !alasan) {
    return Response.json({ error: 'Alasan penolakan wajib diisi' }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[bk]] = await conn.query('SELECT id, user_id, jamaah_data FROM bookings WHERE id = ? FOR UPDATE', [booking_id]);
    if (!bk) { await conn.rollback(); return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 }); }
    const jd = parseJd(bk.jamaah_data);
    const j = jd[idx];
    if (!j || !j[doc_key]) { await conn.rollback(); return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 }); }
    if (j[doc_key] !== path) {
      await conn.rollback();
      return Response.json({ error: 'Dokumen ini baru saja diganti jamaah. Muat ulang daftar dulu.' }, { status: 409 });
    }

    j.doc_status = { ...(j.doc_status || {}), [doc_key]: {
      status, alasan: status === 'ditolak' ? alasan : null,
      oleh: auth.user.name || auth.user.id, pada: new Date().toISOString(),
    } };
    await conn.query('UPDATE bookings SET jamaah_data = ? WHERE id = ?', [JSON.stringify(jd), booking_id]);

    const label = labelDokumen(doc_key);
    const nama = j.nama || `Jamaah ${idx + 1}`;
    await catatAudit(conn, {
      actor: auth.user, aksi: status === 'ditolak' ? 'tolak_dokumen_pendukung' : 'verifikasi_dokumen_pendukung',
      target_type: 'booking', target_id: booking_id,
      keterangan: `${label} — ${nama}${status === 'ditolak' ? ` (alasan: ${alasan})` : ''}`,
    });
    if (status === 'ditolak') {
      await kirimNotifikasi(conn, {
        user_id: bk.user_id, tipe: 'dokumen_pendukung_ditolak',
        judul: `${label} Ditolak — Mohon Unggah Ulang`,
        pesan: `${label} untuk ${nama} ditolak admin: ${alasan}`,
        link: `/form-jamaah?booking_id=${booking_id}`,
      });
    }
    await conn.commit();
    return Response.json({ message: status === 'ditolak' ? 'Dokumen ditolak.' : 'Dokumen terverifikasi.' });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  } finally {
    conn.release();
  }
}
