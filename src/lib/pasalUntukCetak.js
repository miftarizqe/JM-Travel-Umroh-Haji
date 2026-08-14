// Ambil isi pasal (+ signer utk spka_ins) siap cetak: snapshot beku kalau
// dokumen ini sudah pernah dibekukan buat refId itu, fallback ke isi live
// kalau belum. Query sama persis dgn GET /api/admin/pasal (lihat file itu)
// — dipisah jadi helper di sini biar generator PDF (src/lib/pdfDokumen/) dan
// endpoint dokumen-signature bisa pakai ulang tanpa fetch HTTP ke route lain.
import pool from '@/lib/db';

export async function ambilPasalUntukCetak(dokumen, refId) {
  const [snapshotRows] = await pool.query(
    'SELECT nomor, judul, isi FROM dokumen_pasal_snapshot WHERE ref_id = ? AND dokumen = ? ORDER BY nomor ASC',
    [refId, dokumen]
  );

  if (snapshotRows.length > 0) {
    const [[signerRow]] = dokumen === 'jamaah'
      ? [[null]]
      : await pool.query('SELECT nama, jabatan FROM dokumen_signer_snapshot WHERE ref_id = ? AND dokumen = ?', [refId, dokumen]);
    return { pasal: snapshotRows, signer: signerRow ? { nama: signerRow.nama, jabatan: signerRow.jabatan } : null };
  }

  const [liveRows] = await pool.query(
    'SELECT nomor, judul, isi FROM dokumen_pasal WHERE dokumen = ? ORDER BY nomor ASC',
    [dokumen]
  );
  let signer = null;
  if (dokumen !== 'jamaah') {
    const [[pengaturan]] = await pool.query('SELECT nama_penandatangan, jabatan_penandatangan FROM pengaturan WHERE id = 1');
    signer = pengaturan ? { nama: pengaturan.nama_penandatangan, jabatan: pengaturan.jabatan_penandatangan } : null;
  }
  return { pasal: liveRows, signer };
}
