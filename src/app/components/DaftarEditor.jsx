'use client';
import { useEffect, useState } from 'react';

const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";

// Form add/edit — komponen terpisah (bukan didefinisikan di dalam
// DaftarEditor) supaya identitasnya stabil antar render dan input di
// dalamnya gak kehilangan fokus tiap ketik.
function FormEditor({ editing, setEditing, fields, imageUploadUrl, uploadingGambar, pilihGambar, saving, onSimpan, onBatal, onHapus }) {
  return (
    <div className="bg-white rounded-xl border-2 border-[#1A4FA0]/30 p-4">
      {fields.map(f => (
        <div key={f.key} className="mb-3">
          <label className={lbl}>{f.label}{f.wajib && ' *'}</label>
          {f.textarea ? (
            <textarea value={editing[f.key]} onChange={e => setEditing(ed => ({ ...ed, [f.key]: e.target.value }))}
              placeholder={f.placeholder} rows={3} className={inp} />
          ) : (
            <input type={f.type === 'number' ? 'number' : 'text'}
              value={editing[f.key]} onChange={e => setEditing(ed => ({ ...ed, [f.key]: e.target.value }))}
              placeholder={f.placeholder} className={inp} />
          )}
        </div>
      ))}

      {imageUploadUrl && !editing.isNew && (
        <div className="mb-4">
          <label className={lbl}>Foto (opsional — boleh sama dengan item lain kalau 1 kelompok)</label>
          <div className="flex items-center gap-3">
            {editing.gambar && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={editing.gambar} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
            )}
            <label className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-3 py-2 rounded-full cursor-pointer whitespace-nowrap">
              {uploadingGambar ? 'Mengunggah...' : editing.gambar ? 'Ganti Foto' : 'Unggah Foto'}
              <input type="file" accept=".jpg,.jpeg,.png" className="hidden" disabled={uploadingGambar}
                onChange={e => pilihGambar(e.target.files?.[0])} />
            </label>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input type="checkbox" checked={editing.aktif} onChange={e => setEditing(ed => ({ ...ed, aktif: e.target.checked }))} className="w-4 h-4 accent-[#1A4FA0]" />
        <span className="text-sm text-gray-600">Tampilkan ke publik</span>
      </label>
      <div className="flex gap-2">
        <button onClick={onSimpan} disabled={saving}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {saving ? 'Menyimpan...' : '💾 Simpan'}
        </button>
        <button onClick={onBatal} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">
          Batal
        </button>
        {!editing.isNew && (
          <button onClick={onHapus} disabled={saving} className="ml-auto text-red-500 hover:text-red-700 text-sm font-bold px-3 py-2.5">
            🗑️ Hapus
          </button>
        )}
      </div>
    </div>
  );
}

// Editor list generik (add/edit/delete/reorder/toggle-aktif) — dipakai di
// beberapa halaman admin (Konten Landing Page, Opsi Tambahan, dst), field-nya
// beda tapi pola interaksinya sama persis. Ngurus fetch data sendiri (bukan
// nerima dari parent) biar gak perlu sync prop->state lewat effect.
//
// Edit nempel INLINE di baris item yang diedit (bukan nge-swap seluruh
// list jadi form) — biar admin gak perlu scroll naik-turun.
export default function DaftarEditor({ judul, deskripsiHalaman, adminApiUrl, fields, kolomTampil, imageUploadUrl }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(null);
  const [uploadingGambar, setUploadingGambar] = useState(false);

  function muat() {
    fetch(adminApiUrl).then(r => r.json()).then(d => {
      const key = Object.keys(d)[0];
      setData(d[key] || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { muat(); }, []);

  function mulaiEdit(item) {
    const form = { id: item.id, aktif: !!item.aktif, isNew: false, gambar: item.gambar || null };
    fields.forEach(f => { form[f.key] = item[f.key] ?? ''; });
    setEditing(form);
  }

  async function pilihGambar(file) {
    if (!file || !editing.id) return;
    setUploadingGambar(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('id', editing.id);
      const res = await fetch(imageUploadUrl, { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) setEditing(ed => ({ ...ed, gambar: d.path }));
      else alert(d.error || 'Gagal mengunggah gambar');
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploadingGambar(false);
  }

  function mulaiTambah() {
    const form = { id: null, aktif: true, isNew: true };
    fields.forEach(f => { form[f.key] = ''; });
    setEditing(form);
  }

  async function simpan() {
    const wajib = fields.filter(f => f.wajib);
    for (const f of wajib) {
      if (!String(editing[f.key] ?? '').trim()) { alert(`${f.label} wajib diisi!`); return; }
    }
    setSaving(true);
    try {
      const body = { id: editing.id, aktif: editing.aktif };
      fields.forEach(f => { body[f.key] = editing[f.key]; });
      const res = await fetch(adminApiUrl, {
        method: editing.isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); return; }
      setEditing(null);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function hapus() {
    if (!confirm('Hapus item ini?')) return;
    setSaving(true);
    try {
      const res = await fetch(`${adminApiUrl}?id=${editing.id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
      setEditing(null);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function geser(id, arah) {
    setReordering(id);
    try {
      const res = await fetch(adminApiUrl, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, arah }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menggeser'); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setReordering(null);
  }

  async function toggleAktif(item) {
    const body = { id: item.id, aktif: item.aktif ? 0 : 1 };
    fields.forEach(f => { body[f.key] = item[f.key]; });
    await fetch(adminApiUrl, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    muat();
  }

  function formatTampil(item, key) {
    const f = fields.find(f => f.key === key);
    const val = item[key];
    if (f?.type === 'number' && val !== undefined && val !== null && val !== '') {
      return `Rp ${Number(val).toLocaleString('id-ID')}`;
    }
    return val;
  }

  const formProps = {
    editing, setEditing, fields, imageUploadUrl, uploadingGambar, pilihGambar, saving,
    onSimpan: simpan, onBatal: () => setEditing(null), onHapus: hapus,
  };

  return (
    <div className="mb-8">
      <div className="font-bold text-[#0E2F6E] mb-1">{judul}</div>
      <div className="text-xs text-gray-400 mb-3">{deskripsiHalaman}</div>

      {loading ? (
        <div className="text-center text-gray-400 py-6 text-sm">Memuat...</div>
      ) : (
        <>
          {editing?.isNew && <div className="mb-3"><FormEditor {...formProps} /></div>}
          <div className="space-y-2 mb-3">
            {data.map((item, i) => (
              editing && !editing.isNew && editing.id === item.id ? (
                <FormEditor key={item.id} {...formProps} />
              ) : (
                <div key={item.id} className={`rounded-xl border p-3 flex items-center gap-3 ${item.aktif ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                  <div className="flex flex-col shrink-0">
                    <button onClick={() => geser(item.id, 'naik')} disabled={i === 0 || reordering}
                      className="text-gray-400 hover:text-[#1A4FA0] disabled:opacity-20 disabled:cursor-not-allowed leading-none px-1">▲</button>
                    <button onClick={() => geser(item.id, 'turun')} disabled={i === data.length - 1 || reordering}
                      className="text-gray-400 hover:text-[#1A4FA0] disabled:opacity-20 disabled:cursor-not-allowed leading-none px-1">▼</button>
                  </div>
                  <div onClick={() => mulaiEdit(item)} className="min-w-0 flex-1 cursor-pointer">
                    <div className="text-sm font-semibold text-gray-700">{item[kolomTampil.judul]}</div>
                    {kolomTampil.sub && <div className="text-xs text-gray-400 truncate">{formatTampil(item, kolomTampil.sub)}</div>}
                  </div>
                  <button onClick={() => toggleAktif(item)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 ${item.aktif ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                    {item.aktif ? '✅ Aktif' : 'Nonaktif'}
                  </button>
                  <span onClick={() => mulaiEdit(item)} className="text-xs font-bold text-[#1A4FA0] shrink-0 cursor-pointer">Edit →</span>
                </div>
              )
            ))}
            {data.length === 0 && <div className="text-center text-gray-400 py-6 text-sm">Belum ada item.</div>}
          </div>
          {!editing && (
            <button onClick={mulaiTambah}
              className="w-full border-2 border-dashed border-gray-200 hover:border-[#1A4FA0] text-gray-400 hover:text-[#1A4FA0] text-sm font-bold py-2.5 rounded-xl transition-colors">
              + Tambah
            </button>
          )}
        </>
      )}
    </div>
  );
}
