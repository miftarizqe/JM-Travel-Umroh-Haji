'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export default function AdminGaleriPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [judul, setJudul] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [files, setFiles] = useState(null);
  const [uploading, setUploading] = useState(false);

  function muatData() {
    fetch('/api/admin/galeri')
      .then(r => r.json())
      .then(d => { setRows(d.rows || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama — bukan
    // berarti belum login (lihat pola yang sama di halaman admin lain).
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muatData();
  }, [user]);

  if (!user || loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  // Kelompokkan per batch buat ditampilin sebagai card, urut dari
  // keberangkatan terbaru (rows sudah diurutkan server dari tanggal desc).
  const batches = [];
  const idxByJudul = new Map();
  rows.forEach(r => {
    if (!idxByJudul.has(r.batch_judul)) {
      idxByJudul.set(r.batch_judul, batches.length);
      batches.push({ judul: r.batch_judul, tanggal: r.batch_tanggal, foto: [] });
    }
    batches[idxByJudul.get(r.batch_judul)].foto.push(r);
  });

  async function upload() {
    if (!judul.trim()) { alert('Judul keberangkatan wajib diisi!'); return; }
    if (!files || files.length === 0) { alert('Pilih minimal 1 foto!'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('batch_judul', judul.trim());
      if (tanggal) fd.append('batch_tanggal', tanggal);
      Array.from(files).forEach(f => fd.append('files', f));
      const res = await fetch('/api/admin/galeri', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal mengunggah'); return; }
      setJudul(''); setTanggal(''); setFiles(null);
      muatData();
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploading(false);
  }

  async function hapusFoto(id) {
    if (!confirm('Hapus foto ini?')) return;
    await fetch('/api/admin/galeri', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    muatData();
  }

  async function hapusBatch(batchJudul) {
    if (!confirm(`Hapus seluruh foto batch "${batchJudul}"?`)) return;
    await fetch('/api/admin/galeri', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_judul: batchJudul }),
    });
    muatData();
  }

  return (
    <Layout title="🖼️ Galeri Dokumentasi" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Foto di sini muncul sebagai slideshow &ldquo;Dokumentasi Keberangkatan&rdquo; di landing page publik. Buat foto pelatihan/booth/event, pakai halaman <b>Berita &amp; Kegiatan</b> — Instagram sekarang otomatis lewat live feed (SnapWidget).
      </div>

      {/* Form unggah batch baru */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="font-bold text-[#0E2F6E] mb-3">➕ Tambah Foto Keberangkatan</div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Judul Keberangkatan *</label>
            <input value={judul} onChange={e => setJudul(e.target.value)} placeholder="Mis. Keberangkatan 30 Nov 2025"
              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Tanggal Keberangkatan</label>
            <input type="date" value={tanggal} onChange={e => { if (e.target.value) setTanggal(e.target.value); }}
              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
          </div>
        </div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Foto (bisa pilih banyak sekaligus, JPG/PNG maks 5MB)</label>
        <input type="file" accept=".jpg,.jpeg,.png" multiple onChange={e => setFiles(e.target.files)}
          className="w-full text-sm mb-3" />
        <button onClick={upload} disabled={uploading}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {uploading ? 'Mengunggah...' : '📤 Unggah'}
        </button>
      </div>

      {/* Daftar batch */}
      {batches.length === 0 ? (
        <div className="text-center text-gray-400 py-12">Belum ada foto dokumentasi. Unggah yang pertama di atas.</div>
      ) : (
        <div className="space-y-5">
          {batches.map(b => (
            <div key={b.judul} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-bold text-[#0E2F6E]">{b.judul}</div>
                  <div className="text-xs text-gray-400">{tgl(b.tanggal)} · {b.foto.length} foto</div>
                </div>
                <button onClick={() => hapusBatch(b.judul)}
                  className="text-xs font-bold text-red-500 hover:underline whitespace-nowrap">🗑️ Hapus Batch</button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {b.foto.map(f => (
                  <div key={f.id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.foto_path} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => hapusFoto(f.id)}
                      className="absolute inset-0 bg-black/50 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      🗑️ Hapus
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
