// Kop surat (logo + info perusahaan) buat halaman cetak — dipakai di
// cetak-invoice. Pola ini sebenarnya juga diduplikasi lokal di beberapa
// halaman cetak lain (proposal, formulir-mitra, pks-mitra); di sini dibikin
// shared cuma buat halaman baru, tanpa retrofit yang lama (di luar scope).
export default function KopSurat({ pengaturan, warnaBorder = '#0E2F6E' }) {
  return (
    <div className="kop-surat-onscreen" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `3px solid ${warnaBorder}`, paddingBottom: 10, marginBottom: 20 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/jm-travel-logo.png" alt="JM Travel" style={{ height: 70, objectFit: 'contain' }} />
      <div style={{ fontSize: 10, textAlign: 'right', lineHeight: 1.5, color: warnaBorder }}>
        <div style={{ fontWeight: 700 }}>{pengaturan.nama_perusahaan}</div>
        <div>{pengaturan.alamat_kantor}</div>
        <div>Phone: {pengaturan.telepon_kantor}</div>
        <div>Email: {pengaturan.email_kantor}</div>
      </div>
    </div>
  );
}

// Kop surat RESMI (file asli dari user, 2026-10-22) — file utuh 1 halaman
// A4 penuh (header + watermark tengah + garis biru bawah), dipasang sebagai
// background position:fixed KHUSUS PRINT, biar browser otomatis ngulang
// gambar ini di SETIAP halaman fisik kalau dokumennya >1 halaman (dikonfirmasi
// user: "kalo dia ada 3 halaman ya masing2 selalu ada kopnya ini") — beda
// dari <KopSurat> di atas yang cuma elemen biasa di ALIRAN KONTEN, otomatis
// cuma nongol 1x di halaman pertama.
// WAJIB dipasang bareng CSS print di pemanggil (lihat cetak-invoice/[id]/page.jsx):
//   @page { margin: 0 }  -- biar gambar nutup SELURUH kertas, bukan cuma area margin
//   .sheet padding di-override lewat @media print supaya konten gak numpuk
//   sama header/garis bawah di gambar (lihat komentar ukuran di sana).
// display:none di luar print — SENGAJA gak ikut dirender pas preview layar,
// <KopSurat> di atas yang jadi preview-nya.
export function KopSuratPrintBg() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/kop-surat/kop-surat-a4.png" alt="" aria-hidden="true"
      className="kop-surat-print-bg" style={{ display: 'none' }} />
  );
}
