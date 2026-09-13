'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { renderPasalBlock, KopPasalDokumen, TtdBoxHtml, FONT_DOKUMEN, UKURAN_DOKUMEN } from '@/lib/pasalMarkup';
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
    <div style={{ display: 'flex', marginBottom: 3 }}>
      <div style={{ width: 100, flexShrink: 0 }}>{label}</div>
      <div style={{ width: 10 }}>:</div>
      <div style={{ flex: 1, borderBottom: '1px dotted #999', minHeight: 16 }}>{value || ''}</div>
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
      @page { size: A4; margin: 15mm; }
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
      <div className="sheet" style={{ background: '#fff', width: 760, minHeight: '29.7cm', margin: '0 auto', padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', fontFamily: FONT_DOKUMEN, fontSize: UKURAN_DOKUMEN.normal, lineHeight: 1.6, color: '#111' }}>
        <KopPasalDokumen pengaturan={pengaturan} />

        <div style={{ textAlign: 'center', fontSize: UKURAN_DOKUMEN.judul, fontWeight: 800 }}>SURAT PERJANJIAN KERJA SAMA PERWAKILAN</div>
        <div style={{ textAlign: 'center', fontSize: UKURAN_DOKUMEN.nomor, marginBottom: 18 }}>Nomor: {nomor}</div>

        <p>
          Pada hari {HARI[tglGabungP.getDay()]}, tanggal {tglIndo(tglGabungP)}, bertempat di Jakarta, kami yang bertanda tangan dibawah ini :
        </p>

        <div style={{ fontWeight: 700, marginTop: 10 }}>Pihak Pertama (Penyelenggara Umroh & Haji)</div>
        <Field label="Nama Perusahaan" value="PT. Alkhalid Jaya Megah" />
        <Field label="No. Izin PPIU/PIHK" value="SK PPIU No.921 Tahun 2017 / SK PHIK No.35 Tahun 2019" />
        <Field label="Diwakilkan oleh" value={namaPenandatangan} />
        <Field label="Jabatan" value={jabatanPenandatangan} />

        <div style={{ fontWeight: 700, marginTop: 12 }}>Pihak Kedua (Perwakilan)</div>
        <Field label="Nama" value={user.name} />
        <Field label="NIK" value={user.nik} />
        <Field label="Alamat" value={user.alamat} />
        <Field label="No. Telepon" value={user.wa} />

        <div style={{ fontWeight: 700, marginTop: 12 }}>Pihak Ketiga (Perekrut)</div>
        <Field label="Nama" value={perekrutEfektif.name} />
        <Field label="NIK" value={perekrutEfektif.nik} />
        <Field label="Alamat" value={perekrutEfektif.alamat} />
        <Field label="No. Telepon" value={perekrutEfektif.wa} />

        <p style={{ marginTop: 12 }}>
          PIHAK PERTAMA dan PIHAK KEDUA selanjutnya secara bersama-sama disebut <b>PARA PIHAK</b>, sepakat untuk mengikatkan diri dalam Perjanjian Kerja Sama dengan ketentuan sebagai berikut:
        </p>

        {!pasal ? (
          <div style={{ color: '#999', marginTop: 18 }}>Memuat isi pasal...</div>
        ) : pasal.map(p => (
          <div key={p.nomor}>
            {renderPasalBlock(p, { bank_agen: user.bank, rekening_agen: user.no_rekening, nama_rekening_agen: user.nama_pemilik_rekening })}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, breakInside: 'avoid' }}>
          <TtdBoxHtml pihak="PIHAK PERTAMA" sub="PT. Alkhalid Jaya Megah" nama={namaPenandatangan} />
          <TtdBoxHtml pihak="PIHAK KEDUA" sub="Perwakilan" nama={user.name} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 30 }}>
          <TtdBoxHtml pihak="PIHAK KETIGA" sub="Perekrut" nama={perekrutEfektif.name} width={300} />
        </div>
      </div>
      <PrintStyle />
    </div>
  );
}
