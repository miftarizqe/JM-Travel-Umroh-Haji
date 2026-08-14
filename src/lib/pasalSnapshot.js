// Bekukan isi pasal + penandatangan dokumen legal SEKALI per dokumen resmi.
// Dipanggil dari titik "resmi jadi" yang sudah ada di kode:
//   - /api/admin/cetak-pks/[user_id] — saat nomor surat SPKA/SPKA-Ins/SPKL
//     pertama kali digenerate/dibuka.
//   - /api/pks (POST, jenis=jamaah) — saat jamaah klik "Setuju".
// Idempotent: kalau snapshot buat (refId, dokumen) itu udah ada, gak
// ditimpa — sekali beku, beku selamanya, biar aman dipanggil berkali-kali.
export async function pastikanSnapshot(pool, refId, dokumen) {
  const [existing] = await pool.query(
    'SELECT 1 FROM dokumen_pasal_snapshot WHERE ref_id = ? AND dokumen = ? LIMIT 1',
    [refId, dokumen]
  );
  if (existing.length > 0) return;

  const [pasalRows] = await pool.query(
    'SELECT nomor, judul, isi FROM dokumen_pasal WHERE dokumen = ?',
    [dokumen]
  );
  if (pasalRows.length > 0) {
    const values = pasalRows.map(p => [refId, dokumen, p.nomor, p.judul, p.isi]);
    await pool.query(
      'INSERT INTO dokumen_pasal_snapshot (ref_id, dokumen, nomor, judul, isi) VALUES ?',
      [values]
    );
  }

  // Perjanjian jamaah gak punya konsep "penandatangan PIHAK PERTAMA" di
  // halaman cetak, jadi gak perlu snapshot signer.
  if (dokumen === 'jamaah') return;

  const [[pengaturan]] = await pool.query(
    'SELECT nama_penandatangan, jabatan_penandatangan, nama_head_of_agency, jabatan_head_of_agency FROM pengaturan WHERE id = 1'
  );
  // Head of Agency cuma dipakai di blok "Mengetahui" SPKA (SPKA-Ins & SPKL
  // gak punya blok ini di draft resminya) — dokumen lain simpan NULL.
  const hoAktif = dokumen === 'spka';
  await pool.query(
    'INSERT INTO dokumen_signer_snapshot (ref_id, dokumen, nama, jabatan, head_of_agency_nama, head_of_agency_jabatan) VALUES (?, ?, ?, ?, ?, ?)',
    [
      refId, dokumen,
      pengaturan?.nama_penandatangan || null, pengaturan?.jabatan_penandatangan || null,
      hoAktif ? (pengaturan?.nama_head_of_agency || null) : null,
      hoAktif ? (pengaturan?.jabatan_head_of_agency || null) : null,
    ]
  );
}
