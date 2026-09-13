import pool from '@/lib/db';
import { wajibSuperAdmin, wajibRole } from '@/lib/auth';

// Jenis yang ikut pencairan ujroh perwakilan — ujroh closing langsung milik
// perwakilan sendiri DAN margin reseller berjenjang (upline), digabung 1
// pengajuan per program (dikonfirmasi user 2026-09-02 — dua-duanya "duit
// yang harus ditransfer ke perwakilan", gak perlu dipisah alurnya).
const JENIS_UJROH_PERWAKILAN = ['ujroh_perwakilan', 'reseller_perwakilan'];

// GET /api/admin/perwakilan/pengajuan-ujroh — daftar semua batch,
// dipakai /admin/perwakilan/pencairan.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query(
      `SELECT pup.*, p.name AS prog_name, p.tanggal_berangkat
       FROM pengajuan_ujroh_perwakilan pup
       LEFT JOIN programs p ON p.id = pup.prog_id
       ORDER BY pup.id DESC`
    );
    return Response.json({ pengajuan: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/perwakilan/pengajuan-ujroh  body: { prog_id }
// Snapshot SEMUA baris komisi_ledger (ujroh_perwakilan + reseller_perwakilan)
// yang lagi pending & belum masuk batch manapun, DIBATASI ke booking-booking
// program yang dipilih — mirror PERSIS pola pengajuan_ujroh Sahabat Baitullah,
// bedanya dikelompokkan per PROGRAM bukan per rentang tanggal (dikonfirmasi
// user — "ini closing program bukan closing rekrutan", jadi wajar diikat ke
// program, bukan periode kalender).
//
// Gate tambahan yang gak ada di versi sahabat: program yang dipilih WAJIB
// sudah lewat tanggal keberangkatannya — closing (makanya ujroh ini ada)
// cuma bisa kejadian SETELAH keberangkatan lewat, jadi ini jaring pengaman
// eksplisit, bukan cuma mengandalkan closing yang udah gate duluan.
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  const { prog_id } = await request.json();
  if (!prog_id) {
    return Response.json({ error: 'Program wajib dipilih.' }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[program]] = await conn.query('SELECT id, name, tanggal_berangkat FROM programs WHERE id = ?', [prog_id]);
    if (!program) {
      await conn.rollback();
      return Response.json({ error: 'Program tidak ditemukan.' }, { status: 404 });
    }
    if (!program.tanggal_berangkat) {
      await conn.rollback();
      return Response.json({ error: 'Program ini belum punya tanggal keberangkatan.' }, { status: 400 });
    }
    const berangkat = new Date(program.tanggal_berangkat);
    const hariIni = new Date(new Date().toDateString());
    if (berangkat >= hariIni) {
      await conn.rollback();
      return Response.json({ error: `Program ini baru berangkat ${new Date(program.tanggal_berangkat).toLocaleDateString('id-ID')} — pencairan cuma bisa diajukan setelah program berangkat.` }, { status: 400 });
    }

    const [overlap] = await conn.query(
      `SELECT id FROM pengajuan_ujroh_perwakilan WHERE prog_id = ? AND status != 'ditolak' FOR UPDATE`,
      [prog_id]
    );
    if (overlap.length > 0) {
      await conn.rollback();
      return Response.json({ error: `Program ini udah punya pengajuan #${overlap[0].id} yang masih berlaku.` }, { status: 400 });
    }

    const [pending] = await conn.query(
      `SELECT kl.id, kl.nominal FROM komisi_ledger kl
       JOIN bookings b ON b.id = kl.booking_id
       WHERE b.prog_id = ? AND kl.dikonfirmasi_at IS NULL AND kl.pengajuan_ujroh_perwakilan_id IS NULL
         AND kl.jenis IN (?)
       FOR UPDATE`,
      [prog_id, JENIS_UJROH_PERWAKILAN]
    );
    if (pending.length === 0) {
      await conn.rollback();
      return Response.json({ error: 'Gak ada ujroh perwakilan pending buat program ini.' }, { status: 400 });
    }

    const grandTotal = pending.reduce((s, r) => s + Number(r.nominal || 0), 0);

    const [ins] = await conn.query(
      `INSERT INTO pengajuan_ujroh_perwakilan (prog_id, status, grand_total, jumlah_baris, dibuat_oleh)
       VALUES (?, 'draft', ?, ?, ?)`,
      [prog_id, grandTotal, pending.length, auth.user.id]
    );

    await conn.query(
      `UPDATE komisi_ledger SET pengajuan_ujroh_perwakilan_id = ? WHERE id IN (?)`,
      [ins.insertId, pending.map(r => r.id)]
    );

    await conn.commit();
    return Response.json({ message: 'Pengajuan baru dibuat.', pengajuan_id: ins.insertId }, { status: 201 });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  } finally {
    conn.release();
  }
}
