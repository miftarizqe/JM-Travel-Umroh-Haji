'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { renderPasalMarkup } from '@/lib/pasalMarkup';

const SIGNER_FIELDS = [
  { key: 'nama_penandatangan', label: 'Nama Penandatangan (Pihak Pertama)', placeholder: 'Mis. Ahmad Zaky Arief Bestary' },
  { key: 'jabatan_penandatangan', label: 'Jabatan Penandatangan', placeholder: 'Mis. Direktur Pengembangan Bisnis & SDM' },
];

// Penandatangan Invoice/Kwitansi SENGAJA dipisah dari SIGNER_FIELDS di atas —
// dokumen keuangan biasanya ditandatangani org finance, beda orang dari yang
// tanda tangan SPKA-Ins (biasanya direksi/BD). Kosongin field ini
// kalau mau tetap pakai penandatangan umum (ada fallback otomatis).
const SIGNER_KEUANGAN_FIELDS = [
  { key: 'nama_penandatangan_keuangan', label: 'Nama Penandatangan', placeholder: 'Kosongkan buat pakai Penandatangan Umum di atas' },
  { key: 'jabatan_penandatangan_keuangan', label: 'Jabatan Penandatangan', placeholder: 'Mis. Staff Keuangan' },
];

const DOKUMEN_LIST = [
  { key: 'spka_ins', label: 'SPKA-Ins (Perwakilan)' },
  { key: 'jamaah', label: 'Perjanjian Jamaah' },
];

// Contoh data buat preview — angka rekening cuma dummy, gak pernah disimpan.
const CONTOH_MERGE = { bank_agen: 'Bank Contoh', rekening_agen: '000-000-0000', nama_rekening_agen: 'Nama Contoh' };

const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";

