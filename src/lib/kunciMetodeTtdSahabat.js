// Kapan jamaah Sahabat Baitullah SUDAH TIDAK BOLEH ganti metode TTD
// (dikonfirmasi user 2026-10-08). SATU sumber aturan — dipakai
// PATCH /api/sahabat/metode-ttd (gate server) dan GET
// /api/status-pendaftaran-sahabat (nyembunyiin tombol "Ganti Metode TTD").
//
// 1. 'kirim' & jamaah udah konfirmasi kirim paket (dokumen_fisik_dikirim_at)
//    — paketnya udah di jalan, ganti ke 'kantor' bikin admin bingung nunggu
//    yang mana.
// 2. 'kantor' & hari ini udah H-2 (atau lewat) dari tanggal kunjungan —
//    kantor udah nyiapin dokumen buat tanggal itu.
// 3. Admin udah nandain salah satu dokumen fisik diterima — prosesnya udah
//    jalan, apa pun metodenya.

// Tanggal hari ini versi WIB ('YYYY-MM-DD') — server bisa jalan di UTC,
// jangan pakai new Date().toISOString() (sebelum 07.00 WIB = kemarin).
export function hariIniWib() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

function kurangiHari(isoTanggal, n) {
  const [y, m, d] = isoTanggal.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - n));
  return t.toISOString().slice(0, 10);
}

/**
 * @param {object} u  baris users — butuh metode_ttd_sahabat,
 *   tanggal_kunjungan ('YYYY-MM-DD', ambil pakai DATE_FORMAT biar gak kena
 *   geser timezone mysql2), dokumen_fisik_dikirim_at, dan 4 kolom
 *   dokumen_*_fisik_diterima_at.
 * @returns {string|null} alasan terkunci (buat ditampilkan), null = boleh ganti.
 */
export function alasanKunciMetodeTtd(u) {
  if (!u?.metode_ttd_sahabat) return null;
  if (u.dokumen_spk_ak_fisik_diterima_at || u.dokumen_cif_fisik_diterima_at
    || u.dokumen_pemblokiran_fisik_diterima_at || u.dokumen_formulir_bsi_fisik_diterima_at) {
    return 'Dokumen fisik Anda sudah mulai diterima kantor, metode TTD tidak bisa diganti lagi.';
  }
  if (u.metode_ttd_sahabat === 'kirim' && u.dokumen_fisik_dikirim_at) {
    return 'Anda sudah konfirmasi mengirim paket dokumen, metode TTD tidak bisa diganti lagi.';
  }
  if (u.metode_ttd_sahabat === 'kantor' && u.tanggal_kunjungan
    && hariIniWib() >= kurangiHari(u.tanggal_kunjungan, 2)) {
    return 'Metode TTD tidak bisa diganti mulai H-2 sebelum tanggal kunjungan kantor.';
  }
  return null;
}

// Kolom SELECT yang dibutuhkan alasanKunciMetodeTtd (tanpa prefix tabel).
export const KOLOM_KUNCI_METODE_TTD = `metode_ttd_sahabat,
  DATE_FORMAT(rencana_kunjungan_kantor_at, '%Y-%m-%d') AS tanggal_kunjungan,
  dokumen_fisik_dikirim_at, dokumen_spk_ak_fisik_diterima_at, dokumen_cif_fisik_diterima_at,
  dokumen_pemblokiran_fisik_diterima_at, dokumen_formulir_bsi_fisik_diterima_at`;
