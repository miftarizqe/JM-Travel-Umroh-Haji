'use client';
import { useRef, useState } from 'react';

/**
 * Komponen upload bukti transfer.
 * Props:
 *   onUploaded(path, namaAsli)  -> dipanggil setelah upload sukses
 *   label                       -> teks ajakan (opsional)
 */
export default function UploadBukti({ onUploaded, label = 'Klik untuk upload bukti transfer' }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [hasil, setHasil] = useState(null);   // { path, nama }
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  const MAKS = 5 * 1024 * 1024;
  const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

  async function pilihFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setHasil(null);

    // Validasi di sisi klien (server juga memvalidasi ulang)
    if (!TIPE_OK.includes(file.type)) {
      setError('Tipe file tidak didukung. Gunakan JPG, PNG, atau PDF.');
      return;
    }
    if (file.size > MAKS) {
      setError('Ukuran file maksimal 5MB.');
      return;
    }

    // Preview untuk gambar
    if (file.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload-bukti', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) {
        setHasil({ path: d.path, nama: d.nama_asli });
        onUploaded?.(d.path, d.nama_asli);
      } else {
        setError(d.error || 'Gagal mengunggah file');
        setPreview(null);
      }
    } catch {
      setError('Gagal mengunggah file');
      setPreview(null);
    }
    setUploading(false);
  }

  function reset() {
    setHasil(null);
    setPreview(null);
    setError('');
    onUploaded?.(null, null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.pdf"
        onChange={pilihFile} className="hidden"/>

      {!hasil ? (
        <div onClick={() => !uploading && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
            uploading ? 'border-gray-200 bg-gray-50 cursor-wait'
                      : 'border-blue-200 hover:border-[#1A4FA0] hover:bg-[#E8F0FB] cursor-pointer'
          }`}>
          {uploading ? (
            <>
              <div className="text-3xl mb-2">⏳</div>
              <div className="text-sm font-semibold text-gray-500">Mengunggah...</div>
            </>
          ) : (
            <>
              <div className="text-3xl mb-2">📎</div>
              <div className="text-sm font-semibold text-[#0E2F6E]">{label}</div>
              <div className="text-xs text-gray-400 mt-1">JPG, PNG, PDF (maks 5MB)</div>
            </>
          )}
        </div>
      ) : (
        <div className="border-2 border-green-400 bg-green-50 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {preview ? (
                <img src={preview} alt="Preview bukti" className="w-14 h-14 object-cover rounded-lg border border-green-200"/>
              ) : (
                <div className="w-14 h-14 flex items-center justify-center bg-white rounded-lg border border-green-200 text-2xl">📄</div>
              )}
              <div>
                <div className="text-sm font-bold text-green-700">✅ Bukti berhasil diunggah</div>
                <div className="text-xs text-gray-500 mt-0.5 max-w-[180px] truncate">{hasil.nama}</div>
              </div>
            </div>
            <button onClick={reset} className="text-xs font-bold text-red-500 underline flex-shrink-0">
              Ganti
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-600">
          ❌ {error}
        </div>
      )}
    </div>
  );
}
