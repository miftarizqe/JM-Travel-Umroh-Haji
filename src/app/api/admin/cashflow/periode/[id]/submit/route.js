import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

// POST — submit & kunci periode ini. Saldo akhirnya jadi tetap (frozen)
// dan dipakai sebagai saldo awal periode berikutnya saat periode itu dibuat.
export async function POST(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[periode]] = await pool.query('SELECT * FROM cashflow_periode WHERE id = ?', [id]);
    if (!periode) return Response.json({ error: 'Periode tidak ditemukan' }, { status: 404 });
    if (periode.status === 'submitted') {
      return Response.json({ error: 'Periode ini sudah disubmit' }, { status: 400 });
    }

    const [[belumSubmit]] = await pool.query(
      `SELECT id FROM cashflow_periode WHERE bulan < ? AND status = 'draft' LIMIT 1`,
      [periode.bulan]
    );
    if (belumSubmit) {
      return Response.json({ error: 'Ada bulan sebelumnya yang belum disubmit. Submit dari bulan paling awal dulu.' }, { status: 400 });
    }

    await pool.query(
      `UPDATE cashflow_periode SET status = 'submitted', submitted_at = NOW(), submitted_by = ? WHERE id = ?`,
      [auth.user.id, id]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'submit_cashflow',
      target_type: 'cashflow_periode',
      target_id: id,
      keterangan: `Cashflow bulan ${periode.bulan} disubmit & dikunci`,
    });

    return Response.json({ message: 'Cashflow bulan ini disubmit & dikunci!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE — buka kembali (unlock) periode yang sudah disubmit, cuma kalau ini
// periode PALING BARU (belum ada bulan setelahnya) supaya rantai saldo gak rusak.
export async function DELETE(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[periode]] = await pool.query('SELECT * FROM cashflow_periode WHERE id = ?', [id]);
    if (!periode) return Response.json({ error: 'Periode tidak ditemukan' }, { status: 404 });
    if (periode.status !== 'submitted') {
      return Response.json({ error: 'Periode ini belum disubmit' }, { status: 400 });
    }

    const [[adaSetelahnya]] = await pool.query(
      `SELECT id FROM cashflow_periode WHERE bulan > ? LIMIT 1`,
      [periode.bulan]
    );
    if (adaSetelahnya) {
      return Response.json({ error: 'Tidak bisa dibuka lagi karena sudah ada bulan setelahnya. Hapus dulu periode setelahnya kalau memang perlu revisi.' }, { status: 400 });
    }

    await pool.query(
      `UPDATE cashflow_periode SET status = 'draft', submitted_at = NULL, submitted_by = NULL WHERE id = ?`,
      [id]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'buka_cashflow',
      target_type: 'cashflow_periode',
      target_id: id,
      keterangan: `Cashflow bulan ${periode.bulan} dibuka kembali untuk edit`,
    });

    return Response.json({ message: 'Periode dibuka kembali untuk edit.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
