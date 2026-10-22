'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import InputNominal from '@/app/components/InputNominal';

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
        <InputNominal value={hargaSatuan} onChange={e => setHargaSatuan(e.target.value)} placeholder="Mis. 50000"
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

// Edit nama/deskripsi/ambang minimum (dikonfirmasi user 2026-10-12) —
// sebelumnya nama/deskripsi gak bisa diubah sama sekali setelah dibuat,
// ambang minimum cuma lewat prompt() browser yang kasar. gender_spesifik
// & kategori_program TETAP diedit lewat dropdown inline di tabel (udah
// jalan baik, gak perlu dipindah ke modal).
function ModalEditItem({ item, onClose, onSaved }) {
  const [nama, setNama] = useState(item.nama);
  const [deskripsi, setDeskripsi] = useState(item.deskripsi || '');
  const [stokMinimum, setStokMinimum] = useState(String(item.stok_minimum));
  const [loading, setLoading] = useState(false);

  async function simpan() {
    if (!nama.trim()) { alert('Nama item wajib diisi'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/perlengkapan', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, nama, deskripsi, stok_minimum: Number(stokMinimum) || 0 }),
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
        <div className="font-bold text-[#0E2F6E] mb-3">✏️ Edit Item — {item.nama}</div>
        <label className="text-xs font-semibold text-gray-500">Nama Item</label>
        <input value={nama} onChange={e => setNama(e.target.value)} autoFocus
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1" />
        <label className="text-xs font-semibold text-gray-500">Deskripsi (opsional)</label>
        <input value={deskripsi} onChange={e => setDeskripsi(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1" />
        <label className="text-xs font-semibold text-gray-500">Ambang Minimum (buat alert perlu dipesan ulang)</label>
        <input type="number" min="0" value={stokMinimum} onChange={e => setStokMinimum(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1" />
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

// Stok Keluar manual (dikonfirmasi user 2026-10-12) — jalur BARU, sebelum
// ini satu-satunya cara stok berkurang cuma lewat pengiriman kit otomatis
// (tandaiPengirimanJamaah). Buat kasus stok diambil/berkurang di luar itu
// (rusak, hilang, dipakai sampel, koreksi fisik, dll) — keterangan WAJIB
// diisi (beda dari Stok Masuk yang opsional) biar ada jejak kenapa.
function ModalStokKeluar({ item, onClose, onSaved }) {
  const [qty, setQty] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [loading, setLoading] = useState(false);

  async function simpan() {
    if (!qty || Number(qty) <= 0) { alert('Qty harus lebih dari 0'); return; }
    if (Number(qty) > item.stok_saat_ini) { alert(`Qty keluar melebihi stok saat ini (${item.stok_saat_ini})`); return; }
    if (!keterangan.trim()) { alert('Keterangan wajib diisi untuk stok keluar manual'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/perlengkapan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, qty: Number(qty), keterangan, tipe: 'keluar' }),
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
        <div className="font-bold text-[#0E2F6E] mb-3">➖ Stok Keluar (Manual) — {item.nama}</div>
        <div className="text-[10px] text-gray-400 mb-3">Buat stok yang berkurang DI LUAR pengiriman kit otomatis — mis. rusak, hilang, dipakai sampel, atau koreksi hitung fisik. Stok saat ini: <b>{item.stok_saat_ini}</b>.</div>
        <label className="text-xs font-semibold text-gray-500">Jumlah keluar</label>
        <input type="number" min="1" max={item.stok_saat_ini} value={qty} onChange={e => setQty(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1" autoFocus />
        <label className="text-xs font-semibold text-gray-500">Keterangan (wajib)</label>
        <input value={keterangan} onChange={e => setKeterangan(e.target.value)} placeholder="mis. Rusak kena hujan, diambil manual oleh Tim X"
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm mb-3 mt-1" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-full text-sm">Batal</button>
          <button onClick={simpan} disabled={loading} className="flex-1 bg-red-600 text-white font-bold py-2 rounded-full text-sm disabled:opacity-50">
            {loading ? 'Menyimpan...' : 'Catat Stok Keluar'}
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
  const [editItem, setEditItem] = useState(null);
  const [stokKeluarItem, setStokKeluarItem] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [showTambahItem, setShowTambahItem] = useState(false);
  // Aksi sekunder (Edit/Nonaktifkan/Hapus) dikumpulin ke menu titik-tiga
  // per baris (dikonfirmasi user 2026-10-12 -- 5 tombol sebelumnya numpuk
  // 2 baris & kepotong di layar sempit). Cuma 1 menu kebuka dalam satu
  // waktu -- id item yang lagi kebuka, null kalau semua tertutup. Posisi
  // DIHITUNG dari tombol (position: fixed) biar gak kepotong overflow-hidden
  // bungkus tabel (kejadian nyata buat baris paling bawah).
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  function bukaMenu(e, id) {
    if (openMenuId === id) { setOpenMenuId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setOpenMenuId(id);
  }

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { router.replace('/admin?tab=dashboard'); }
  }, [user]);

  // Tutup menu titik-tiga kalau klik di luar area menu.
  useEffect(() => {
    if (openMenuId == null) return;
    function handleClick(e) {
      if (!e.target.closest('[data-menu-aksi]')) setOpenMenuId(null);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openMenuId]);

  function muat() {
    fetch('/api/admin/perlengkapan').then(r => r.json()).then(d => setItems(d.items || [])).catch(() => setItems([]));
  }
  useEffect(() => { if (user?.role === 'super_admin') muat(); }, [user]);

  function bukaRiwayat() {
    fetch('/api/admin/perlengkapan/ledger').then(r => r.json()).then(d => setLedger(d.ledger || [])).catch(() => setLedger([]));
  }

  // Nonaktifkan/Aktifkan (dikonfirmasi user 2026-10-12) -- sebelumnya gak
  // ada jalur sama sekali, item cuma bisa dihapus beneran (dan itu pun
  // CUMA kalau stok udah 0). Item nonaktif TETAP kelihatan di tabel ini
  // (super_admin masih bisa pantau/aktifkan lagi kapan aja), tapi:
  // 1. GAK muncul lagi di checklist "contreng item" pas kirim kit ke
  //    jamaah baru (lihat daftarItemUntukJamaah di lib/perlengkapan.js),
  // 2. GAK dihitung ke alert "perlu dipesan ulang" (cekItemPerluDipesan).
  // Aman dipakai buat item discontinued yang stoknya masih nyisa — gak
  // maksa harus dihabisin dulu baru bisa "berhenti dipakai".
  async function toggleAktif(item) {
    const aktifBaru = !item.aktif;
    if (!confirm(aktifBaru
      ? `Aktifkan lagi "${item.nama}"? Bakal muncul lagi di checklist kirim kit jamaah baru.`
      : `Nonaktifkan "${item.nama}"? Gak akan muncul lagi di checklist kirim kit jamaah baru (stok yang masih ada TETAP tersimpan, bisa dihabiskan lewat Stok Keluar manual).`
    )) return;
    const res = await fetch('/api/admin/perlengkapan', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, aktif: aktifBaru }),
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

  // Hapus beneran CUMA kalau stok_saat_ini = 0 (dikonfirmasi user
  // 2026-10-08) -- server yang nentuin boleh/enggak, di sini cuma konfirmasi.
  async function hapusItem(item) {
    if (!confirm(`Hapus "${item.nama}"? Ini gak bisa dibatalin.`)) return;
    const res = await fetch(`/api/admin/perlengkapan?id=${item.id}`, { method: 'DELETE' });
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
                <tr key={it.id} className={`border-t border-gray-100 ${!it.aktif ? 'bg-gray-50 opacity-60' : it.perlu_dipesan ? 'bg-red-50' : ''}`}>
                  <td className="px-3 py-2 font-semibold text-[#0E2F6E]">
                    {it.nama} {it.perlu_dipesan && it.aktif && <span className="text-red-500">⚠️</span>}
                    {!it.aktif && <span className="ml-1.5 text-[9px] font-bold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-full align-middle">NONAKTIF</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{GENDER_LABEL[it.gender_spesifik]}</td>
                  <td className="px-3 py-2">
                    <select value={it.kategori_program} onChange={e => ubahKategori(it, e.target.value)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-full border-0 ${it.kategori_program === 'sahabat_baitullah' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                      {Object.entries(KATEGORI_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right font-bold">{it.stok_saat_ini}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{it.stok_minimum}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{it.kebutuhan_mendatang}</td>
                  {/* Direwamp (dikonfirmasi user 2026-10-12) -- sebelumnya
                      5 tombol sejajar numpuk 2 baris & kepotong di layar
                      sempit. Sekarang 2 aksi UTAMA (paling sering dipakai)
                      tetap tombol langsung, 3 aksi SEKUNDER (Edit/
                      Nonaktifkan/Hapus) dikumpulin ke menu titik-tiga. */}
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => setModalItem(it)}
                        className="bg-[#1A4FA0] text-white text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap">
                        ➕ Masuk
                      </button>
                      {/* Disabled kalau stok udah 0 -- gak ada apa pun buat
                          dikeluarin (dikonfirmasi user 2026-10-12). */}
                      <button onClick={() => setStokKeluarItem(it)} disabled={it.stok_saat_ini === 0}
                        title="Stok Keluar (manual)"
                        className="bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
                        ➖ Keluar
                      </button>
                      <button data-menu-aksi onClick={e => bukaMenu(e, it.id)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-600 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">
                        ⋮
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items == null && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Memuat...</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Menu titik-tiga dirender SEKALI di luar tabel, position: fixed
            dihitung dari tombol yang diklik (lihat bukaMenu()) -- bukan
            absolute di dalam baris, biar gak kepotong overflow-hidden
            bungkus tabel (kejadian nyata buat baris paling bawah,
            dikonfirmasi user 2026-10-12). */}
        {openMenuId != null && (() => {
          const it = (items || []).find(i => i.id === openMenuId);
          if (!it) return null;
          return (
            <div data-menu-aksi style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
              className="z-20 bg-white rounded-xl border border-gray-200 shadow-lg py-1 w-48 text-left">
              <button onClick={() => { setEditItem(it); setOpenMenuId(null); }}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                ✏️ Edit Item
              </button>
              <button onClick={() => { toggleAktif(it); setOpenMenuId(null); }}
                title={it.aktif ? 'Nonaktifkan item ini' : 'Aktifkan lagi item ini'}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                {it.aktif ? '🚫 Nonaktifkan' : '✅ Aktifkan'}
              </button>
              {/* Cuma aktif (gak disabled) kalau stok udah 0 -- kalau masih
                  ada stok, klik tetap jalan tapi server nolak & kasih tau
                  alasannya (dikonfirmasi user 2026-10-08). Buat stok yang
                  masih ada, pakai "Nonaktifkan" dulu atau habiskan lewat
                  "Stok Keluar" (dikonfirmasi user 2026-10-12). */}
              <button onClick={() => { hapusItem(it); setOpenMenuId(null); }}
                title={it.stok_saat_ini !== 0 ? 'Stok belum 0, kosongkan dulu (Stok Keluar) atau nonaktifkan' : 'Hapus item'}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 flex items-center gap-2 border-t border-gray-100">
                🗑️ Hapus Item
              </button>
            </div>
          );
        })()}

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
      {editItem && (
        <ModalEditItem item={editItem} onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); muat(); }} />
      )}
      {stokKeluarItem && (
        <ModalStokKeluar item={stokKeluarItem} onClose={() => setStokKeluarItem(null)}
          onSaved={() => { setStokKeluarItem(null); muat(); }} />
      )}
      {showTambahItem && (
        <ModalTambahItem onClose={() => setShowTambahItem(false)}
          onSaved={() => { setShowTambahItem(false); muat(); }} />
      )}
    </Layout>
  );
}
