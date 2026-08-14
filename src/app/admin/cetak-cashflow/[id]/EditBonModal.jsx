'use client';
import { useState } from 'react';
import Cropper from 'react-easy-crop';
import { getCroppedImg, rotateImage } from '@/lib/cropImage';

/**
 * Editor rotate/crop buat foto bon yang SUDAH terupload (beda dari
 * UploadBon.jsx yang ngedit file BARU sebelum diunggah) — dipakai dari
 * preview cetak-cashflow buat benerin foto bon yang kefoto miring/kepotong
 * tanpa perlu upload ulang dari HP. Alur & UI-nya sengaja disamain persis
 * kayak UploadBon.jsx biar konsisten sama editor yang udah ada.
 */
export default function EditBonModal({ imgSrc, namaAsli, onClose, onSaved }) {
  const [mode, setMode] = useState('rotate'); // 'rotate' | 'crop'
  const [rotation, setRotation] = useState(0);
  const [rotated, setRotated] = useState(null); // { url, width, height }
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropAspect, setCropAspect] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [memproses, setMemproses] = useState(false);

  async function bukaModeCrop() {
    setMemproses(true);
    try {
      const hasil = await rotateImage(imgSrc, rotation);
      setRotated(hasil);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCropAspect(hasil.width / hasil.height);
      setCroppedAreaPixels(null);
      setMode('crop');
    } catch { alert('Gagal memproses gambar'); }
    setMemproses(false);
  }

  function kembaliKeRotate() {
    if (rotated) URL.revokeObjectURL(rotated.url);
    setRotated(null);
    setMode('rotate');
  }

  async function unggahHasil(blob) {
    const namaDasar = (namaAsli || 'bon').replace(/\.[^.]+$/, '');
    const file = new File([blob], `${namaDasar}.jpg`, { type: 'image/jpeg' });
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload-bukti', { method: 'POST', body: fd });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Gagal unggah');
    setMemproses(false);
    onSaved({ bukti_path: d.path, bukti_nama: d.nama_asli });
  }

  async function simpanTanpaCrop() {
    setMemproses(true);
    try {
      const { blob } = await rotateImage(imgSrc, rotation);
      await unggahHasil(blob);
    } catch { alert('Gagal memproses gambar'); setMemproses(false); }
  }

  async function simpanHasilCrop() {
    if (!croppedAreaPixels) return;
    setMemproses(true);
    try {
      const blob = await getCroppedImg(rotated.url, croppedAreaPixels);
      await unggahHasil(blob);
    } catch { alert('Gagal memproses gambar'); setMemproses(false); }
  }

  function tutup() {
    if (rotated) URL.revokeObjectURL(rotated.url);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      {mode === 'rotate' && (
        <>
          <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgSrc} alt="Bon" style={{ transform: `rotate(${rotation}deg)` }}
              className="max-w-full max-h-full object-contain transition-transform" />
          </div>
          <div className="bg-black/90 p-4 space-y-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setRotation(r => (r - 90 + 360) % 360)}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-2 rounded-lg">⟲ Putar Kiri</button>
              <button type="button" onClick={() => setRotation(r => (r + 90) % 360)}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-2 rounded-lg">⟳ Putar Kanan</button>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={bukaModeCrop} disabled={memproses}
                className="flex-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl">✂️ Crop</button>
              <button type="button" onClick={simpanTanpaCrop} disabled={memproses}
                className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl">
                {memproses ? 'Menyimpan...' : '✅ Simpan'}
              </button>
            </div>
            <button type="button" onClick={tutup} disabled={memproses}
              className="w-full bg-transparent text-white/70 text-xs font-bold py-1">Batal</button>
          </div>
        </>
      )}

      {mode === 'crop' && rotated && (
        <>
          <div className="relative flex-1">
            <Cropper
              image={rotated.url}
              crop={crop}
              zoom={zoom}
              aspect={cropAspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
            />
          </div>
          <div className="bg-black/90 p-4 space-y-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { label: 'Asli', nilai: rotated.width / rotated.height },
                { label: '1:1', nilai: 1 },
                { label: '4:3', nilai: 4 / 3 },
                { label: '3:4', nilai: 3 / 4 },
                { label: '16:9', nilai: 16 / 9 },
                { label: '9:16', nilai: 9 / 16 },
              ].map(opsi => (
                <button key={opsi.label} type="button" onClick={() => setCropAspect(opsi.nilai)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${Math.abs(cropAspect - opsi.nilai) < 0.001 ? 'bg-[#1A4FA0] text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}>
                  {opsi.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white text-xs font-bold">🔍 Zoom</span>
              <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="flex-1" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={simpanHasilCrop} disabled={memproses}
                className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl">
                {memproses ? 'Menyimpan...' : '✅ Simpan Hasil Crop'}
              </button>
              <button type="button" onClick={kembaliKeRotate} disabled={memproses}
                className="flex-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl">‹ Kembali</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
