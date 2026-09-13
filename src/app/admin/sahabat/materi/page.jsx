'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useIsHop } from '@/lib/useIsHop';
import MateriSahabatViewer from '@/app/components/MateriSahabatViewer';

export default function AdminMateriSahabatPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const { isAdminOrHop, isHop, checked: hopChecked } = useIsHop(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [judul, setJudul] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [files, setFiles] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewMateri, setPreviewMateri] = useState(null);

  function muatData() {
    fetch('/api/admin/sahabat/materi')
      .then(r => r.json())
      .then(d => { setRows(d.materi || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user || !hopChecked) return;
    if (!isAdminOrHop) { router.replace('/login'); return; }
    muatData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hopChecked, isAdminOrHop]);

  if (!user || !hopChecked || !isAdminOrHop || loading) return <Layout title="🎞️ Materi Presentasi" showBack><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

  async function upload() {
    if (!judul.trim()) { alert('Judul wajib diisi!'); return; }
    if (!files || files.length === 0) { alert('Pilih minimal 1 gambar slide!'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('judul', judul.trim());
      if (deskripsi.trim()) fd.append('deskripsi', deskripsi.trim());
      Array.from(files).forEach(f => fd.append('slides', f));
      const res = await fetch('/api/admin/sahabat/materi', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal mengunggah'); return; }
      setJudul(''); setDeskripsi(''); setFiles(null);
      muatData();
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploading(false);
  }

  async function toggleAktif(m) {
    await fetch(`/api/admin/sahabat/materi/${m.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif: !m.aktif }),
    });
    muatData();
  }

  async function hapus(id) {
    if (!confirm('Hapus materi ini beserta seluruh slide-nya?')) return;
    await fetch(`/api/admin/sahabat/materi/${id}`, { method: 'DELETE' });
    muatData();
  }

  return (
    <Layout title="🎞️ Materi Presentasi Sahabat Baitullah" showBack>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-[#E8F0FB] text-[#0E2F6E] text-xs rounded-xl p-3">
          Bahan presentasi yang diunggah di sini bisa dilihat oleh semua anggota Sahabat Baitullah aktif, tapi <b>tidak bisa diunduh</b> —
          hanya tampil sebagai slide di aplikasi mereka, lengkap dengan watermark nama & kode akun peninjau. Upload slide dalam bentuk gambar
          (export dari PPT/PDF ke JPG/PNG dulu), urutan file yang dipilih jadi urutan tampil slide-nya.
        </div>

        {!isHop && (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
            <div className="font-bold text-[#0E2F6E] mb-3">➕ Unggah Materi Baru</div>
            <div className="space-y-2">
              <input value={judul} onChange={e => setJudul(e.target.value)} placeholder="Judul materi (mis. Presentasi Program Sahabat Baitullah 2026)"
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm" />
              <textarea value={deskripsi} onChange={e => setDeskripsi(e.target.value)} placeholder="Deskripsi singkat (opsional)" rows={2}
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm" />
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => setFiles(e.target.files)}
                className="w-full text-xs" />
              <button onClick={upload} disabled={uploading}
                className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-full">
                {uploading ? 'Mengunggah...' : 'Unggah Materi'}
              </button>
            </div>
          </div>
        )}

        <div className="font-bold text-[#0E2F6E]">Daftar Materi ({rows.length})</div>
        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Belum ada materi diunggah.</div>
        ) : rows.map(m => (
          <div key={m.id} className="bg-white rounded-xl border border-[#e0e8f0] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-[#0E2F6E]">{m.judul}</div>
                {m.deskripsi && <div className="text-xs text-gray-500 mt-0.5">{m.deskripsi}</div>}
                <div className="text-[10px] text-gray-400 mt-1">{m.jumlah_slide} slide</div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${m.aktif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {m.aktif ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setPreviewMateri(m)} className="text-xs font-bold text-[#1A4FA0] underline">Preview</button>
              {!isHop && (
                <>
                  <button onClick={() => toggleAktif(m)} className="text-xs font-bold text-[#1A4FA0] underline">{m.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  <button onClick={() => hapus(m.id)} className="text-xs font-bold text-red-500 underline">Hapus</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {previewMateri && (
        <MateriSahabatViewer materi={previewMateri} user={user} onClose={() => setPreviewMateri(null)} />
      )}
    </Layout>
  );
}
