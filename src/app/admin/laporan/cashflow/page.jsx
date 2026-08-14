'use client';
import { useEffect, useState } from 'react';
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

const TIPE_AKUN_LIST = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash/Petty Cash' },
  { value: 'emoney', label: 'E-money' },
  { value: 'lainnya', label: 'Lainnya' },
];

const KOSONG_AKUN = { id: null, nama: '', tipe: 'bank', urutan: 0, aktif: true };
const KOSONG_KATEGORI = { id: null, nama: '', tipe: 'out', urutan: 0, aktif: true, termasuk_laba_rugi: true };

const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";

// Form terpisah (bukan didefinisikan di dalam komponen halaman) supaya
// identitasnya stabil antar render — nempel inline di baris item yang
// diedit, bukan nge-swap seluruh panel jadi form.
function FormAkun({ value, onChange, onSimpan, onBatal }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 flex flex-wrap gap-3 items-end">
      <div>
        <label className={lbl}>Nama Akun</label>
        <input value={value.nama} onChange={e => onChange({ ...value, nama: e.target.value })} placeholder="Mis. BCA" className={inp} />
      </div>
      <div>
        <label className={lbl}>Tipe</label>
        <select value={value.tipe} onChange={e => onChange({ ...value, tipe: e.target.value })} className={inp}>
          {TIPE_AKUN_LIST.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl}>Urutan Kolom</label>
        <input type="number" value={value.urutan} onChange={e => onChange({ ...value, urutan: e.target.value })} className={inp} />
      </div>
      <button onClick={onSimpan} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl">💾 Simpan</button>
      <button onClick={onBatal} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
    </div>
  );
}

function FormKategori({ value, onChange, onSimpan, onBatal }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="flex flex-wrap gap-3 items-end mb-2">
        <div>
          <label className={lbl}>Nama Kategori</label>
          <input value={value.nama} onChange={e => onChange({ ...value, nama: e.target.value })} placeholder="Mis. Zakat/Infaq" className={inp} />
        </div>
        <div>
          <label className={lbl}>Untuk Tipe</label>
          <select value={value.tipe} onChange={e => onChange({ ...value, tipe: e.target.value })} className={inp}>
            <option value="out">OUT (pengeluaran)</option>
            <option value="in">IN (pemasukan)</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Urutan</label>
          <input type="number" value={value.urutan} onChange={e => onChange({ ...value, urutan: e.target.value })} className={inp} />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 pb-2.5">
          <input type="checkbox" checked={value.termasuk_laba_rugi} onChange={e => onChange({ ...value, termasuk_laba_rugi: e.target.checked })} />
          Termasuk hitungan Laba Rugi
        </label>
        <button onClick={onSimpan} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl">💾 Simpan</button>
        <button onClick={onBatal} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
      </div>
      <div className="text-xs text-gray-400">
        Matikan ini kalau kategori sebenarnya sudah dihitung otomatis dari sumber lain (mis. HPP/Komisi dari data booking, Pendapatan Booking dari pembayaran) atau bukan pendapatan/beban operasional (mis. modal pribadi owner) — biar gak kehitung dobel di Laba Rugi.
      </div>
    </div>
  );
}

