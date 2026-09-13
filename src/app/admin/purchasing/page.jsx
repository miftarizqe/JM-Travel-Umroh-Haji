'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import UploadBon from '@/app/components/UploadBon';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const KOSONG = { tanggal: hariIni(), deskripsi: '', kategori_id: '', program_id: '', tipe: 'out', nominal: '', bukti_path: null, bukti_nama: null };

const inp = "w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const lbl = "block text-xs font-semibold text-gray-500 mb-1.5";

export default function PurchasingPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [kategoriList, setKategoriList] = useState([]);
  const [programList, setProgramList] = useState([]);
  const [transaksi, setTransaksi] = useState([]);
  const [form, setForm] = useState(KOSONG);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { router.replace('/admin?tab=dashboard'); }
  }, [user]);

  function muat() {
    Promise.all([
      fetch('/api/admin/cashflow/kategori').then(r => r.json()),
      fetch('/api/admin/programs').then(r => r.json()),
      fetch('/api/admin/cashflow/transaksi?tanpa_akun=1').then(r => r.json()),
    ]).then(([k, p, t]) => {
      setKategoriList(k.kategori || []);
      setProgramList(p.programs || []);
      setTransaksi(t.transaksi || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { if (user?.role === 'super_admin') muat(); }, [user]);

  async function simpan() {
    if (!form.tanggal || !form.deskripsi.trim() || !form.nominal || Number(form.nominal) <= 0) {
      alert('Tanggal, deskripsi & nominal wajib diisi!'); return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/cashflow/transaksi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, kategori_id: form.kategori_id || null, program_id: form.program_id || null }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setSaving(false); return; }
      setForm({ ...KOSONG, tanggal: hariIni() });
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  if (!user || user.role !== 'super_admin') {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <Layout title="🧾 Purchasing (Bon Vendor & Program)" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Buat catat pengeluaran/pemasukan yang BUKAN lewat rekening yang direkonsiliasi di Cashflow Bulanan — mis. bon dari owner buat pembayaran vendor program, atau belanja lain yang duitnya di luar rekening yang ditrack. Tetap kehitung di Laba Rugi & Realisasi vs Budget Program, cuma gak ikut rekonsiliasi saldo akun manapun. Kalau ini transaksi dari rekening yang kamu pegang & saldo-nya perlu dicocokkan, pakai <b>Cashflow Bulanan</b> aja.
      </div>

      <div className="bg-white rounded-xl border-2 border-[#1A4FA0] p-4 space-y-3 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Tanggal</label>
            <input type="date" value={form.tanggal} onChange={e => { if (e.target.value) setForm({ ...form, tanggal: e.target.value }); }} className={inp} />
          </div>
          <div>
            <label className={lbl}>Tipe</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, tipe: 'out', kategori_id: '' })}
                className={`flex-1 py-2 rounded-lg text-sm font-bold ${form.tipe === 'out' ? 'bg-red-100 text-red-700 border-2 border-red-300' : 'bg-gray-50 text-gray-400 border-2 border-gray-100'}`}>OUT (keluar)</button>
              <button type="button" onClick={() => setForm({ ...form, tipe: 'in', kategori_id: '' })}
                className={`flex-1 py-2 rounded-lg text-sm font-bold ${form.tipe === 'in' ? 'bg-green-100 text-green-700 border-2 border-green-300' : 'bg-gray-50 text-gray-400 border-2 border-gray-100'}`}>IN (masuk)</button>
            </div>
          </div>
        </div>
        <div>
          <label className={lbl}>Deskripsi</label>
          <input value={form.deskripsi} onChange={e => setForm({ ...form, deskripsi: e.target.value })} placeholder="Mis. Pelunasan Hotel Mekkah — Program Umroh Oktober" className={inp} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Nominal (Rp)</label>
            <input type="number" value={form.nominal} onChange={e => setForm({ ...form, nominal: e.target.value })} placeholder="Mis. 15000000" className={inp} />
          </div>
          <div>
            <label className={lbl}>Kategori (opsional)</label>
            <select value={form.kategori_id} onChange={e => setForm({ ...form, kategori_id: e.target.value ? Number(e.target.value) : '' })} className={inp}>
              <option value="">— Tanpa kategori —</option>
              {kategoriList.filter(k => k.tipe === form.tipe).map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={lbl}>Program (opsional — biar bisa dibandingin budget vs realisasi)</label>
          <select value={form.program_id} onChange={e => setForm({ ...form, program_id: e.target.value })} className={inp}>
            <option value="">— Tanpa program —</option>
            {programList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Bon/Bukti (opsional)</label>
          <UploadBon value={form} onChange={v => setForm(f => ({ ...f, ...v }))} />
        </div>
        <button onClick={simpan} disabled={saving} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {saving ? 'Menyimpan...' : '💾 Catat Transaksi'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="font-bold text-[#0E2F6E] px-4 pt-4 pb-2">📜 Riwayat (200 terakhir)</div>
        {loading ? (
          <div className="text-center text-gray-400 py-6">Memuat...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2">Tanggal</th>
                <th className="px-3 py-2">Deskripsi</th>
                <th className="px-3 py-2">Kategori</th>
                <th className="px-3 py-2">Program</th>
                <th className="px-3 py-2 text-right">Nominal</th>
              </tr>
            </thead>
            <tbody>
              {transaksi.length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 py-6">Belum ada catatan.</td></tr>
              )}
              {transaksi.map(t => (
                <tr key={t.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">{tgl(t.tanggal)}</td>
                  <td className="px-3 py-2 text-gray-700">{t.deskripsi}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{t.kategori_nama || '—'}</td>
                  <td className="px-3 py-2 text-[#1A4FA0] whitespace-nowrap">{t.program_nama || '—'}</td>
                  <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${t.tipe === 'out' ? 'text-red-600' : 'text-green-600'}`}>
                    {t.tipe === 'out' ? '−' : '+'}{rp(t.nominal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
