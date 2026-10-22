// Kop surat RESMI — preview di layar sekarang pakai gambar pita header asli
// yang sama dengan hasil print/PDF (bukan logo+teks manual lagi), biar
// preview gak beda sama hasil cetak (ditemukan user 2026-10-22: "preview
// kwitansinya belum pake kop surat terbaru tp pas print sih udah").
// `pengaturan`/`warnaBorder` gak kepakai lagi (gambar udah include nama/
// alamat/telepon/email perusahaan) tapi DIBIARKAN di signature biar caller
// lama (cetak-rekap-ujroh, cetak-tanda-terima-perlengkapan, dst) gak perlu
// diubah semua.
export default function KopSurat({ pengaturan, warnaBorder } = {}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/kop-surat/kop-surat-header.png" alt="JM Travel"
      className="kop-surat-onscreen" style={{ display: 'block', width: '100%', marginBottom: 20 }} />
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
