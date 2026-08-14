import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

// POST /api/admin/cashflow/transaksi/import/confirm
// Commit baris-baris hasil review manual dari /import/parse ke
// cashflow_transaksi. Body: { periode_id, akun_id, rows: [{ tanggal,
// deskripsi, kategori_id, tipe, nominal, bukti_path, bukti_nama }] } — cuma
// rows yang admin centang "sertakan" di layar review yang dikirim ke sini.
// bukti_path/bukti_nama itu bon per-baris (opsional, sama kayak input
// transaksi manual) — BUKAN file mutasi rekeningnya sendiri, itu bukan bon.
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { periode_id, akun_id, rows } = await request.json();
    if (!periode_id || !akun_id || !Array.isArray(rows) || rows.length === 0) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    const [[periode]] = await pool.query('SELECT * FROM cashflow_periode WHERE id = ?', [periode_id]);
    if (!periode) return Response.json({ error: 'Periode tidak ditemukan' }, { status: 404 });
    if (periode.status === 'submitted') {
      return Response.json({ error: 'Periode ini sudah dikunci, tidak bisa ditambah transaksi' }, { status: 400 });
    }

    for (const r of rows) {
      if (!r.tanggal || !r.deskripsi?.trim() || !['in', 'out'].includes(r.tipe) || !r.nominal || Number(r.nominal) <= 0) {
        return Response.json({ error: `Baris "${r.deskripsi || '(tanpa deskripsi)'}" datanya tidak lengkap/valid` }, { status: 400 });
      }
    }

    let totalIn = 0;
    let totalOut = 0;
    for (const r of rows) {
      await pool.query(
        `INSERT INTO cashflow_transaksi (periode_id, tanggal, deskripsi, kategori_id, akun_id, tipe, nominal, bukti_path, bukti_nama, input_oleh)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [periode_id, r.tanggal, r.deskripsi.trim(), r.kategori_id || null, akun_id, r.tipe, Number(r.nominal), r.bukti_path || null, r.bukti_nama || null, auth.user.id]
      );
      if (r.tipe === 'in') totalIn += Number(r.nominal); else totalOut += Number(r.nominal);
    }

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'import_mutasi_rekening',
      target_type: 'cashflow_periode',
      target_id: periode_id,
      keterangan: `Import ${rows.length} transaksi dari mutasi rekening — Total IN Rp${totalIn.toLocaleString('id-ID')}, OUT Rp${totalOut.toLocaleString('id-ID')}`,
    });

    return Response.json({ message: `${rows.length} transaksi berhasil disimpan!` });
  } catch (error) {
    console.error('Konfirmasi import mutasi rekening gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
