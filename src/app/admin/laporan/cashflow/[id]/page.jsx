'use client';
import { Fragment, Suspense, useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import UploadBon from '@/app/components/UploadBon';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const waktuInput = (t) => t ? new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
// PENTING: jangan pernah `.slice(0, 10)` string tanggal dari API — MySQL DATE
// kebaca sebagai Date lokal lalu di-JSON-kan jadi ISO string UTC, yang buat
// tanggal awal bulan (mis. 1 Juli) kegeser mundur jadi "30 Jun" kalau di-slice
// mentah. Selalu lewat sini biar konsisten pakai komponen tanggal LOKAL.
const keTanggalInput = (v) => {
  const d = v ? new Date(v) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const namaBulan = (b) => {
  if (!b) return '-';
  const [y, m] = b.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

const KOSONG_FORM = { id: null, tanggal: '', deskripsi: '', kategori_id: '', program_id: '', akun_id: '', tipe: 'out', nominal: '', bukti_path: null, bukti_nama: null, is_settlement: false, penerima_settlement: '' };
const KOSONG_TRANSFER = { tanggal: '', deskripsi: '', akun_dari_id: '', akun_ke_id: '', nominal: '' };
const KOSONG_BREAKDOWN = { tanggal: '', deskripsi: '', kategori_id: '', nominal: '', bukti_path: null, bukti_nama: null, kembalian: false };
const KOSONG_REIMBURSE = { id: null, nama_staff: '', tanggal_pengeluaran: '', deskripsi: '', kategori_id: '', nominal: '', bukti_path: null, bukti_nama: null };

const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";

// Form tambah/edit transaksi — komponen terpisah (bukan didefinisikan di
// dalam komponen halaman) supaya identitasnya stabil antar render. Edit
// nempel INLINE tepat di bawah baris transaksi yang diedit (di dalam
// <table>, sebagai <tr> tambahan — pola sama kayak "Rincikan" yang sudah
// ada), bukan di atas tabel — biar gak perlu scroll naik-turun.
function FormTransaksi({ form, setForm, akunList, kategoriList, programList, saving, onSimpan, onBatal }) {
  return (
    <div className="bg-white rounded-xl border-2 border-[#1A4FA0] p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Tanggal</label>
          <input type="date" value={form.tanggal} onChange={e => { if (e.target.value) setForm({ ...form, tanggal: e.target.value }); }} className={inp} />
        </div>
        <div>
          <label className={lbl}>Akun</label>
          <select value={form.akun_id} onChange={e => setForm({ ...form, akun_id: Number(e.target.value) })} className={inp}>
            {akunList.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={lbl}>Deskripsi</label>
        <input value={form.deskripsi} onChange={e => setForm({ ...form, deskripsi: e.target.value })} placeholder="Mis. Listrik Juli 2026" className={inp} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Tipe</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm({ ...form, tipe: 'out', kategori_id: '' })}
              className={`flex-1 py-2 rounded-lg text-sm font-bold ${form.tipe === 'out' ? 'bg-red-100 text-red-700 border-2 border-red-300' : 'bg-gray-50 text-gray-400 border-2 border-gray-100'}`}>OUT (keluar)</button>
            <button type="button" onClick={() => setForm({ ...form, tipe: 'in', kategori_id: '' })}
              className={`flex-1 py-2 rounded-lg text-sm font-bold ${form.tipe === 'in' ? 'bg-green-100 text-green-700 border-2 border-green-300' : 'bg-gray-50 text-gray-400 border-2 border-gray-100'}`}>IN (masuk)</button>
          </div>
        </div>
        <div>
          <label className={lbl}>Nominal (Rp)</label>
          <input type="number" value={form.nominal} onChange={e => setForm({ ...form, nominal: e.target.value })} placeholder="Mis. 150000" className={inp} />
        </div>
      </div>
      <div>
        <label className={lbl}>Kategori (opsional)</label>
        <select value={form.kategori_id} onChange={e => setForm({ ...form, kategori_id: e.target.value ? Number(e.target.value) : '' })} className={inp}>
          <option value="">— Tanpa kategori —</option>
          {kategoriList.filter(k => k.tipe === form.tipe).map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
        </select>
      </div>
      <div>
        {/* Tag opsional ke 1 program — fondasi laporan Realisasi vs Budget
            (bandingin duit yang BENERAN keluar/masuk di sini vs HPP budget
            program itu). Kosong = transaksi company-wide, gak nempel ke
            program manapun (gaji, sewa, dst) — perilaku lama gak berubah. */}
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
      {form.tipe === 'out' && (
        <div className="bg-amber-50 rounded-lg p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-amber-700">
            <input type="checkbox" checked={form.is_settlement} onChange={e => setForm({ ...form, is_settlement: e.target.checked })} />
            Ini transfer ke staff untuk belanja (settlement — belum ada rincian bon)
          </label>
          {form.is_settlement && (
            <input value={form.penerima_settlement} onChange={e => setForm({ ...form, penerima_settlement: e.target.value })}
              placeholder="Nama staff penerima" className={`${inp} mt-2`} />
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onSimpan} disabled={saving} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {saving ? 'Menyimpan...' : '💾 Simpan'}
        </button>
        <button onClick={onBatal} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
      </div>
    </div>
  );
}

export default function CashflowPeriodePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>}>
      <CashflowPeriodeInner />
    </Suspense>
  );
}

function CashflowPeriodeInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const periodeId = params?.id;
  const rincikanParam = searchParams?.get('rincikan');
  const [user] = useCurrentUser();
  const [periode, setPeriode] = useState(null);
  const [saldo, setSaldo] = useState([]);
  const [anggaran, setAnggaran] = useState(null);
  const [akunList, setAkunList] = useState([]);
  const [kategoriList, setKategoriList] = useState([]);
  const [programList, setProgramList] = useState([]);
  const [transaksi, setTransaksi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState(KOSONG_TRANSFER);
  const [rincikan, setRincikan] = useState(null); // { induk_id, items: [...] } — bisa lebih dari 1 item belanja
  const [busyAksi, setBusyAksi] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [bonCheckList, setBonCheckList] = useState(null); // null = modal tertutup
  const [settlementCheckList, setSettlementCheckList] = useState(null); // null = modal tertutup
  const [importMutasi, setImportMutasi] = useState(null); // null = modal tertutup; { tahap: 'upload'|'review', ... }
  const [reimburseList, setReimburseList] = useState([]);
  const [formReimburse, setFormReimburse] = useState(null); // null = form tertutup
  const [bayarForm, setBayarForm] = useState(null); // { id, akun_id } — klaim yang lagi dipilih akun buat dibayar

  function muat() {
    Promise.all([
      fetch(`/api/admin/cashflow/periode/${periodeId}`).then(r => r.json()),
      fetch('/api/admin/cashflow/akun').then(r => r.json()),
      fetch('/api/admin/cashflow/kategori').then(r => r.json()),
      fetch(`/api/admin/cashflow/transaksi?periode_id=${periodeId}`).then(r => r.json()),
      fetch('/api/admin/cashflow/reimburse?status=belum_dibayar').then(r => r.json()),
      fetch('/api/admin/programs').then(r => r.json()),
    ]).then(([p, a, k, t, r, pr]) => {
      if (p.error) { alert(p.error); router.push('/admin/laporan/cashflow'); return; }
      setPeriode(p.periode);
      setSaldo(p.saldo || []);
      setAnggaran(p.anggaran || null);
      setAkunList(a.akun || []);
      setKategoriList(k.kategori || []);
      setTransaksi(t.transaksi || []);
      setReimburseList(r.reimburse || []);
      setProgramList(pr.programs || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { router.replace('/admin?tab=dashboard'); }
  }, [user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (periodeId) muat(); }, [periodeId]);

  useEffect(() => {
    if (!rincikanParam || transaksi.length === 0 || rincikan || periode?.status === 'submitted') return;
    const target = transaksi.find(t => t.id === Number(rincikanParam) && t.is_settlement);
    if (target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRincikan({ induk_id: target.id, items: [{ ...KOSONG_BREAKDOWN, tanggal: keTanggalInput(target.tanggal) }] });
    }
  }, [transaksi, rincikanParam, rincikan, periode]);

  if (!user || user.role !== 'super_admin' || loading || !periode) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const terkunci = periode.status === 'submitted';

  async function simpanTransaksi() {
    if (!form.tanggal || !form.deskripsi.trim() || !form.akun_id || !form.nominal || Number(form.nominal) <= 0) {
      alert('Tanggal, deskripsi, akun & nominal wajib diisi!'); return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/cashflow/transaksi', {
        method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, periode_id: Number(periodeId) }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setSaving(false); return; }
      setForm(null);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function unggahBonLangsung(t, { bukti_path, bukti_nama }) {
    await fetch('/api/admin/cashflow/transaksi', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: t.id, tanggal: keTanggalInput(t.tanggal), deskripsi: t.deskripsi, kategori_id: t.kategori_id || null,
        akun_id: t.akun_id, tipe: t.tipe, nominal: t.nominal, bukti_path, bukti_nama,
        is_settlement: !!t.is_settlement, penerima_settlement: t.penerima_settlement || '',
      }),
    });
    muat();
  }

  async function ubahCetakMode(t, cetak_mode) {
    if (t.cetak_mode === cetak_mode) return;
    await fetch('/api/admin/cashflow/transaksi', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, cetak_mode }),
    });
    muat();
  }

  async function hapusTransaksi(id) {
    if (!confirm('Hapus transaksi ini?')) return;
    const res = await fetch(`/api/admin/cashflow/transaksi?id=${id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    muat();
  }

  async function simpanTransfer() {
    const { tanggal, deskripsi, akun_dari_id, akun_ke_id, nominal } = transferForm;
    if (!tanggal || !deskripsi.trim() || !akun_dari_id || !akun_ke_id || !nominal || Number(nominal) <= 0) {
      alert('Semua field wajib diisi!'); return;
    }
    setBusyAksi(true);
    try {
      const res = await fetch('/api/admin/cashflow/transaksi/transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...transferForm, periode_id: Number(periodeId) }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal mencatat transfer'); setBusyAksi(false); return; }
      setShowTransfer(false);
      setTransferForm(KOSONG_TRANSFER);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusyAksi(false);
  }

  function tambahItemRincikan(tanggalDefault) {
    setRincikan(r => ({ ...r, items: [...r.items, { ...KOSONG_BREAKDOWN, tanggal: tanggalDefault }] }));
  }

  function ubahItemRincikan(idx, patch) {
    setRincikan(r => ({ ...r, items: r.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  }

  function hapusItemRincikan(idx) {
    setRincikan(r => ({ ...r, items: r.items.filter((_, i) => i !== idx) }));
  }

  async function simpanSemuaRincian(indukId) {
    const items = rincikan.items;
    for (const it of items) {
      if (!it.tanggal || !it.deskripsi.trim() || !it.nominal || Number(it.nominal) <= 0) {
        alert('Tanggal, deskripsi & nominal wajib diisi di semua item!'); return;
      }
    }
    const induk = transaksi.find(t => t.id === indukId);
    setBusyAksi(true);
    try {
      for (const it of items) {
        const res = await fetch('/api/admin/cashflow/transaksi', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            periode_id: Number(periodeId), tanggal: it.tanggal, deskripsi: it.deskripsi, kategori_id: it.kategori_id || null,
            akun_id: induk.akun_id, tipe: it.kembalian ? 'in' : 'out', nominal: it.nominal,
            bukti_path: it.bukti_path, bukti_nama: it.bukti_nama, settlement_induk_id: indukId,
          }),
        });
        const d = await res.json();
        if (!res.ok) { alert(d.error || 'Gagal menyimpan salah satu item'); setBusyAksi(false); muat(); return; }
      }
      setRincikan(null);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusyAksi(false);
  }

  function mulaiImportMutasi() {
    setImportMutasi({ tahap: 'upload', akunId: akunList[0]?.id || '', file: null, memproses: false });
  }

  async function parseMutasiRekeningFile() {
    if (!importMutasi.file || !importMutasi.akunId) { alert('Pilih akun & file PDF dulu'); return; }
    setImportMutasi(m => ({ ...m, memproses: true }));
    try {
      const fd = new FormData();
      fd.append('file', importMutasi.file);
      fd.append('periode_id', periodeId);
      fd.append('akun_id', importMutasi.akunId);
      const res = await fetch('/api/admin/cashflow/transaksi/import/parse', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal memproses file'); setImportMutasi(m => ({ ...m, memproses: false })); return; }
      setImportMutasi({
        tahap: 'review',
        akunId: importMutasi.akunId,
        rows: d.rows.map(r => ({ ...r, sertakan: !r.kemungkinan_duplikat, bukti_path: null, bukti_nama: null })),
        menyimpan: false,
      });
    } catch { alert('Terjadi kesalahan'); setImportMutasi(m => ({ ...m, memproses: false })); }
  }

  function ubahBarisImport(idx, patch) {
    setImportMutasi(m => ({ ...m, rows: m.rows.map((r, i) => i === idx ? { ...r, ...patch } : r) }));
  }

  async function simpanImportMutasi() {
    const rowsTerpilih = importMutasi.rows.filter(r => r.sertakan);
    if (rowsTerpilih.length === 0) { alert('Pilih minimal 1 transaksi buat disimpan'); return; }
    setImportMutasi(m => ({ ...m, menyimpan: true }));
    try {
      const res = await fetch('/api/admin/cashflow/transaksi/import/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periode_id: Number(periodeId), akun_id: importMutasi.akunId,
          rows: rowsTerpilih.map(r => ({ tanggal: r.tanggal, deskripsi: r.deskripsi, kategori_id: r.kategori_id || null, tipe: r.tipe, nominal: r.nominal, bukti_path: r.bukti_path, bukti_nama: r.bukti_nama })),
        }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setImportMutasi(m => ({ ...m, menyimpan: false })); return; }
      setImportMutasi(null);
      muat();
    } catch { alert('Terjadi kesalahan'); setImportMutasi(m => ({ ...m, menyimpan: false })); }
  }

  async function simpanReimburse() {
    const f = formReimburse;
    if (!f.tanggal_pengeluaran || !f.deskripsi.trim() || !f.nama_staff.trim() || !f.nominal || Number(f.nominal) <= 0) {
      alert('Nama staff, tanggal, deskripsi & nominal wajib diisi!'); return;
    }
    setBusyAksi(true);
    try {
      const res = await fetch('/api/admin/cashflow/reimburse', {
        method: f.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusyAksi(false); return; }
      setFormReimburse(null);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusyAksi(false);
  }

  async function hapusReimburse(id) {
    if (!confirm('Hapus klaim reimburse ini?')) return;
    const res = await fetch(`/api/admin/cashflow/reimburse?id=${id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    muat();
  }

  async function bayarReimburse(id) {
    if (!bayarForm?.akun_id) { alert('Pilih akun buat bayar dulu'); return; }
    setBusyAksi(true);
    try {
      const res = await fetch(`/api/admin/cashflow/reimburse/${id}/bayar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periode_id: Number(periodeId), akun_id: bayarForm.akun_id }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal membayar'); setBusyAksi(false); return; }
      setBayarForm(null);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusyAksi(false);
  }

  async function mulaiSubmit() {
    // Settlement yang sisanya NEGATIF (staff nombokin lebih dari yang
    // ditransfer) dianggap selesai kalau SUDAH ada klaim reimburse yang
    // nyambung ke situ (dari_settlement_id) — apa pun statusnya (udah
    // dibayar atau belum), biar gak nanya berulang tiap mau submit.
    const semuaReimburse = await fetch('/api/admin/cashflow/reimburse').then(r => r.json()).catch(() => ({ reimburse: [] }));
    const settlementSudahDireimburse = new Set((semuaReimburse.reimburse || []).map(r => r.dari_settlement_id).filter(Boolean));

    const settlementBelumSelesai = topLevel
      .filter(t => t.is_settlement)
      .map(t => ({ ...t, sisa: sisaSettlement(t) }))
      .filter(t => t.sisa > 0 || (t.sisa < 0 && !settlementSudahDireimburse.has(t.id)));

    if (settlementBelumSelesai.length > 0) {
      setSettlementCheckList(settlementBelumSelesai);
      return;
    }
    lanjutkanSetelahCekSettlement();
  }

  function lanjutkanSetelahCekSettlement() {
    // Baris induk settlement (mis. "TF to Dana Panji") secara alami gak punya
    // bon sendiri — bonnya nempel di rincian/anaknya. Jadi induk dianggap
    // lengkap kalau SEMUA anaknya udah ada bon (atau ditandai tanpa bon),
    // bukan dicek dari bukti_path induknya sendiri (yang emang selalu kosong).
    const belumAdaBon = transaksi.filter(t => {
      if (t.transfer_pair_id || t.tanpa_bon) return false;
      if (t.bukti_path) return false;
      if (t.is_settlement) {
        const anak = anakDari(t.id);
        return anak.length === 0 || anak.some(a => !a.bukti_path && !a.tanpa_bon);
      }
      return true;
    });
    if (belumAdaBon.length > 0) {
      setBonCheckList(belumAdaBon.map(t => ({ ...t, lanjutTanpaBon: false })));
      return;
    }
    jalankanSubmit();
  }

  // Settlement yang masih ada sisa & sampai mau submit tetap gak ada bon —
  // dianggap staff-nya balikin sisa uangnya (kembalian), dicatat OTOMATIS
  // sebagai baris rincian IN di bawah settlement itu.
  async function selesaikanSettlementSebagaiKembalian(item) {
    setBusyAksi(true);
    try {
      const res = await fetch('/api/admin/cashflow/transaksi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periode_id: Number(periodeId), tanggal: keTanggalInput(item.tanggal),
          deskripsi: `Kembalian sisa settlement — ${item.deskripsi}`,
          kategori_id: null, akun_id: item.akun_id, tipe: 'in', nominal: item.sisa,
          settlement_induk_id: item.id,
        }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusyAksi(false); return; }
      setSettlementCheckList(list => {
        const sisaList = list.filter(x => x.id !== item.id);
        if (sisaList.length === 0) { setBusyAksi(false); lanjutkanSetelahCekSettlement(); }
        return sisaList.length === 0 ? null : sisaList;
      });
      muat();
    } catch { alert('Terjadi kesalahan'); setBusyAksi(false); }
  }

  // Settlement yang rinciannya LEBIH BESAR dari uang yang ditransfer (staff
  // nombokin pakai duit sendiri) — kekurangannya otomatis jadi klaim
  // reimburse (BELUM masuk cashflow_transaksi, nunggu company bayar balik).
  async function selesaikanSettlementSebagaiReimburse(item) {
    setBusyAksi(true);
    try {
      const res = await fetch('/api/admin/cashflow/reimburse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tanggal_pengeluaran: keTanggalInput(item.tanggal),
          deskripsi: `Kekurangan settlement — ${item.deskripsi}`,
          kategori_id: null, nominal: Math.abs(item.sisa),
          nama_staff: item.penerima_settlement?.trim() || item.deskripsi,
          dari_settlement_id: item.id,
        }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal membuat reimburse'); setBusyAksi(false); return; }
      setSettlementCheckList(list => {
        const sisaList = list.filter(x => x.id !== item.id);
        if (sisaList.length === 0) { setBusyAksi(false); lanjutkanSetelahCekSettlement(); }
        return sisaList.length === 0 ? null : sisaList;
      });
      muat();
    } catch { alert('Terjadi kesalahan'); setBusyAksi(false); }
  }

  async function jalankanSubmit() {
    if (!confirm(`Submit & kunci ${namaBulan(periode.bulan)}? Setelah dikunci, transaksi tidak bisa ditambah/diubah lagi, dan saldo akhirnya jadi saldo awal bulan berikutnya.`)) return;
    setBusyAksi(true);
    const res = await fetch(`/api/admin/cashflow/periode/${periodeId}/submit`, { method: 'POST' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal submit'); setBusyAksi(false); return; }
    muat();
    setBusyAksi(false);
  }

  async function simpanBonCekItem(id, { bukti_path, bukti_nama }) {
    const item = bonCheckList.find(i => i.id === id);
    await fetch('/api/admin/cashflow/transaksi', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, tanggal: keTanggalInput(item.tanggal), bukti_path, bukti_nama }),
    });
    setBonCheckList(list => list.map(i => i.id === id ? { ...i, bukti_path, bukti_nama } : i));
  }

  async function toggleLanjutTanpaBon(id, checked) {
    setBonCheckList(list => list.map(i => i.id === id ? { ...i, lanjutTanpaBon: checked } : i));
    await toggleTanpaBon(id, checked);
  }

  // Dipakai baik dari modal checklist submit maupun langsung dari kolom Bon
  // di tabel utama — makanya disimpan ke server (bukan cuma state lokal),
  // biar gak ilang pas reload & gak nanya ulang lagi pas submit.
  async function toggleTanpaBon(id, checked) {
    await fetch('/api/admin/cashflow/transaksi', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tanpa_bon: checked }),
    });
    muat();
  }

  async function lanjutkanSetelahCekBon() {
    setBonCheckList(null);
    await jalankanSubmit();
    muat();
  }

  async function downloadExcel() {
    setDownloadingExcel(true);
    try {
      const res = await fetch(`/api/admin/cashflow/export/${periodeId}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Gagal membuat file Excel');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cashflow-${periode?.bulan || periodeId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Terjadi kesalahan saat membuat file Excel');
    } finally {
      setDownloadingExcel(false);
    }
  }

  async function bukaKembali() {
    if (!confirm('Buka kembali bulan ini untuk edit?')) return;
    setBusyAksi(true);
    const res = await fetch(`/api/admin/cashflow/periode/${periodeId}/submit`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal membuka kembali'); setBusyAksi(false); return; }
    muat();
    setBusyAksi(false);
  }

  const topLevel = transaksi.filter(t => !t.settlement_induk_id);
  const anakDari = (indukId) => transaksi.filter(t => t.settlement_induk_id === indukId);
  const sisaSettlement = (t) => t.is_settlement ? Number(t.nominal) - anakDari(t.id).reduce((s, a) => s + Number(a.nominal), 0) : 0;

  return (
    <Layout title={`🔒 Cashflow ${namaBulan(periode.bulan)}`} backHref="/admin/laporan/cashflow">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className={`text-xs font-bold px-2.5 py-1 rounded ${terkunci ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
          {terkunci ? `🔒 Terkunci · disubmit ${new Date(periode.submitted_at).toLocaleDateString('id-ID')}` : '📝 Draft — masih bisa diedit'}
        </div>
        <div className="flex gap-2">
          <a href={`/admin/cetak-cashflow/${periodeId}`} target="_blank" rel="noopener noreferrer"
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold px-4 py-2 rounded-xl">🖨️ Cetak / PDF</a>
          <button onClick={downloadExcel} disabled={downloadingExcel}
            className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm font-bold px-4 py-2 rounded-xl">
            {downloadingExcel ? 'Menyiapkan...' : '📊 Download Excel'}
          </button>
          {terkunci ? (
            <button onClick={bukaKembali} disabled={busyAksi} className="bg-amber-100 hover:bg-amber-200 disabled:opacity-50 text-amber-700 text-sm font-bold px-4 py-2 rounded-xl">Buka Kembali</button>
          ) : (
            <button onClick={mulaiSubmit} disabled={busyAksi} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl">✅ Submit & Kunci</button>
          )}
        </div>
      </div>

      {/* Saldo ringkas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {saldo.map(s => {
          const akun = akunList.find(a => a.id === s.akun_id) || {};
          return (
            <div key={s.akun_id} className="bg-[#E8F0FB] rounded-xl p-3">
              <div className="text-xs text-gray-400">{akun.nama || `Akun #${s.akun_id}`}</div>
              <div className="text-[10px] text-gray-400">Saldo awal {rp(s.saldo_awal)}</div>
              <div className="text-[10px] text-green-600">Masuk {rp(s.total_in)}</div>
              <div className="text-[10px] text-red-500">Keluar {rp(s.total_out)}</div>
              <div className="font-bold text-[#0E2F6E] text-sm mt-0.5">{rp(s.saldo_akhir)}</div>
            </div>
          );
        })}
      </div>

      {/* Anggaran vs Realisasi — acuannya Pengajuan Dana bulan yang sama (diutamain yang disetujui) */}
      {anggaran && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="font-bold text-[#0E2F6E]">📊 Anggaran vs Realisasi</div>
            <a href={`/admin/laporan/pengajuan-dana/${anggaran.pengajuan_id}`} className="text-xs font-bold text-[#1A4FA0] hover:underline">
              Lihat Pengajuan Dana ({anggaran.pengajuan_status === 'disetujui' ? 'Disetujui' : anggaran.pengajuan_status === 'diajukan' ? 'Menunggu Persetujuan' : anggaran.pengajuan_status === 'ditolak' ? 'Ditolak' : 'Draft'}) →
            </a>
          </div>
          {anggaran.pengajuan_status !== 'disetujui' && (
            <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
              ⚠️ Pengajuan Dana bulan ini belum disetujui — angka anggaran di bawah masih {anggaran.pengajuan_status === 'ditolak' ? 'dari pengajuan yang ditolak' : 'sementara'}.
            </div>
          )}
          {anggaran.per_kategori.length === 0 ? (
            <div className="text-xs text-gray-400">Pengajuan Dana bulan ini belum ada rincian per kategori.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#0E2F6E] text-xs uppercase">
                    <th className="text-left px-2 py-1.5 font-bold">Kategori</th>
                    <th className="text-right px-2 py-1.5 font-bold">Dianggarkan</th>
                    <th className="text-right px-2 py-1.5 font-bold">Realisasi</th>
                    <th className="text-right px-2 py-1.5 font-bold">Sisa / Lebih</th>
                  </tr>
                </thead>
                <tbody>
                  {anggaran.per_kategori.map(k => {
                    const selisih = k.budget - k.aktual;
                    // budget=0 itu 2 makna beda: "sengaja dianggarkan Rp 0" vs
                    // "kategori ini emang gak diitemize di Pengajuan Dana" —
                    // RAB biasanya cuma nyebut sebagian kategori (angka
                    // gelondongan/rincian yang kepikiran doang), jadi kategori
                    // tanpa budget TAPI ada realisasi jangan ikut dicap
                    // "Overbudget" (bikin merah semua padahal emang gak
                    // diajukan), cukup ditandain netral "Belum Dianggarkan".
                    const takDianggarkan = k.budget === 0 && k.aktual > 0;
                    const overBudget = !takDianggarkan && selisih < 0;
                    return (
                      <tr key={k.kategori_id ?? 'null'} className={`border-t border-gray-100 ${overBudget ? 'bg-red-50' : ''}`}>
                        <td className="px-2 py-1.5 text-gray-700">
                          {k.kategori_nama}
                          {overBudget && <span className="ml-2 text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">⚠️ Overbudget</span>}
                          {takDianggarkan && <span className="ml-2 text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Belum Dianggarkan</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-600 whitespace-nowrap">{rp(k.budget)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-600 whitespace-nowrap">{rp(k.aktual)}</td>
                        <td className={`px-2 py-1.5 text-right font-bold whitespace-nowrap ${overBudget ? 'text-red-600' : takDianggarkan ? 'text-gray-400' : 'text-green-600'}`}>
                          {overBudget ? `-${rp(Math.abs(selisih))}` : rp(selisih)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reimburse Staff — klaim staff keluar duit pribadi dulu, company bayar nyusul */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="font-bold text-[#0E2F6E] flex items-center gap-2">
            💰 Reimburse Staff
            {reimburseList.length > 0 && <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{reimburseList.length} belum dibayar</span>}
          </div>
          {!formReimburse && (
            <button onClick={() => setFormReimburse({ ...KOSONG_REIMBURSE, tanggal_pengeluaran: keTanggalInput() })}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-lg">+ Klaim Reimburse Baru</button>
          )}
        </div>

        {formReimburse && (
          <div className="border-2 border-[#1A4FA0] rounded-lg p-3 mb-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={formReimburse.nama_staff} onChange={e => setFormReimburse({ ...formReimburse, nama_staff: e.target.value })} placeholder="Nama staff" className={inp} />
              <input type="date" value={formReimburse.tanggal_pengeluaran} onChange={e => { if (e.target.value) setFormReimburse({ ...formReimburse, tanggal_pengeluaran: e.target.value }); }} className={inp} />
            </div>
            <input value={formReimburse.deskripsi} onChange={e => setFormReimburse({ ...formReimburse, deskripsi: e.target.value })} placeholder="Dipakai buat apa (mis. bensin Karawang-Bandung)" className={inp} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input type="number" value={formReimburse.nominal} onChange={e => setFormReimburse({ ...formReimburse, nominal: e.target.value })} placeholder="Nominal" className={inp} />
              <select value={formReimburse.kategori_id} onChange={e => setFormReimburse({ ...formReimburse, kategori_id: e.target.value ? Number(e.target.value) : '' })} className={inp}>
                <option value="">— Tanpa kategori —</option>
                {kategoriList.filter(k => k.tipe === 'out').map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
            </div>
            <UploadBon value={formReimburse} onChange={v => setFormReimburse(f => ({ ...f, ...v }))} />
            <div className="flex gap-2">
              <button onClick={simpanReimburse} disabled={busyAksi} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg">💾 Simpan Klaim</button>
              <button onClick={() => setFormReimburse(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold px-4 py-2 rounded-lg">Batal</button>
            </div>
          </div>
        )}

        {reimburseList.length === 0 ? (
          <div className="text-xs text-gray-400">Belum ada klaim reimburse yang pending.</div>
        ) : (
          <div className="space-y-2">
            {reimburseList.map(r => (
              <div key={r.id} className="border border-amber-200 bg-amber-50/50 rounded-lg p-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-bold text-gray-700">{r.nama_staff}</span> — {r.deskripsi}
                    <div className="text-[10px] text-gray-400">
                      {tgl(r.tanggal_pengeluaran)}
                      {r.kategori_nama && <> · {r.kategori_nama}</>}
                      {r.bukti_path && <> · <a href={r.bukti_path} target="_blank" rel="noopener noreferrer" className="text-green-600 font-bold">📎 bon</a></>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-red-600 text-sm">{rp(r.nominal)}</div>
                  </div>
                </div>
                {bayarForm?.id === r.id ? (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <select value={bayarForm.akun_id} onChange={e => setBayarForm({ ...bayarForm, akun_id: Number(e.target.value) })} className={`${inp} !py-1.5 w-auto`}>
                      <option value="">Pilih akun bayar</option>
                      {akunList.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}
                    </select>
                    <button onClick={() => bayarReimburse(r.id)} disabled={busyAksi || !bayarForm.akun_id} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg">Konfirmasi Bayar</button>
                    <button onClick={() => setBayarForm(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold px-3 py-1.5 rounded-lg">Batal</button>
                  </div>
                ) : (
                  <div className="flex gap-3 mt-2">
                    <button onClick={() => setBayarForm({ id: r.id, akun_id: '' })} disabled={terkunci}
                      title={terkunci ? 'Periode ini terkunci — buka periode draft buat bayar' : ''}
                      className="text-xs font-bold text-green-700 hover:underline disabled:opacity-40 disabled:no-underline">💵 Bayar Sekarang</button>
                    <button onClick={() => hapusReimburse(r.id)} className="text-xs font-bold text-red-500 hover:underline">Hapus</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!terkunci && (
        <div className="flex flex-wrap gap-2 mb-4">
          {!form && <button onClick={() => setForm({ ...KOSONG_FORM, tanggal: keTanggalInput(), akun_id: akunList[0]?.id || '' })}
            className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl">+ Tambah Transaksi</button>}
          <button onClick={() => setShowTransfer(true)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold px-5 py-2.5 rounded-xl">🔁 Transfer Antar Akun</button>
          <button onClick={mulaiImportMutasi} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold px-5 py-2.5 rounded-xl">📄 Upload Mutasi Rekening</button>
        </div>
      )}

      {/* Form TAMBAH transaksi baru — muncul di sini karena belum ada baris
          buat diacu. Form EDIT nempel inline di baris tabelnya sendiri
          (lihat di bawah, di dalam <tbody>). */}
      {form?.id === null && (
        <div className="mb-6">
          <FormTransaksi form={form} setForm={setForm} akunList={akunList} kategoriList={kategoriList} programList={programList} saving={saving} onSimpan={simpanTransaksi} onBatal={() => setForm(null)} />
        </div>
      )}

      {/* Modal transfer antar akun */}
      {showTransfer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-3">
            <div className="font-bold text-[#0E2F6E]">🔁 Transfer Antar Akun Sendiri</div>
            <div className="text-xs text-gray-400">Mis. &quot;Pindah dana cash to bank&quot; — dicatat otomatis sebagai OUT di akun asal + IN di akun tujuan.</div>
            <div>
              <label className={lbl}>Tanggal</label>
              <input type="date" value={transferForm.tanggal} onChange={e => { if (e.target.value) setTransferForm({ ...transferForm, tanggal: e.target.value }); }} className={inp} />
            </div>
            <div>
              <label className={lbl}>Deskripsi</label>
              <input value={transferForm.deskripsi} onChange={e => setTransferForm({ ...transferForm, deskripsi: e.target.value })} placeholder="Mis. Pindah dana cash to bank" className={inp} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Dari Akun</label>
                <select value={transferForm.akun_dari_id} onChange={e => setTransferForm({ ...transferForm, akun_dari_id: Number(e.target.value) })} className={inp}>
                  <option value="">Pilih</option>
                  {akunList.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Ke Akun</label>
                <select value={transferForm.akun_ke_id} onChange={e => setTransferForm({ ...transferForm, akun_ke_id: Number(e.target.value) })} className={inp}>
                  <option value="">Pilih</option>
                  {akunList.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={lbl}>Nominal (Rp)</label>
              <input type="number" value={transferForm.nominal} onChange={e => setTransferForm({ ...transferForm, nominal: e.target.value })} className={inp} />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={simpanTransfer} disabled={busyAksi} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">💾 Simpan</button>
              <button onClick={() => { setShowTransfer(false); setTransferForm(KOSONG_TRANSFER); }} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cek settlement yang masih ada sisa belum dirincikan, sebelum submit */}
      {settlementCheckList && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-xl max-h-[85vh] overflow-y-auto space-y-3">
            <div className="font-bold text-amber-700">⚠️ Ada {settlementCheckList.length} settlement belum selesai</div>
            <div className="text-xs text-gray-400">
              Rincikan dulu manual (tombol &quot;+ Rincikan&quot; di tabel), atau pakai tombol otomatis
              di bawah — kalau sisanya dibalikin orangnya jadi &quot;Kembalian&quot;, kalau rinciannya
              malah LEBIH BESAR dari yang ditransfer (staff nombokin) jadi &quot;Reimburse&quot;.
            </div>
            <div className="space-y-3">
              {settlementCheckList.map(item => (
                <div key={item.id} className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                  <div className="text-sm font-semibold text-gray-700">{item.deskripsi}</div>
                  <div className="text-xs text-gray-400 mb-2">{tgl(item.tanggal)} · total settlement {rp(item.nominal)}</div>
                  {item.sisa > 0 ? (
                    <>
                      <div className="text-xs font-bold text-amber-700 mb-2">Sisa belum ada bon: {rp(item.sisa)}</div>
                      <button onClick={() => selesaikanSettlementSebagaiKembalian(item)} disabled={busyAksi}
                        className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                        ✅ Anggap Kembalian ({rp(item.sisa)} balik ke {item.akun_nama})
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-bold text-red-600 mb-2">Rincian lebih besar {rp(Math.abs(item.sisa))} dari transfer — staff nombokin</div>
                      <button onClick={() => selesaikanSettlementSebagaiReimburse(item)} disabled={busyAksi}
                        className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                        💰 Buat Reimburse Otomatis ({rp(Math.abs(item.sisa))} ke {item.penerima_settlement?.trim() || item.deskripsi})
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setSettlementCheckList(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal, saya rincikan manual dulu</button>
          </div>
        </div>
      )}

      {/* Modal cek bon sebelum submit */}
      {bonCheckList && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-xl max-h-[85vh] overflow-y-auto space-y-3">
            <div className="font-bold text-amber-700">⚠️ Ada {bonCheckList.length} transaksi belum ada bon</div>
            <div className="text-xs text-gray-400">Upload bon-nya langsung di sini, atau centang &quot;Lanjut tanpa bon&quot; kalau memang gak ada buktinya.</div>
            <div className="space-y-3">
              {bonCheckList.map(item => (
                <div key={item.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="text-sm font-semibold text-gray-700">{item.deskripsi} — {rp(item.nominal)}</div>
                  <div className="text-xs text-gray-400 mb-2">{tgl(item.tanggal)} · {item.akun_nama}</div>
                  {item.bukti_path ? (
                    <div className="text-xs text-green-600 font-semibold">📎 Bon terpasang</div>
                  ) : !item.lanjutTanpaBon ? (
                    <UploadBon value={item} onChange={v => simpanBonCekItem(item.id, v)} />
                  ) : null}
                  {!item.bukti_path && (
                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mt-2">
                      <input type="checkbox" checked={item.lanjutTanpaBon} onChange={e => toggleLanjutTanpaBon(item.id, e.target.checked)} />
                      Lanjut tanpa bon
                    </label>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={lanjutkanSetelahCekBon} disabled={!bonCheckList.every(i => i.bukti_path || i.lanjutTanpaBon)}
                className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
                Lanjutkan Submit
              </button>
              <button onClick={() => setBonCheckList(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal upload & review mutasi rekening */}
      {importMutasi && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-3xl max-h-[85vh] overflow-y-auto space-y-3">
            {importMutasi.tahap === 'upload' ? (
              <>
                <div className="font-bold text-[#0E2F6E]">📄 Upload Mutasi Rekening (PDF)</div>
                <div className="text-xs text-gray-400">
                  Sistem akan coba deteksi otomatis tiap baris transaksi (masuk/keluar) & sarankan
                  kategorinya. Semua hasilnya tetap bisa kamu koreksi dulu sebelum benar-benar disimpan.
                </div>
                <div>
                  <label className={lbl}>Akun (rekening ini punya siapa)</label>
                  <select value={importMutasi.akunId} onChange={e => setImportMutasi(m => ({ ...m, akunId: Number(e.target.value) }))} className={inp}>
                    {akunList.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>File PDF Mutasi Rekening</label>
                  <input type="file" accept="application/pdf" onChange={e => setImportMutasi(m => ({ ...m, file: e.target.files?.[0] || null }))} className={inp} />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={parseMutasiRekeningFile} disabled={importMutasi.memproses || !importMutasi.file}
                    className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
                    {importMutasi.memproses ? 'Memproses PDF...' : 'Proses & Baca Transaksi'}
                  </button>
                  <button onClick={() => setImportMutasi(null)} disabled={importMutasi.memproses} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
                </div>
              </>
            ) : (
              <>
                <div className="font-bold text-[#0E2F6E]">Review Hasil Baca Mutasi Rekening</div>
                <div className="text-xs text-gray-400">
                  Cek & koreksi tiap baris sebelum disimpan — uncentang baris yang salah/duplikat/gak perlu.
                  Baris bertanda <span className="font-bold text-amber-600">⚠️ periksa</span> artinya sistem kurang yakin baca nominal/tipe-nya, cek manual dulu.
                </div>
                <div className="space-y-2">
                  {importMutasi.rows.map((r, idx) => (
                    <div key={idx} className={`border rounded-lg p-3 ${r.kemungkinan_duplikat ? 'border-amber-300 bg-amber-50' : 'border-gray-100'}`}>
                      <div className="flex items-start gap-2">
                        <input type="checkbox" checked={r.sertakan} onChange={e => ubahBarisImport(idx, { sertakan: e.target.checked })} className="mt-2" />
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input type="date" value={r.tanggal} onChange={e => { if (e.target.value) ubahBarisImport(idx, { tanggal: e.target.value }); }} className={inp} />
                          <input type="number" value={r.nominal} onChange={e => ubahBarisImport(idx, { nominal: e.target.value })} className={inp} />
                          <input value={r.deskripsi} onChange={e => ubahBarisImport(idx, { deskripsi: e.target.value })} className={`${inp} sm:col-span-2`} />
                          <div className="flex gap-2">
                            <button type="button" onClick={() => ubahBarisImport(idx, { tipe: 'out', kategori_id: null })}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${r.tipe === 'out' ? 'bg-red-100 text-red-700 border-2 border-red-300' : 'bg-gray-50 text-gray-400 border-2 border-gray-100'}`}>OUT</button>
                            <button type="button" onClick={() => ubahBarisImport(idx, { tipe: 'in', kategori_id: null })}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${r.tipe === 'in' ? 'bg-green-100 text-green-700 border-2 border-green-300' : 'bg-gray-50 text-gray-400 border-2 border-gray-100'}`}>IN</button>
                          </div>
                          <select value={r.kategori_id || ''} onChange={e => ubahBarisImport(idx, { kategori_id: e.target.value ? Number(e.target.value) : null })} className={inp}>
                            <option value="">— Tanpa kategori —</option>
                            {kategoriList.filter(k => k.tipe === r.tipe).map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2 ml-6">
                        {r.kategori_nama_disarankan && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">🤖 disarankan: {r.kategori_nama_disarankan}</span>}
                        {r.kemungkinan_duplikat && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">⚠️ mirip transaksi yang sudah ada</span>}
                        {!r.yakin_parsing && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">⚠️ periksa (kurang yakin)</span>}
                      </div>
                      <div className="ml-6 mt-2 max-w-xs">
                        <UploadBon value={r} onChange={v => ubahBarisImport(idx, v)} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                  <div className="text-xs text-gray-500">
                    {importMutasi.rows.filter(r => r.sertakan).length} dari {importMutasi.rows.length} baris terpilih ·{' '}
                    IN {rp(importMutasi.rows.filter(r => r.sertakan && r.tipe === 'in').reduce((s, r) => s + Number(r.nominal || 0), 0))} ·{' '}
                    OUT {rp(importMutasi.rows.filter(r => r.sertakan && r.tipe === 'out').reduce((s, r) => s + Number(r.nominal || 0), 0))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={simpanImportMutasi} disabled={importMutasi.menyimpan}
                      className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
                      {importMutasi.menyimpan ? 'Menyimpan...' : `💾 Simpan ${importMutasi.rows.filter(r => r.sertakan).length} Transaksi`}
                    </button>
                    <button onClick={() => setImportMutasi(null)} disabled={importMutasi.menyimpan} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tabel transaksi */}
      <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#E8F0FB] text-[#0E2F6E] text-xs uppercase">
              <th className="text-left px-3 py-2.5 font-bold whitespace-nowrap">No</th>
              <th className="text-left px-3 py-2.5 font-bold whitespace-nowrap">Tanggal</th>
              <th className="text-left px-3 py-2.5 font-bold whitespace-nowrap">Deskripsi</th>
              <th className="text-left px-3 py-2.5 font-bold whitespace-nowrap">Kategori</th>
              <th className="text-left px-3 py-2.5 font-bold whitespace-nowrap">Akun</th>
              <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">OUT</th>
              <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">IN</th>
              <th className="text-center px-3 py-2.5 font-bold whitespace-nowrap">Bon</th>
              {!terkunci && <th className="text-center px-3 py-2.5 font-bold whitespace-nowrap">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {topLevel.length === 0 && (
              <tr><td colSpan={terkunci ? 8 : 9} className="text-center text-gray-400 py-8">Belum ada transaksi.</td></tr>
            )}
            {topLevel.map((t, idx) => {
              const anak = anakDari(t.id);
              const sisaBelumRinci = sisaSettlement(t);
              return (
                <Fragment key={t.id}>
                  <tr className="border-t border-gray-100">
                    <td className="px-3 py-2.5 text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                      {tgl(t.tanggal)}
                      <div className="text-[10px] text-gray-300">diinput {waktuInput(t.created_at)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {t.deskripsi}
                      {!!t.is_settlement && (
                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${sisaBelumRinci > 0 ? 'bg-amber-100 text-amber-700' : sisaBelumRinci < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {sisaBelumRinci > 0 ? `⏳ Sisa ${rp(sisaBelumRinci)} belum dirincikan` : sisaBelumRinci < 0 ? `⚠️ Nombok ${rp(Math.abs(sisaBelumRinci))}` : '✅ Sudah settlement'}
                        </span>
                      )}
                      {!!t.is_settlement && t.penerima_settlement && <div className="text-[10px] text-gray-400">ke {t.penerima_settlement}</div>}
                      {!!t.is_settlement && (
                        <div className="mt-1 inline-flex text-[10px] font-bold border border-gray-200 rounded-full overflow-hidden">
                          <button type="button" disabled={terkunci} onClick={() => ubahCetakMode(t, 'rincian')}
                            className={`px-2 py-0.5 ${t.cetak_mode !== 'totalan' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                            title="Cetak PDF: pecah jadi baris per item rincian belanja">📋 Rincian</button>
                          <button type="button" disabled={terkunci} onClick={() => ubahCetakMode(t, 'totalan')}
                            className={`px-2 py-0.5 ${t.cetak_mode === 'totalan' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                            title="Cetak PDF: 1 baris gelondongan aja">🧾 Totalan</button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {t.kategori_nama ? <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{t.kategori_nama}</span> : <span className="text-gray-300">—</span>}
                      {t.program_nama && <span className="block text-[10px] font-semibold text-[#1A4FA0] mt-0.5" title="Ditag ke program ini — masuk laporan Realisasi vs Budget">🏷️ {t.program_nama}</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{t.akun_nama}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-red-600">{t.tipe === 'out' ? rp(t.nominal) : ''}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-green-600">{t.tipe === 'in' ? rp(t.nominal) : ''}</td>
                    <td className="px-3 py-2.5 text-center">
                      {t.bukti_path ? (
                        <a href={t.bukti_path} target="_blank" rel="noopener noreferrer" className="text-green-600 font-bold">📎</a>
                      ) : t.transfer_pair_id ? (
                        <span className="text-gray-300">—</span>
                      ) : !!t.is_settlement && anak.length > 0 && anak.every(a => a.bukti_path || a.tanpa_bon) ? (
                        <span className="text-[10px] text-green-600 font-semibold">📎 Bon di rincian</span>
                      ) : t.tanpa_bon ? (
                        <div className="text-[10px] text-gray-400">
                          Tanpa bon
                          {!terkunci && <button type="button" onClick={() => toggleTanpaBon(t.id, false)} className="block mx-auto font-bold text-[#1A4FA0] hover:underline">Batal</button>}
                        </div>
                      ) : (
                        <div className="w-28 mx-auto space-y-1">
                          <UploadBon value={t} onChange={v => unggahBonLangsung(t, v)} />
                          {!terkunci && (
                            <label className="flex items-center justify-center gap-1 text-[10px] font-semibold text-gray-500">
                              <input type="checkbox" onChange={e => toggleTanpaBon(t.id, e.target.checked)} /> Lanjut tanpa bon
                            </label>
                          )}
                        </div>
                      )}
                    </td>
                    {!terkunci && (
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <button onClick={() => setForm({ id: t.id, tanggal: keTanggalInput(t.tanggal), deskripsi: t.deskripsi, kategori_id: t.kategori_id || '', program_id: t.program_id || '', akun_id: t.akun_id, tipe: t.tipe, nominal: t.nominal, bukti_path: t.bukti_path, bukti_nama: t.bukti_nama, is_settlement: !!t.is_settlement, penerima_settlement: t.penerima_settlement || '' })}
                          className="text-xs font-bold text-[#1A4FA0] hover:underline mr-2">Edit</button>
                        <button onClick={() => hapusTransaksi(t.id)} className="text-xs font-bold text-red-500 hover:underline">Hapus</button>
                        {!!t.is_settlement && (
                          <button onClick={() => setRincikan({ induk_id: t.id, items: [{ ...KOSONG_BREAKDOWN, tanggal: keTanggalInput(t.tanggal) }] })}
                            className="block text-xs font-bold text-amber-600 hover:underline mt-1">+ Rincikan</button>
                        )}
                      </td>
                    )}
                  </tr>
                  {form?.id === t.id && (
                    <tr>
                      <td colSpan={terkunci ? 8 : 9} className="p-0">
                        <div className="p-3 bg-[#F8FAFD] border-y border-[#1A4FA0]/20">
                          <FormTransaksi form={form} setForm={setForm} akunList={akunList} kategoriList={kategoriList} programList={programList} saving={saving} onSimpan={simpanTransaksi} onBatal={() => setForm(null)} />
                        </div>
                      </td>
                    </tr>
                  )}
                  {anak.map(a => (
                    <Fragment key={a.id}>
                      <tr className="border-t border-gray-50 bg-gray-50/50">
                        <td className="px-3 py-2 text-gray-300">↳</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500 text-xs">
                          {tgl(a.tanggal)}
                          <div className="text-[10px] text-gray-300">diinput {waktuInput(a.created_at)}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{a.deskripsi}</td>
                        <td className="px-3 py-2 text-xs">
                          {a.kategori_nama ? <span className="text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{a.kategori_nama}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-400 text-xs">{a.akun_nama}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap text-red-400 text-xs">{a.tipe === 'out' ? rp(a.nominal) : ''}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap text-green-400 text-xs">{a.tipe === 'in' ? rp(a.nominal) : ''}</td>
                        <td className="px-3 py-2 text-center">
                          {a.bukti_path ? (
                            <a href={a.bukti_path} target="_blank" rel="noopener noreferrer" className="text-green-600 font-bold text-xs">📎</a>
                          ) : a.tanpa_bon ? (
                            <div className="text-[10px] text-gray-400">
                              Tanpa bon
                              {!terkunci && <button type="button" onClick={() => toggleTanpaBon(a.id, false)} className="block mx-auto font-bold text-[#1A4FA0] hover:underline">Batal</button>}
                            </div>
                          ) : (
                            <div className="w-28 mx-auto space-y-1">
                              <UploadBon value={a} onChange={v => unggahBonLangsung(a, v)} />
                              {!terkunci && (
                                <label className="flex items-center justify-center gap-1 text-[10px] font-semibold text-gray-500">
                                  <input type="checkbox" onChange={e => toggleTanpaBon(a.id, e.target.checked)} /> Lanjut tanpa bon
                                </label>
                              )}
                            </div>
                          )}
                        </td>
                        {!terkunci && (
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <button onClick={() => setForm({ id: a.id, tanggal: keTanggalInput(a.tanggal), deskripsi: a.deskripsi, kategori_id: a.kategori_id || '', program_id: a.program_id || '', akun_id: a.akun_id, tipe: a.tipe, nominal: a.nominal, bukti_path: a.bukti_path, bukti_nama: a.bukti_nama, is_settlement: false, penerima_settlement: '' })}
                              className="text-xs font-bold text-[#1A4FA0] hover:underline mr-2">Edit</button>
                            <button onClick={() => hapusTransaksi(a.id)} className="text-xs font-bold text-red-500 hover:underline">Hapus</button>
                          </td>
                        )}
                      </tr>
                      {form?.id === a.id && (
                        <tr>
                          <td colSpan={terkunci ? 8 : 9} className="p-0">
                            <div className="p-3 bg-[#F8FAFD] border-y border-[#1A4FA0]/20">
                              <FormTransaksi form={form} setForm={setForm} akunList={akunList} kategoriList={kategoriList} programList={programList} saving={saving} onSimpan={simpanTransaksi} onBatal={() => setForm(null)} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {rincikan?.induk_id === t.id && (
                    <tr>
                      <td colSpan={terkunci ? 8 : 9} className="p-0">
                        <div className="bg-amber-50 border-y border-amber-200 p-3 space-y-3">
                          <div className="text-xs font-bold text-amber-700">Rincikan pemakaian dari settlement &quot;{t.deskripsi}&quot;</div>
                          {rincikan.items.map((item, idx) => (
                            <div key={idx} className="bg-white/60 rounded-lg p-2 space-y-2 border border-amber-100">
                              <div className="flex items-center justify-between">
                                <div className="text-[10px] font-bold text-amber-600">Item {idx + 1}</div>
                                {rincikan.items.length > 1 && (
                                  <button onClick={() => hapusItemRincikan(idx)} className="text-[10px] font-bold text-red-500 hover:underline">Hapus item</button>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <input type="date" value={item.tanggal} onChange={e => { if (e.target.value) ubahItemRincikan(idx, { tanggal: e.target.value }); }} className={inp} />
                                <input value={item.deskripsi} onChange={e => ubahItemRincikan(idx, { deskripsi: e.target.value })} placeholder="Item apa" className={inp} />
                                <input type="number" value={item.nominal} onChange={e => ubahItemRincikan(idx, { nominal: e.target.value })} placeholder="Nominal" className={inp} />
                              </div>
                              <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                                <input type="checkbox" checked={item.kembalian} onChange={e => ubahItemRincikan(idx, { kembalian: e.target.checked, kategori_id: '' })} />
                                Ini uang sisa dikembalikan (kembalian), bukan belanja
                              </label>
                              <select value={item.kategori_id} onChange={e => ubahItemRincikan(idx, { kategori_id: e.target.value ? Number(e.target.value) : '' })} className={inp}>
                                <option value="">— Tanpa kategori —</option>
                                {kategoriList.filter(k => k.tipe === (item.kembalian ? 'in' : 'out')).map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                              </select>
                              <UploadBon value={item} onChange={v => ubahItemRincikan(idx, v)} />
                            </div>
                          ))}
                          <button onClick={() => tambahItemRincikan(keTanggalInput(t.tanggal))} className="text-xs font-bold text-amber-700 hover:underline">+ Tambah Item Belanja Lagi</button>
                          <div className="flex gap-2">
                            <button onClick={() => simpanSemuaRincian(t.id)} disabled={busyAksi} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg">💾 Simpan Semua Rincian</button>
                            <button onClick={() => setRincikan(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold px-4 py-2 rounded-lg">Batal</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {saldo.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[#1A4FA0] bg-[#E8F0FB]">
                <td colSpan={3} className="px-3 py-2.5 font-bold text-[#0E2F6E]">POSISI SALDO</td>
                <td className="px-3 py-2.5"></td>
                <td className="px-3 py-2.5"></td>
                <td colSpan={terkunci ? 3 : 4} className="px-3 py-2.5">
                  <div className="flex flex-wrap justify-end gap-4">
                    {saldo.map(s => {
                      const akun = akunList.find(a => a.id === s.akun_id) || {};
                      return (
                        <div key={s.akun_id} className="text-right">
                          <div className="text-[10px] text-gray-500">{akun.nama}</div>
                          <div className="font-black text-[#0E2F6E]">{rp(s.saldo_akhir)}</div>
                        </div>
                      );
                    })}
                  </div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Layout>
  );
}
