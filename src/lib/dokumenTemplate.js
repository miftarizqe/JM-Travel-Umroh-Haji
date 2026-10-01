// Dokumen legal yang teks resminya SATU-SATUNYA dari template PDF final di
// src/lib/pdfDokumen/templates/ (dikonfirmasi user 2026-10-01) — pasal di
// tabel dokumen_pasal TIDAK dipakai lagi untuk dokumen ini di role mana pun
// (baca & setuju, cetak, snapshot, /api/pasal, Pengaturan Dokumen admin).
// Ganti teks = ganti file template + deploy.
export const DOKUMEN_TEMPLATE = ['sk_cif', 'surat_pemblokiran', 'spk_ak', 'spk_ak_nonis'];
export const pakaiTemplate = (dokumen) => DOKUMEN_TEMPLATE.includes(dokumen);
