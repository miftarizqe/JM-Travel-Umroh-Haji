'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePengaturan } from '@/lib/usePengaturan';
import UploadScanDokumen from '@/app/components/UploadScanDokumen';
import DokumenSignatureAksi from '@/app/components/DokumenSignatureAksi';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function tglIndo(d) {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
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

function Field({ label, value, wajib }) {
  return (
    <div style={{ display: 'flex', fontSize: 12, marginBottom: 4 }}>
      <div style={{ width: 190, flexShrink: 0 }}>{label}{wajib && <span>*</span>}</div>
      <div style={{ width: 10 }}>:</div>
      <div style={{ flex: 1, borderBottom: '1px solid #000', minHeight: 17, paddingLeft: 4, fontWeight: 600 }}>{value || ''}</div>
    </div>
  );
}

export default function CetakFormulirMitra() {
  const params = useParams();
  const router = useRouter();
  const userId = params.user_id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);
  const [pengaturan] = usePengaturan();

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }
    const admin = JSON.parse(u);

    fetch(`/api/admin/cetak-pks/${userId}`)
      .then(r => r.json())
      .then(d => {
        if (admin.role !== 'admin' && admin.role !== 'super_admin') { setDitolak(true); setLoading(false); return; }
        if (!d.user) { setLoading(false); return; }
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat data...</div>;

  if (ditolak) return (
    <div style={{ padding: 40, fontFamily: 'Arial', textAlign: 'center' }}>
      <h2 style={{ color: '#dc2626' }}>🔒 Akses Ditolak</h2>
      <p style={{ color: '#666', fontSize: 14 }}>Cetak formulir pendaftaran hanya dapat diakses oleh admin.</p>
      <button onClick={() => router.back()} style={{ marginTop: 16, background: '#1A4FA0', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 20, cursor: 'pointer' }}>
        ← Kembali
      </button>
    </div>
  );

  if (!data) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Akun tidak ditemukan.</div>;

  function tandaiTerunggah(path) {
    setData(d => ({ ...d, user: { ...d.user, formulir_pendaftaran_fisik_path: path, formulir_pendaftaran_fisik_uploaded_at: new Date().toISOString() } }));
  }

  const { user } = data;
  const tglDaftar = new Date(user.created_at);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button onClick={() => window.print()}
          style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          🖨️ Print / Save PDF
        </button>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          {user.name} · di dialog print pilih &quot;Save as PDF&quot;
        </div>
      </div>

      <DokumenSignatureAksi dokumen="formulir" refId={user.id} onCetakFisik={() => window.print()} hideCetakFisik />

      <UploadScanDokumen label="Formulir fisik" uploadUrl="/api/admin/upload-formulir-fisik" userId={user.id}
        path={user.formulir_pendaftaran_fisik_path} uploadedAt={user.formulir_pendaftaran_fisik_uploaded_at} onUploaded={tandaiTerunggah} />

      <div className="sheet" style={{ background: '#fff', width: 760, margin: '0 auto', padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
        <Kop pengaturan={pengaturan} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <div style={{ fontSize: 11, textAlign: 'right' }}>
            <div>Nama Perwakilan: <b>{user.name}</b></div>
            <div>Kode Perwakilan: <b>{user.kode_unik || '-'}</b></div>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 17, fontWeight: 800, marginBottom: 16 }}>
          Formulir Pendaftaran <span>PERWAKILAN</span>
        </div>

        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Data Pribadi</div>
        <Field label="Nama Lengkap Sesuai KTP" wajib value={user.name} />
        <Field label="Nomor KTP" wajib value={user.nik} />
        <Field label="Tempat, Tanggal Lahir" wajib value={`${user.tempat_lahir || ''}${user.tempat_lahir && user.tanggal_lahir ? ', ' : ''}${user.tanggal_lahir ? tglIndo(new Date(user.tanggal_lahir)) : ''}`} />
        <Field label="Jenis Kelamin" wajib value={user.jenis_kelamin} />
        <Field label="Nama Gadis Ibu Kandung" wajib value={user.nama_ibu} />
        <Field label="Alamat sesuai KTP" wajib value={user.alamat_ktp || user.alamat} />
        <Field label="Alamat Domisili" wajib value={user.alamat_domisili || user.alamat} />
        <Field label="No. Whatsapp" wajib value={user.wa} />
        <Field label="Email Aktif" wajib value={user.email} />
        <Field label="Perekrut" wajib value={data.perekrut?.name || 'JM Travel'} />
        <Field label="Pekerjaan" value={user.pekerjaan} />
        <Field label="Nama Perusahaan" value="" />
        <Field label="Alamat Kantor" value="" />

        <p style={{ fontSize: 10.5, lineHeight: 1.5, marginTop: 14 }}>
          Dengan ini saya menyatakan bahwa seluruh data yang saya isikan dalam formulir ini adalah benar, lengkap, dan dapat dipertanggungjawabkan. Apabila di kemudian hari terdapat ketidaksesuaian data, saya bersedia menerima konsekuensi sesuai ketentuan yang berlaku. <b>*Mohon kirimkan foto KTP ke nomor Admin 0823 1057 2050</b>
        </p>

        <div style={{ marginTop: 10 }}>
          <Field label="Nama Bank" wajib value={user.bank} />
          <Field label="Nomor Rekening" wajib value={user.no_rekening} />
          <Field label="Nama Pemilik Rekening" wajib value={user.nama_pemilik_rekening} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, fontSize: 12 }}>
          <div style={{ textAlign: 'center', width: '45%' }}>
            <div>Jakarta, {tglIndo(tglDaftar)}</div>
            <div style={{ height: 70 }}></div>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>({user.name})</div>
            <div style={{ fontWeight: 700, marginTop: 2 }}>Perwakilan JM Travel</div>
          </div>
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
