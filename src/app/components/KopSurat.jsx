// Kop surat (logo + info perusahaan) buat halaman cetak — dipakai di
// cetak-invoice. Pola ini sebenarnya juga diduplikasi lokal di beberapa
// halaman cetak lain (proposal, formulir-mitra, pks-mitra); di sini dibikin
// shared cuma buat halaman baru, tanpa retrofit yang lama (di luar scope).
export default function KopSurat({ pengaturan, warnaBorder = '#0E2F6E' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `3px solid ${warnaBorder}`, paddingBottom: 10, marginBottom: 20 }}>
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
