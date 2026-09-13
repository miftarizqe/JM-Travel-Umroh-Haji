'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const GENDER_LABEL = { semua: 'Semua', laki: 'Laki-laki', perempuan: 'Perempuan' };
const KATEGORI_LABEL = { umum: 'Umum', sahabat_baitullah: 'Sahabat Baitullah' };

function ModalTambahItem({ onClose, onSaved }) {
  const [nama, setNama] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [genderSpesifik, setGenderSpesifik] = useState('semua');
  const [kategoriProgram, setKategoriProgram] = useState('umum');
  const [loading, setLoading] = useState(false);

  async function simpan() {
    if (!nama.trim()) { alert('Nama item wajib diisi'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/perlengkapan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama, deskripsi, gender_spesifik: genderSpesifik, kategori_program: kategoriProgram }),
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
        <div className="font-bold text-[#0E2F6E] mb-3">➕ Tambah Item Perlengkapan</div>
        <label className="text-xs font-semibold text-gray-500">Nama Item</label>
        <input value={nama} onChange={e => setNama(e.target.value)} placeholder="mis. Sarung Sahabat Baitullah" autoFocus
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1" />
        <label className="text-xs font-semibold text-gray-500">Deskripsi (opsional)</label>
        <input value={deskripsi} onChange={e => setDeskripsi(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1" />
        <label className="text-xs font-semibold text-gray-500">Gender Spesifik</label>
        <select value={genderSpesifik} onChange={e => setGenderSpesifik(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1">
          {Object.entries(GENDER_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="text-xs font-semibold text-gray-500">Kategori Program</label>
        <select value={kategoriProgram} onChange={e => setKategoriProgram(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1">
          {Object.entries(KATEGORI_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <div className="text-[10px] text-gray-400 mb-3">Item "Sahabat Baitullah" cuma muncul di checklist pengiriman jamaah yang booking-nya lewat Program Sahabat Baitullah — item "Umum" muncul di checklist program publik biasa.</div>
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

function ModalTambahStok({ item, onClose, onSaved }) {
  const [qty, setQty] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [hargaSatuan, setHargaSatuan] = useState('');
  const [akunId, setAkunId] = useState('');
  const [programId, setProgramId] = useState('');
  const [akunList, setAkunList] = useState([]);
  const [programList, setProgramList] = useState([]);
  const [loading, setLoading] = useState(false);

  // Dua-duanya dimuat sekali pas modal dibuka — cuma kepake kalau admin
  // beneran isi harga (biar belanja ini kehitung sebagai pengeluaran
  // cashflow), gak wajib, jangan blokir tambah stok yang cuma nyatet qty.
  useEffect(() => {
    fetch('/api/admin/cashflow/akun').then(r => r.json()).then(d => setAkunList(d.akun || [])).catch(() => {});
    fetch('/api/admin/programs').then(r => r.json()).then(d => setProgramList(d.programs || [])).catch(() => {});
  }, []);

  async function simpan() {
    if (!qty || Number(qty) <= 0) { alert('Qty harus lebih dari 0'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/perlengkapan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: item.id, qty: Number(qty), keterangan,
          harga_satuan: hargaSatuan || undefined, akun_id: akunId || undefined, program_id: programId || undefined,
        }),
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
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1" />
        <label className="text-xs font-semibold text-gray-500">Harga satuan (opsional — biar tercatat sebagai pengeluaran)</label>
        <input type="number" min="0" value={hargaSatuan} onChange={e => setHargaSatuan(e.target.value)} placeholder="Mis. 50000"
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1" />
        {hargaSatuan && Number(hargaSatuan) > 0 && (
          <>
            <label className="text-xs font-semibold text-gray-500">Bayar dari akun (opsional — kosongkan kalau ini bon dari owner/pihak lain, bukan lewat rekening yang ditrack di sini)</label>
            <select value={akunId} onChange={e => setAkunId(e.target.value)} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1">
              <option value="">— Tanpa akun (purchasing/bon) —</option>
              {akunList.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}
            </select>
            <label className="text-xs font-semibold text-gray-500">Program (opsional)</label>
            <select value={programId} onChange={e => setProgramId(e.target.value)} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1">
              <option value="">— Tanpa program —</option>
              {programList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="text-[10px] text-gray-400 mb-3">Total Rp {(Number(hargaSatuan) * (Number(qty) || 0)).toLocaleString('id-ID')} bakal otomatis kecatat sebagai pengeluaran &quot;Perlengkapan Jamaah&quot;.</div>
          </>
        )}
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
  const [showTambahItem, setShowTambahItem] = useState(false);

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

  async function ubahKategori(item, kategoriBaru) {
    const res = await fetch('/api/admin/perlengkapan', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, kategori_program: kategoriBaru }),
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
        <div className="flex justify-end">
          <button onClick={() => setShowTambahItem(true)}
            className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-4 py-2 rounded-full">
            ➕ Item Baru
          </button>
        </div>
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
                <th className="px-3 py-2">Kategori</th>
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
                  <td className="px-3 py-2">
                    <select value={it.kategori_program} onChange={e => ubahKategori(it, e.target.value)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-full border-0 ${it.kategori_program === 'sahabat_baitullah' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                      {Object.entries(KATEGORI_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
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
              {items == null && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Memuat...</td></tr>}
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
                      <td className="py-1.5 text-gray-500">
                        {l.keterangan || (l.booking_id ? `Kirim ke ${l.booking_id}` : '-')}
                        {l.harga_satuan != null && <span className="text-[#1A4FA0]"> — Rp {Number(l.harga_satuan).toLocaleString('id-ID')}/unit{l.cashflow_transaksi_id ? ' 🏷️' : ''}</span>}
                      </td>
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
      {showTambahItem && (
        <ModalTambahItem onClose={() => setShowTambahItem(false)}
          onSaved={() => { setShowTambahItem(false); muat(); }} />
      )}
    </Layout>
  );
}
