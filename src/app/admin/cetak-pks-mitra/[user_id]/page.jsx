'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { renderPasalMarkup } from '@/lib/pasalMarkup';
import { usePengaturan } from '@/lib/usePengaturan';
import UploadScanDokumen from '@/app/components/UploadScanDokumen';
import DokumenSignatureAksi from '@/app/components/DokumenSignatureAksi';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function tglIndo(d) {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', fontSize: 12, marginBottom: 3 }}>
      <div style={{ width: 100, flexShrink: 0 }}>{label}</div>
      <div style={{ width: 10 }}>:</div>
      <div style={{ flex: 1, borderBottom: '1px dotted #999', minHeight: 16 }}>{value || ''}</div>
    </div>
  );
}

// Render semua pasal 1 dokumen legal — nomor, judul, isi sesuai sintaks di
// /admin/pasal (lihat migration-dokumen-pasal.sql).
function Pasal({ pasal, mergeData }) {
  if (!pasal) return <div style={{ fontSize: 12, color: '#999', marginTop: 18 }}>Memuat isi pasal...</div>;
  return pasal.map(p => (
    <div key={p.nomor} style={{ marginTop: 18 }}>
      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 12.5 }}>PASAL {p.nomor}</div>
      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 12.5, marginBottom: 8 }}>{p.judul}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.6 }}>{renderPasalMarkup(p.isi, mergeData)}</div>
    </div>
  ));
}

