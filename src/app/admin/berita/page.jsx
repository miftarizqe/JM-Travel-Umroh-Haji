'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

function statusPost(tanggal) {
  if (!tanggal) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(tanggal) >= today ? 'akan_datang' : 'sudah_berlangsung';
}

export default function AdminBeritaPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [judul, setJudul] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [files, setFiles] = useState(null);
  const [saving, setSaving] = useState(false);

  function muatData() {
    fetch('/api/admin/berita')
      .then(r => r.json())
      .then(d => { setRows(d.rows || []); setLoading(false); })
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

  async function pasang() {
    if (!judul.trim()) { alert('Judul wajib diisi!'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('judul', judul.trim());
      fd.append('deskripsi', deskripsi.trim());
      if (tanggal) fd.append('tanggal', tanggal);
      if (files) Array.from(files).forEach(f => fd.append('files', f));
      const res = await fetch('/api/admin/berita', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal membuat berita'); return; }
      setJudul(''); setDeskripsi(''); setTanggal(''); setFiles(null);
      muatData();
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function hapus(id) {
    if (!confirm('Hapus post ini beserta foto-fotonya?')) return;
    await fetch(`/api/admin/berita?id=${id}`, { method: 'DELETE' });
    muatData();
  }

  const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-gray-500 mb-1";

  return (
    <Layout title="📰 Berita & Kegiatan" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Feed berita/kegiatan tampil di section Kemitraan landing page publik. Status &ldquo;Akan Datang&rdquo; vs &ldquo;Sudah Berlangsung&rdquo; otomatis dari tanggal — isi tanggal ke depan buat pengumuman event, tanggal lampau/hari ini buat recap kegiatan.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="font-bold text-[#0E2F6E] mb-3">➕ Post Baru</div>
        <label className={lbl}>Judul *</label>
        <input value={judul} onChange={e => setJudul(e.target.value)} placeholder="Mis. Booth Umroh Expo Jakarta 2026"
          className={`${inp} mb-3`} />
        <label className={lbl}>Deskripsi</label>
        <textarea value={deskripsi} onChange={e => setDeskripsi(e.target.value)} rows={3}
          placeholder="Ceritakan kegiatannya atau info event yang akan datang..."
          className={`${inp} mb-3`} />
        <label className={lbl}>Tanggal (kosongkan kalau gak spesifik)</label>
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className={`${inp} mb-3`} />
        <label className={lbl}>Foto (opsional, bisa pilih banyak sekaligus, JPG/PNG maks 5MB)</label>
        <input type="file" accept=".jpg,.jpeg,.png" multiple onChange={e => setFiles(e.target.files)}
          className="w-full text-sm mb-3" />
        <button onClick={pasang} disabled={saving}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {saving ? 'Memasang...' : '📰 Pasang Post'}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="text-center text-gray-400 py-12">Belum ada post berita/kegiatan.</div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => {
            const status = statusPost(r.tanggal);
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-bold text-[#0E2F6E]">{r.judul}</div>
                      {status && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${status === 'akan_datang' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {status === 'akan_datang' ? '🔜 Akan Datang' : '✅ Sudah Berlangsung'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{tgl(r.tanggal)}</div>
                  </div>
                  <button onClick={() => hapus(r.id)} className="text-xs font-bold text-red-500 hover:underline whitespace-nowrap shrink-0">🗑️ Hapus</button>
                </div>
                {r.deskripsi && <p className="text-sm text-gray-600 mb-3 whitespace-pre-line">{r.deskripsi}</p>}
                {r.foto.length > 0 && (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {r.foto.map(f => (
                      <div key={f.id} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.foto_path} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
