import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

const RE_BULAN = /^\d{4}-\d{2}$/;
const RE_TAHUN = /^\d{4}$/;

// Pastikan Cashflow yang jadi sumber angka udah dikunci dulu sebelum Laba
// Rugi ikut dikunci — jangan sampai P&L "final" di atas ledger yang masih
// bisa berubah. Return null kalau lolos, atau pesan error kalau ditolak.
async function cekCashflowSudahSubmit(periode, tipe) {
  if (tipe === 'bulan') {
    const [[p]] = await pool.query('SELECT status FROM cashflow_periode WHERE bulan = ?', [periode]);
    if (!p) return `Belum ada Cashflow bulan ${periode}, buat & submit dulu di sana.`;
    if (p.status !== 'submitted') return `Cashflow bulan ${periode} masih draft — submit dulu di Cashflow sebelum kunci Laba Rugi-nya.`;
    return null;
  }
  const [rows] = await pool.query("SELECT bulan, status FROM cashflow_periode WHERE bulan LIKE ?", [`${periode}-%`]);
  if (rows.length === 0) return `Belum ada Cashflow bulan mana pun di tahun ${periode}.`;
  const belum = rows.find(r => r.status !== 'submitted');
  if (belum) return `Cashflow bulan ${belum.bulan} masih draft — submit semua bulan di tahun ${periode} dulu sebelum kunci Laba Rugi setahun.`;
  return null;
}

// GET /api/admin/laba-rugi-periode?periode=2026-07
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const periode = searchParams.get('periode');
    if (!periode) return Response.json({ error: 'Parameter periode wajib diisi' }, { status: 400 });
    const [[row]] = await pool.query('SELECT * FROM laba_rugi_periode WHERE periode = ?', [periode]);
    return Response.json({ periode: row || null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — submit & kunci. Body: { periode, tipe: 'bulan'|'tahun', data_snapshot }
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { periode, tipe, data_snapshot } = await request.json();
    if (!periode || !['bulan', 'tahun'].includes(tipe) || !data_snapshot) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    if (tipe === 'bulan' && !RE_BULAN.test(periode)) return Response.json({ error: 'Format periode bulan tidak valid' }, { status: 400 });
    if (tipe === 'tahun' && !RE_TAHUN.test(periode)) return Response.json({ error: 'Format periode tahun tidak valid' }, { status: 400 });

    const [[existing]] = await pool.query('SELECT * FROM laba_rugi_periode WHERE periode = ?', [periode]);
    if (existing?.status === 'submitted') {
      return Response.json({ error: 'Periode ini sudah dikunci' }, { status: 400 });
    }

    const pesanError = await cekCashflowSudahSubmit(periode, tipe);
    if (pesanError) return Response.json({ error: pesanError }, { status: 400 });

    if (existing) {
      await pool.query(
        `UPDATE laba_rugi_periode SET status = 'submitted', data_snapshot = ?, submitted_at = NOW(), submitted_by = ? WHERE periode = ?`,
        [JSON.stringify(data_snapshot), auth.user.id, periode]
      );
    } else {
      await pool.query(
        `INSERT INTO laba_rugi_periode (periode, tipe, status, data_snapshot, submitted_at, submitted_by)
         VALUES (?, ?, 'submitted', ?, NOW(), ?)`,
        [periode, tipe, JSON.stringify(data_snapshot), auth.user.id]
      );
    }

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'submit_laba_rugi',
      target_type: 'laba_rugi_periode',
      target_id: periode,
      keterangan: `Laba Rugi ${tipe === 'bulan' ? 'bulan' : 'tahun'} ${periode} disubmit & dikunci`,
    });

    return Response.json({ message: 'Laba Rugi disubmit & dikunci!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE ?periode=2026-07 — buka kembali (kembali ke draft/live)
export async function DELETE(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const periode = searchParams.get('periode');
    if (!periode) return Response.json({ error: 'Parameter periode wajib diisi' }, { status: 400 });

    const [[existing]] = await pool.query('SELECT * FROM laba_rugi_periode WHERE periode = ?', [periode]);
    if (!existing || existing.status !== 'submitted') {
      return Response.json({ error: 'Periode ini belum dikunci' }, { status: 400 });
    }

    await pool.query(
      `UPDATE laba_rugi_periode SET status = 'draft', data_snapshot = NULL, submitted_at = NULL, submitted_by = NULL WHERE periode = ?`,
      [periode]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'buka_laba_rugi',
      target_type: 'laba_rugi_periode',
      target_id: periode,
      keterangan: `Laba Rugi ${periode} dibuka kembali`,
    });

    return Response.json({ message: 'Laba Rugi dibuka kembali.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