// Form terpisah (bukan didefinisikan di dalam komponen halaman) supaya
// identitasnya stabil antar render — nempel inline di baris pasal yang
// diedit (bukan nge-swap seluruh list jadi form), biar gak perlu scroll.
function FormPasal({ editing, setEditing, saving, showPreview, setShowPreview, onSimpan, onBatal, onHapus }) {
  return (
    <div className="bg-white rounded-xl border-2 border-[#1A4FA0]/30 p-4">
      <div className="font-bold text-[#0E2F6E] mb-3">{editing.isNew ? `Tambah Pasal Baru (Pasal ${editing.nomor})` : `Edit Pasal ${editing.nomor}`}</div>

      <label className={lbl}>Judul Pasal</label>
      <input value={editing.judul} onChange={e => setEditing(ed => ({ ...ed, judul: e.target.value }))}
        className={`${inp} mb-3`} />

      <label className={lbl}>Isi Pasal</label>
      <textarea value={editing.isi} onChange={e => setEditing(ed => ({ ...ed, isi: e.target.value }))}
        rows={16} className={`${inp} mb-3 font-mono text-xs leading-relaxed`} />

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setShowPreview(p => !p)}
          className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-3 py-1.5 rounded-full">
          {showPreview ? 'Sembunyikan Preview' : '👁️ Lihat Preview'}
        </button>
      </div>

      {showPreview && (
        <div className="bg-[#F8F9FD] border border-gray-200 rounded-lg p-4 mb-4 text-[11.5px] leading-relaxed">
          <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 12.5 }}>PASAL {editing.nomor}</div>
          <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 12.5, marginBottom: 8 }}>{editing.judul}</div>
          {renderPasalMarkup(editing.isi, CONTOH_MERGE)}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onSimpan} disabled={saving}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {saving ? 'Menyimpan...' : '💾 Simpan'}
        </button>
        <button onClick={onBatal}
          className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">
          Batal
        </button>
        {!editing.isNew && (
          <button onClick={onHapus} disabled={saving}
            className="ml-auto text-red-500 hover:text-red-700 text-sm font-bold px-3 py-2.5">
            🗑️ Hapus Pasal Ini
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminPengaturanDokumenPage() {
  const router = useRouter();
  const [user] = useCurrentUser();

  // --- Penandatangan ---
  const [signerForm, setSignerForm] = useState(null);
  const [signerSaving, setSignerSaving] = useState(false);
  const [signerSaved, setSignerSaved] = useState(false);
  const [uploadingTtd, setUploadingTtd] = useState(false);
  const [uploadingCap, setUploadingCap] = useState(false);

  // --- Isi Pasal ---
  const [dokumen, setDokumen] = useState('spka_ins');
  const [pasal, setPasal] = useState([]);
  const [loadingPasal, setLoadingPasal] = useState(true);
  const [editing, setEditing] = useState(null); // { nomor, judul, isi, isNew }
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [reordering, setReordering] = useState(null); // nomor pasal yg lagi digeser

  function muatPasal(dok) {
    fetch(`/api/admin/pasal?dokumen=${dok}`)
      .then(r => r.json())
      .then(d => { setPasal(d.pasal || []); setLoadingPasal(false); })
      .catch(() => setLoadingPasal(false));
  }

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama — bukan
    // berarti belum login (pola sama di halaman admin lain).
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); return; }
    fetch('/api/admin/pengaturan')
      .then(r => r.json())
      .then(d => setSignerForm(d.pengaturan || {}))
      .catch(() => setSignerForm({}));
    muatPasal(dokumen);
  }, [user, dokumen]);

  if (!user || !['admin','super_admin'].includes(user.role) || !signerForm) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  function ubahSigner(key, val) {
    setSignerForm(f => ({ ...f, [key]: val }));
    setSignerSaved(false);
  }

  async function simpanSigner() {
    setSignerSaving(true);
    try {
      const body = {};
      [...SIGNER_FIELDS, ...SIGNER_KEUANGAN_FIELDS].forEach(f => { body[f.key] = signerForm[f.key]; });
      const res = await fetch('/api/admin/pengaturan', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); return; }
      setSignerSaved(true);
    } catch { alert('Terjadi kesalahan'); }
    setSignerSaving(false);
  }

  async function uploadGambarSigner(kolom, file, setUploading) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kolom', kolom);
      const res = await fetch('/api/admin/pengaturan/upload-gambar', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal mengunggah gambar'); return; }
      setSignerForm(f => ({ ...f, [kolom]: d.path }));
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploading(false);
  }

  function mulaiEdit(p) {
    setEditing({ nomor: p.nomor, judul: p.judul, isi: p.isi, isNew: false });
    setShowPreview(false);
  }

  function mulaiTambah() {
    setEditing({ nomor: pasal.length ? pasal[pasal.length - 1].nomor + 1 : 1, judul: '', isi: '', isNew: true });
    setShowPreview(false);
  }

  async function simpanPasal() {
    if (!editing.judul.trim() || !editing.isi.trim()) { alert('Judul & isi tidak boleh kosong!'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pasal', {
        method: editing.isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dokumen, nomor: editing.nomor, judul: editing.judul, isi: editing.isi }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan pasal'); return; }
      setEditing(null);
      muatPasal(dokumen);
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function hapusPasal() {
    if (!confirm(`Hapus Pasal ${editing.nomor} — ${editing.judul}? Pasal sesudahnya otomatis geser nomor.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pasal?dokumen=${dokumen}&nomor=${editing.nomor}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menghapus pasal'); return; }
      setEditing(null);
      muatPasal(dokumen);
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function geserPasal(nomor, arah) {
    setReordering(nomor);
    try {
      const res = await fetch('/api/admin/pasal', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dokumen, nomor, arah }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menggeser pasal'); return; }
      muatPasal(dokumen);
    } catch { alert('Terjadi kesalahan'); }
    setReordering(null);
  }

  return (
    <Layout title="📜 Pengaturan Dokumen" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Kumpulan pengaturan buat dokumen legal (SPKA-Ins/Perjanjian Jamaah) — penandatangan & isi pasal, gak perlu ubah kode lagi.
      </div>

      {/* PENANDATANGAN */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="font-bold text-[#0E2F6E] mb-1">✍️ Penandatangan</div>
        <div className="text-xs text-gray-400 mb-3">
          Dipakai di dokumen SPKA-Ins.
          Begitu dokumen seseorang dibekukan (nomor surat sudah digenerate), dokumennya TETAP pakai nama/jabatan versi saat itu walau field ini diedit lagi nanti.
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          {SIGNER_FIELDS.map(f => (
            <div key={f.key}>
              <label className={lbl}>{f.label}</label>
              <input value={signerForm[f.key] || ''} onChange={e => ubahSigner(f.key, e.target.value)}
                placeholder={f.placeholder} className={inp} />
            </div>
          ))}
        </div>
        <hr className="border-gray-100 my-4" />

        <div className="font-bold text-[#0E2F6E] mb-1">🧾 Penandatangan Invoice/Kwitansi (Keuangan)</div>
        <div className="text-xs text-gray-400 mb-3">
          Biasanya beda orang dari penandatangan SPKA di atas (org finance, bukan direksi/BD). Kosongkan buat pakai Penandatangan Umum.
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          {SIGNER_KEUANGAN_FIELDS.map(f => (
            <div key={f.key}>
              <label className={lbl}>{f.label}</label>
              <input value={signerForm[f.key] || ''} onChange={e => ubahSigner(f.key, e.target.value)}
                placeholder={f.placeholder} className={inp} />
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-3">
          <div>
            <label className={lbl}>Tanda Tangan Digital (gambar, background transparan lebih bagus)</label>
            {signerForm.ttd_penandatangan_keuangan_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signerForm.ttd_penandatangan_keuangan_path} alt="TTD" className="h-16 mb-2 border border-gray-100 rounded-lg bg-gray-50 px-2" />
            )}
            <input type="file" accept="image/jpeg,image/png" disabled={uploadingTtd}
              onChange={e => { uploadGambarSigner('ttd_penandatangan_keuangan_path', e.target.files?.[0], setUploadingTtd); e.target.value = ''; }}
              className="text-xs" />
            {uploadingTtd && <div className="text-xs text-gray-400 mt-1">Mengunggah...</div>}
          </div>
          <div>
            <label className={lbl}>Cap Perusahaan (gambar, background transparan lebih bagus)</label>
            {signerForm.cap_perusahaan_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signerForm.cap_perusahaan_path} alt="Cap Perusahaan" className="h-16 mb-2 border border-gray-100 rounded-lg bg-gray-50 px-2" />
            )}
            <input type="file" accept="image/jpeg,image/png" disabled={uploadingCap}
              onChange={e => { uploadGambarSigner('cap_perusahaan_path', e.target.files?.[0], setUploadingCap); e.target.value = ''; }}
              className="text-xs" />
            {uploadingCap && <div className="text-xs text-gray-400 mt-1">Mengunggah...</div>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={simpanSigner} disabled={signerSaving}
            className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
            {signerSaving ? 'Menyimpan...' : '💾 Simpan Penandatangan'}
          </button>
          {signerSaved && <span className="text-sm text-green-600 font-semibold">✅ Tersimpan!</span>}
        </div>
      </div>

      {/* ISI PASAL */}
      <div className="font-bold text-[#0E2F6E] mb-1">📜 Isi Pasal</div>
      <div className="text-xs text-gray-400 mb-4">
        Perubahan cuma berlaku ke dokumen yang BELUM dibekukan (perwakilan yang nomor suratnya belum pernah digenerate, atau booking jamaah yang belum klik Setuju). Dokumen yang sudah dibekukan TETAP pakai isi versi lama — lihat tanda 🔒 di halaman cetaknya.
        Sintaks: <code className="bg-gray-100 px-1 rounded">**tebal**</code>, <code className="bg-gray-100 px-1 rounded">- item list</code>, <code className="bg-gray-100 px-1 rounded">  - sub-item huruf</code> (indent 2 spasi),
        dan <code className="bg-gray-100 px-1 rounded">{'{{bank_agen}}'}</code> / <code className="bg-gray-100 px-1 rounded">{'{{rekening_agen}}'}</code> / <code className="bg-gray-100 px-1 rounded">{'{{nama_rekening_agen}}'}</code> buat rekening PENANDA TANGAN (beda tiap orang, jangan diisi manual).
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {DOKUMEN_LIST.map(d => (
          <button key={d.key} onClick={() => { setEditing(null); setDokumen(d.key); setLoadingPasal(true); }}
            className={`text-xs font-bold px-4 py-2 rounded-full whitespace-nowrap ${dokumen === d.key ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {d.label}
          </button>
        ))}
      </div>

      {loadingPasal ? (
        <div className="text-center text-gray-400 py-12">Memuat...</div>
      ) : (
        <>
          {editing?.isNew && (
            <div className="mb-3">
              <FormPasal editing={editing} setEditing={setEditing} saving={saving} showPreview={showPreview} setShowPreview={setShowPreview}
                onSimpan={simpanPasal} onBatal={() => setEditing(null)} onHapus={hapusPasal} />
            </div>
          )}
          <div className="space-y-2 mb-3">
            {pasal.map((p, i) => (
              editing && !editing.isNew && editing.nomor === p.nomor ? (
                <FormPasal key={p.nomor} editing={editing} setEditing={setEditing} saving={saving} showPreview={showPreview} setShowPreview={setShowPreview}
                  onSimpan={simpanPasal} onBatal={() => setEditing(null)} onHapus={hapusPasal} />
              ) : (
                <div key={p.nomor}
                  className="bg-white rounded-xl border border-gray-200 hover:border-[#1A4FA0] p-3 flex items-center gap-3">
                  <div className="flex flex-col shrink-0">
                    <button onClick={() => geserPasal(p.nomor, 'naik')} disabled={i === 0 || reordering}
                      className="text-gray-400 hover:text-[#1A4FA0] disabled:opacity-20 disabled:cursor-not-allowed leading-none px-1">▲</button>
                    <button onClick={() => geserPasal(p.nomor, 'turun')} disabled={i === pasal.length - 1 || reordering}
                      className="text-gray-400 hover:text-[#1A4FA0] disabled:opacity-20 disabled:cursor-not-allowed leading-none px-1">▼</button>
                  </div>
                  <div onClick={() => mulaiEdit(p)} className="min-w-0 flex-1 cursor-pointer">
                    <div className="text-xs text-gray-400">Pasal {p.nomor}</div>
                    <div className="text-sm font-semibold text-gray-700 truncate">{p.judul}</div>
                  </div>
                  <span onClick={() => mulaiEdit(p)} className="text-xs font-bold text-[#1A4FA0] shrink-0 cursor-pointer">Edit →</span>
                </div>
              )
            ))}
          </div>
          {!editing && (
            <button onClick={mulaiTambah}
              className="w-full border-2 border-dashed border-gray-200 hover:border-[#1A4FA0] text-gray-400 hover:text-[#1A4FA0] text-sm font-bold py-3 rounded-xl transition-colors">
              + Tambah Pasal Baru
            </button>
          )}
        </>
      )}
    </Layout>
  );
}
