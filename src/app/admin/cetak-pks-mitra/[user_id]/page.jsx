'use client';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import PdfDokumenResmi from '@/app/components/PdfDokumenResmi';
import UploadScanDokumen from '@/app/components/UploadScanDokumen';
import DokumenSignatureAksi from '@/app/components/DokumenSignatureAksi';

// Cetak Surat Perjanjian Kerja Sama Perwakilan (SPKA-Ins) — PDF template
// resmi 2 rangkap (bukan lagi render HTML dari pasal DB, dikonfirmasi user
// 2026-10-18, mirror cetak-spk-ak). Akses admin/super_admin only (dijaga
// di API /api/admin/cetak-spka-ins & /api/admin/cetak-pks).
export default function CetakPksMitra() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Memuat...</div>}>
      <CetakPksMitraInner />
    </Suspense>
  );
}

function CetakPksMitraInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = params.user_id;
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);

  const rangkap = searchParams.get('rangkap') === 'management' ? 'management' : 'perwakilan';
  const gantiRangkap = (r) => router.push(`/admin/cetak-pks-mitra/${userId}?rangkap=${r}`);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }
    const admin = JSON.parse(u);

    fetch(`/api/admin/cetak-pks/${userId}`)
      .then(r => r.json())
      .then(d => {
        if (admin.role !== 'admin' && admin.role !== 'super_admin') { setDitolak(true); setLoading(false); return; }
        setUser(d.user || null); setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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

  if (!user) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Akun tidak ditemukan.</div>;

  function tandaiTerunggah(path) {
    setUser(u => ({ ...u, dokumen_pks_fisik_path: path, dokumen_pks_fisik_uploaded_at: new Date().toISOString() }));
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ textAlign: 'center', fontWeight: 700, color: '#0E2F6E', marginBottom: 4 }}>
          🖨️ Surat Perjanjian Kerja Sama Perwakilan — {user.name}
        </div>
        <div className="flex gap-2 justify-center" style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '10px 0' }}>
          <button onClick={() => gantiRangkap('perwakilan')}
            style={{ fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', background: rangkap === 'perwakilan' ? '#1A4FA0' : '#f3f4f6', color: rangkap === 'perwakilan' ? '#fff' : '#6b7280' }}>
            Rangkap Perwakilan
          </button>
          <button onClick={() => gantiRangkap('management')}
            style={{ fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', background: rangkap === 'management' ? '#1A4FA0' : '#f3f4f6', color: rangkap === 'management' ? '#fff' : '#6b7280' }}>
            Rangkap Management
          </button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>
          {rangkap === 'management'
            ? 'Rangkap buat kantor JM Travel.'
            : 'Rangkap buat Perwakilan — sama persis yang dipegang Perwakilan.'}
        </div>

        {/* Kirim TTD Digital DICABUT (dikonfirmasi user 2026-10-12) — praktik sekarang
            100% fisik. Mirror Perjanjian Jamaah. */}
        <DokumenSignatureAksi dokumen="spka_ins" refId={user.id} onCetakFisik={() => {}} hideCetakFisik hideKirimDigital />
        <UploadScanDokumen label="Dokumen fisik" uploadUrl="/api/admin/upload-dokumen-pks-fisik" userId={user.id} path={user.dokumen_pks_fisik_path} uploadedAt={user.dokumen_pks_fisik_uploaded_at} onUploaded={tandaiTerunggah} />

        <PdfDokumenResmi url={`/api/admin/cetak-spka-ins/${userId}?rangkap=${rangkap}`} tinggi="80vh" />
      </div>
    </div>
  );
}
