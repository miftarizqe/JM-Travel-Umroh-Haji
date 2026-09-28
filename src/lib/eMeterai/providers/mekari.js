// Adapter e-Meterai — Mekari Sign (mekarisign.com), distributor resmi
// e-Meterai Peruri (dicek 2026-09-28, badge PERURI+PSrE+Kominfo di halaman
// mereka). Dipakai gantiin rencana provider "peruri" generik yang lama —
// satu vendor yang sama juga dipakai buat TTD digital (lihat
// src/lib/eSignature/providers/mekari.js), gak perlu 2 kontrak vendor
// terpisah buat materai vs tanda tangan.
//
// Akses API baru kebuka setelah akun Sandbox disetujui tim Mekari (isi form
// di mekarisign.com/en/features/emeterai-api/, mereka follow-up manual,
// BUKAN self-serve instan). Yang sudah pasti dari halaman publik mereka:
// REST API + Bearer Token, kerja pakai kuota saldo e-meterai yang dibeli
// duluan (bukan bayar per-panggilan), request kirim dokumen+filename+
// annotations (posisi taruh materai di PDF)+callback URL. Field PERSIS &
// format respons TETAP harus dicek ulang begitu sandbox aktif.
//
// Setelah TODO diisi: set env MATERAI_PROVIDER=mekari (lihat .env.local).

const BASE_URL = process.env.MEKARI_API_BASE_URL; // sama akun/base URL dengan provider TTD mekari.js
const BEARER_TOKEN = process.env.MEKARI_BEARER_TOKEN;

function pastikanKonfigurasi() {
  if (!BASE_URL || !BEARER_TOKEN) {
    throw new Error(
      'Provider materai "mekari" belum dikonfigurasi — isi MEKARI_API_BASE_URL/MEKARI_BEARER_TOKEN (sesuai docs sandbox) di env dulu.'
    );
  }
}

// TODO: ganti isi fungsi ini sesuai endpoint "tempel e-meterai ke dokumen"
// dari dokumentasi API e-Meterai Mekari Sign (baru kebuka penuh setelah akun
// Sandbox aktif). Field request/response contoh di bawah HARUS dicek ulang.
export async function beli({ dokumen, refId, pdfBuffer }) {
  pastikanKonfigurasi();

  throw new Error(
    'Provider "mekari" — endpoint beli/tempel e-meterai belum diisi. Lihat komentar TODO di ' +
    'src/lib/eMeterai/providers/mekari.js, sesuaikan dengan dokumentasi Sandbox Mekari Sign, ' +
    'baru hapus throw ini.'
  );

  // Contoh bentuk yang PALING UMUM dipakai provider sejenis — WAJIB dicek ulang
  // ke docs Mekari Sign sebelum dipakai, jangan asumsikan field ini benar:
  //
  // const res = await fetch(`${BASE_URL}/v2/emeterai/v1/documents`, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${BEARER_TOKEN}`,
  //   },
  //   body: JSON.stringify({
  //     document_base64: pdfBuffer.toString('base64'),
  //     filename: `${dokumen}-${refId}.pdf`,
  //     reference_id: `${dokumen}-${refId}`,
  //     // TODO: field "annotations"/posisi taruh materai di halaman terakhir —
  //     // cek format koordinat yang diminta docs Mekari.
  //   }),
  // });
  // if (!res.ok) throw new Error(`Mekari Sign eMeterai API error ${res.status}: ${await res.text()}`);
  // const data = await res.json();
  // return { kodeUnik: data.serial_number, dibeliAt: new Date() };
}
