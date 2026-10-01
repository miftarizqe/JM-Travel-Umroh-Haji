'use client';
import { useEffect, useRef, useState } from 'react';

// Tampilan "baca" dokumen legal resmi (SK-CIF, Surat Pemblokiran, SPK-AK,
// SPK-AK Non-Muslim) — SATU-SATUNYA sumber teksnya template PDF final di
// src/lib/pdfDokumen/templates/ (dikonfirmasi user 2026-10-01), BUKAN lagi
// pasal di database. Komponen ini ngambil PDF hasil BE (identitas sudah
// terisi), lalu nampilin di iframe. Dipakai semua role (Sahabat, admin,
// super_admin, Head of Program) biar yang dibaca = yang ditandatangani.
//
// props:
//   url      — endpoint BE yang membalas application/pdf
//   method   — 'GET' (default) atau 'POST'
//   tinggi   — tinggi iframe (default 70vh)
//   onSiap   — dipanggil sekali begitu PDF berhasil dimuat (mis. buka checkbox setuju)
export default function PdfDokumenResmi({ url, method = 'GET', tinggi = '70vh', onSiap }) {
  const [objUrl, setObjUrl] = useState(null);
  const [error, setError] = useState('');
  const onSiapRef = useRef(onSiap);
  onSiapRef.current = onSiap;

  useEffect(() => {
    if (!url) return;
    let batal = false;
    let dibuat = null;
    setObjUrl(null);
    setError('');
    fetch(url, { method })
      .then(async res => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Gagal memuat dokumen');
        }
        return res.blob();
      })
      .then(blob => {
        if (batal) return;
        dibuat = URL.createObjectURL(blob);
        setObjUrl(dibuat);
      })
      .catch(e => { if (!batal) setError(e.message || 'Gagal memuat dokumen'); });
    return () => { batal = true; if (dibuat) URL.revokeObjectURL(dibuat); };
  }, [url, method]);

  if (error) return <div className="text-center text-red-500 text-sm py-8 border border-red-100 bg-red-50 rounded-lg">{error}</div>;
  if (!objUrl) return <div className="text-center text-gray-400 text-sm py-10 border border-gray-200 rounded-lg">Memuat dokumen resmi...</div>;

  return (
    <div className="space-y-1.5">
      <iframe src={objUrl} title="Dokumen resmi" className="w-full border border-gray-200 rounded-lg bg-gray-50"
        style={{ height: tinggi }} onLoad={() => onSiapRef.current?.()} />
      <div className="text-right">
        <a href={objUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-[#1A4FA0] hover:underline">
          Buka di tab baru / cetak ↗
        </a>
      </div>
    </div>
  );
}
