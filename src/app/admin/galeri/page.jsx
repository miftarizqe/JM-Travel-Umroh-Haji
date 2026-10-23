'use client';
import { useEffect, useRef, useState } from 'react';
import InputTanggal from '@/app/components/InputTanggal';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";

export default function AdminGaleriPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipe, setTipe] = useState('keberangkatan');
  const [judul, setJudul] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [cerita, setCerita] = useState('');
  const [files, setFiles] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(null); // { id, judul, tanggal, cerita }
  const tambahFotoRef = useRef({});

  function muatData() {
    fetch('/api/admin/galeri')
      .then(r => r.json())
      .then(d => { setBatches(d.rows || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama — bukan
    // berarti belum login (pola sama di halaman admin lain).
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muatData();
  }, [user]);

  if (!user || loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  async function buatBatch() {
    if (!judul.trim()) { alert('Judul wajib diisi!'); return; }
    if (!files || files.length === 0) { alert('Pilih minimal 1 foto!'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('tipe', tipe);
      fd.append('judul', judul.trim());
      if (tanggal) fd.append('tanggal', tanggal);
      fd.append('cerita', cerita.trim());
      Array.from(files).forEach(f => fd.append('files', f));
      const res = await fetch('/api/admin/galeri', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal mengunggah'); return; }
      setJudul(''); setTanggal(''); setCerita(''); setFiles(null);
      muatData();
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploading(false);
  }

  async function tambahFotoKeBatch(batchId, fileList) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('batch_id', batchId);
      Array.from(fileList).forEach(f => fd.append('files', f));
      const res = await fetch('/api/admin/galeri', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal mengunggah'); return; }
      muatData();
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploading(false);
  }

  async function simpanEdit() {
    if (!editing.judul.trim()) { alert('Judul wajib diisi!'); return; }
    const res = await fetch('/api/admin/galeri', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menyimpan'); return; }
    setEditing(null);
    muatData();
  }

  async function hapusFoto(id) {
    if (!confirm('Hapus foto ini?')) return;
    await fetch('/api/admin/galeri', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    muatData();
  }

  async function hapusBatch(batchId, judulBatch) {
    if (!confirm(`Hapus seluruh batch "${judulBatch}" beserta foto & ceritanya?`)) return;
    await fetch('/api/admin/galeri', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_id: batchId }),
    });
    muatData();
  }

  return (
    <Layout title="🖼️ Galeri" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Satu batch = satu momen (keberangkatan ATAU kegiatan/pelatihan/booth), lengkap dengan cerita — tampil di landing page section Dokumentasi. Instagram tetap otomatis lewat live feed (SnapWidget), gak diurus di sini.
      </div>

      {/* Form batch baru */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="font-bold text-[#0E2F6E] mb-3">➕ Batch Baru</div>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setTipe('keberangkatan')}
            className={`text-xs font-bold px-3 py-1.5 rounded-full ${tipe === 'keberangkatan' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
            🕋 Keberangkatan
          </button>
          <button onClick={() => setTipe('kegiatan')}
            className={`text-xs font-bold px-3 py-1.5 rounded-full ${tipe === 'kegiatan' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
            📰 Kegiatan
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className={lbl}>Judul *</label>
            <input value={judul} onChange={e => setJudul(e.target.value)}
              placeholder={tipe === 'keberangkatan' ? 'Mis. Keberangkatan 30 Nov 2025' : 'Mis. Booth Umroh Expo Jakarta 2026'}
              className={inp} />
          </div>
          <div>
            <label className={lbl}>Tanggal</label>
            <InputTanggal value={tanggal} onChange={e => { if (e.target.value) setTanggal(e.target.value); }} className={inp} />
          </div>
        </div>
        <label className={lbl}>Cerita (ceritakan momennya — ini yang tampil di landing page, bukan cuma foto polos)</label>
        <textarea value={cerita} onChange={e => setCerita(e.target.value)} rows={3}
          placeholder="Ceritakan momen ini..." className={`${inp} mb-3`} />
        <label className={lbl}>Foto (bisa pilih banyak sekaligus, JPG/PNG maks 3MB)</label>
        <input type="file" accept=".jpg,.jpeg,.png" multiple onChange={e => setFiles(e.target.files)}
          className="w-full text-sm mb-3" />
        <button onClick={buatBatch} disabled={uploading}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {uploading ? 'Mengunggah...' : '📤 Unggah'}
        </button>
      </div>

      {/* Daftar batch */}
      {batches.length === 0 ? (
        <div className="text-center text-gray-400 py-12">Belum ada batch. Unggah yang pertama di atas.</div>
      ) : (
        <div className="space-y-5">
          {batches.map(b => (
            <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4">
              {editing?.id === b.id ? (
                <div className="mb-3">
                  <label className={lbl}>Judul</label>
                  <input value={editing.judul} onChange={e => setEditing(ed => ({ ...ed, judul: e.target.value }))} className={`${inp} mb-2`} />
                  <label className={lbl}>Tanggal</label>
                  <InputTanggal value={editing.tanggal || ''} onChange={e => setEditing(ed => ({ ...ed, tanggal: e.target.value }))} className={`${inp} mb-2`} />
                  <label className={lbl}>Cerita</label>
                  <textarea value={editing.cerita || ''} onChange={e => setEditing(ed => ({ ...ed, cerita: e.target.value }))} rows={3} className={`${inp} mb-2`} />
                  <div className="flex gap-2">
                    <button onClick={simpanEdit} className="bg-[#1A4FA0] text-white text-xs font-bold px-4 py-2 rounded-lg">💾 Simpan</button>
                    <button onClick={() => setEditing(null)} className="bg-gray-100 text-gray-600 text-xs font-bold px-4 py-2 rounded-lg">Batal</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${b.tipe === 'kegiatan' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {b.tipe === 'kegiatan' ? '📰 Kegiatan' : '🕋 Keberangkatan'}
                      </span>
                      <div className="font-bold text-[#0E2F6E]">{b.judul}</div>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{tgl(b.tanggal)} · {b.foto.length} foto</div>
                    {b.cerita && <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{b.cerita}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button onClick={() => setEditing({ id: b.id, judul: b.judul, tanggal: b.tanggal, cerita: b.cerita })}
                      className="text-xs font-bold text-[#1A4FA0] hover:underline whitespace-nowrap">✏️ Edit</button>
                    <button onClick={() => hapusBatch(b.id, b.judul)}
                      className="text-xs font-bold text-red-500 hover:underline whitespace-nowrap">🗑️ Hapus Batch</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-2">
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
              <input ref={el => { tambahFotoRef.current[b.id] = el; }} type="file" accept=".jpg,.jpeg,.png" multiple className="hidden"
                onChange={e => { tambahFotoKeBatch(b.id, e.target.files); e.target.value = ''; }} />
              <button onClick={() => tambahFotoRef.current[b.id]?.click()} disabled={uploading}
                className="text-xs font-bold text-[#1A4FA0] hover:underline disabled:opacity-50">+ Tambah Foto</button>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
