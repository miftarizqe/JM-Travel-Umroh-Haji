import { kolomSignerUntuk, ambilSignerSkCif } from '@/lib/signerKolom';

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
    'SELECT nomor, tipe, judul, isi FROM dokumen_pasal WHERE dokumen = ?',
    [dokumen]
  );
  if (pasalRows.length > 0) {
    const values = pasalRows.map(p => [refId, dokumen, p.nomor, p.tipe, p.judul, p.isi]);
    await pool.query(
      'INSERT INTO dokumen_pasal_snapshot (ref_id, dokumen, nomor, tipe, judul, isi) VALUES ?',
      [values]
    );
  }

  // surat_pemblokiran gak punya konsep "penandatangan PIHAK PERTAMA" di
  // halaman cetak (cuma 1 pihak yang TTD, si member) — jadi gak perlu
  // snapshot signer institusi. jamaah (SPJ) & SPK-AK 2/3-pihak (lihat
  // catatan di pasalUntukCetak.js), jadi HARUS ikut nyimpen snapshot signer.
  if (dokumen === 'surat_pemblokiran') return;

  // sk_cif: Penerima Kuasa punya penandatangan SENDIRI (bukan Head of
  // Program, bukan Penandatangan Umum), plus butuh NIK (dokumen lain gak)
  // — dikonfirmasi user 2026-09-10 (samain ke "Surat Kuasa CIF.docx").
  if (dokumen === 'sk_cif') {
    const skCifSigner = await ambilSignerSkCif(pool);
    await pool.query(
      'INSERT INTO dokumen_signer_snapshot (ref_id, dokumen, nama, nik, jabatan) VALUES (?, ?, ?, ?, ?)',
      [refId, dokumen, skCifSigner?.nama || null, skCifSigner?.nik || null, skCifSigner?.jabatan || null]
    );
    return;
  }

  const kolom = kolomSignerUntuk(dokumen);
  const selectCols = [kolom.nama, kolom.jabatan, 'nama_head_of_agency', 'jabatan_head_of_agency']
    .filter(Boolean).join(', ');
  const [[pengaturan]] = await pool.query(`SELECT ${selectCols} FROM pengaturan WHERE id = 1`);
  // Head of Agency cuma dipakai di blok "Mengetahui" SPKA (SPKA-Ins & SPKL
  // gak punya blok ini di draft resminya) — dokumen lain simpan NULL.
  const hoAktif = dokumen === 'spka';
  await pool.query(
    'INSERT INTO dokumen_signer_snapshot (ref_id, dokumen, nama, jabatan, head_of_agency_nama, head_of_agency_jabatan) VALUES (?, ?, ?, ?, ?, ?)',
    [
      refId, dokumen,
      pengaturan?.[kolom.nama] || null, pengaturan?.[kolom.jabatan] || null,
      hoAktif ? (pengaturan?.nama_head_of_agency || null) : null,
      hoAktif ? (pengaturan?.jabatan_head_of_agency || null) : null,
    ]
  );
}
