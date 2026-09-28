// Adapter TTD digital — Mekari Sign (mekarisign.com). Dipilih 2026-09-28
// gantiin rencana awal Privy — Mekari Sign PSrE-tersertifikasi DAN sekaligus
// distributor resmi e-Meterai Peruri, jadi satu vendor/satu API buat TTD +
// materai (lihat juga src/lib/eMeterai/providers/mekari.js), gak perlu 2
// integrasi vendor terpisah.
//
// Dokumentasi teknis lengkap (endpoint pasti, bentuk payload webhook) baru
// bisa diakses setelah akun Sandbox disetujui tim Mekari (isi form di
// mekarisign.com/en/features/esignature-api/, mereka follow-up manual —
// BUKAN self-serve instan, dicek 2026-09-28). Yang sudah pasti dari halaman
// publik mereka: REST API, auth Bearer Token, contoh endpoint sandbox
// `https://sandbox-api.mekari.com/v2/esign/v1/...`, ada webhook realtime
// (status sent/viewed/signed/declined). Field request/response PERSIS &
// format+verifikasi payload webhook TETAP harus dicek ulang begitu sandbox
// aktif — jangan asumsikan TODO contoh di bawah ini benar tanpa dicek.
//
// Setelah semua TODO diisi: set env TTD_PROVIDER=mekari (lihat .env.local),
// provider ini sudah didaftarkan di ../index.js (PROVIDERS map).

const BASE_URL = process.env.MEKARI_API_BASE_URL; // TODO: isi dari akun sandbox/production (contoh publik: sandbox-api.mekari.com)
const BEARER_TOKEN = process.env.MEKARI_BEARER_TOKEN; // TODO: cek apakah ini API key statis atau token hasil OAuth2 client_credentials (MEKARI_CLIENT_ID/SECRET) — sesuaikan kalau OAuth2

function pastikanKonfigurasi() {
  if (!BASE_URL || !BEARER_TOKEN) {
    throw new Error(
      'Provider TTD "mekari" belum dikonfigurasi — isi MEKARI_API_BASE_URL/MEKARI_BEARER_TOKEN (sesuai docs sandbox) di env dulu.'
    );
  }
}

// TODO: ganti isi fungsi ini sesuai endpoint "kirim dokumen untuk TTD" dari
// dokumentasi Mekari Sign (baru kebuka penuh setelah akun Sandbox aktif).
// Field request/response contoh di bawah HARUS dicek ulang, jangan dipakai
// mentah — endpoint eSignature API Mekari kemungkinan pola v2/esign/v1/...
export async function kirim({ dokumen, refId, signer, pdfBuffer }) {
  pastikanKonfigurasi();

  throw new Error(
    'Provider "mekari" — endpoint kirim dokumen TTD belum diisi. Lihat komentar TODO di ' +
    'src/lib/eSignature/providers/mekari.js, sesuaikan dengan dokumentasi Sandbox Mekari Sign, ' +
    'baru hapus throw ini.'
  );

  // Contoh bentuk yang PALING UMUM dipakai provider sejenis — WAJIB dicek ulang
  // ke docs Mekari Sign sebelum dipakai, jangan asumsikan field ini benar:
  //
  // const res = await fetch(`${BASE_URL}/v2/esign/v1/documents`, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${BEARER_TOKEN}`,
  //   },
  //   body: JSON.stringify({
  //     document_base64: pdfBuffer.toString('base64'),
  //     filename: `${dokumen}-${refId}.pdf`,
  //     signers: [{ name: signer?.nama, email: signer?.email, phone: signer?.wa }],
  //     reference_id: `${dokumen}-${refId}`,
  //     callback_url: `${process.env.APP_URL}/api/webhook/mekari-ttd`,
  //   }),
  // });
  // if (!res.ok) throw new Error(`Mekari Sign API error ${res.status}: ${await res.text()}`);
  // const data = await res.json();
  // return { providerRef: data.document_id, status: 'ttd_menunggu' };
}

// Provider asli TIDAK dipicu manual seperti mock — Mekari Sign akan
// memanggil webhook JM Travel begitu status dokumen jadi "signed" (lihat
// src/app/api/webhook/mekari-ttd/route.js), bukan tombol UI.
export async function selesaikan({ providerRef, signer }) {
  pastikanKonfigurasi();
  return { selesaiAt: new Date() };
}
