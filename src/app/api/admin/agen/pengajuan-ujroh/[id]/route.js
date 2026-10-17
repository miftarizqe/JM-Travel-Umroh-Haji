import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { catatRekening } from '@/lib/rekeningLedger';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

// PATCH /api/admin/agen/pengajuan-ujroh/[id]  body: { action, catatan? }
// action: 'ajukan' | 'setujui' | 'tolak'
// BEDA dari perwakilan/sahabat: 'setujui' TIDAK butuh upload bukti TTD
// (dikonfirmasi user 2026-10-17 — agen gak perlu approval seformal itu),
// dan LANGSUNG final: begitu disetujui, semua komisi_ledger terkait
// langsung dikonfirmasi_at + 1 baris rekening_ledger 'keluar' tercatat
// (bukan 2 tahap approve-lalu-TF-per-penerima kayak perwakilan/sahabat,
// karena gak ada data bank yang perlu dicocokin per agen).
export async function PATCH(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const { action, catatan } = await request.json();

    const [[p]] = await pool.query('SELECT * FROM pengajuan_ujroh_agen WHERE id = ?', [id]);
    if (!p) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });

    if (action === 'ajukan') {
      if (p.status !== 'draft') return Response.json({ error: 'Cuma pengajuan draft yang bisa diajukan.' }, { status: 400 });
      await pool.query(
        "UPDATE pengajuan_ujroh_agen SET status='diajukan', diajukan_oleh=?, diajukan_at=NOW() WHERE id=?",
        [auth.user.id, id]
      );
    } else if (action === 'setujui') {
      if (p.status !== 'diajukan') return Response.json({ error: 'Cuma pengajuan yang udah diajukan yang bisa disetujui.' }, { status: 400 });

      const [[program]] = await pool.query('SELECT publish_type FROM programs WHERE id = ?', [p.prog_id]);
      const rekening = program?.publish_type === 'sahabat_baitullah' ? 'sahabat_baitullah' : 'alkhalid';

      await pool.query(
        "UPDATE pengajuan_ujroh_agen SET status='disetujui', diputuskan_oleh=?, diputuskan_at=NOW(), catatan_keputusan=? WHERE id=?",
        [auth.user.id, catatan || null, id]
      );
      await pool.query(
        'UPDATE komisi_ledger SET dikonfirmasi_at = NOW() WHERE pengajuan_ujroh_agen_id = ?',
        [id]
      );
      await catatRekening(pool, {
        rekening, jenis: 'keluar', sumber_tipe: 'ujroh_agen',
        sumber_id: String(id), nominal: Number(p.grand_total || 0),
        keterangan: `Ujroh Agen #${id} — ${p.jumlah_baris} baris`,
      });
    } else if (action === 'tolak') {
      if (p.status !== 'diajukan') return Response.json({ error: 'Cuma pengajuan yang udah diajukan yang bisa ditolak.' }, { status: 400 });
      await pool.query(
        "UPDATE pengajuan_ujroh_agen SET status='ditolak', diputuskan_oleh=?, diputuskan_at=NOW(), catatan_keputusan=? WHERE id=?",
        [auth.user.id, catatan || null, id]
      );
      await pool.query('UPDATE komisi_ledger SET pengajuan_ujroh_agen_id = NULL WHERE pengajuan_ujroh_agen_id = ?', [id]);
    } else {
      return Response.json({ error: 'Action tidak dikenal' }, { status: 400 });
    }

    await catatAudit(pool, {
      actor: auth.user,
      aksi: `pengajuan_ujroh_agen_${action}`,
      target_type: 'pengajuan_ujroh_agen',
      target_id: id,
      keterangan: `Pengajuan ujroh agen #${id} (${fmtRp(p.grand_total)}, ${p.jumlah_baris} baris) → ${action}`,
    });

    return Response.json({ message: 'Status pengajuan diperbarui.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/agen/pengajuan-ujroh/[id] — cuma draft/diajukan.
export async function DELETE(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const [[p]] = await pool.query('SELECT * FROM pengajuan_ujroh_agen WHERE id = ?', [id]);
    if (!p) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });
    if (!['draft', 'diajukan'].includes(p.status)) {
      return Response.json({ error: 'Pengajuan yang udah disetujui/ditolak gak bisa dihapus — itu udah jadi keputusan tercatat.' }, { status: 400 });
    }

    await pool.query('UPDATE komisi_ledger SET pengajuan_ujroh_agen_id = NULL WHERE pengajuan_ujroh_agen_id = ?', [id]);
    await pool.query('DELETE FROM pengajuan_ujroh_agen WHERE id = ?', [id]);

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'pengajuan_ujroh_agen_hapus',
      target_type: 'pengajuan_ujroh_agen',
      target_id: id,
      keterangan: `Pengajuan ujroh agen #${id} (${fmtRp(p.grand_total)}, ${p.jumlah_baris} baris) dihapus — baris lepas balik ke pending.`,
    });

    return Response.json({ message: 'Pengajuan dihapus.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
