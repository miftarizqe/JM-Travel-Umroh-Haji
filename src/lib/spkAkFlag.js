// SPK-AK / SPK-AK Non-Muslim dipaksa jalur manual (fisik) SEMENTARA — vendor
// esign/e-materai (Peruri/Mekari) belum siap connect padahal launch sudah
// besok (dikonfirmasi user 2026-09-30). Set `false` lagi begitu vendor
// beneran connect — JANGAN hapus kode digital yang sudah ada
// (kirimSpkAkTunggalUntukTtd di dokumen-signature/route.js, komponen
// DokumenSignatureAksi, dst), cuma dinonaktifkan lewat flag ini.
//
// File terpisah (bukan langsung di dokumen-signature/route.js) supaya aman
// diimpor dari client component juga (route.js server-only karena ada
// import pool/fs).
export const SPK_AK_SEMENTARA_FISIK = true;
