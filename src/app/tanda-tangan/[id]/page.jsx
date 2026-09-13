'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';

// Label tampilan — key dokumen di database TIDAK ikut berubah (dokumen lama
// yang sudah ditandatangani gak perlu migrasi), cuma teks yang ditampilkan.
const DOKUMEN_LABEL = {
  spka_ins: 'SPK-PWK — Surat Perjanjian Kerja Sama Perwakilan',
  jamaah: 'Surat Perjanjian Jamaah Umroh',
  formulir: 'Formulir Pendaftaran Perwakilan',
  invoice: 'Invoice/Kwitansi',
  spk_ak: 'Surat Perjanjian Jamaah Umroh — Program Sahabat Baitullah',
  sk_cif: 'SK-CIF — Surat Keterangan CIF',
  surat_pemblokiran: 'Surat Pernyataan Kuasa Blokir Rekening & Instruksi Pemindahbukuan',
};
const RANGKAP_LABEL = {
  travel: 'Rangkap 1 — Untuk JM Travel',
  luar: 'Rangkap 2 — Untuk Perwakilan',
};

// Halaman signer-facing — link dikirim via notifikasi/WA ke penandatangan.
// Sekarang cuma mock (tombol "Tanda Tangan Sekarang" langsung menyelesaikan
// sesi) — begitu provider tersertifikasi (Privy/Digisign/dst) terhubung,
// tombol ini diganti redirect ke hosted-signing-page provider tsb.
export default function TandaTanganPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const [sig, setSig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [memproses, setMemproses] = useState(false);
  const [error, setError] = useState(null);

  function muat() {
    fetch(`/api/dokumen-signature/${id}`)
      .then(r => r.json())
      .then(d => { setSig(d.signature || null); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function tandaTanganSekarang() {
    setMemproses(true); setError(null);
    try {
      const res = await fetch(`/api/dokumen-signature/${id}/selesaikan`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Gagal menyelesaikan tanda tangan'); setMemproses(false); return; }
      muat();
    } catch { setError('Terjadi kesalahan'); }
    setMemproses(false);
  }

  if (loading) return <Layout title="✍️ Tanda Tangan Digital" showBack><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;
  if (!sig) return <Layout title="✍️ Tanda Tangan Digital" showBack><div className="text-center text-gray-400 py-10">Sesi tanda tangan tidak ditemukan.</div></Layout>;

  const pdfUrl = sig.pdf_final_path || sig.pdf_bermaterai_path || sig.pdf_awal_path;

  return (
    <Layout title="✍️ Tanda Tangan Digital" showBack>
      <div className="max-w-xl mx-auto space-y-4">
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5">
          <div className="font-bold text-[#0E2F6E] mb-1">{DOKUMEN_LABEL[sig.dokumen] || sig.dokumen}</div>
          {sig.rangkap && sig.rangkap !== 'tunggal' && (
            <div className="text-xs font-bold text-[#C9952A] mb-1">{RANGKAP_LABEL[sig.rangkap] || sig.rangkap}</div>
          )}
          <div className="text-xs text-gray-400 mb-3">Provider: {sig.ttd_provider === 'mock' ? 'Mock — belum terhubung provider tersertifikasi' : (sig.ttd_provider || '-')}</div>

          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
              className="inline-block text-sm font-bold text-[#1A4FA0] mb-4">📄 Lihat dokumen (PDF) →</a>
          )}

          {sig.fase === 'selesai' ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <div className="text-2xl mb-1">✅</div>
              <div className="font-bold text-green-700">Sudah ditandatangani</div>
              <div className="text-xs text-green-600 mt-1">Selesai pada {new Date(sig.completed_at).toLocaleString('id-ID')}</div>
              {sig.dokumen === 'formulir' && (
                <button onClick={() => router.push('/pks?jenis=perwakilan')}
                  className="mt-3 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold px-5 py-2.5 rounded-full text-sm">
                  Lanjutkan ke Persetujuan Kerjasama →
                </button>
              )}
              {sig.dokumen === 'spk_ak' && (
                <button onClick={() => router.push('/status-pendaftaran-sahabat')}
                  className="mt-3 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold px-5 py-2.5 rounded-full text-sm">
                  Lanjutkan Pendaftaran Sahabat Baitullah →
                </button>
              )}
            </div>
          ) : sig.fase === 'ttd_menunggu' ? (
            <div className="bg-[#E8F0FB] rounded-lg p-4 text-center">
              <div className="text-sm text-[#0E2F6E] mb-3">
                Silakan baca dokumen di atas, lalu klik tombol di bawah untuk menandatangani secara elektronik.
              </div>
              <button onClick={tandaTanganSekarang} disabled={memproses}
                className="bg-[#C9952A] hover:bg-yellow-600 text-white font-bold px-6 py-2.5 rounded-full text-sm disabled:opacity-50">
                {memproses ? 'Memproses...' : '✍️ Tanda Tangan Sekarang'}
              </button>
              {error && <div className="text-red-600 text-xs mt-2">{error}</div>}
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center text-sm text-yellow-700">
              Status: {sig.fase} — dokumen sedang diproses, coba muat ulang halaman ini sesaat lagi.
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
