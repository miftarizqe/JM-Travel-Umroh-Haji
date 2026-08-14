// Klasifikasi kategori cashflow dari teks deskripsi mutasi rekening bank —
// rule-based (kata kunci), BUKAN AI. Dicocokkan ke NAMA kategori (bukan id
// yang di-hardcode) supaya tetap valid walau kategori diedit/ditambah lewat
// UI Kelola Kategori. Ini cuma SARAN awal — admin tetap wajib review manual
// sebelum baris hasil import mutasi rekening disimpan (lihat
// /api/admin/cashflow/transaksi/import/parse).
const KATA_KUNCI = {
  'Gaji & Tunjangan Karyawan': ['GAJI', 'PAYROLL', 'THR', 'TUNJANGAN'],
  'Sewa Kantor': ['SEWA KANTOR', 'SEWA GEDUNG', 'SEWA RUKO', 'RENT OFFICE'],
  'Marketing/Iklan': ['IKLAN', ' ADS', 'ADS ', 'MARKETING', 'FACEBOOK ADS', 'GOOGLE ADS', 'INSTAGRAM ADS', 'META ADS', 'TIKTOK ADS'],
  'Utilitas (Listrik, Internet, Air)': ['PLN', 'LISTRIK', 'PDAM', 'TELKOM', 'INDIHOME', 'WIFI', 'INTERNET'],
  'Operasional Kantor (ATK, dll)': ['ATK', 'ALAT TULIS', 'FOTOCOPY', 'FOTOKOPI'],
  'Sistem/Teknologi (Hosting, WA API, dll)': ['HOSTING', 'DOMAIN', 'SERVER', 'WABLAS', 'FONNTE', 'WA API', 'VERCEL', 'CLOUDFLARE'],
  'Legal & Perizinan': ['NOTARIS', 'IZIN USAHA', 'NPWP', 'LEGALITAS'],
  'Pembayaran Vendor/HPP (Hotel, Maskapai)': ['HOTEL', 'MASKAPAI', 'GARUDA', 'SAUDIA', 'AIRLINES', 'MUASSASAH', 'VISA UMROH'],
  'Komisi/Ujroh': ['KOMISI', 'UJROH'],
  'Pendapatan Booking (DP/Pelunasan)': ['SETORAN JAMAAH', 'DP UMROH', 'PELUNASAN', 'BOOKING'],
  'Modal/Setoran Pemilik': ['SETORAN MODAL', 'MODAL USAHA'],
};

/**
 * @param {string} deskripsi - teks baris mutasi rekening
 * @param {Array<{id:number,nama:string,tipe:'in'|'out'}>} kategoriUntukTipe - daftar kategori aktif YANG SUDAH difilter sesuai tipe (in/out) baris ini
 * @returns {{id:number,nama:string}|null}
 */
export function sarankanKategori(deskripsi, kategoriUntukTipe) {
  const teks = (deskripsi || '').toUpperCase();
  if (!teks) return null;
  for (const kategori of kategoriUntukTipe) {
    const kataKunci = KATA_KUNCI[kategori.nama];
    if (kataKunci && kataKunci.some(k => teks.includes(k))) return kategori;
  }
  return null;
}
