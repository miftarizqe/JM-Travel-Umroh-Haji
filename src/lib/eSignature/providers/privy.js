// Adapter TTD digital — PrivyID (privy.id), BUKAN privy.io (itu platform
// Web3/wallet yang gak nyambung ke tanda tangan dokumen — jangan salah cari
// dokumentasi). Dokumentasi teknis PrivyID (endpoint pasti, format auth,
// bentuk payload webhook) ada di docs.privy.id, TAPI portal itu wajib login
// akun partner/bisnis PrivyID dulu (dicek 2026-09-28, redirect ke
// oauth2.privypass.id) — jadi detail persisnya BELUM bisa diambil dari sini.
//
// Yang sudah pasti dari riset publik: PrivyID menyebut satu paket dokumen
// yang dikirim buat ditandatangani sebagai "Envelope", dan API bisnis mereka
// disebut "API Suite". Selebihnya (path endpoint, nama field request/response,
// skema auth — kemungkinan API key/secret atau username+password+merchant
// key, dan format+verifikasi payload webhook) HARUS dicek langsung dari
// dashboard partner PrivyID begitu akun bisnis JM Travel aktif, lalu isi
// TODO di bawah. Jangan tebak endpoint — tiap TODO di file ini nunjuk ke
// bagian yang wajib disesuaikan dengan dokumentasi asli sebelum dipakai live.
//
// Setelah semua TODO diisi: set env TTD_PROVIDER=privy (lihat .env.local),
// lalu daftarkan provider ini di ../index.js (PROVIDERS map) — baris impor
// & pendaftarannya sudah disiapkan, tinggal di-uncomment.

const BASE_URL = process.env.PRIVY_API_BASE_URL; // TODO: isi dari docs partner (biasanya beda base URL sandbox vs production)
const API_KEY = process.env.PRIVY_API_KEY; // TODO: sesuaikan nama & jumlah kredensial — PrivyID API Suite kemungkinan butuh lebih dari satu (mis. merchant key + secret)
const API_SECRET = process.env.PRIVY_API_SECRET;
const MERCHANT_KEY = process.env.PRIVY_MERCHANT_KEY;

function pastikanKonfigurasi() {
  if (!BASE_URL || !API_KEY) {
    throw new Error(
      'Provider TTD "privy" belum dikonfigurasi — isi PRIVY_API_BASE_URL/PRIVY_API_KEY (dan kredensial lain sesuai docs partner) di env dulu.'
    );
  }
}

// TODO: ganti isi fungsi ini sesuai endpoint "buat Envelope + kirim ke
// penandatangan" dari dokumentasi PrivyID. Alur pada umumnya provider TTD
// Indonesia (Privy/Digisign/VIDA sejenis): upload PDF -> daftarkan
// penandatangan (nama/email/no HP) -> submit permintaan TTD -> API balikin
// ID dokumen/envelope di sisi provider (dipakai sebagai providerRef di sini).
// Field request/response PASTINYA beda dengan asumsi di bawah — sesuaikan.
export async function kirim({ dokumen, refId, signer, pdfBuffer }) {
  pastikanKonfigurasi();

  throw new Error(
    'Provider "privy" — endpoint kirim Envelope belum diisi. Lihat komentar TODO di ' +
    'src/lib/eSignature/providers/privy.js, sesuaikan dengan dokumentasi partner PrivyID ' +
    '(docs.privy.id, wajib login akun bisnis), baru hapus throw ini.'
  );

  // Contoh bentuk yang PALING UMUM dipakai provider sejenis — WAJIB dicek ulang
  // ke docs PrivyID sebelum dipakai, jangan asumsikan field ini benar:
  //
  // const res = await fetch(`${BASE_URL}/TODO-path-buat-envelope`, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     // TODO: skema auth asli — API key di header? Basic Auth? Bearer token
  //     // hasil login terpisah? Cek docs.
  //     'Authorization': `Bearer ${API_KEY}`,
  //   },
  //   body: JSON.stringify({
  //     merchant_key: MERCHANT_KEY,
  //     document_base64: pdfBuffer.toString('base64'),
  //     recipients: [{ name: signer?.nama, email: signer?.email, phone: signer?.wa }],
  //     reference_id: `${dokumen}-${refId}`,
  //     // TODO: field webhook callback URL kalau PrivyID butuh didaftarkan per-request
  //     // (bukan cuma dikonfigurasi sekali di dashboard partner).
  //   }),
  // });
  // if (!res.ok) throw new Error(`PrivyID API error ${res.status}: ${await res.text()}`);
  // const data = await res.json();
  // return { providerRef: data.envelope_id, status: 'ttd_menunggu' };
}

// Provider asli TIDAK dipicu manual seperti mock — PrivyID akan memanggil
// webhook JM Travel begitu penandatangan selesai TTD di sisi mereka. Fungsi
// `selesaikan` ini akan dipanggil DARI webhook (lihat
// src/app/api/webhook/privy-ttd/route.js), bukan dari tombol UI. Kalaupun
// dipanggil, di sini cukup kembalikan waktu selesai — PrivyID biasanya kirim
// timestamp-nya sendiri di payload webhook, TODO: pakai itu kalau ada,
// jangan pakai `new Date()` server kalau provider punya timestamp resmi.
export async function selesaikan({ providerRef, signer }) {
  pastikanKonfigurasi();
  return { selesaiAt: new Date() };
}