export default function CashflowHubPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [periodeList, setPeriodeList] = useState([]);
  const [akunList, setAkunList] = useState([]);
  const [kategoriList, setKategoriList] = useState([]);
  const [settlementPending, setSettlementPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showKelolaAkun, setShowKelolaAkun] = useState(false);
  const [showKelolaKategori, setShowKelolaKategori] = useState(false);
  const [formAkun, setFormAkun] = useState(null);
  const [formKategori, setFormKategori] = useState(null);
  const [bulanBaru, setBulanBaru] = useState(new Date().toISOString().slice(0, 7));
  const [membuat, setMembuat] = useState(false);
  const [saldoAwalManual, setSaldoAwalManual] = useState({});

  function muat() {
    Promise.all([
      fetch('/api/admin/cashflow/periode').then(r => r.json()),
      fetch('/api/admin/cashflow/akun?semua=1').then(r => r.json()),
      fetch('/api/admin/cashflow/kategori?semua=1').then(r => r.json()),
      fetch('/api/admin/cashflow/settlement-pending').then(r => r.json()),
    ]).then(([p, a, k, s]) => {
      setPeriodeList(p.periode || []);
      setAkunList(a.akun || []);
      setKategoriList(k.kategori || []);
      setSettlementPending(s.settlement || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { router.replace('/admin?tab=dashboard'); }
  }, [user]);

  useEffect(() => { muat(); }, []);

  if (!user || user.role !== 'super_admin') {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  async function buatPeriode() {
    setMembuat(true);
    try {
      const res = await fetch('/api/admin/cashflow/periode', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulan: bulanBaru, saldo_awal_manual: saldoAwalManual }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal membuat periode'); setMembuat(false); return; }
      router.push(`/admin/laporan/cashflow/${d.id}`);
    } catch { alert('Terjadi kesalahan'); setMembuat(false); }
  }

  async function simpanAkun() {
    const res = await fetch('/api/admin/cashflow/akun', {
      method: formAkun.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formAkun),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menyimpan'); return; }
    setFormAkun(null);
    muat();
  }

  async function toggleAktifAkun(a) {
    await fetch('/api/admin/cashflow/akun', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...a, aktif: !a.aktif }),
    });
    muat();
  }

  async function simpanKategori() {
    const res = await fetch('/api/admin/cashflow/kategori', {
      method: formKategori.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formKategori),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menyimpan'); return; }
    setFormKategori(null);
    muat();
  }

  async function toggleAktifKategori(k) {
    await fetch('/api/admin/cashflow/kategori', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...k, aktif: !k.aktif }),
    });
    muat();
  }

  const sudahAdaPeriode = periodeList.some(p => p.bulan === bulanBaru);

  return (
    <Layout title="🔒 Cashflow Bulanan" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Khusus super admin. Buku kas manual per bulan, per akun (bank, cash/petty cash, e-money, dst) — lengkap dengan bon per transaksi. Saldo akhir bulan yang sudah disubmit otomatis jadi saldo awal bulan berikutnya.
      </div>

      {/* Buat periode baru */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className={lbl}>Buat Cashflow Bulan</label>
          <input type="month" value={bulanBaru} onChange={e => setBulanBaru(e.target.value)} className={inp} />
        </div>
        <button onClick={buatPeriode} disabled={membuat || sudahAdaPeriode}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {membuat ? 'Membuat...' : '+ Buat Cashflow Bulan Ini'}
        </button>
        {sudahAdaPeriode && <div className="text-xs text-amber-600">Bulan ini sudah ada — klik di daftar bawah.</div>}
        <div className="ml-auto flex gap-3">
          <button onClick={() => setShowKelolaKategori(v => !v)} className="text-xs font-bold text-[#1A4FA0] hover:underline">
            {showKelolaKategori ? 'Sembunyikan Kategori' : '🏷️ Kelola Kategori'}
          </button>
          <button onClick={() => setShowKelolaAkun(v => !v)} className="text-xs font-bold text-[#1A4FA0] hover:underline">
            {showKelolaAkun ? 'Sembunyikan Kelola Akun' : '⚙️ Kelola Akun'}
          </button>
        </div>

        {periodeList.length === 0 && akunList.length > 0 && (
          <div className="w-full bg-[#E8F0FB] rounded-lg p-3">
            <div className="text-xs font-bold text-[#0E2F6E] mb-2">Ini bulan pertama — isi saldo awal tiap akun (boleh kosong = 0):</div>
            <div className="flex flex-wrap gap-3">
              {akunList.filter(a => a.aktif).map(a => (
                <div key={a.id}>
                  <label className={lbl}>{a.nama}</label>
                  <input type="number" value={saldoAwalManual[a.id] || ''} placeholder="0"
                    onChange={e => setSaldoAwalManual(s => ({ ...s, [a.id]: e.target.value }))} className={inp} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {settlementPending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="font-bold text-amber-700 mb-1">⚠️ Belum Settlement ({settlementPending.length})</div>
          <div className="text-xs text-amber-600 mb-3">Transfer ke staff yang belum lunas dirincikan dengan bon, dari semua bulan.</div>
          <div className="space-y-2">
            {settlementPending.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-white rounded-lg p-3 gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-700 truncate">
                    {s.deskripsi} {s.penerima_settlement ? `— ke ${s.penerima_settlement}` : ''}
                  </div>
                  <div className="text-xs text-gray-400">
                    {namaBulan(s.bulan)} · {tgl(s.tanggal)} · {s.akun_nama} · Total {rp(s.nominal)}
                    {s.periode_status === 'submitted' && ' · 🔒 bulan terkunci'}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-amber-600">Sisa {rp(s.sisa)}</div>
                  {s.periode_status === 'draft' ? (
                    <button onClick={() => router.push(`/admin/laporan/cashflow/${s.periode_id}?rincikan=${s.id}`)}
                      className="text-xs font-bold text-[#1A4FA0] hover:underline">Rincikan →</button>
                  ) : (
                    <button onClick={() => router.push(`/admin/laporan/cashflow/${s.periode_id}`)}
                      className="text-xs font-bold text-gray-400 hover:underline">Buka bulan dulu</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showKelolaAkun && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#0E2F6E]">Akun Cashflow (CIMB, Cash, Flazz, dll)</div>
            {!formAkun && (
              <button onClick={() => setFormAkun(KOSONG_AKUN)} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Akun</button>
            )}
          </div>
          {formAkun?.id === null && (
            <div className="mb-4"><FormAkun value={formAkun} onChange={setFormAkun} onSimpan={simpanAkun} onBatal={() => setFormAkun(null)} /></div>
          )}
          <div className="space-y-2">
            {akunList.map(a => (
              formAkun?.id === a.id ? (
                <FormAkun key={a.id} value={formAkun} onChange={setFormAkun} onSimpan={simpanAkun} onBatal={() => setFormAkun(null)} />
              ) : (
              <div key={a.id} className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
                <div className="text-sm font-semibold text-gray-700">
                  {a.nama} <span className="text-xs font-normal text-gray-400">({TIPE_AKUN_LIST.find(t => t.value === a.tipe)?.label})</span>
                  {!a.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setFormAkun({ id: a.id, nama: a.nama, tipe: a.tipe, urutan: a.urutan, aktif: !!a.aktif })} className="text-xs font-bold text-[#1A4FA0] hover:underline">Edit</button>
                  <button onClick={() => toggleAktifAkun(a)} className="text-xs font-bold text-amber-600 hover:underline">{a.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                </div>
              </div>
              )
            ))}
          </div>
        </div>
      )}

      {showKelolaKategori && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#0E2F6E]">Kategori Pengeluaran/Pemasukan</div>
            {!formKategori && (
              <button onClick={() => setFormKategori(KOSONG_KATEGORI)} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Kategori</button>
            )}
          </div>
          {formKategori?.id === null && (
            <div className="mb-4"><FormKategori value={formKategori} onChange={setFormKategori} onSimpan={simpanKategori} onBatal={() => setFormKategori(null)} /></div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-bold text-red-600 mb-2">OUT (pengeluaran)</div>
              <div className="space-y-2">
                {kategoriList.filter(k => k.tipe === 'out').map(k => (
                  formKategori?.id === k.id ? (
                    <FormKategori key={k.id} value={formKategori} onChange={setFormKategori} onSimpan={simpanKategori} onBatal={() => setFormKategori(null)} />
                  ) : (
                  <div key={k.id} className="flex items-center justify-between border border-gray-100 rounded-xl p-2.5">
                    <div className="text-sm font-semibold text-gray-700">
                      {k.nama}
                      {!k.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}
                      {!k.termasuk_laba_rugi && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">gak masuk Laba Rugi</span>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setFormKategori({ id: k.id, nama: k.nama, tipe: k.tipe, urutan: k.urutan, aktif: !!k.aktif, termasuk_laba_rugi: !!k.termasuk_laba_rugi })} className="text-xs font-bold text-[#1A4FA0] hover:underline">Edit</button>
                      <button onClick={() => toggleAktifKategori(k)} className="text-xs font-bold text-amber-600 hover:underline">{k.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    </div>
                  </div>
                  )
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-green-600 mb-2">IN (pemasukan)</div>
              <div className="space-y-2">
                {kategoriList.filter(k => k.tipe === 'in').map(k => (
                  formKategori?.id === k.id ? (
                    <FormKategori key={k.id} value={formKategori} onChange={setFormKategori} onSimpan={simpanKategori} onBatal={() => setFormKategori(null)} />
                  ) : (
                  <div key={k.id} className="flex items-center justify-between border border-gray-100 rounded-xl p-2.5">
                    <div className="text-sm font-semibold text-gray-700">
                      {k.nama}
                      {!k.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}
                      {!k.termasuk_laba_rugi && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">gak masuk Laba Rugi</span>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setFormKategori({ id: k.id, nama: k.nama, tipe: k.tipe, urutan: k.urutan, aktif: !!k.aktif, termasuk_laba_rugi: !!k.termasuk_laba_rugi })} className="text-xs font-bold text-[#1A4FA0] hover:underline">Edit</button>
                      <button onClick={() => toggleAktifKategori(k)} className="text-xs font-bold text-amber-600 hover:underline">{k.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    </div>
                  </div>
                  )
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : (
        <div className="space-y-3">
          {periodeList.length === 0 && (
            <div className="text-center text-gray-400 py-10 text-sm">Belum ada cashflow bulanan. Buat yang pertama di atas.</div>
          )}
          {periodeList.map(p => (
            <button key={p.id} onClick={() => router.push(`/admin/laporan/cashflow/${p.id}`)}
              className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-[#1A4FA0] p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold text-[#0E2F6E]">{namaBulan(p.bulan)}</div>
                <div className="text-xs text-gray-400">
                  {p.status === 'submitted' ? `🔒 Terkunci · disubmit ${new Date(p.submitted_at).toLocaleDateString('id-ID')}` : '📝 Draft'}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {p.saldo_akhir.map(s => {
                  const akun = akunList.find(a => a.id === s.akun_id);
                  return (
                    <div key={s.akun_id} className="text-right">
                      <div className="text-[10px] text-gray-400">{akun?.nama || `Akun #${s.akun_id}`}</div>
                      <div className="text-sm font-bold text-[#0E2F6E]">{rp(s.saldo_akhir)}</div>
                    </div>
                  );
                })}
              </div>
            </button>
          ))}
        </div>
      )}
    </Layout>
  );
}