function Kop({ pengaturan }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1A4FA0', paddingBottom: 10, marginBottom: 20 }}>
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

function tglIndoJam(t) {
  const d = new Date(t);
  return `${tglIndo(d)} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

function PrintBtn({ user, nomor, dibekukan, dibekukanAt }) {
  return (
    <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
      <button onClick={() => window.print()}
        style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
        🖨️ Print / Save PDF
      </button>
      <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        {user.name} · Nomor {nomor} · di dialog print pilih &quot;Save as PDF&quot;
      </div>
      <div style={{ fontSize: 11, marginTop: 4, color: dibekukan ? '#047857' : '#b45309' }}>
        {dibekukan ? `🔒 Isi dibekukan pada ${tglIndoJam(dibekukanAt)} — gak berubah walau pasal diedit lagi` : '🔓 Belum dibekukan — isi masih ikut versi pasal terbaru'}
      </div>
    </div>
  );
}

function PrintStyle() {
  return (
    <style>{`
      @media print {
        .no-print { display: none !important; }
        body { background: #fff !important; }
        .sheet { box-shadow: none !important; margin: 0 auto !important; page-break-after: always; width: 100% !important; }
      }
    `}</style>
  );
}

export default function CetakPksMitra() {
  const params = useParams();
  const router = useRouter();
  const userId = params.user_id;
  const [data, setData] = useState(null);
  const [pengaturan] = usePengaturan();
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);
  const [pasal, setPasal] = useState(null);
  const [signer, setSigner] = useState(null);
  const [dibekukan, setDibekukan] = useState(false);
  const [dibekukanAt, setDibekukanAt] = useState(null);

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

  useEffect(() => {
    if (!data) return;
    fetch(`/api/admin/pasal?dokumen=spka_ins&ref_id=${userId}`)
      .then(r => r.json())
      .then(d => {
        setPasal(d.pasal || []);
        setSigner(d.signer || null);
        setDibekukan(!!d.dibekukan);
        setDibekukanAt(d.dibekukan_at || null);
      })
      .catch(() => setPasal([]));
  }, [data]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat data...</div>;

  if (ditolak) return (
    <div style={{ padding: 40, fontFamily: 'Arial', textAlign: 'center' }}>
      <h2 style={{ color: '#dc2626' }}>🔒 Akses Ditolak</h2>
      <p style={{ color: '#666', fontSize: 14 }}>Cetak perjanjian kerjasama hanya dapat diakses oleh admin.</p>
      <button onClick={() => router.back()} style={{ marginTop: 16, background: '#1A4FA0', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 20, cursor: 'pointer' }}>
        ← Kembali
      </button>
    </div>
  );

  if (!data) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Akun tidak ditemukan.</div>;

  function tandaiTerunggah(path) {
    setData(d => ({ ...d, user: { ...d.user, dokumen_pks_fisik_path: path, dokumen_pks_fisik_uploaded_at: new Date().toISOString() } }));
  }

  const { user, perekrut, nomor } = data;
  // Nama penandatangan PIHAK PERTAMA — dari snapshot (kalau dokumen ini
  // udah dibekukan) atau live Pengaturan Umum (fallback selagi belum
  // dibekukan / masih loading).
  const namaPenandatangan = signer?.nama || 'Ahmad Zaky Arief Bestary';
  const jabatanPenandatangan = signer?.jabatan || 'Direktur Pengembangan Bisnis & Sumber Daya Manusia';
  // Kalau daftar mandiri (gak ada perekrut_id), Pihak Ketiga di surat
  // otomatis jadi Pihak Pertama sendiri (mewakili perusahaan) — bukan
  // dikosongin, karena tetap harus ada yang bertindak sebagai perekrut
  // secara formal di dokumen.
  const perekrutEfektif = perekrut || {
    name: namaPenandatangan,
    nik: '-',
    alamat: '(mewakili PT. Alkhalid Jaya Megah)',
    wa: '-',
  };
  // SPKA-Ins — Surat Perjanjian Kerja Sama Perwakilan. 15 pasal, fokus
  // institusi/lembaga — transparansi dana, tata kelola, dst. Gak ada blok
  // "Mengetahui Head of Agency" di draft resminya (itu cuma ada di SPKA
  // agen lama, sudah dihapus dari sistem bareng role agen).
  const tglGabungP = new Date(user.created_at);
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <PrintBtn user={user} nomor={nomor} dibekukan={dibekukan} dibekukanAt={dibekukanAt} />
      <DokumenSignatureAksi dokumen="spka_ins" refId={user.id} onCetakFisik={() => window.print()} hideCetakFisik />
      <UploadScanDokumen label="Dokumen fisik" uploadUrl="/api/admin/upload-dokumen-pks-fisik" userId={user.id} path={user.dokumen_pks_fisik_path} uploadedAt={user.dokumen_pks_fisik_uploaded_at} onUploaded={tandaiTerunggah} />
      <div className="sheet" style={{ background: '#fff', width: 760, margin: '0 auto', padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
        <Kop pengaturan={pengaturan} />

        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 800 }}>SURAT PERJANJIAN KERJA SAMA PERWAKILAN</div>
        <div style={{ textAlign: 'center', fontSize: 11.5, marginBottom: 18 }}>Nomor: {nomor}</div>

        <p style={{ fontSize: 12, lineHeight: 1.6 }}>
          Pada hari {HARI[tglGabungP.getDay()]}, tanggal {tglIndo(tglGabungP)}, bertempat di Jakarta, kami yang bertanda tangan dibawah ini :
        </p>

        <div style={{ fontWeight: 700, fontSize: 12, marginTop: 10 }}>Pihak Pertama (Penyelenggara Umroh & Haji)</div>
        <Field label="Nama Perusahaan" value="PT. Alkhalid Jaya Megah" />
        <Field label="No. Izin PPIU/PIHK" value="SK PPIU No.921 Tahun 2017 / SK PHIK No.35 Tahun 2019" />
        <Field label="Diwakilkan oleh" value={namaPenandatangan} />
        <Field label="Jabatan" value={jabatanPenandatangan} />

        <div style={{ fontWeight: 700, fontSize: 12, marginTop: 12 }}>Pihak Kedua (Perwakilan)</div>
        <Field label="Nama" value={user.name} />
        <Field label="NIK" value={user.nik} />
        <Field label="Alamat" value={user.alamat} />
        <Field label="No. Telepon" value={user.wa} />

        <div style={{ fontWeight: 700, fontSize: 12, marginTop: 12 }}>Pihak Ketiga (Perekrut)</div>
        <Field label="Nama" value={perekrutEfektif.name} />
        <Field label="NIK" value={perekrutEfektif.nik} />
        <Field label="Alamat" value={perekrutEfektif.alamat} />
        <Field label="No. Telepon" value={perekrutEfektif.wa} />

        <p style={{ fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
          PIHAK PERTAMA dan PIHAK KEDUA selanjutnya secara bersama-sama disebut <b>PARA PIHAK</b>, sepakat untuk mengikatkan diri dalam Perjanjian Kerja Sama dengan ketentuan sebagai berikut:
        </p>

        <Pasal pasal={pasal} mergeData={{ bank_agen: user.bank, rekening_agen: user.no_rekening, nama_rekening_agen: user.nama_pemilik_rekening }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, fontSize: 12 }}>
          <div style={{ textAlign: 'center', width: '45%' }}>
            <div>PIHAK PERTAMA</div>
            <div style={{ fontWeight: 700 }}>PT. Alkhalid Jaya Megah</div>
            <div style={{ height: 70 }}></div>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>({namaPenandatangan})</div>
          </div>
          <div style={{ textAlign: 'center', width: '45%' }}>
            <div>PIHAK KEDUA</div>
            <div style={{ fontWeight: 700 }}>Perwakilan</div>
            <div style={{ height: 70 }}></div>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>({user.name})</div>
          </div>
        </div>

        <div style={{ marginTop: 30, fontSize: 12 }}>
          <div style={{ display: 'inline-block', textAlign: 'center' }}>
            <div>PIHAK KETIGA</div>
            <div style={{ fontWeight: 700 }}>Perekrut</div>
            <div style={{ height: 70 }}></div>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>({perekrutEfektif.name})</div>
          </div>
        </div>
      </div>
      <PrintStyle />
    </div>
  );
}
