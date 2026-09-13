'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";

// Form terpisah (bukan didefinisikan di dalam komponen halaman) supaya
// identitasnya stabil antar render — dipakai buat Tambah maupun Edit
// (yang terakhir nempel inline di baris metode-nya, bukan nge-swap seluruh
// list jadi form, biar gak perlu scroll naik-turun).
function FormMetode({ editing, setEditing, saving, uploadingQr, onPilihQr, onSimpan, onBatal, onHapus }) {
  return (
    <div className="bg-white rounded-xl border-2 border-[#1A4FA0]/30 p-4">
      <div className="font-bold text-[#0E2F6E] mb-3">{editing.isNew ? 'Tambah Metode Pembayaran' : 'Edit Metode Pembayaran'}</div>

      <label className={lbl}>Nama Metode *</label>
      <input value={editing.nama} onChange={e => setEditing(ed => ({ ...ed, nama: e.target.value }))}
        placeholder="Mis. Bank Syariah Indonesia (BSI), DANA, QRIS" className={`${inp} mb-3`} />

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={lbl}>No. Rekening / No. HP (opsional)</label>
          <input value={editing.nomor} onChange={e => setEditing(ed => ({ ...ed, nomor: e.target.value }))} className={inp} />
        </div>
        <div>
          <label className={lbl}>Atas Nama (opsional)</label>
          <input value={editing.atas_nama} onChange={e => setEditing(ed => ({ ...ed, atas_nama: e.target.value }))} className={inp} />
        </div>
      </div>

      <label className={lbl}>Catatan (opsional — mis. &quot;khusus DP&quot;, instruksi tambahan)</label>
      <input value={editing.catatan} onChange={e => setEditing(ed => ({ ...ed, catatan: e.target.value }))} className={`${inp} mb-3`} />

      {!editing.isNew && (
        <>
          <label className={lbl}>Gambar QR (opsional — buat QRIS dll)</label>
          <div className="flex items-center gap-3 mb-3">
            {editing.gambar_qr && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={editing.gambar_qr} alt="QR" className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white" />
            )}
            <label className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-3 py-2 rounded-full cursor-pointer whitespace-nowrap">
              {uploadingQr ? 'Mengunggah...' : editing.gambar_qr ? 'Ganti QR' : 'Unggah QR'}
              <input type="file" accept=".jpg,.jpeg,.png" className="hidden" disabled={uploadingQr}
                onChange={e => onPilihQr(e.target.files?.[0])} />
            </label>
          </div>
        </>
      )}

      <div className="mb-3">
        <label className={lbl}>Ruang Lingkup</label>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="ruang_lingkup" checked={!editing.khusus_sahabat} onChange={() => setEditing(ed => ({ ...ed, khusus_sahabat: false }))} className="w-4 h-4 accent-[#1A4FA0]" />
            <span className="text-sm text-gray-600">Publik — booking/checkout biasa</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="ruang_lingkup" checked={editing.khusus_sahabat} onChange={() => setEditing(ed => ({ ...ed, khusus_sahabat: true }))} className="w-4 h-4 accent-[#C9952A]" />
            <span className="text-sm text-gray-600">Khusus Sahabat Baitullah — cuma buat setoran pendaftaran Rp1.000.000</span>
          </label>
        </div>
      </div>

      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input type="checkbox" checked={editing.aktif} onChange={e => setEditing(ed => ({ ...ed, aktif: e.target.checked }))} className="w-4 h-4 accent-[#1A4FA0]" />
        <span className="text-sm text-gray-600">Aktif (dipakai)</span>
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

export default function AdminMetodePembayaranPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [metode, setMetode] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { id, nama, nomor, atas_nama, catatan, aktif, isNew }
  const [saving, setSaving] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [reordering, setReordering] = useState(null);

  function muatData() {
    fetch('/api/admin/metode-pembayaran')
      .then(r => r.json())
      .then(d => { setMetode(d.metode || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama — bukan
    // berarti belum login (pola sama di halaman admin lain).
    if (!user) return;
    // Rekening tujuan transfer — khusus super_admin (dikonfirmasi user
    // 2026-08-21, admin biasa gak boleh ganti2 rekening/nomor pembayaran).
    if (user.role !== 'super_admin') { router.replace('/admin?tab=dashboard'); return; }
    muatData();
  }, [user]);

  if (!user || user.role !== 'super_admin' || loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  function mulaiEdit(m) {
    setEditing({ id: m.id, nama: m.nama, nomor: m.nomor || '', atas_nama: m.atas_nama || '', catatan: m.catatan || '', aktif: !!m.aktif, khusus_sahabat: !!m.khusus_sahabat, gambar_qr: m.gambar_qr, isNew: false });
  }

  function mulaiTambah() {
    setEditing({ id: null, nama: '', nomor: '', atas_nama: '', catatan: '', aktif: true, khusus_sahabat: false, gambar_qr: null, isNew: true });
  }

  async function simpan() {
    if (!editing.nama.trim()) { alert('Nama metode wajib diisi!'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/metode-pembayaran', {
        method: editing.isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, nama: editing.nama, nomor: editing.nomor, atas_nama: editing.atas_nama, catatan: editing.catatan, aktif: editing.aktif, khusus_sahabat: editing.khusus_sahabat }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); return; }
      setEditing(null);
      muatData();
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function hapus() {
    if (!confirm(`Hapus metode "${editing.nama}"?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/metode-pembayaran?id=${editing.id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
      setEditing(null);
      muatData();
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function pilihQr(file) {
    if (!file || !editing.id) return;
    setUploadingQr(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('id', editing.id);
      const res = await fetch('/api/admin/metode-pembayaran/upload-qr', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) setEditing(e => ({ ...e, gambar_qr: d.path }));
      else alert(d.error || 'Gagal mengunggah QR');
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploadingQr(false);
  }

  async function geser(id, arah) {
    setReordering(id);
    try {
      const res = await fetch('/api/admin/metode-pembayaran', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, arah }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menggeser urutan'); return; }
      muatData();
    } catch { alert('Terjadi kesalahan'); }
    setReordering(null);
  }

  async function toggleAktif(m) {
    await fetch('/api/admin/metode-pembayaran', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, nama: m.nama, nomor: m.nomor, atas_nama: m.atas_nama, catatan: m.catatan, aktif: m.aktif ? 0 : 1, khusus_sahabat: m.khusus_sahabat }),
    });
    muatData();
  }

  const formProps = { editing, setEditing, saving, uploadingQr, onPilihQr: pilihQr, onSimpan: simpan, onBatal: () => setEditing(null), onHapus: hapus };

  return (
    <Layout title="💳 Metode Pembayaran" backHref="/admin/pengaturan/dokumen">
      <div className="text-xs text-gray-400 mb-4">
        Semua cara bayar yang ditampilkan ke jamaah (landing page, checkout, order jamaah, pelunasan) — bisa lebih dari satu (beberapa bank, e-wallet, QRIS, dst). Yang non-aktif gak tampil di manapun tapi datanya tetap tersimpan. Ruang Lingkup "Khusus Sahabat Baitullah" cuma tampil di halaman pendaftaran Sahabat Baitullah, gak pernah ikut nongol di checkout/booking biasa walau aktif.
      </div>

      {editing?.isNew && <div className="mb-3"><FormMetode {...formProps} /></div>}
      <div className="space-y-2 mb-3">
        {metode.map((m, i) => (
          editing && !editing.isNew && editing.id === m.id ? (
            <FormMetode key={m.id} {...formProps} />
          ) : (
            <div key={m.id} className={`rounded-xl border p-3 flex items-center gap-3 ${m.aktif ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
              <div className="flex flex-col shrink-0">
                <button onClick={() => geser(m.id, 'naik')} disabled={i === 0 || reordering}
                  className="text-gray-400 hover:text-[#1A4FA0] disabled:opacity-20 disabled:cursor-not-allowed leading-none px-1">▲</button>
                <button onClick={() => geser(m.id, 'turun')} disabled={i === metode.length - 1 || reordering}
                  className="text-gray-400 hover:text-[#1A4FA0] disabled:opacity-20 disabled:cursor-not-allowed leading-none px-1">▼</button>
              </div>
              {m.gambar_qr && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={m.gambar_qr} alt="" className="w-10 h-10 object-contain rounded-lg border border-gray-200 bg-white shrink-0" />
              )}
              <div onClick={() => mulaiEdit(m)} className="min-w-0 flex-1 cursor-pointer">
                <div className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  {m.nama}
                  {!!m.khusus_sahabat && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">🤝 Sahabat Baitullah</span>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  {m.nomor && <>{m.nomor}{m.atas_nama && ` · a.n. ${m.atas_nama}`}</>}
                  {m.catatan && <> · {m.catatan}</>}
                </div>
              </div>
              <button onClick={() => toggleAktif(m)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 ${m.aktif ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                {m.aktif ? '✅ Aktif' : 'Nonaktif'}
              </button>
              <span onClick={() => mulaiEdit(m)} className="text-xs font-bold text-[#1A4FA0] shrink-0 cursor-pointer">Edit →</span>
            </div>
          )
        ))}
        {metode.length === 0 && <div className="text-center text-gray-400 py-8 text-sm">Belum ada metode pembayaran.</div>}
      </div>
      {!editing && (
        <button onClick={mulaiTambah}
          className="w-full border-2 border-dashed border-gray-200 hover:border-[#1A4FA0] text-gray-400 hover:text-[#1A4FA0] text-sm font-bold py-3 rounded-xl transition-colors">
          + Tambah Metode Pembayaran
        </button>
      )}
    </Layout>
  );
}
