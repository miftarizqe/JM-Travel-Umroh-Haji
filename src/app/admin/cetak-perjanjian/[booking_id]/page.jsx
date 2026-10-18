'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PdfDokumenResmi from '@/app/components/PdfDokumenResmi';
import DokumenSignatureAksi from '@/app/components/DokumenSignatureAksi';
import UploadScanDokumen from '@/app/components/UploadScanDokumen';
import { DOC_LIST, STATUS_DOKUMEN, statusDokumen } from '@/lib/dokumenPendukung';

function fmtTgl(t) {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d)) return t;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Cetak Surat Perjanjian Jamaah Umroh (SPJ) — PDF template resmi, 1 lembar
// per jamaah aktif digabung otomatis (dikonfirmasi user 2026-10-18, bukan
// lagi render HTML dari pasal DB, mirror cetak-pks-mitra/cetak-spk-ak).
// Verifikasi dokumen pendukung & upload scan fisik PER JAMAAH tetap di sini
// (gak berubah) -- cuma tampilan lembar yang dicetak yang diganti.
export default function CetakPerjanjian() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.booking_id;
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);
  const [busyDoc, setBusyDoc] = useState(null);

  function muatBooking() {
    fetch(`/api/bookings/${bookingId}`)
      .then(r => r.json())
      .then(d => { if (d.booking) setBooking(d.booking); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }
    const user = JSON.parse(u);

    fetch(`/api/bookings/${bookingId}`)
      .then(r => r.json())
      .then(d => {
        const b = d.booking;
        if (!b) { setLoading(false); return; }

        // GUARD AKSES: sama seperti cetak formulir — hanya admin.
        if (!['admin','super_admin'].includes(user.role)) { setDitolak(true); setLoading(false); return; }

        setBooking(b);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // Verifikasi dokumen pendukung jamaah (scan paspor/KK/KTP/vaksin/pas foto)
  // langsung dari halaman ini -- sebelumnya admin harus pindah ke
  // /admin/dokumen-pendukung terpisah buat booking yang sama lagi dibuka di
  // sini (ditemukan user 2026-10-08, "gaada button approve dokumen
  // pendukung"). Sumber kebenaran tetap satu endpoint yang sama.
  async function aksiDok(idx, docKey, path, label, namaJamaah, status) {
    let alasan = '';
    if (status === 'ditolak') {
      alasan = prompt(`Alasan menolak ${label} — ${namaJamaah}:`);
      if (alasan === null) return;
      if (!alasan.trim()) { alert('Alasan penolakan wajib diisi.'); return; }
    }
    const id = `${idx}:${docKey}`;
    setBusyDoc(id);
    try {
      const res = await fetch('/api/admin/dokumen-pendukung', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, idx, doc_key: docKey, path, status, alasan }),
      });
      const d = await res.json();
      if (!res.ok) alert(d.error || 'Gagal menyimpan');
      muatBooking();
    } catch { alert('Terjadi kesalahan'); }
    setBusyDoc(null);
  }

  function setScanJamaah(idx, path) {
    setBooking(bk => {
      const entries = (Array.isArray(bk.jamaah_data) ? bk.jamaah_data : []).map((j, i) =>
        i === idx ? { ...j, perjanjian_scan_path: path, perjanjian_scan_uploaded_at: new Date().toISOString() } : j
      );
      return { ...bk, jamaah_data: entries };
    });
  }

  if (loading) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat data...</div>;

  if (ditolak) return (
    <div style={{ padding: 40, fontFamily: 'Arial', textAlign: 'center' }}>
      <h2 style={{ color: '#dc2626' }}>🔒 Akses Ditolak</h2>
      <p style={{ color: '#666', fontSize: 14 }}>Cetak surat perjanjian hanya dapat diakses oleh admin.</p>
      <button onClick={() => router.back()} style={{ marginTop: 16, background: '#1A4FA0', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 20, cursor: 'pointer' }}>
        ← Kembali
      </button>
    </div>
  );

  if (!booking) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Booking tidak ditemukan.</div>;

  // Cuma jamaah AKTIF yang butuh lembar perjanjian sendiri — yang dibatalkan
  // gak perlu dokumen apa pun lagi (sama pola kayak cetak-formulir).
  const jamaahAktif = (Array.isArray(booking.jamaah_data) ? booking.jamaah_data : [])
    .map((j, idx) => ({ j, idx }))
    .filter(({ j }) => j?.status_jamaah !== 'dibatalkan');
  // Dokumen lama (sebelum lembar per-jamaah ada, 2026-10-13) nyimpen 1 scan
  // gabungan di level booking — tetap ditampilkan sebagai warisan biar
  // booking lama yang udah pernah discan gak keliatan "belum selesai" lagi,
  // TAPI scan BARU dari sini selalu per-jamaah (jamaah_data[i].perjanjian_scan_path).
  const scanLegacy = booking.perjanjian_scan_path;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ textAlign: 'center', fontWeight: 700, color: '#0E2F6E', marginBottom: 12 }}>
          🖨️ Surat Perjanjian Jamaah Umroh — Booking {booking.id} · {jamaahAktif.length} lembar
        </div>

        {/* Persetujuan ONLINE tetap 1x per booking/transaksi (dikonfirmasi user
            2026-10-13) — materai+TTD FISIK yang per-jamaah, bukan centang
            setuju-nya. Kirim TTD Digital DICABUT (dikonfirmasi user
            2026-10-08) -- vendor esign belum connect. */}
        <DokumenSignatureAksi dokumen="jamaah" refId={booking.id} onCetakFisik={() => {}} hideCetakFisik hideKirimDigital />

        <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 16,
          background: booking.setuju_pks ? '#dcfce7' : '#fef9c3', color: booking.setuju_pks ? '#15803d' : '#854d0e' }}>
          {booking.setuju_pks
            ? `✅ Disetujui elektronik oleh pemesan pada ${fmtTgl(booking.setuju_pks_at)}. Materai & TTD fisik per jamaah tetap wajib diproses (lihat tiap lembar di bawah) — bukan syarat pelunasan lagi, cuma follow-up administratif.`
            : '⏳ Pemesan belum menyetujui secara elektronik.'}
        </div>

        {/* Verifikasi dokumen pendukung jamaah langsung di sini (dikonfirmasi
            user 2026-10-08, "gaada button approve dokumen pendukung") --
            sebelumnya cuma bisa lewat /admin/dokumen-pendukung terpisah.
            Sama endpoint/logic, cuma di-scope ke booking ini aja. */}
        {jamaahAktif.some(({ j }) => DOC_LIST.some(dl => j?.[dl.key])) && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.15)', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: '#0E2F6E', marginBottom: 10, fontSize: 14 }}>📎 Dokumen Pendukung Jamaah</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {jamaahAktif.flatMap(({ j, idx }) => DOC_LIST.filter(dl => j?.[dl.key]).map(dl => {
                const st = statusDokumen(j, dl.key);
                const info = STATUS_DOKUMEN[st.status];
                const id = `${idx}:${dl.key}`;
                const nama = j.nama || `Jamaah ${idx + 1}`;
                return (
                  <div key={id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#F8F9FD', borderRadius: 8, fontSize: 12 }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontWeight: 700, color: '#333' }}>{dl.label} — {nama}</div>
                      {info && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10, background: info.cls.includes('green') ? '#dcfce7' : info.cls.includes('red') ? '#fee2e2' : '#fef9c3', color: info.cls.includes('green') ? '#15803d' : info.cls.includes('red') ? '#b91c1c' : '#854d0e' }}>{info.ikon} {info.label}</span>}
                      {st.status === 'ditolak' && st.alasan && <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 2 }}>Alasan: {st.alasan}</div>}
                    </div>
                    <a href={j[dl.key]} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, fontWeight: 700, color: '#1A4FA0', background: '#E8F0FB', padding: '5px 12px', borderRadius: 16, textDecoration: 'none' }}>Lihat</a>
                    {st.status !== 'diverifikasi' && (
                      <button disabled={busyDoc === id} onClick={() => aksiDok(idx, dl.key, j[dl.key], dl.label, nama, 'diverifikasi')}
                        style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#16a34a', border: 'none', padding: '5px 12px', borderRadius: 16, cursor: 'pointer', opacity: busyDoc === id ? 0.5 : 1 }}>✅ Verifikasi</button>
                    )}
                    {st.status !== 'ditolak' && (
                      <button disabled={busyDoc === id} onClick={() => aksiDok(idx, dl.key, j[dl.key], dl.label, nama, 'ditolak')}
                        style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', background: '#fee2e2', border: 'none', padding: '5px 12px', borderRadius: 16, cursor: 'pointer', opacity: busyDoc === id ? 0.5 : 1 }}>❌ Tolak</button>
                    )}
                  </div>
                );
              }))}
            </div>
          </div>
        )}

        {jamaahAktif.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Belum ada jamaah aktif di booking ini.</div>
        ) : (
          <>
            {jamaahAktif.map(({ j, idx }) => {
              const scanPath = j.perjanjian_scan_path || scanLegacy || null;
              const scanAt = j.perjanjian_scan_path ? j.perjanjian_scan_uploaded_at : (scanLegacy ? booking.perjanjian_scan_uploaded_at : null);
              const scanWarisan = !j.perjanjian_scan_path && !!scanLegacy;
              return (
                <div key={idx} style={{ marginBottom: 12 }}>
                  <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 8,
                    background: scanPath ? '#dcfce7' : '#fef9c3', color: scanPath ? '#15803d' : '#854d0e' }}>
                    {scanPath
                      ? `✅ ${j.nama || `Jamaah ${idx + 1}`} — materai+TTD fisik sudah diunggah${scanWarisan ? ' (dokumen lama/gabungan sebelum per-jamaah)' : ''}.`
                      : `⏳ ${j.nama || `Jamaah ${idx + 1}`} — belum ada scan materai+TTD fisik.`}
                  </div>
                  <UploadScanDokumen label={`Scan fisik — ${j.nama || `Jamaah ${idx + 1}`}`}
                    uploadUrl={`/api/admin/bookings/${booking.id}/scan-perjanjian`}
                    userId={booking.id} path={scanPath} uploadedAt={scanAt}
                    extraFields={{ jamaah_idx: idx }}
                    onUploaded={(path) => setScanJamaah(idx, path)} />
                </div>
              );
            })}

            <div style={{ marginTop: 16, marginBottom: 20 }}>
              <PdfDokumenResmi url={`/api/admin/cetak-spj/${booking.id}`} tinggi="80vh" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
