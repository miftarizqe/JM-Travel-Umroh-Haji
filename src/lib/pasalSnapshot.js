import { kolomSignerUntuk, ambilSignerSkCif } from '@/lib/signerKolom';
import { pakaiTemplate } from '@/lib/dokumenTemplate';

// Bekukan isi pasal + penandatangan dokumen legal SEKALI per dokumen resmi.
// Dipanggil dari titik "resmi jadi" yang sudah ada di kode:
//   - /api/admin/cetak-pks/[user_id] — saat nomor surat SPKA/SPKA-Ins/SPKL
//     pertama kali digenerate/dibuka.
//   - /api/pks (POST, jenis=jamaah) — saat jamaah klik "Setuju".
// Idempotent: kalau snapshot buat (refId, dokumen) itu udah ada, gak
// ditimpa — sekali beku, beku selamanya, biar aman dipanggil berkali-kali.
export async function pastikanSnapshot(pool, refId, dokumen) {
  // Dokumen ber-template (SK-CIF, Pemblokiran, SPK-AK, SPK-AK Non-Muslim):
  // teks resminya dari template PDF, jadi pasal DB gak dibekukan lagi
  // (dikonfirmasi user 2026-10-01). Yang tetap dibekukan cuma penandatangan
  // JM Travel di SK-CIF (Penerima Kuasa) — sekali, gak ditimpa.
  if (pakaiTemplate(dokumen)) {
    if (dokumen !== 'sk_cif') return;
    const skCifSigner = await ambilSignerSkCif(pool);
    await pool.query(
      'INSERT IGNORE INTO dokumen_signer_snapshot (ref_id, dokumen, nama, nik, jabatan) VALUES (?, ?, ?, ?, ?)',
      [refId, dokumen, skCifSigner?.nama || null, skCifSigner?.nik || null, skCifSigner?.jabatan || null]
    );
    return;
  }

  const [existing] = await pool.query(
    'SELECT 1 FROM dokumen_pasal_snapshot WHERE ref_id = ? AND dokumen = ? LIMIT 1',
    [refId, dokumen]
  );
  if (existing.length > 0) return;

  const [pasalRows] = await pool.query(
    'SELECT nomor, tipe, judul, isi FROM dokumen_pasal WHERE dokumen = ?',
    [dokumen]
  );
  // Pasal belum diisi admin — jangan bekukan apa-apa dulu. Kalau signer
  // ikut dibekukan di sini, pemanggilan berikutnya (setelah pasal diisi)
  // bakal INSERT signer lagi & kena ER_DUP_ENTRY.
  if (pasalRows.length === 0) return;
  const values = pasalRows.map(p => [refId, dokumen, p.nomor, p.tipe, p.judul, p.isi]);
  await pool.query(
    'INSERT INTO dokumen_pasal_snapshot (ref_id, dokumen, nomor, tipe, judul, isi) VALUES ?',
    [values]
  );

  // surat_pemblokiran gak punya konsep "penandatangan PIHAK PERTAMA" di
  // halaman cetak (cuma 1 pihak yang TTD, si member) — jadi gak perlu
  // snapshot signer institusi. jamaah (SPJ) & SPK-AK 2/3-pihak (lihat
  // catatan di pasalUntukCetak.js), jadi HARUS ikut nyimpen snapshot signer.
  if (dokumen === 'surat_pemblokiran') return;

  // ON DUPLICATE KEY UPDATE di bawah: baris signer bisa sudah ada dari
  // pemanggilan lama waktu pasal masih kosong (sebelum guard di atas) —
  // sampai sini berarti pasal BARU dibekukan, jadi signer ikut dibekukan
  // ulang di momen yang sama.

  // sk_cif: Penerima Kuasa punya penandatangan SENDIRI (bukan Head of
  // Program, bukan Penandatangan Umum), plus butuh NIK (dokumen lain gak)
  // — dikonfirmasi user 2026-09-10 (samain ke "Surat Kuasa CIF.docx").
  if (dokumen === 'sk_cif') {
    const skCifSigner = await ambilSignerSkCif(pool);
    await pool.query(
      `INSERT INTO dokumen_signer_snapshot (ref_id, dokumen, nama, nik, jabatan) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nama = VALUES(nama), nik = VALUES(nik), jabatan = VALUES(jabatan)`,
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
    `INSERT INTO dokumen_signer_snapshot (ref_id, dokumen, nama, jabatan, head_of_agency_nama, head_of_agency_jabatan) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE nama = VALUES(nama), jabatan = VALUES(jabatan),
       head_of_agency_nama = VALUES(head_of_agency_nama), head_of_agency_jabatan = VALUES(head_of_agency_jabatan)`,
    [
      refId, dokumen,
      pengaturan?.[kolom.nama] || null, pengaturan?.[kolom.jabatan] || null,
      hoAktif ? (pengaturan?.nama_head_of_agency || null) : null,
      hoAktif ? (pengaturan?.jabatan_head_of_agency || null) : null,
    ]
  );
}
