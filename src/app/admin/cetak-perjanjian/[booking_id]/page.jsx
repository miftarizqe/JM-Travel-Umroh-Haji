'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { renderPasalMarkup } from '@/lib/pasalMarkup';
import DokumenSignatureAksi from '@/app/components/DokumenSignatureAksi';

function fmtTgl(t) {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d)) return t;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function CetakPerjanjian() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.booking_id;
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);
  const [pasal, setPasal] = useState(null);

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
    fetch(`/api/admin/pasal?dokumen=jamaah&ref_id=${bookingId}`).then(r => r.json()).then(d => setPasal(d.pasal || [])).catch(() => setPasal([]));
  }, [bookingId]);

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

      <DokumenSignatureAksi dokumen="jamaah" refId={booking.id} onCetakFisik={() => window.print()} hideCetakFisik />

      <div className="sheet" style={{ background: '#fff', width: 720, margin: '0 auto', padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/jm-travel-logo.png" alt="JM Travel" style={{ height: 78, objectFit: 'contain' }} />
          </div>
          <div style={{ fontSize: 11, textAlign: 'right' }}>
            <div>Kode Booking: <b>{booking.id}</b></div>
            <div>Program: <b>{booking.prog_name || '-'}</b></div>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, margin: '16px 0 4px' }}>Perjanjian Keberangkatan Jamaah</div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#666', marginBottom: 16 }}>Nomor: {booking.id}</div>

        <div style={{ fontSize: 15, fontWeight: 800, color: '#000', marginBottom: 6 }}>Jamaah Terkait</div>
        <div style={{ fontSize: 12, marginBottom: 16 }}>
          {jamaahArr.length > 0 ? jamaahArr.map((j, idx) => (
            <div key={idx}>{idx + 1}. {j.nama || '(belum diisi)'} {j.nik ? `— NIK ${j.nik}` : ''}</div>
          )) : <div style={{ color: '#999' }}>Data jamaah belum diisi.</div>}
        </div>

        <div style={{ fontSize: 15, fontWeight: 800, color: '#000', margin: '14px 0 8px' }}>Ketentuan</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.6 }}>
          {!pasal ? (
            <div style={{ color: '#999' }}>Memuat ketentuan...</div>
          ) : pasal.map(p => (
            <div key={p.nomor} style={{ margin: '0 0 8px' }}>
              <b>Pasal {p.nomor} — {p.judul}.</b> {renderPasalMarkup(p.isi)}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, marginTop: 20, padding: '10px 12px', borderRadius: 8, background: booking.setuju_pks ? '#ecfdf5' : '#fef2f2', color: booking.setuju_pks ? '#047857' : '#b91c1c' }}>
          {booking.setuju_pks
            ? `✅ Disetujui secara elektronik oleh pemesan pada ${fmtTgl(booking.setuju_pks_at)}.`
            : '⚠️ Persetujuan elektronik belum tercatat untuk booking ini.'}
        </div>

        <div style={{ textAlign: 'right', marginTop: 30, fontSize: 12 }}>
          <div style={{ display: 'inline-block', textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #000', width: 200, marginBottom: 4, height: 40 }}></div>
            (&nbsp;&nbsp;{booking.pemesan_nama || '................'}&nbsp;&nbsp;)
            <div style={{ fontWeight: 700, marginTop: 2 }}>Pemesan / Jamaah JM Travel</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .sheet { box-shadow: none !important; margin: 0 auto !important; width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
