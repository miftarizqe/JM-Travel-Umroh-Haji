// Ambil isi pasal (+ signer utk spka_ins) siap cetak: snapshot beku kalau
// dokumen ini sudah pernah dibekukan buat refId itu, fallback ke isi live
// kalau belum. Query sama persis dgn GET /api/admin/pasal (lihat file itu)
// — dipisah jadi helper di sini biar generator PDF (src/lib/pdfDokumen/) dan
// endpoint dokumen-signature bisa pakai ulang tanpa fetch HTTP ke route lain.
import pool from '@/lib/db';
import { kolomSignerUntuk, ambilSignerSkCif } from '@/lib/signerKolom';

export async function ambilPasalUntukCetak(dokumen, refId) {
  const [snapshotRows] = await pool.query(
    'SELECT nomor, tipe, judul, isi FROM dokumen_pasal_snapshot WHERE ref_id = ? AND dokumen = ? ORDER BY nomor ASC',
    [refId, dokumen]
  );

  // surat_pemblokiran satu pihak yang TTD (si member) — "Mengetahui
  // Petugas Bank" itu pihak BSI, bukan JM Travel, jadi gak perlu signer
  // institusi. sk_cif 2-pihak (Pemberi Kuasa/jamaah vs Penerima Kuasa/JM
  // Travel) — Penerima Kuasa-nya penandatangan SENDIRI (nama_penandatangan_
  // sk_cif dkk), BUKAN Head of Program (dikoreksi 2026-09-10 setelah
  // dicocokkan ke file final user). jamaah (SPJ) 2-pihak, spk_ak 3-pihak —
  // lihat kolomSignerUntuk().
  const satuPihak = dokumen === 'surat_pemblokiran';

  if (snapshotRows.length > 0) {
    let signer = null;
    if (dokumen === 'sk_cif') {
      const [[row]] = await pool.query('SELECT nama, nik, jabatan FROM dokumen_signer_snapshot WHERE ref_id = ? AND dokumen = ?', [refId, dokumen]);
      signer = row ? { nama: row.nama, nik: row.nik, jabatan: row.jabatan } : null;
    } else if (!satuPihak) {
      const [[row]] = await pool.query('SELECT nama, jabatan FROM dokumen_signer_snapshot WHERE ref_id = ? AND dokumen = ?', [refId, dokumen]);
      signer = row ? { nama: row.nama, jabatan: row.jabatan } : null;
    }
    return { pasal: snapshotRows, signer };
  }

  const [liveRows] = await pool.query(
    'SELECT nomor, tipe, judul, isi FROM dokumen_pasal WHERE dokumen = ? ORDER BY nomor ASC',
    [dokumen]
  );
  let signer = null;
  if (dokumen === 'sk_cif') {
    signer = await ambilSignerSkCif(pool);
  } else if (!satuPihak) {
    const kolom = kolomSignerUntuk(dokumen);
    const selectCols = [kolom.nama, kolom.jabatan].filter(Boolean).join(', ');
    const [[pengaturan]] = await pool.query(`SELECT ${selectCols} FROM pengaturan WHERE id = 1`);
    signer = pengaturan
      ? { nama: pengaturan[kolom.nama], jabatan: pengaturan[kolom.jabatan] }
      : null;
  }
  return { pasal: liveRows, signer };
}
