'use client';
import { useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { getCroppedImg, rotateImage } from '@/lib/cropImage';

/**
 * Upload bon/bukti — satu tombol, klik baru muncul pilihan (kamera vs
 * file/galeri). Dipisah jadi 2 input file di belakang layar karena input
 * file polos + accept="image/*" gak konsisten nawarin kamera di semua
 * browser mobile.
 *
 * Kalau yang dipilih GAMBAR, mampir dulu ke editor singkat sebelum benar-benar
 * di-upload (bon sering kefoto miring/kepotong dari HP) — SENGAJA dipisah 2
 * langkah:
 *   1. Rotate — foto ditampilkan UTUH (gak ada crop paksa), cuma diputar.
 *   2. Crop — OPSIONAL, baru muncul kalau user klik "✂️ Crop"; area crop-nya
 *      default = seukuran foto hasil rotate (zoom=1 = foto utuh), user
 *      tinggal zoom-in kalau mau motong.
 * PDF langsung diunggah apa adanya (crop/rotate gak relevan buat PDF).
 */
export default function UploadBon({ value, onChange, disabled }) {
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingFile, setEditingFile] = useState(null); // { file, imgSrc } | null
  const [mode, setMode] = useState('rotate'); // 'rotate' | 'crop'
  const [rotation, setRotation] = useState(0);
  const [rotated, setRotated] = useState(null); // { url, width, height } — hasil bakar rotasi, dipakai di mode crop
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropAspect, setCropAspect] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [memproses, setMemproses] = useState(false);
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const nonaktif = disabled || uploading;

  async function unggah(file) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload-bukti', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Gagal unggah bon');
      onChange({ bukti_path: d.path, bukti_nama: d.nama_asli });
    } catch (err) { alert(err.message); }
    setUploading(false);
  }

  function pilihFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { unggah(file); return; } // PDF dll langsung upload
    setRotation(0);
    setRotated(null);
    setMode('rotate');
    setEditingFile({ file, imgSrc: URL.createObjectURL(file) });
  }

  function tutupEditor() {
    if (editingFile) URL.revokeObjectURL(editingFile.imgSrc);
    if (rotated) URL.revokeObjectURL(rotated.url);
    setEditingFile(null);
    setRotated(null);
  }

  async function bukaModeCrop() {
    setMemproses(true);
    try {
      const hasil = await rotateImage(editingFile.imgSrc, rotation);
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

  async function gunakanTanpaCrop() {
    setMemproses(true);
    try {
      const namaAsli = editingFile.file.name.replace(/\.[^.]+$/, '') || 'bon';
      let fileHasil = editingFile.file;
      if (rotation) {
        const { blob } = await rotateImage(editingFile.imgSrc, rotation);
        fileHasil = new File([blob], `${namaAsli}.jpg`, { type: 'image/jpeg' });
      }
      tutupEditor();
      setMemproses(false);
      await unggah(fileHasil);
    } catch { alert('Gagal memproses gambar'); setMemproses(false); }
  }

  async function gunakanHasilCrop() {
    if (!croppedAreaPixels) return;
    setMemproses(true);
    try {
      const namaAsli = editingFile.file.name.replace(/\.[^.]+$/, '') || 'bon';
      const blob = await getCroppedImg(rotated.url, croppedAreaPixels);
      const fileHasil = new File([blob], `${namaAsli}.jpg`, { type: 'image/jpeg' });
      tutupEditor();
      setMemproses(false);
      await unggah(fileHasil);
    } catch { alert('Gagal memproses gambar'); setMemproses(false); }
  }

  return (
    <div className="relative">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" disabled={nonaktif}
        onChange={e => { pilihFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" disabled={nonaktif}
        onChange={e => { pilihFile(e.target.files?.[0]); e.target.value = ''; }} />

      <button type="button" disabled={nonaktif} onClick={() => setMenuOpen(v => !v)}
        className="w-full py-2 rounded-lg text-xs font-bold bg-gray-50 border-2 border-gray-100 text-gray-600 hover:border-[#1A4FA0] disabled:opacity-50">
        📎 {uploading ? 'Mengunggah...' : 'Unggah Bon'}
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            <button type="button" onClick={() => { setMenuOpen(false); cameraRef.current?.click(); }}
              className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
              📷 Ambil Foto
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); fileRef.current?.click(); }}
              className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
              📁 Pilih File
            </button>
          </div>
        </>
      )}

      {value?.bukti_path && !uploading && (
        <div className="text-xs text-green-600 mt-1">
          📎 {value.bukti_nama || 'Bon terlampir'}
          <button type="button" onClick={() => onChange({ bukti_path: null, bukti_nama: null })} className="text-red-500 hover:underline ml-1">Hapus</button>
        </div>
      )}

      {editingFile && mode === 'rotate' && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col">
          <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={editingFile.imgSrc} alt="Bon" style={{ transform: `rotate(${rotation}deg)` }}
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
              <button type="button" onClick={gunakanTanpaCrop} disabled={memproses}
                className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl">
                {memproses ? 'Memproses...' : '✅ Gunakan'}
              </button>
            </div>
            <button type="button" onClick={tutupEditor} disabled={memproses}
              className="w-full bg-transparent text-white/70 text-xs font-bold py-1">Batal</button>
          </div>
        </div>
      )}

      {editingFile && mode === 'crop' && rotated && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col">
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
              <button type="button" onClick={gunakanHasilCrop} disabled={memproses}
                className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl">
                {memproses ? 'Memproses...' : '✅ Gunakan Hasil Crop'}
              </button>
              <button type="button" onClick={kembaliKeRotate} disabled={memproses}
                className="flex-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl">‹ Kembali</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
