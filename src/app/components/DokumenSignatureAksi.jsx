'use client';
import { useEffect, useState } from 'react';
import TombolWA from '@/app/components/TombolWA';
import { pesanDokumenMenungguTtd } from '@/lib/waTemplates';

const FASE_LABEL = {
  draft: 'Memproses...',
  materai_pending: 'Membeli materai digital...',
  materai_selesai: 'Materai terpasang, mengirim TTD...',
  materai_gagal: 'Materai gagal — coba lagi',
  ttd_terkirim: 'Mengirim ke provider TTD...',
  ttd_menunggu: 'Menunggu tanda tangan',
  selesai: 'Selesai ditandatangani',
  gagal: 'Gagal — coba lagi',
  dibatalkan: 'Dibatalkan',
};
const FASE_WARNA = {
  ttd_menunggu: { bg: '#FEF3DC', fg: '#7a5500' },
  selesai: { bg: '#ecfdf5', fg: '#047857' },
  materai_gagal: { bg: '#fef2f2', fg: '#b91c1c' },
  gagal: { bg: '#fef2f2', fg: '#b91c1c' },
};
const RANGKAP_LABEL = {
  travel: 'Rangkap 1 — Untuk JM Travel (TTD Perwakilan)',
  luar: 'Rangkap 2 — Untuk Perwakilan (TTD JM Travel)',
};

// 1 sesi = 1 baris dokumen_signature. SPKA-Ins bisa punya 2 baris sekaligus
// (rangkap 'travel'/'luar', lihat src/lib/materaiRule.js) — dokumen lain
// cuma 1 baris ('tunggal'). Dipisah jadi komponen sendiri biar gampang
// diulang tanpa duplikasi kalau ada >1 sesi.
function PanelSesi({ sig, onSelesai, loading }) {
  const warna = FASE_WARNA[sig.fase] || { bg: '#F5F8FE', fg: '#1A4FA0' };
  return (
    <div style={{ display: 'inline-block', marginTop: 10, marginLeft: 4, marginRight: 4, padding: '8px 16px', borderRadius: 10, fontSize: 12, background: warna.bg, color: warna.fg, textAlign: 'left' }}>
      {sig.rangkap !== 'tunggal' && (
        <div style={{ fontSize: 10, fontWeight: 700, color: '#C9952A', marginBottom: 2 }}>{RANGKAP_LABEL[sig.rangkap] || sig.rangkap}</div>
      )}
      <div style={{ fontWeight: 700 }}>{FASE_LABEL[sig.fase] || sig.fase}</div>
      {sig.perlu_materai ? <div>Materai: {sig.materai_kode_unik || 'menunggu'}</div> : null}
      {sig.fase === 'ttd_menunggu' && (
        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <a href={`/tanda-tangan/${sig.id}`} target="_blank" rel="noopener noreferrer"
            style={{ color: '#1A4FA0', fontWeight: 700 }}>Buka halaman TTD →</a>
          {sig.signer_wa && (
            <TombolWA nomor={sig.signer_wa} label="Kirim WA"
              pesan={pesanDokumenMenungguTtd({
                namaSigner: sig.signer_nama,
                dokumen: sig.dokumen,
                linkTtd: typeof window !== 'undefined' ? `${window.location.origin}/tanda-tangan/${sig.id}` : '',
              })} />
          )}
          <button onClick={() => onSelesai(sig.id)} disabled={loading}
            style={{ background: 'none', border: '1px solid #7a5500', color: '#7a5500', borderRadius: 12, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
            Tandai Selesai (mock)
          </button>
        </div>
      )}
      {sig.fase === 'selesai' && sig.pdf_final_path && (
        <div style={{ marginTop: 6 }}>
          <a href={sig.pdf_final_path} target="_blank" rel="noopener noreferrer" style={{ color: '#047857', fontWeight: 700 }}>
            📄 Unduh PDF Final →
          </a>
        </div>
      )}
    </div>
  );
}

// Action bar dipakai bareng di 4 halaman cetak (SPKA-Ins, Perjanjian Jamaah,
// Formulir Pendaftaran, Invoice) — 2 pilihan: cetak fisik (alur lama, tidak
// berubah) atau kirim TTD digital (alur baru, lihat
// /api/admin/dokumen-signature). Nggak nge-hardcode logic per jenis dokumen,
// cuma beda `dokumen`/`refId` yang dioper dari pemanggil.
export default function DokumenSignatureAksi({ dokumen, refId, onCetakFisik, hideCetakFisik }) {
  const [sigs, setSigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function muatStatus() {
    fetch(`/api/admin/dokumen-signature?dokumen=${dokumen}&ref_id=${refId}`)
      .then(r => r.json())
      .then(d => setSigs(d.signatures || []))
      .catch(() => {});
  }

  useEffect(() => { if (refId) muatStatus(); }, [dokumen, refId]);

  async function kirimDigital() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/dokumen-signature', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dokumen, ref_id: refId, metode: 'digital' }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Gagal mengirim'); setLoading(false); return; }
      muatStatus();
    } catch { setError('Terjadi kesalahan'); }
    setLoading(false);
  }

  async function tandaiSelesaiMock(id) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/dokumen-signature/${id}/selesaikan`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Gagal menyelesaikan'); setLoading(false); return; }
      muatStatus();
    } catch { setError('Terjadi kesalahan'); }
    setLoading(false);
  }

  const sudahDigital = sigs.some(s => s.metode === 'digital');
  const sudahFisik = sigs.some(s => s.metode === 'fisik');

  return (
    <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {!hideCetakFisik && (
          <button onClick={onCetakFisik}
            style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            🖨️ Cetak untuk TTD Fisik
          </button>
        )}
        <button onClick={kirimDigital} disabled={loading || sudahDigital}
          style={{ background: '#C9952A', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: loading ? 0.6 : 1 }}>
          ✍️ Kirim TTD Digital{dokumen === 'spka_ins' ? ' (2 Rangkap)' : ''}
        </button>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{error}</div>}

      {sudahDigital && (
        <div>
          {sigs.filter(s => s.metode === 'digital').map(s => (
            <PanelSesi key={s.id} sig={s} onSelesai={tandaiSelesaiMock} loading={loading} />
          ))}
        </div>
      )}
      {sudahFisik && !sudahDigital && (
        <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>📝 Dicatat sebagai jalur TTD fisik.</div>
      )}
    </div>
  );
}
