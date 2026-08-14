'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const GENDER_LABEL = { semua: 'Semua', laki: 'Laki-laki', perempuan: 'Perempuan' };

function ModalTambahStok({ item, onClose, onSaved }) {
  const [qty, setQty] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [loading, setLoading] = useState(false);

  async function simpan() {
    if (!qty || Number(qty) <= 0) { alert('Qty harus lebih dari 0'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/perlengkapan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, qty: Number(qty), keterangan }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setLoading(false); return; }
      onSaved();
    } catch { alert('Terjadi kesalahan'); }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-5 w-full max-w-sm">
        <div className="font-bold text-[#0E2F6E] mb-3">➕ Tambah Stok — {item.nama}</div>
        <label className="text-xs font-semibold text-gray-500">Jumlah masuk</label>
        <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1" autoFocus />
        <label className="text-xs font-semibold text-gray-500">Keterangan (opsional)</label>
        <input value={keterangan} onChange={e => setKeterangan(e.target.value)} placeholder="mis. Pembelian dari supplier X"
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-4 mt-1" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-full text-sm">Batal</button>
          <button onClick={simpan} disabled={loading} className="flex-1 bg-[#1A4FA0] text-white font-bold py-2 rounded-full text-sm disabled:opacity-50">
            {loading ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PerlengkapanPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [items, setItems] = useState(null);
  const [modalItem, setModalItem] = useState(null);
  const [ledger, setLedger] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { router.replace('/admin?tab=dashboard'); }
  }, [user]);

  function muat() {
    fetch('/api/admin/perlengkapan').then(r => r.json()).then(d => setItems(d.items || [])).catch(() => setItems([]));
  }
  useEffect(() => { if (user?.role === 'super_admin') muat(); }, [user]);

  function bukaRiwayat() {
    fetch('/api/admin/perlengkapan/ledger').then(r => r.json()).then(d => setLedger(d.ledger || [])).catch(() => setLedger([]));
  }

  async function editMinimum(item) {
    const nilai = prompt(`Ambang minimum untuk "${item.nama}" (sekarang: ${item.stok_minimum})`, item.stok_minimum);
    if (nilai == null) return;
    const res = await fetch('/api/admin/perlengkapan', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, stok_minimum: Number(nilai) }),
    });
    if (res.ok) muat(); else alert((await res.json()).error);
  }

  if (!user || user.role !== 'super_admin') {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const perluDipesan = (items || []).filter(i => i.perlu_dipesan);

  return (
    <Layout title="🔒 Kelola Perlengkapan (Gudang)" backHref="/admin?tab=dashboard">
      <div className="max-w-4xl mx-auto space-y-4">
        {perluDipesan.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            <div className="font-bold mb-1">⚠️ {perluDipesan.length} item perlu dipesan ulang</div>
            <div>{perluDipesan.map(i => i.nama).join(', ')}</div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Gender</th>
                <th className="px-3 py-2 text-right">Stok</th>
                <th className="px-3 py-2 text-right">Ambang Min.</th>
                <th className="px-3 py-2 text-right">Kebutuhan Mendatang</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(items || []).map(it => (
                <tr key={it.id} className={`border-t border-gray-100 ${it.perlu_dipesan ? 'bg-red-50' : ''}`}>
                  <td className="px-3 py-2 font-semibold text-[#0E2F6E]">
                    {it.nama} {it.perlu_dipesan && <span className="text-red-500">⚠️</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{GENDER_LABEL[it.gender_spesifik]}</td>
                  <td className="px-3 py-2 text-right font-bold">{it.stok_saat_ini}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => editMinimum(it)} className="text-[#1A4FA0] underline">{it.stok_minimum}</button>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">{it.kebutuhan_mendatang}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setModalItem(it)}
                      className="bg-[#1A4FA0] text-white text-xs font-bold px-3 py-1.5 rounded-full">
                      ➕ Stok Masuk
                    </button>
                  </td>
                </tr>
              ))}
              {items == null && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Memuat...</td></tr>}
            </tbody>
          </table>
        </div>

        <button onClick={bukaRiwayat} className="text-sm font-bold text-[#1A4FA0]">📜 Lihat Riwayat Stok Masuk/Keluar</button>

        {ledger && (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 max-h-96 overflow-y-auto">
            <div className="font-bold text-[#0E2F6E] mb-2 text-sm">Riwayat Stok (200 terakhir)</div>
            {ledger.length === 0 ? <div className="text-xs text-gray-400">Belum ada riwayat.</div> : (
              <table className="w-full text-xs">
                <tbody>
                  {ledger.map(l => (
                    <tr key={l.id} className="border-t border-gray-50">
                      <td className="py-1.5 text-gray-400 whitespace-nowrap">{new Date(l.created_at).toLocaleString('id-ID')}</td>
                      <td className="py-1.5 font-semibold">{l.item_nama}</td>
                      <td className={`py-1.5 font-bold ${l.tipe === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                        {l.tipe === 'in' ? '+' : '-'}{l.qty}
                      </td>
                      <td className="py-1.5 text-gray-500">{l.keterangan || (l.booking_id ? `Kirim ke ${l.booking_id}` : '-')}</td>
                      <td className="py-1.5 text-gray-400">{l.input_oleh_nama || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {modalItem && (
        <ModalTambahStok item={modalItem} onClose={() => setModalItem(null)}
          onSaved={() => { setModalItem(null); muat(); }} />
      )}
    </Layout>
  );
}
