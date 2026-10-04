import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

// Jenis yang ikut pengajuan mingguan (SENGAJA gak termasuk
// 'pemakaian_saldo_sahabat' — itu penyesuaian internal checkout mandiri,
// bukan transfer eksternal ke rekening umroh, gak lewat alur pengajuan
// mingguan sama sekali).
//
// TIDAK LAGI "sama persis" /api/admin/sahabat/komisi-rekap sejak 2026-09-30
// (dikonfirmasi user) — 'tabungan_awal_sahabat' DIKELUARKAN di sini karena
// bukan lagi kewajiban TF JM Travel (jemaah setor sendiri Rp100rb ke
// rekening tabungan umroh mereka), lahir langsung dikonfirmasi_at (lihat
// status-pendaftaran-sahabat/route.js), gak pernah perlu diajukan. Tapi
// komisi-rekap TETAP menyertakannya di list-nya — dipakai juga buat nampilin
// SNAPSHOT batch LAMA yang mungkin masih punya baris tabungan_awal dari
// sebelum tanggal ini.
const JENIS_UJROH = ['komisi_sahabat', 'closing_langsung_sahabat', 'referral_closing_reguler_sahabat', 'head_of_program_registrasi'];

// GET /api/admin/sahabat/pengajuan-ujroh — daftar semua batch, dipakai
// /admin/sahabat/pencairan.
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;
  try {
    // jumlah_confirmed -- badge "X/Y TF" di list (dikonfirmasi user
    // 2026-10-04, sebelumnya cuma kelihatan di halaman detail, bukan di
    // list-nya) -- dihitung dari komisi_ledger, bukan kolom jumlah_baris
    // yang statis (itu snapshot pas pengajuan dibuat, gak ikut berubah).
    const [rows] = await pool.query(
      `SELECT p.*, COALESCE(cl.jumlah_confirmed, 0) AS jumlah_confirmed
       FROM pengajuan_ujroh p
       LEFT JOIN (
         SELECT pengajuan_ujroh_id, SUM(CASE WHEN dikonfirmasi_at IS NOT NULL THEN 1 ELSE 0 END) AS jumlah_confirmed
         FROM komisi_ledger WHERE pengajuan_ujroh_id IS NOT NULL GROUP BY pengajuan_ujroh_id
       ) cl ON cl.pengajuan_ujroh_id = p.id
       ORDER BY p.id DESC`
    );
    return Response.json({ pengajuan: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/sahabat/pengajuan-ujroh  body: { periode_mulai, periode_selesai }
// Snapshot baris komisi_ledger yang lagi pending & belum pernah masuk batch
// manapun, DIBATASI ke rentang tanggal yang admin pilih sendiri, jadi 1
// pengajuan baru (status='draft'). Dibuat 2026-08-30 biar rekap ujroh jadi
// DOKUMEN PERSISTEN (bukan live-query sekali print hilang) yang bisa
// di-track status approval-nya sampai eksekusi TF beneran.
//
// Follow-up 2026-09-02 (dikonfirmasi user): periode SEKARANG dipilih admin
// sendiri (dulu auto-dihitung dari MIN/MAX created_at baris yang kesapu) —
// jadi periode itu MEMBATASI baris mana yang kesapu, bukan cuma label
// setelahnya. Overlap dicegah: gak boleh bikin pengajuan baru yang
// periodenya tumpang tindih sama pengajuan lain yang MASIH berlaku (status
// != 'ditolak' — yang ditolak periodenya bebas dipakai lagi, sama kayak
// baris di dalamnya yang juga dilepas balik ke pending).
// Bikin draft pengajuan mingguan — dibuka ke admin biasa (dikonfirmasi user
// 2026-09-30, kerjaan rutin mingguan, belum keputusan pencairan apa-apa).
// Keputusan 'setujui'/'tolak' di PATCH [id] tetap super_admin only.
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  const { periode_mulai, periode_selesai } = await request.json();
  if (!periode_mulai || !periode_selesai) {
    return Response.json({ error: 'Periode (dari–sampai tanggal) wajib diisi.' }, { status: 400 });
  }
  if (periode_mulai > periode_selesai) {
    return Response.json({ error: 'Tanggal mulai tidak boleh setelah tanggal selesai.' }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [overlap] = await conn.query(
      `SELECT id, periode_mulai, periode_selesai FROM pengajuan_ujroh
       WHERE status != 'ditolak' AND periode_mulai <= ? AND periode_selesai >= ?
       FOR UPDATE`,
      [periode_selesai, periode_mulai]
    );
    if (overlap.length > 0) {
      await conn.rollback();
      const o = overlap[0];
      // mysql2 balikin kolom DATE sebagai Date object tengah malam LOCAL
      // (WIB) — toISOString() (UTC) bisa geser mundur 1 hari, jadi format
      // manual pakai getter local, BUKAN toISOString.
      const fmt = (d) => {
        const dt = new Date(d);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      };
      return Response.json({
        error: `Periode ini tumpang tindih dengan Pengajuan #${o.id} (${fmt(o.periode_mulai)} – ${fmt(o.periode_selesai)}). Pilih rentang tanggal lain.`,
      }, { status: 400 });
    }

    const [pending] = await conn.query(
      `SELECT id, nominal FROM komisi_ledger
       WHERE dikonfirmasi_at IS NULL AND pengajuan_ujroh_id IS NULL AND jenis IN (?)
         AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
       FOR UPDATE`,
      [JENIS_UJROH, periode_mulai, periode_selesai]
    );
    if (pending.length === 0) {
      await conn.rollback();
      return Response.json({ error: 'Gak ada ujroh pending di periode ini.' }, { status: 400 });
    }

    const grandTotal = pending.reduce((s, r) => s + Number(r.nominal || 0), 0);

    const [ins] = await conn.query(
      `INSERT INTO pengajuan_ujroh (periode_mulai, periode_selesai, status, grand_total, jumlah_baris, dibuat_oleh)
       VALUES (?, ?, 'draft', ?, ?, ?)`,
      [periode_mulai, periode_selesai, grandTotal, pending.length, auth.user.id]
    );

    await conn.query(
      `UPDATE komisi_ledger SET pengajuan_ujroh_id = ? WHERE id IN (?)`,
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
