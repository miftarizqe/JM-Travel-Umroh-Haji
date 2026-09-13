'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useCurrentUser } from '@/lib/useCurrentUser';

export default function UploadFotoPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Memuat...</div>}>
      <UploadFotoPageInner />
    </Suspense>
  );
}

function UploadFotoPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Diteruskan dari register -> verifikasi (lihat komentar di sana) — ini
  // langkah wajib TERAKHIR sebelum akun baru bisa dipakai, jadi di sinilah
  // redirect beneran dieksekusi (lihat tombol "Lanjut" di bawah). Prasyarat
  // perwakilan (formulir kemitraan) tetap didahulukan APAPUN redirect-nya —
  // itu langkah wajib, bukan sesuatu yang boleh dilewati.
  const redirect = searchParams.get('redirect');
  const inputRef = useRef(null);
  const [user] = useCurrentUser();
  const [preview, setPreview] = useState(null);
  const [fotoPath, setFotoPath] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Foto langsung kesimpan ke server begitu upload sukses — yang perlu
  // dijaga cuma pas lagi proses upload aja, biar gak keputus di tengah jalan.
  useUnsavedGuard(uploading);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/profil?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.user?.foto_path) { setFotoPath(d.user.foto_path); setPreview(d.user.foto_path); } });
  }, [user]);

  async function pilihFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    if (!['image/jpeg','image/jpg','image/png'].includes(file.type)) {
      setError('Foto harus JPG atau PNG'); return;
    }
    if (file.size > 10*1024*1024) { setError('Ukuran foto maksimal 10MB'); return; }

    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload-foto', { method:'POST', body: fd });
      const d = await res.json();
      if (res.ok) setFotoPath(d.path);
      else { setError(d.error); setPreview(fotoPath); }
    } catch { setError('Gagal mengunggah foto'); setPreview(fotoPath); }
    setUploading(false);
  }

  // Dipakai baik oleh tombol "Lanjut" (setelah upload) maupun "Lewati,
  // nanti saja" (dikonfirmasi user 2026-09-03: foto TIDAK lagi jadi gate
  // keras — boleh dilewati permanen, upload foto jadi self-service murni
  // dari halaman Profil kapan saja).
  async function lanjutkan() {
    // Perwakilan yang BARU daftar (belum pernah kirim formulir kemitraan ke
    // agen_pendaftaran) lanjut ke situ dulu — bukan ke dashboard, krn
    // dashboard cuma nunjukin "menunggu admin" padahal belum ada apa2 yang
    // dikirim buat direview. User yang cuma ganti foto profil (formulir udah
    // pernah dikirim) tetap balik ke dashboard.
    if (user?.role === 'perwakilan') {
      try {
        const res = await fetch('/api/status-pendaftaran');
        const d = await res.json();
        if (res.ok && !d.prasyarat?.formulir_terkirim) {
          router.push('/daftar-perwakilan');
          return;
        }
      } catch { /* fallback ke dashboard di bawah kalau gagal cek */ }
    }
    // Sahabat yang BARU daftar (belum pernah kirim data diri ke
    // sahabat_pendaftaran) lanjut ke situ dulu — pola sama persis dengan
    // perwakilan di atas.
    if (user?.role === 'sahabat_baitullah') {
      try {
        const res = await fetch('/api/status-pendaftaran-sahabat');
        const d = await res.json();
        if (res.ok && !d.prasyarat?.data_diri_terkirim) {
          router.push('/daftar-sahabat');
          return;
        }
      } catch { /* fallback ke status di bawah kalau gagal cek */ }
    }
    if (redirect) { router.push(redirect); return; }
    const tujuan = { admin: '/admin', perwakilan: '/dashboard/perwakilan', jamaah: '/dashboard/jamaah', sahabat: '/status-pendaftaran-sahabat' };
    router.push(tujuan[user?.role] || '/dashboard/jamaah');
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <Layout title="📷 Foto Profil" showBack confirmLeave={uploading}
      confirmMessage="Foto masih diunggah, yakin ingin keluar?">
      <div className="max-w-md mx-auto">
        <div className="bg-[#E8F0FB] rounded-xl p-4 mb-6 text-sm text-[#1A4FA0]">
          Foto profil akan dipakai untuk mencetak ID Card Anda.
          Gunakan foto formal, wajah terlihat jelas. Bisa dilewati dulu dan diisi belakangan lewat halaman Profil.
        </div>

        <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png" onChange={pilihFile} className="hidden"/>

        <div onClick={() => !uploading && inputRef.current?.click()}
          className="cursor-pointer flex flex-col items-center">
          {preview ? (
            <img src={preview} alt="Foto profil"
              className="w-48 h-48 object-cover rounded-2xl border-4 border-[#1A4FA0] shadow-lg"/>
          ) : (
            <div className="w-48 h-48 rounded-2xl border-4 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-[#1A4FA0]">
              <div className="text-5xl mb-2">📷</div>
              <div className="text-sm font-semibold">Pilih Foto</div>
            </div>
          )}
          <button className="mt-4 text-sm font-bold text-[#1A4FA0] underline">
            {uploading ? 'Mengunggah...' : preview ? 'Ganti Foto' : 'Pilih Foto'}
          </button>
        </div>

        <div className="text-center text-xs text-gray-400 mt-2">JPG atau PNG, maksimal 10MB</div>

        {error && <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-600 text-center">❌ {error}</div>}

        {fotoPath && !uploading && (
          <div className="mt-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 text-center mb-4">
              ✅ Foto profil tersimpan
            </div>
            <button onClick={lanjutkan}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full">
              Lanjut →
            </button>
          </div>
        )}

        {!fotoPath && !uploading && (
          <div className="mt-6 text-center">
            <button onClick={lanjutkan} className="text-sm font-semibold text-gray-400 hover:text-[#1A4FA0] underline">
              Lewati, nanti saja →
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
