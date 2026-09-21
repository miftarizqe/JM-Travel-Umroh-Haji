import pool from '@/lib/db';
import path from 'path';

// Path absolut di disk dari path publik/API yang tersimpan di kolom DB
// (mis. users.foto_ktp_path, dokumen_signature.pdf_final_path) — dokumen
// privat (diawali /api/dokumen/, disimpan di private-uploads/) vs dokumen
// yang emang sengaja publik (disimpan apa adanya di public/). SATU-SATUNYA
// tempat buat resolusi ini — JANGAN duplikat logic-nya di pemanggil lain
// (bug nyata ditemukan 2026-09-11: 2 tempat beda sempat masing-masing
// nulis sendiri asumsi "semua path itu public/", diam-diam gagal begitu
// kategori dokumennya dipindah ke private-uploads).
export function absolutePathDariUrl(publicPath) {
  if (publicPath.startsWith('/api/dokumen/')) {
    return path.join(process.cwd(), 'private-uploads', publicPath.replace(/^\/api\/dokumen\//, ''));
  }
  return path.join(process.cwd(), 'public', publicPath.replace(/^\//, ''));
}

// Resolusi "siapa pemilik file ini" per kategori dokumen sensitif, dipakai
// src/app/api/dokumen/[...slug]/route.js buat mutusin boleh/tidaknya
// auth.user.id (non-staff) mengakses satu file. admin/super_admin SELALU
// boleh (dicek terpisah di caller), fungsi ini cuma dipanggil buat role lain.
//
// Kategori A — user id ketebak langsung dari nama file (format upload SELALU
// `<prefix>_<userId>_<timestamp>.<ext>`, prefix & userId dijamin gak
// mengandung underscore — lihat komentar di tiap route upload terkait):
const USER_ID_DI_NAMA_FILE = new Set([
  'ktp', 'paspor', 'foto', 'dokumen-jamaah', 'formulir-fisik', 'dokumen-pks-fisik',
  'dokumen-koperasi-fisik', 'bukti-tf-koperasi',
]);

function userIdDariNamaFile(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const parts = base.split('_');
  return parts.length >= 2 ? parts[1] : null;
}

// Kategori B — id di nama file merujuk entitas LAIN (booking/invoice/
// pembatalan), perlu 1-2 lookup buat nyampe ke user_id pemilik booking-nya.
async function ownerViaBookingId(bookingId) {
  const [[b]] = await pool.query('SELECT user_id FROM bookings WHERE id = ?', [bookingId]);
  return b?.user_id || null;
}

async function resolveKategoriB(category, filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const parts = base.split('_');
  const entityId = parts.length >= 2 ? parts[1] : null;
  if (!entityId) return null;

  if (category === 'perjanjian-jamaah-scan') return ownerViaBookingId(entityId);

  if (category === 'invoice-kwitansi-scan') {
    const [[inv]] = await pool.query('SELECT booking_id FROM invoice_kwitansi WHERE id = ?', [entityId]);
    return inv?.booking_id ? ownerViaBookingId(inv.booking_id) : null;
  }

  if (category === 'bukti-refund') {
    const [[p]] = await pool.query('SELECT booking_id FROM pembatalan WHERE id = ?', [entityId]);
    return p?.booking_id ? ownerViaBookingId(p.booking_id) : null;
  }

  return null;
}

// Kategori C — nama file gak ada id sama sekali (`bukti_<timestamp>_<random>`),
// satu-satunya cara nemu pemiliknya adalah cocokin file_path tersimpan di
// tabel yang relevan.
async function resolveKategoriC(category, urlPath) {
  if (category === 'bukti') {
    const [[p]] = await pool.query('SELECT booking_id FROM payments WHERE bukti_path = ?', [urlPath]);
    return p?.booking_id ? ownerViaBookingId(p.booking_id) : null;
  }
  if (category === 'bukti-tf-komisi') {
    const [[k]] = await pool.query('SELECT penerima_id FROM komisi_ledger WHERE bukti_tf_admin_path = ?', [urlPath]);
    return k?.penerima_id || null;
  }
  return null;
}

// Kategori D — admin/super_admin only, gak ada jalur self-view (dicek dari
// codebase: bukti_ttd_path pengajuan ujroh cuma pernah dipakai di halaman
// admin, gak pernah dirender ke jamaah/perwakilan/koperasi).
const ADMIN_ONLY = new Set(['bukti-ttd-ujroh', 'bukti-ttd-ujroh-perwakilan']);

// Kategori E — dokumen-signature (PDF hasil TTD digital: SPK-AK/SPKA-Ins/
// SPJ jamaah/Formulir/Invoice). Format nama file `<dokumen>_<refId>_<tahap>_
// <timestamp>.pdf` (lihat simpanPdfDokumenSignature) — TIDAK bisa dipotong
// pakai posisi index tetap kayak Kategori A/B karena `dokumen` sendiri ada
// yang mengandung underscore ("spk_ak", "spka_ins"), jadi dicari pakai
// prefix match (urut dari yang paling panjang dulu biar gak ada yang ke-
// salah-cocokin ke prefix lain yang lebih pendek). `refId` dijamin gak
// pernah mengandung underscore (booking id pola "JMT-XXXXXX", user id UUID,
// invoice id angka — semua pakai dash atau polos, bukan underscore).
const DOKUMEN_SIGNATURE_PREFIX = ['spka_ins', 'spk_ak', 'spk_ak_nonis', 'formulir', 'jamaah', 'invoice']
  .sort((a, b) => b.length - a.length);

async function resolveDokumenSignature(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const dokumen = DOKUMEN_SIGNATURE_PREFIX.find(p => base.startsWith(p + '_'));
  if (!dokumen) return null;
  const refId = base.slice(dokumen.length + 1).split('_')[0];
  if (!refId) return null;

  if (dokumen === 'jamaah') return ownerViaBookingId(refId);
  if (dokumen === 'invoice') {
    const [[inv]] = await pool.query('SELECT booking_id FROM invoice_kwitansi WHERE id = ?', [refId]);
    return inv?.booking_id ? ownerViaBookingId(inv.booking_id) : null;
  }
  // spk_ak/spka_ins/formulir — refId LANGSUNG user id pemiliknya.
  return refId;
}

/**
 * @returns {Promise<'admin_only' | string | null>} 'admin_only' kalau kategori
 *   ini emang gak punya jalur self-view, string ownerId kalau ketemu, null
 *   kalau gak ketemu (akses ditolak buat non-staff).
 */
export async function resolveOwnerId(category, filename, urlPath) {
  if (ADMIN_ONLY.has(category)) return 'admin_only';
  if (USER_ID_DI_NAMA_FILE.has(category)) return userIdDariNamaFile(filename);
  if (['perjanjian-jamaah-scan', 'invoice-kwitansi-scan', 'bukti-refund'].includes(category)) {
    return resolveKategoriB(category, filename);
  }
  if (['bukti', 'bukti-tf-komisi'].includes(category)) {
    return resolveKategoriC(category, urlPath);
  }
  if (category === 'dokumen-signature') return resolveDokumenSignature(filename);
  return null;
}

export const KATEGORI_TERPROTEKSI = new Set([
  'ktp', 'paspor', 'foto', 'dokumen-jamaah', 'formulir-fisik', 'dokumen-pks-fisik',
  'dokumen-koperasi-fisik', 'bukti-tf-koperasi',
  'perjanjian-jamaah-scan', 'invoice-kwitansi-scan', 'bukti-refund',
  'bukti', 'bukti-tf-komisi', 'bukti-ttd-ujroh', 'bukti-ttd-ujroh-perwakilan',
  'dokumen-signature',
]);
