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

// Kop surat RESMI (file asli dari user, revisi 2026-10-22 — versi pertama
// full 1 halaman A4 + watermark ternyata bikin tampilan "ngeblock"/cacat pas
// print, user ganti ke versi simpel: CUMA pita header, gak ada watermark/
// garis bawah lagi). Gambar ini CUMA pita header (bukan 1 halaman penuh),
// dipasang position:fixed KHUSUS PRINT nempel di TOP:0 — browser otomatis
// ngulang di SETIAP halaman fisik kalau dokumennya >1 halaman (dikonfirmasi
// user: "kalo dia ada 3 halaman ya masing2 selalu ada kopnya ini"). SENGAJA
// TANPA z-index (biar ikut urutan DOM biasa, dirender sebagai child
// PERTAMA di .sheet jadi otomatis di BELAKANG konten lain yang nyusul —
// z-index negatif di versi sebelumnya dicurigai jadi penyebab "ngeblock"
// karena print engine browser kadang gak taat stacking context yang sama
// kayak di layar).
// WAJIB dipasang bareng CSS print di pemanggil (lihat cetak-invoice/[id]/page.jsx):
//   @page { margin: 0 }  -- biar pita header nempel PERSIS di tepi kertas
//   .sheet padding-top di-override lewat @media print (~38mm, lihat komentar
//   ukuran di sana) supaya konten gak numpuk garis biru di gambar.
// display:none di luar print — SENGAJA gak ikut dirender pas preview layar,
// <KopSurat> di atas yang jadi preview-nya.
export function KopSuratPrintBg() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/kop-surat/kop-surat-header.png" alt="" aria-hidden="true"
      className="kop-surat-print-bg" style={{ display: 'none' }} />
  );
}
