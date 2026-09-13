'use client';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { usePengaturan } from '@/lib/usePengaturan';
import { resolveJamaahHarga } from '@/lib/jamaahHarga';

function Field({ label, value, star }) {
  return (
    <div style={{ display: 'flex', fontSize: 12, marginBottom: 4, alignItems: 'flex-end' }}>
      <div style={{ width: 200, flexShrink: 0, color: '#000' }}>{label}{star && <span>*</span>}</div>
      <div style={{ width: 8 }}>:</div>
      <div style={{ flex: 1, borderBottom: '1px solid #000', minHeight: 16, paddingLeft: 4, fontWeight: 600 }}>
        {value || '\u00A0'}
      </div>
    </div>
  );
}

function fmtTgl(t) {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d)) return t;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Kop({ pengaturan }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1A4FA0', paddingBottom: 10, marginBottom: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/jm-travel-logo.png" alt="JM Travel" style={{ height: 78, objectFit: 'contain' }} />
      <div style={{ fontSize: 10, textAlign: 'right', lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700 }}>{pengaturan.nama_perusahaan}</div>
        <div>{pengaturan.alamat_kantor}</div>
        <div>Phone: {pengaturan.telepon_kantor}</div>
        <div>Email: {pengaturan.email_kantor}</div>
      </div>
    </div>
  );
}

export default function CetakFormulir() {
  return (
    <Suspense fallback={<div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat data...</div>}>
      <CetakFormulirInner />
    </Suspense>
  );
}

function CetakFormulirInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = params.booking_id;
  const idxParam = searchParams.get('idx');
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);
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

        // GUARD AKSES: cetak formulir HANYA untuk ADMIN (termasuk super_admin).
        // Perwakilan/jamaah tidak boleh mencetak formulir.
        const boleh = user.role === 'admin' || user.role === 'super_admin';

        if (!boleh) { setDitolak(true); setLoading(false); return; }

        setBooking(b);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [bookingId]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat data...</div>;

  if (ditolak) return (
    <div style={{ padding: 40, fontFamily: 'Arial', textAlign: 'center' }}>
      <h2 style={{ color: '#dc2626' }}>🔒 Akses Ditolak</h2>
      <p style={{ color: '#666', fontSize: 14 }}>Cetak formulir jamaah hanya dapat diakses oleh admin.</p>
      <button onClick={() => router.back()} style={{ marginTop: 16, background: '#1A4FA0', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 20, cursor: 'pointer' }}>
        ← Kembali
      </button>
    </div>
  );

  if (!booking) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Booking tidak ditemukan.</div>;

  const jamaahArr = Array.isArray(booking.jamaah_data) ? booking.jamaah_data : [];

  // Kalau dibuka dari manifest dengan ?idx=<n>, cetak cuma formulir 1 jamaah itu saja.
  // Tanpa idx (mis. dibuka dari halaman booking), tetap cetak semua jamaah sekaligus.
  const idxNum = idxParam !== null ? Number(idxParam) : null;
  const sheetsToRender = (idxNum !== null && jamaahArr[idxNum])
    ? [{ j: jamaahArr[idxNum], idx: idxNum }]
    : jamaahArr.map((j, idx) => ({ j, idx }));

  if (jamaahArr.length === 0) {
    return (
      <div style={{ padding: 40, fontFamily: 'Arial' }}>
        <p>Data formulir jamaah untuk booking <b>{booking.id}</b> belum diisi.</p>
        <p style={{ color: '#666', fontSize: 13 }}>Jamaah harus mengisi & mengirim formulir terlebih dahulu.</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button onClick={() => window.print()}
          style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          🖨️ Print / Save PDF
        </button>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          Booking {booking.id} · {sheetsToRender.length} jamaah · di dialog print pilih &quot;Save as PDF&quot;
        </div>
      </div>

      {sheetsToRender.map(({ j, idx }) => {
        const jk = resolveJamaahHarga(booking, j); // kombo paket/kamar/harga jamaah ini (sendiri kalau pernah diedit per-orang, else ikut booking)
        return (
        <div key={idx} className="sheet" style={{ background: '#fff', width: 720, margin: '0 auto 20px', padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
          <Kop pengaturan={pengaturan} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <div style={{ fontSize: 11, textAlign: 'right' }}>
              <div>Kode Booking: <b>{booking.id}</b></div>
              <div>Kode Referral: <b>{booking.referral_kode || '-'}</b></div>
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 18, margin: '12px 0 16px' }}>
            Formulir Pendaftaran <b>JAMAAH</b>
            {jamaahArr.length > 1 && <span style={{ fontSize: 13 }}> — Jamaah {idx + 1}</span>}
          </div>

          <div style={{ fontSize: 15, fontWeight: 800, color: '#000', marginBottom: 6 }}>Data Pribadi</div>
          <Field label="Nama Sesuai Paspor" star value={j.nama} />
          <Field label="Nomor Paspor" star value={j.paspor} />
          <Field label="Masa Berlaku Paspor" star value={`${fmtTgl(j.exp_mulai)}  s/d  ${fmtTgl(j.exp_paspor)}`} />
          <Field label="Tempat Keluar Paspor" star value={j.tkp} />
          <Field label="Tempat, Tanggal Lahir" star value={`${j.tl || ''}${j.tl && j.ttl ? ', ' : ''}${fmtTgl(j.ttl)}`} />
          <Field label="Nomor KTP" value={j.nik} />
          <Field label="Jenis Kelamin" star value={j.jk} />
          <Field label="Alamat Lengkap Domisili" star value={j.alamat} />
          <Field label="No. Whatsapp" star value={j.wa} />
          <Field label="Email Aktif" value={j.email} />
          <Field label="Riwayat Penyakit" value={j.penyakit} />
          <Field label="Pekerjaan" value={j.pkj} />
          <Field label="Nama Mahram/Pendamping" star value={j.mahram} />
          <Field label="Hubungan Mahram - Jamaah" star value={j.hub_mahram} />

          <div style={{ fontSize: 15, fontWeight: 800, color: '#000', margin: '14px 0 6px' }}>Kontak Darurat</div>
          <Field label="Nama Lengkap" star value={j.kdnama} />
          <Field label="Nomor Whatsapp" star value={j.kdwa} />
          <Field label="Hubungan Dengan Jamaah" star value={j.kdhub} />

          <div style={{ fontSize: 15, fontWeight: 800, color: '#000', margin: '14px 0 6px' }}>Data Program</div>
          <Field label="Pilihan Program" value={booking.prog_name} />
          <Field label="Pilihan Kamar" value={jk.kamar} />
          {Array.isArray(booking.opsi_tambahan_data) && booking.opsi_tambahan_data.length > 0 && (
            <Field label="Opsi Tambahan" value={booking.opsi_tambahan_data.map(o => `${o.nama} (+Rp ${Number(o.harga || 0).toLocaleString('id-ID')})`).join(', ')} />
          )}
          <Field label="Total Harga Program" value={`Rp ${jk.hargaJual.toLocaleString('id-ID')}`} />

          <div style={{ fontSize: 9.5, color: '#000', marginTop: 16, lineHeight: 1.5 }}>
            <p style={{ margin: '4px 0' }}>1. Jamaah dilarang keras menitipkan pembayaran DP/pelunasan kepada perorangan/Perwakilan. Kerugian yang terjadi akibat hal tersebut bukan menjadi tanggung jawab perusahaan.</p>
            <p style={{ margin: '4px 0' }}>2. Pembayaran DP/Pelunasan hanya melalui rekening: <b>{pengaturan.bank_nama}</b> a.n. <b>{pengaturan.bank_atas_nama}</b>, No. Rek IDR <b>{pengaturan.bank_rekening}</b></p>
            <p style={{ margin: '4px 0' }}>3. Mohon menyertakan: Scan Paspor berlaku min. 6 bulan sebelum keberangkatan, Kartu Keluarga & KTP; Scan bukti vaksin meningitis & polio; Scan pas foto.</p>
            <p style={{ margin: '10px 0 4px' }}>Dengan menandatangani dokumen ini, saya sudah membaca dan mengerti peraturan ini.</p>
          </div>

          <div style={{ textAlign: 'right', marginTop: 30, fontSize: 12 }}>
            <div style={{ display: 'inline-block', textAlign: 'center' }}>
              <div style={{ borderBottom: '1px solid #000', width: 200, marginBottom: 4, height: 40 }}></div>
              (&nbsp;&nbsp;{j.nama || '................'}&nbsp;&nbsp;)
              <div style={{ fontWeight: 700, marginTop: 2 }}>Jamaah JM Travel</div>
            </div>
          </div>
        </div>
        );
      })}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .sheet { box-shadow: none !important; margin: 0 auto !important; page-break-after: always; width: 100% !important; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>
    </div>
  );
}
