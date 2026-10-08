'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { renderPasalBlock, KopPasalDokumen, TtdBoxHtml, FONT_DOKUMEN, UKURAN_DOKUMEN } from '@/lib/pasalMarkup';
import { usePengaturan } from '@/lib/usePengaturan';
import DokumenSignatureAksi from '@/app/components/DokumenSignatureAksi';
import UploadScanDokumen from '@/app/components/UploadScanDokumen';
import { DOC_LIST, STATUS_DOKUMEN, statusDokumen } from '@/lib/dokumenPendukung';

function fmtTgl(t) {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d)) return t;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function tglIndo(d) {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', marginBottom: 3 }}>
      <div style={{ width: 100, flexShrink: 0 }}>{label}</div>
      <div style={{ width: 10 }}>:</div>
      <div style={{ flex: 1, borderBottom: '1px dotted #999', minHeight: 16 }}>{value || ''}</div>
    </div>
  );
}

export default function CetakPerjanjian() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.booking_id;
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);
  const [pasal, setPasal] = useState(null);
  const [signer, setSigner] = useState(null);
  const [pengaturan] = usePengaturan();
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
    fetch(`/api/admin/pasal?dokumen=jamaah&ref_id=${bookingId}`).then(r => r.json())
      .then(d => { setPasal(d.pasal || []); setSigner(d.signer || null); }).catch(() => setPasal([]));
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

  const jamaahArr = Array.isArray(booking.jamaah_data) ? booking.jamaah_data : [];
  const jamaahTunggal = jamaahArr.length === 1 ? jamaahArr[0] : null;
  const namaPenandatangan = signer?.nama || 'Ahmad Zaky Arief Bestary';
  const jabatanPenandatangan = signer?.jabatan || 'Direktur Pengembangan Bisnis & Sumber Daya Manusia';
  const tglBooking = new Date(booking.created_at);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button onClick={() => window.print()}
          style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          🖨️ Print / Save PDF
        </button>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          Booking {booking.id} · di dialog print pilih &quot;Save as PDF&quot;
        </div>
      </div>

      {/* Kirim TTD Digital DICABUT (dikonfirmasi user 2026-10-08) -- vendor
          esign belum connect, tombol itu cuma buka sesi mock. Perjanjian
          Jamaah sekarang murni jalur fisik: cetak di sini, lalu unggah
          scan-nya lewat UploadScanDokumen di bawah. */}
      <DokumenSignatureAksi dokumen="jamaah" refId={booking.id} onCetakFisik={() => window.print()} hideCetakFisik hideKirimDigital />

      <UploadScanDokumen label="Scan fisik (materai + TTD)" uploadUrl={`/api/admin/bookings/${booking.id}/scan-perjanjian`}
        userId={booking.id} path={booking.perjanjian_scan_path} uploadedAt={booking.perjanjian_scan_uploaded_at}
        onUploaded={(path) => setBooking(bk => ({ ...bk, perjanjian_scan_path: path, perjanjian_scan_uploaded_at: new Date().toISOString() }))} />

      {/* Verifikasi dokumen pendukung jamaah langsung di sini (dikonfirmasi
          user 2026-10-08, "gaada button approve dokumen pendukung") --
          sebelumnya cuma bisa lewat /admin/dokumen-pendukung terpisah.
          Sama endpoint/logic, cuma di-scope ke booking ini aja. */}
      {jamaahArr.some(j => DOC_LIST.some(dl => j?.[dl.key])) && (
        <div className="no-print" style={{ width: 720, margin: '0 auto 16px', background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
          <div style={{ fontWeight: 700, color: '#0E2F6E', marginBottom: 10, fontSize: 14 }}>📎 Dokumen Pendukung Jamaah</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {jamaahArr.flatMap((j, idx) => DOC_LIST.filter(dl => j?.[dl.key]).map(dl => {
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

      <div className="sheet" style={{ background: '#fff', width: 720, minHeight: '29.7cm', margin: '0 auto', padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', fontFamily: FONT_DOKUMEN, fontSize: UKURAN_DOKUMEN.normal, lineHeight: 1.6, color: '#111' }}>
        <KopPasalDokumen pengaturan={pengaturan} />

        <div style={{ textAlign: 'center', fontSize: UKURAN_DOKUMEN.judul, fontWeight: 800 }}>SURAT PERJANJIAN JAMAAH UMROH</div>
        <div style={{ textAlign: 'center', fontSize: UKURAN_DOKUMEN.nomor, color: '#666', marginBottom: 18 }}>Nomor: {booking.id}</div>

        <p>
          Pada hari {HARI[tglBooking.getDay()]}, tanggal {tglIndo(tglBooking)}, bertempat di Jakarta, yang bertanda tangan di bawah ini :
        </p>

        <div style={{ fontWeight: 700, marginTop: 10 }}>Pihak Pertama (Penyelenggara)</div>
        <Field label="Nama Perusahaan" value="PT. Alkhalid Jaya Megah" />
        <Field label="No. Izin PPIU/PIHK" value="SK PPIU No.921 Tahun 2017 / SK PHIK No.35 Tahun 2019" />
        <Field label="Diwakilkan oleh" value={namaPenandatangan} />
        <Field label="Jabatan" value={jabatanPenandatangan} />

        <div style={{ fontWeight: 700, marginTop: 12 }}>Pihak Kedua (Jamaah)</div>
        <Field label="Nama" value={booking.pemesan_nama} />
        <Field label="Program" value={booking.prog_name} />
        <Field label="Alamat" value={jamaahTunggal?.alamat} />
        <Field label="No. Telepon" value={booking.pemesan_wa} />
        <Field label="No. Paspor" value={jamaahTunggal?.paspor} />

        <p style={{ marginTop: 12 }}>
          PARA PIHAK sepakat untuk mengikatkan diri dalam Perjanjian Perjalanan Ibadah Umroh dengan ketentuan sebagai berikut:
        </p>

        {jamaahArr.length > 1 && (
          <>
            <div style={{ fontSize: UKURAN_DOKUMEN.subJudul, fontWeight: 800, color: '#000', margin: '10px 0 6px' }}>Jamaah Terkait</div>
            <div style={{ marginBottom: 8 }}>
              {jamaahArr.map((j, idx) => (
                <div key={idx}>{idx + 1}. {j.nama || '(belum diisi)'} {j.nik ? `— NIK ${j.nik}` : ''}</div>
              ))}
            </div>
          </>
        )}

        {!pasal ? (
          <div style={{ color: '#999' }}>Memuat ketentuan...</div>
        ) : pasal.map(p => (
          <div key={p.nomor}>
            {renderPasalBlock(p)}
          </div>
        ))}

        <div style={{ fontSize: 11, marginTop: 20, padding: '10px 12px', borderRadius: 8, background: booking.setuju_pks ? '#ecfdf5' : '#fef2f2', color: booking.setuju_pks ? '#047857' : '#b91c1c' }}>
          {booking.setuju_pks
            ? `✅ Disetujui secara elektronik oleh pemesan pada ${fmtTgl(booking.setuju_pks_at)}.`
            : '⚠️ Persetujuan elektronik belum tercatat untuk booking ini.'}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, breakInside: 'avoid' }}>
          <TtdBoxHtml pihak="PIHAK PERTAMA" sub="PT. Alkhalid Jaya Megah" nama={namaPenandatangan} keterangan={jabatanPenandatangan} />
          <TtdBoxHtml pihak="PIHAK KEDUA" sub="Jamaah" nama={booking.pemesan_nama || '................'} />
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .sheet { box-shadow: none !important; margin: 0 auto !important; width: 100% !important; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>
    </div>
  );
}
