'use client';
import { useEffect, useState, use as usePromise } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const namaBulan = (b) => {
  if (!b) return '-';
  const [y, m] = b.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

const STATUS_BADGE = {
  draft: 'bg-gray-100 text-gray-500',
  diajukan: 'bg-amber-100 text-amber-700',
  disetujui: 'bg-green-100 text-green-700',
  ditolak: 'bg-red-100 text-red-700',
};
const STATUS_LABEL = { draft: 'Draft', diajukan: 'Menunggu Persetujuan', disetujui: 'Disetujui', ditolak: 'Ditolak' };

const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const inpSm = "px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs";

export default function PengajuanDanaDetailPage({ params }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [user] = useCurrentUser();
  const [pengajuan, setPengajuan] = useState(null);
  const [items, setItems] = useState([]);
  const [reimbursePending, setReimbursePending] = useState([]);
  const [kategoriList, setKategoriList] = useState([]);
  const [referensiLalu, setReferensiLalu] = useState(null);
  const [referensiCashflow, setReferensiCashflow] = useState(null);
  const [catatan, setCatatan] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [catatanKeputusan, setCatatanKeputusan] = useState('');

  function muat() {
    fetch(`/api/admin/pengajuan-dana/${id}`).then(r => r.json()).then(d => {
      if (d.error) { alert(d.error); router.push('/admin/laporan/pengajuan-dana'); return; }
      setPengajuan(d.pengajuan);
      setItems((d.items || []).map(it => ({ ...it, nominal: String(it.nominal) })));
      setReimbursePending(d.reimburse_pending || []);
      setKategoriList(d.kategori_out || []);
      setReferensiLalu(d.referensi_bulan_lalu || null);
      setReferensiCashflow(d.referensi_cashflow_bulan_lalu || null);
      setCatatan(d.pengajuan.catatan || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { if (user) muat(); }, [user, id]);

  const draft = pengajuan?.status === 'draft';
  const total = items.reduce((s, it) => s + (Number(it.nominal) || 0), 0);
  const isSuperAdmin = user?.role === 'super_admin';

  function ubahItem(idx, patch) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function hapusItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }
  function tambahManual() {
    setItems(prev => [...prev, { keterangan: '', nominal: '0', kategori_id: '', sumber: 'manual', reimburse_id: null }]);
  }
  function tarikReimburse(r) {
    setItems(prev => [...prev, {
      keterangan: `Reimburse: ${r.deskripsi} (${r.nama_staff})`, nominal: String(r.nominal),
      kategori_id: r.kategori_id || '', sumber: 'reimburse', reimburse_id: r.id,
    }]);
    setReimbursePending(prev => prev.filter(x => x.id !== r.id));
  }
  // Salin 1 baris dari referensi bulan lalu apa adanya (nominal ikut kepindah,
  // bukan cuma keterangannya) — tinggal diedit/dihapus/dipecah kalau perlu,
  // biar gak ngetik dari nol tiap bulan buat kebutuhan yang emang rutin.
  function pakaiLagi(it) {
    setItems(prev => [...prev, {
      keterangan: it.keterangan, nominal: String(it.nominal),
      kategori_id: it.kategori_id || '', sumber: 'manual', reimburse_id: null,
    }]);
  }
  // Sama kayak pakaiLagi, tapi sumbernya realisasi Cashflow (total aktual per
  // kategori bulan lalu) — gak ada teks "keterangan" asli (cuma total angka),
  // jadi keterangannya di-generate dari nama kategori, admin tinggal edit.
  function pakaiLagiCashflow(k) {
    setItems(prev => [...prev, {
      keterangan: k.kategori_nama || 'Kebutuhan bulan ini', nominal: String(k.total),
      kategori_id: k.kategori_id || '', sumber: 'manual', reimburse_id: null,
    }]);
  }

  async function simpan() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/pengajuan-dana/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catatan, items }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusy(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  async function hapusDraft() {
    if (!confirm(`Hapus draft pengajuan bulan ${namaBulan(pengajuan.bulan)}?`)) return;
    const res = await fetch(`/api/admin/pengajuan-dana/${id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    router.push('/admin/laporan/pengajuan-dana');
  }

  async function ajukan() {
    if (!confirm(`Ajukan pengajuan dana bulan ${namaBulan(pengajuan.bulan)} sebesar ${rp(total)}? Gak bisa diedit lagi setelah ini.`)) return;
    setBusy(true);
    try {
      // Simpan dulu perubahan terakhir sebelum dikunci
      await fetch(`/api/admin/pengajuan-dana/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catatan, items }),
      });
      const res = await fetch(`/api/admin/pengajuan-dana/${id}/ajukan`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal mengajukan'); setBusy(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  async function putuskan(action) {
    if (!confirm(action === 'setujui' ? 'Setujui pengajuan ini?' : 'Tolak pengajuan ini?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/pengajuan-dana/${id}/putuskan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, catatan: catatanKeputusan }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal memproses'); setBusy(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  if (!user || loading || !pengajuan) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <Layout title="🧾 Pengajuan Dana Bulanan" backHref="/admin/laporan/pengajuan-dana">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-bold text-[#0E2F6E] text-lg">{namaBulan(pengajuan.bulan)}</div>
            <div className="text-xs text-gray-400">Dibuat oleh {pengajuan.created_by_nama || '-'}</div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_BADGE[pengajuan.status]}`}>{STATUS_LABEL[pengajuan.status]}</span>
        </div>

        {pengajuan.status !== 'draft' && (
          <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs text-gray-500">
            Diajukan oleh {pengajuan.diajukan_oleh_nama || '-'} · {tgl(pengajuan.diajukan_at)}
            {pengajuan.diputuskan_oleh_nama && (
              <> · {pengajuan.status === 'disetujui' ? 'Disetujui' : 'Ditolak'} oleh {pengajuan.diputuskan_oleh_nama} · {tgl(pengajuan.diputuskan_at)}</>
            )}
            {pengajuan.catatan_keputusan && <div className="mt-1 italic">&quot;{pengajuan.catatan_keputusan}&quot;</div>}
          </div>
        )}

        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 mb-4">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Catatan Pengajuan (opsional)</label>
          {draft ? (
            <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={2} className={inp}
              placeholder="Mis. ada kenaikan sewa kantor bulan ini, dst."/>
          ) : (
            <div className="text-sm text-gray-600">{catatan || '-'}</div>
          )}
        </div>

        {draft && referensiLalu && referensiLalu.items.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <div className="font-bold text-[#0E2F6E] mb-1">📋 Referensi {namaBulan(referensiLalu.bulan)}</div>
            <div className="text-[10px] text-gray-500 mb-2">
              Diajukan bulan lalu ({STATUS_LABEL[referensiLalu.status]}) — klik &quot;Pakai Lagi&quot; buat yang masih relevan, biarin aja yang udah gak kepake. Angka gelondongan bisa dipecah jadi beberapa baris manual setelah disalin.
            </div>
            <div className="space-y-2">
              {referensiLalu.items.map(it => (
                <div key={it.id} className="flex items-center justify-between bg-white rounded-lg p-2.5">
                  <div className="text-xs">
                    <div className="font-semibold text-gray-700">{it.keterangan}</div>
                    <div className="text-gray-400">{it.kategori_nama || '-'} · {rp(it.nominal)}</div>
                  </div>
                  <button onClick={() => pakaiLagi(it)} className="text-xs font-bold text-[#1A4FA0] hover:underline shrink-0">+ Pakai Lagi</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Realisasi Cashflow bulan lalu — uang yang BENERAN keluar per
            kategori (bukan yang diajukan/RAB-nya), selalu ada begitu Cashflow
            bulan itu udah diisi, jadi acuan yang lebih bisa diandalkan
            ketimbang referensi pengajuan di atas (yang cuma ada kalau bulan
            lalu emang pernah diajukan RAB-nya). */}
        {draft && referensiCashflow && referensiCashflow.per_kategori.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
            <div className="font-bold text-[#0E2F6E] mb-1">💳 Realisasi Cashflow {namaBulan(referensiCashflow.bulan)}</div>
            <div className="text-[10px] text-gray-500 mb-2">
              Uang yang beneran keluar per kategori bulan lalu (dari Cashflow) — klik &quot;Pakai Lagi&quot; buat jadiin acuan angka RAB bulan ini, tinggal diedit sesuai perkiraan.
            </div>
            <div className="space-y-2">
              {referensiCashflow.per_kategori.map(k => (
                <div key={k.kategori_id} className="flex items-center justify-between bg-white rounded-lg p-2.5">
                  <div className="text-xs">
                    <div className="font-semibold text-gray-700">{k.kategori_nama || '(tanpa kategori)'}</div>
                    <div className="text-gray-400">Realisasi: {rp(k.total)}</div>
                  </div>
                  <button onClick={() => pakaiLagiCashflow(k)} className="text-xs font-bold text-emerald-700 hover:underline shrink-0">+ Pakai Lagi</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 mb-4">
          <div className="font-bold text-[#0E2F6E] mb-3">Rincian Kebutuhan</div>
          <div className="space-y-2 mb-3">
            {items.map((it, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                {it.sumber === 'reimburse' && <span className="text-[10px] font-bold text-[#C9952A] bg-white px-1.5 py-0.5 rounded shrink-0">REIMBURSE</span>}
                {draft ? (
                  <>
                    <input value={it.keterangan} onChange={e => ubahItem(i, { keterangan: e.target.value })}
                      placeholder="Keterangan" className={`${inpSm} flex-1 min-w-[140px]`} />
                    <select value={it.kategori_id || ''} onChange={e => ubahItem(i, { kategori_id: e.target.value || null })} className={inpSm}>
                      <option value="">— Kategori —</option>
                      {kategoriList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                    </select>
                    <input type="number" value={it.nominal} onChange={e => ubahItem(i, { nominal: e.target.value })}
                      placeholder="Nominal" className={`${inpSm} w-32`} />
                    <button onClick={() => hapusItem(i)} className="text-red-500 text-xs font-bold hover:underline shrink-0">Hapus</button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 text-sm text-gray-700">
                      {it.keterangan}
                      {it.kategori_nama && <span className="text-xs text-gray-400"> · {it.kategori_nama}</span>}
                    </div>
                    <div className="font-semibold text-[#0E2F6E]">{rp(it.nominal)}</div>
                  </>
                )}
              </div>
            ))}
            {items.length === 0 && <div className="text-xs text-gray-400">Belum ada baris kebutuhan.</div>}
          </div>

          {draft && (
            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={tambahManual} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Baris Manual</button>
            </div>
          )}

          <div className="flex justify-between items-center border-t border-gray-200 pt-3 font-bold">
            <span className="text-sm">Total Diajukan</span>
            <span className="text-lg text-[#0E2F6E]">{rp(total)}</span>
          </div>
        </div>

        {draft && reimbursePending.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <div className="font-bold text-amber-800 mb-2">💸 Reimburse Belum Dibayar (belum ditarik ke pengajuan manapun)</div>
            <div className="space-y-2">
              {reimbursePending.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-white rounded-lg p-2.5">
                  <div className="text-xs">
                    <div className="font-semibold text-gray-700">{r.deskripsi} — {r.nama_staff}</div>
                    <div className="text-gray-400">{tgl(r.tanggal_pengeluaran)} · {rp(r.nominal)}</div>
                  </div>
                  <button onClick={() => tarikReimburse(r)} className="text-xs font-bold text-[#1A4FA0] hover:underline shrink-0">+ Tarik</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {draft && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={simpan} disabled={busy} className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm font-bold px-5 py-2.5 rounded-xl">
              {busy ? 'Menyimpan...' : '💾 Simpan Draft'}
            </button>
            <button onClick={ajukan} disabled={busy || items.length === 0} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
              📤 Ajukan buat Disetujui
            </button>
            <button onClick={hapusDraft} className="ml-auto text-red-500 hover:text-red-700 text-sm font-bold px-3 py-2.5">🗑️ Hapus Draft</button>
          </div>
        )}

        {pengajuan.status === 'diajukan' && isSuperAdmin && (
          <div className="bg-white rounded-xl border-2 border-[#1A4FA0]/30 p-4 mb-6">
            <div className="font-bold text-[#0E2F6E] mb-2">Keputusan</div>
            <textarea value={catatanKeputusan} onChange={e => setCatatanKeputusan(e.target.value)} rows={2} className={`${inp} mb-3`}
              placeholder="Catatan (opsional) — mis. alasan penolakan, atau catatan persetujuan"/>
            <div className="flex gap-2">
              <button onClick={() => putuskan('setujui')} disabled={busy} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
                ✅ Setujui
              </button>
              <button onClick={() => putuskan('tolak')} disabled={busy} className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
                ❌ Tolak
              </button>
            </div>
          </div>
        )}
        {pengajuan.status === 'diajukan' && !isSuperAdmin && (
          <div className="text-center text-xs text-gray-400 mb-6">Menunggu keputusan super admin.</div>
        )}
      </div>
    </Layout>
  );
}
