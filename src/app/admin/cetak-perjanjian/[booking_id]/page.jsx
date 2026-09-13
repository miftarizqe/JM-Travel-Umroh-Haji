'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { renderPasalBlock, KopPasalDokumen, TtdBoxHtml, FONT_DOKUMEN, UKURAN_DOKUMEN } from '@/lib/pasalMarkup';
import { usePengaturan } from '@/lib/usePengaturan';
import DokumenSignatureAksi from '@/app/components/DokumenSignatureAksi';
import UploadScanDokumen from '@/app/components/UploadScanDokumen';

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

      <DokumenSignatureAksi dokumen="jamaah" refId={booking.id} onCetakFisik={() => window.print()} hideCetakFisik />

      <UploadScanDokumen label="Scan fisik (materai + TTD)" uploadUrl={`/api/admin/bookings/${booking.id}/scan-perjanjian`}
        userId={booking.id} path={booking.perjanjian_scan_path} uploadedAt={booking.perjanjian_scan_uploaded_at}
        onUploaded={(path) => setBooking(bk => ({ ...bk, perjanjian_scan_path: path, perjanjian_scan_uploaded_at: new Date().toISOString() }))} />

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
