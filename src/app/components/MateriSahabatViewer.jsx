'use client';
import { useEffect, useState } from 'react';

// Viewer slide "Materi Presentasi" Sahabat Baitullah — dipakai bareng oleh
// admin (preview sebelum publish) & anggota sahabat (lihat materi aktif).
// Gambar SELALU diambil lewat fetch()+blob URL (bukan <img src="/api/...">
// langsung) supaya alamat gambar yang beneran gak pernah nampil di HTML —
// blob: URL cuma valid di tab ini & hilang begitu viewer ditutup. Watermark
// nama+kode_unik penampil dioverlay transparan di atas gambar sebagai jejak
// kalau sampai ada yang nekat screenshot & sebarin ulang.
export default function MateriSahabatViewer({ materi, user, onClose }) {
  const [idx, setIdx] = useState(0);
  const [blobUrl, setBlobUrl] = useState(null);
  const slides = materi.slides || [];

  useEffect(() => {
    let revoke = null;
    let cancelled = false;
    if (slides[idx]) {
      fetch(`/api/sahabat/materi/${materi.id}/slide/${slides[idx].id}`)
        .then(r => r.blob())
        .then(b => {
          if (cancelled) return;
          const url = URL.createObjectURL(b);
          revoke = url;
          setBlobUrl(url);
        });
    }
    return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, materi.id]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
        <div className="text-white text-sm font-bold mb-2">{materi.judul}</div>
        {blobUrl ? (
          <img src={blobUrl} alt="" className="w-full rounded-lg select-none" draggable={false} />
        ) : (
          <div className="w-full aspect-video bg-white/10 rounded-lg animate-pulse" />
        )}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-white/25 text-2xl font-bold rotate-[-20deg] text-center leading-tight">
            {user?.name}<br />{user?.kode_unik}
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 text-white text-sm">
          <button disabled={idx === 0} onClick={() => setIdx(i => i - 1)} className="disabled:opacity-30 font-bold">← Sebelumnya</button>
          <span>{idx + 1} / {slides.length}</span>
          <button disabled={idx >= slides.length - 1} onClick={() => setIdx(i => i + 1)} className="disabled:opacity-30 font-bold">Berikutnya →</button>
        </div>
        <div className="text-center text-white/50 text-[10px] mt-2">Hanya untuk dilihat — dilarang diunduh atau disebarluaskan</div>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white text-sm font-bold">✕ Tutup</button>
      </div>
    </div>
  );
}
