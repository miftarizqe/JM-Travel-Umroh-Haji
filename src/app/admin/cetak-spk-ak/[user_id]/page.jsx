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

function PrintBtn({ user, nomor }) {
  return (
    <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
      <button onClick={() => window.print()}
        style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
        🖨️ Print / Save PDF
      </button>
      <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        {user.name} · Nomor {nomor} · Cetak 2 rangkap (materai masing-masing) · di dialog print pilih &quot;Save as PDF&quot;
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
        .sheet { box-shadow: none !important; margin: 0 auto !important; width: 100% !important; }
      }
      @page { size: A4; margin: 15mm; }
    `}</style>
  );
}

export default function CetakSpkAk() {
  const params = useParams();
  const router = useRouter();
  const userId = params.user_id;
  const [data, setData] = useState(null);
  const [pengaturan] = usePengaturan();
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);
  const [pesanDitolak, setPesanDitolak] = useState('');

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }

    // Akses (admin ATAU si jamaah sendiri) sudah divalidasi server-side di
    // GET /api/admin/cetak-spk-ak/[user_id] — 403 dari situ yang jadi
    // sumber kebenaran "ditolak", bukan cek role di sini (biar gak dobel
    // logic auth client vs server).
    fetch(`/api/admin/cetak-spk-ak/${userId}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { setDitolak(true); setPesanDitolak(d.error || 'Akses ditolak.'); setLoading(false); return; }
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
      <p style={{ color: '#666', fontSize: 14 }}>{pesanDitolak}</p>
      <button onClick={() => router.back()} style={{ marginTop: 16, background: '#1A4FA0', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 20, cursor: 'pointer' }}>
        ← Kembali
      </button>
    </div>
  );

  if (!data) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Akun tidak ditemukan.</div>;

  function tandaiTerunggah(path) {
    setData(d => ({ ...d, user: { ...d.user, dokumen_spk_ak_fisik_path: path, dokumen_spk_ak_fisik_uploaded_at: new Date().toISOString() } }));
  }

  const { user, hop, nomor, pasal, signer, target } = data;
  const mergeData = {
    bank_agen: user.bank, rekening_agen: user.no_rekening, nama_rekening_agen: user.nama_pemilik_rekening,
    target_minat: target?.target_minat || '(belum ditentukan)',
    target_estimasi_harga: target?.target_estimasi_harga ? Number(target.target_estimasi_harga).toLocaleString('id-ID') : '________',
  };
  const namaPenandatangan = signer?.nama || 'Ahmad Zaky Arief Bestary';
  const jabatanPenandatangan = signer?.jabatan || 'Direktur Pengembangan Bisnis & Sumber Daya Manusia';
  // Head of Program belum ditunjuk di Pengaturan — Pihak Ketiga fallback
  // mewakili JM Travel sendiri, sama pola fallback perekrutEfektif SPKA-Ins.
  const hopEfektif = hop || {
    name: namaPenandatangan, nik: '-', alamat: '(mewakili PT. Alkhalid Jaya Megah)', wa: '-',
  };
  const tglGabung = new Date(user.created_at);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <PrintBtn user={user} nomor={nomor} />
      <DokumenSignatureAksi dokumen="spk_ak" refId={user.id} onCetakFisik={() => window.print()} hideCetakFisik />
      <UploadScanDokumen label="Dokumen fisik (2 rangkap, materai silang)" uploadUrl="/api/admin/upload-dokumen-sahabat-fisik"
        userId={user.id} path={user.dokumen_spk_ak_fisik_path} uploadedAt={user.dokumen_spk_ak_fisik_uploaded_at}
        extraFields={{ jenis: 'spk_ak' }} onUploaded={tandaiTerunggah} />
      <div className="sheet" style={{ background: '#fff', width: 760, minHeight: '29.7cm', margin: '0 auto', padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', fontFamily: FONT_DOKUMEN, fontSize: UKURAN_DOKUMEN.normal, lineHeight: 1.6, color: '#111' }}>
        <KopPasalDokumen pengaturan={pengaturan} />

        <div style={{ textAlign: 'center', fontSize: UKURAN_DOKUMEN.judul, fontWeight: 800 }}>SURAT PERJANJIAN JAMAAH UMROH</div>
        <div style={{ textAlign: 'center', fontSize: UKURAN_DOKUMEN.judul, fontWeight: 800 }}>PROGRAM SAHABAT BAITULLAH</div>
        <div style={{ textAlign: 'center', fontSize: UKURAN_DOKUMEN.nomor, marginBottom: 18 }}>Nomor: {nomor}</div>

        <p>
          Pada hari {HARI[tglGabung.getDay()]}, tanggal {tglIndo(tglGabung)}, bertempat di Jakarta, kami yang bertanda tangan dibawah ini :
        </p>

        <div style={{ fontWeight: 700, marginTop: 10 }}>Pihak Pertama (Penyelenggara Umroh & Haji)</div>
        <Field label="Nama Perusahaan" value="PT. Alkhalid Jaya Megah" />
        <Field label="No. Izin PPIU/PIHK" value="SK PPIU No.921 Tahun 2017 / SK PHIK No.35 Tahun 2019" />
        <Field label="Diwakilkan oleh" value={namaPenandatangan} />
        <Field label="Jabatan" value={jabatanPenandatangan} />

        <div style={{ fontWeight: 700, marginTop: 12 }}>Pihak Kedua (Jamaah Sahabat Baitullah)</div>
        <Field label="Nama" value={user.name} />
        <Field label="NIK" value={user.nik} />
        <Field label="Alamat" value={user.alamat} />
        <Field label="No. Telepon" value={user.wa} />
        <Field label="No. Paspor" value={user.no_paspor} />

        <div style={{ fontWeight: 700, marginTop: 12 }}>Pihak Ketiga (Head of Program)</div>
        <Field label="Nama" value={hopEfektif.name} />
        <Field label="NIK" value={hopEfektif.nik} />
        <Field label="Alamat" value={hopEfektif.alamat} />
        <Field label="No. Telepon" value={hopEfektif.wa} />

        <p style={{ marginTop: 12 }}>
          PARA PIHAK sepakat untuk mengikatkan diri dalam Perjanjian Perjalanan Ibadah Umroh Program Sahabat Baitullah dengan ketentuan sebagai berikut:
        </p>

        {!pasal ? (
          <div style={{ color: '#999', marginTop: 18 }}>Memuat isi pasal...</div>
        ) : pasal.map(p => (
          <div key={p.nomor}>
            {renderPasalBlock(p, mergeData)}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, breakInside: 'avoid' }}>
          <TtdBoxHtml pihak="PIHAK PERTAMA" sub="PT. Alkhalid Jaya Megah" nama={namaPenandatangan} />
          <TtdBoxHtml pihak="PIHAK KEDUA" sub="Jamaah Sahabat Baitullah" nama={user.name} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 30 }}>
          <TtdBoxHtml pihak="PIHAK KETIGA" sub="Head of Program" nama={hopEfektif.name} width={300} />
        </div>
      </div>
      <PrintStyle />
    </div>
  );
}
