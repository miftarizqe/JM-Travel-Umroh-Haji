'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useIsHop } from '@/lib/useIsHop';
import { persenKesiapan, warnaProgress } from '@/lib/kesiapanTabungan';
import { downloadExcel } from '@/lib/downloadExcel';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

function fmtTanggal(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Status FUNNEL pendaftaran (kp.status) — cuma dipakai buat display detail
// tahap proses (mis. badge di tab Hirarki Pohon), BUKAN buat filter tab
// utama lagi (dikonfirmasi user 2026-09-07, sebelumnya tab filter salah
// pakai ini, jadi gak konsisten sama Database Perwakilan yang dari awal
// pakai status akun).
const PENDAFTARAN_STATUS_LABEL = {
  pending: 'Verifikasi Bukti TF', menunggu_bsi: 'Menunggu Rekening Tabungan Umroh', menunggu_sk_cif: 'Menunggu SK-CIF',
  active: 'Aktif', ditolak: 'Ditolak',
};
const PENDAFTARAN_STATUS_WARNA = {
  pending: 'bg-yellow-100 text-yellow-700', menunggu_bsi: 'bg-blue-100 text-blue-700',
  menunggu_sk_cif: 'bg-purple-100 text-purple-700', active: 'bg-green-100 text-green-700', ditolak: 'bg-red-100 text-red-700',
};

const TEKS_KONFIRMASI_KOREKSI = 'KURANGI SALDO';

// Modal konfirmasi ketik-ulang buat Koreksi Saldo (dikonfirmasi user
// 2026-09-21) — "angka fatal" karena ngurangin duit member, sama level
// proteksi kayak ubah nominal komisi di Pengaturan Komisi. Ditulis inline di
// sini (bukan komponen shared) karena cuma dipakai 1 halaman ini.
function ModalKoreksiSaldo({ nama, saldoSaatIni, nominal, keterangan, onBatal, onKonfirmasi, saving }) {
  const [teks, setTeks] = useState('');
  const cocok = teks.trim() === TEKS_KONFIRMASI_KOREKSI;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onBatal}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="font-bold text-lg text-red-600 mb-1">⚠️ Konfirmasi Koreksi Saldo</div>
        <div className="text-sm text-gray-500 mb-4">Tindakan ini MENGURANGI saldo tabungan umroh {nama} secara permanen. Riwayat tetap tercatat (append-only), tapi saldo yang tampil ke member langsung berubah.</div>
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 mb-4 space-y-1">
          <div>Saldo saat ini: <b>{fmtRp(saldoSaatIni)}</b></div>
          <div>Dikurangi: <b className="text-red-600">−{fmtRp(nominal)}</b></div>
          <div>Saldo setelah: <b>{fmtRp(Math.max(0, saldoSaatIni - nominal))}</b></div>
          <div className="pt-1 border-t border-gray-200 mt-1">Alasan: <b>{keterangan}</b></div>
        </div>
        <div className="text-xs text-gray-500 mb-1.5">
          Ketik <b className="text-red-600">{TEKS_KONFIRMASI_KOREKSI}</b> buat lanjut:
        </div>
        <input value={teks} onChange={e => setTeks(e.target.value)} autoFocus
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-red-400 focus:outline-none text-sm mb-4" />
        <div className="flex gap-2">
          <button onClick={onBatal} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2.5 rounded-xl">Batal</button>
          <button onClick={onKonfirmasi} disabled={!cocok || saving}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl">
            {saving ? 'Menyimpan...' : 'Konfirmasi & Kurangi'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Status AKUN (u.status) — dipakai buat tab filter utama & badge di baris
// list, mirror PERSIS Database Perwakilan (Aktif/Pending/Ditolak/Nonaktif).
const STATUS_LABEL = { active: 'Aktif', pending: 'Pending', rejected: 'Ditolak', nonaktif: 'Nonaktif' };
const STATUS_WARNA = {
  active: 'bg-green-100 text-green-700', pending: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700', nonaktif: 'bg-gray-200 text-gray-500',
};

// Rekap per-periode (dikonfirmasi user 2026-09-06) — beda dari Perwakilan:
// saldo sahabat itu TABUNGAN yang ngendap (bukan komisi tahunan), jadi kartu
// utama TETAP all-time, cuma nambahin rekap+download filter Bulan/Tahun/
// Jenis Transaksi (bukan "Per Program" — banyak jenis saldo sahabat, mis.
// komisi rekrutan/tabungan awal, gak nempel ke booking manapun).
const JENIS_SALDO_LABEL = {
  komisi_sahabat: 'Komisi Rekrutan (5 Generasi)', closing_langsung_sahabat: 'Closing Langsung',
  referral_closing_reguler_sahabat: 'Referral Closing Reguler', tabungan_awal_sahabat: 'Tabungan Awal',
  head_of_program_registrasi: 'Head of Program (Registrasi)', pemakaian_saldo_sahabat: 'Pemakaian Saldo',
  setoran_mandiri_sahabat: 'Setoran Mandiri', koreksi_saldo_sahabat: 'Koreksi Saldo (Admin)',
};
const BULAN_LABEL = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const TAHUN_SEKARANG = new Date().getFullYear();
const PILIHAN_TAHUN = Array.from({ length: 5 }, (_, i) => TAHUN_SEKARANG - i);

// Halaman profil lengkap 1 Jamaah Sahabat Baitullah — digabung 2026-08-29 dari
// yang tadinya kepencar di Pendaftaran (detail WA/NIK/bank/CIF/voucher/status
// funnel/aksi verify-TF/BSI/SK-CIF/riwayat saldo) + yang emang udah ada di
// sini (saldo & target keberangkatan). Pendaftaran sekarang cuma nampilin
// reminder cluster per status, klik "Lihat Detail" ke sini.
export default function DatabaseJamaahPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const { isAdminOrHop, isHop, checked: hopChecked } = useIsHop(user);
  const [jamaah, setJamaah] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cari, setCari] = useState('');
  // `?cari=` di URL (link dari /admin/sahabat/riwayat-closing "Lihat
  // Profil →") prefill kolom cari ini, dibaca sekali dari window.location
  // (dikonfirmasi user 2026-09-06, sama pola `?publish_type=` di /admin/programs).
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search).get('cari');
    if (qp) setCari(qp);
  }, []);
  const [filterStatus, setFilterStatus] = useState('semua');
  // Filter tambahan, independen dari status — buat kartu ringkasan "≥80%
  // Siap Berangkat" (dikonfirmasi user 2026-09-07), bisa digabung sama
  // filter status manapun (mis. Aktif + Siap Berangkat sekaligus).
  const [filterSiap, setFilterSiap] = useState(false);
  // Search/filter/sort/pagination SEMUA dikerjakan server (bukan client-side
  // filter dari array penuh kayak sebelumnya) — disiapin dari awal buat
  // skala besar walau belum mendesak sekarang (dikonfirmasi user 2026-09-06).
  const [sort, setSort] = useState('kode');
  const [dir, setDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [ringkasan, setRingkasan] = useState({ total: 0, aktif: 0, proses: 0, siap_berangkat: 0 });
  const PER_PAGE = 25;
  const [expand, setExpand] = useState(null); // user_id lagi dibuka detailnya
  const [editing, setEditing] = useState(null); // user_id lagi diedit target-nya
  const [form, setForm] = useState({ target_minat: '', target_estimasi_harga: '', target_bulan: '' });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingData, setEditingData] = useState(null); // user_id lagi diedit NIK/rekening-nya
  const [formData, setFormData] = useState({});
  const [savingData, setSavingData] = useState(false);
  const [komisiPerUser, setKomisiPerUser] = useState({}); // { [user_id]: rows[] }
  const [rekapFor, setRekapFor] = useState(null);
  const [rekapFilter, setRekapFilter] = useState({ tahun: '', bulan: '', jenis: '' });
  const [rekapData, setRekapData] = useState([]);
  const [rekapLoading, setRekapLoading] = useState(false);
  const [downloadingRekap, setDownloadingRekap] = useState(false);
  const [setoranForm, setSetoranForm] = useState({}); // { [user_id]: { nominal, keterangan } }
  const [savingSetoran, setSavingSetoran] = useState(null); // user_id lagi disubmit
  const [koreksiForm, setKoreksiForm] = useState({}); // { [user_id]: { nominal, keterangan } }
  const [koreksiModalFor, setKoreksiModalFor] = useState(null); // user_id yang lagi nunjukin modal konfirmasi
  const [savingKoreksi, setSavingKoreksi] = useState(null); // user_id lagi disubmit
  const isSuperAdmin = user?.role === 'super_admin';
  // Tab "Hirarki Pohon" — digabung ke sini 2026-08-30 (sebelumnya halaman
  // /admin/sahabat/hirarki berdiri sendiri), REUSE API /api/admin/sahabat/
  // hirarki yang sama persis, cuma pindah tempat konsumennya.
  const [tab, setTab] = useState('daftar'); // 'daftar' | 'hirarki'
  const [akar, setAkar] = useState([]);
  const [loadingAkar, setLoadingAkar] = useState(true);
  const [cariAkar, setCariAkar] = useState('');
  // Riwayat Closing PINDAH jadi halaman sendiri, /admin/sahabat/
  // riwayat-closing (dikonfirmasi user 2026-09-06) — state & fetch-nya ikut
  // pindah kesana, gak numpang di sini lagi.

  function muat() {
    const qs = new URLSearchParams({
      page: String(page), per_page: String(PER_PAGE), sort, dir,
      ...(cari.trim() ? { q: cari.trim() } : {}),
      ...(filterStatus !== 'semua' ? { status: filterStatus } : {}),
      ...(filterSiap ? { siap_berangkat: '1' } : {}),
    });
    fetch(`/api/admin/sahabat/database?${qs.toString()}`).then(r => r.json()).then(d => {
      setJamaah(d.jamaah || []);
      setTotal(d.total || 0);
      if (d.ringkasan) setRingkasan(d.ringkasan);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user || !hopChecked) return;
    if (!isAdminOrHop) { router.replace('/login'); return; }
    fetch('/api/admin/sahabat/hirarki').then(r => r.json()).then(d => {
      setAkar(d.akar || []);
      setLoadingAkar(false);
    }).catch(() => setLoadingAkar(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hopChecked, isAdminOrHop]);

  // Reset ke halaman 1 tiap kali search/filter/sort ganti (bukan reset page
  // sekaligus muat — dipisah biar gak race condition sama efek muat di bawah).
  useEffect(() => { setPage(1); }, [cari, filterStatus, filterSiap, sort, dir]);

  // Debounce dikit (350ms) buat ketikan pencarian, biar gak nembak fetch
  // tiap huruf — filter/sort/page ganti langsung muat, gak perlu nunggu.
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(muat, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cari, filterStatus, filterSiap, sort, dir, page]);

  function muatKomisi(userId) {
    fetch(`/api/admin/sahabat/komisi?user_id=${userId}`).then(r => r.json())
      .then(d => setKomisiPerUser(prev => ({ ...prev, [userId]: d.komisi || [] })))
      .catch(() => {});
  }

  function bukaRekap(row) {
    setRekapFor(row);
    setRekapFilter({ tahun: '', bulan: '', jenis: '' });
  }

  function muatRekap() {
    if (!rekapFor) return;
    setRekapLoading(true);
    const qs = new URLSearchParams({ user_id: rekapFor.user_id });
    if (rekapFilter.tahun) qs.set('tahun', rekapFilter.tahun);
    if (rekapFilter.bulan) qs.set('bulan', rekapFilter.bulan);
    if (rekapFilter.jenis) qs.set('jenis', rekapFilter.jenis);
    fetch(`/api/admin/sahabat/komisi?${qs.toString()}`).then(r => r.json())
      .then(d => { setRekapData(d.komisi || []); setRekapLoading(false); })
      .catch(() => setRekapLoading(false));
  }

  useEffect(() => {
    if (!rekapFor) return;
    muatRekap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rekapFor, rekapFilter]);

  async function downloadRekap() {
    if (!rekapFor) return;
    setDownloadingRekap(true);
    try {
      const params = { penerima_id: rekapFor.user_id };
      params.jenis = rekapFilter.jenis ? [rekapFilter.jenis] : Object.keys(JENIS_SALDO_LABEL);
      if (rekapFilter.tahun) {
        params.from = `${rekapFilter.tahun}-${rekapFilter.bulan ? String(rekapFilter.bulan).padStart(2, '0') : '01'}-01`;
        const bulanAkhir = rekapFilter.bulan ? Number(rekapFilter.bulan) : 12;
        const akhirDate = new Date(Number(rekapFilter.tahun), bulanAkhir, 0);
        params.to = akhirDate.toISOString().slice(0, 10);
      }
      await downloadExcel('komisi', params);
    } catch (e) { alert(e.message || 'Gagal download'); }
    setDownloadingRekap(false);
  }

  async function konfirmasiDenganBukti(userId, komisiId, file) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('confirmed', 'true');
      if (file) fd.append('file', file);
      const res = await fetch(`/api/admin/sahabat/komisi/${komisiId}`, { method: 'PATCH', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusy(false); return; }
      muatKomisi(userId);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  async function batalkanKonfirmasi(userId, komisiId) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('confirmed', 'false');
      const res = await fetch(`/api/admin/sahabat/komisi/${komisiId}`, { method: 'PATCH', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusy(false); return; }
      muatKomisi(userId);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  // Setoran mandiri — jamaah nabung sendiri ke tabungan umroh BSI mereka
  // (bukan ujroh/closing lewat JM Travel). Gak ada API BSI, admin cek
  // mutasi rekening manual tiap sore & catat per-transaksi kalau ada yang
  // baru masuk (dikonfirmasi user 2026-09-02). Langsung tercatat confirmed,
  // admin biasa boleh input (gak ada duit yang lewat JM Travel di sini).
  async function catatSetoranMandiri(userId) {
    const f = setoranForm[userId] || {};
    const nominal = Number(f.nominal);
    if (!nominal || nominal <= 0) { alert('Nominal harus lebih dari 0'); return; }
    setSavingSetoran(userId);
    try {
      const res = await fetch('/api/admin/sahabat/setoran-mandiri', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, nominal, keterangan: f.keterangan || '' }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSavingSetoran(null); return; }
      setSetoranForm(prev => ({ ...prev, [userId]: { nominal: '', keterangan: '' } }));
      muatKomisi(userId);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSavingSetoran(null);
  }

  // Koreksi Saldo (kurangi manual) — super_admin only, "angka fatal" sama
  // level Pengaturan Komisi (dikonfirmasi user 2026-09-21). Validasi
  // client-side di sini cuma buat UX cepat, guard beneran TETAP di server
  // (nominal gak boleh melebihi saldo, keterangan wajib).
  function bukaKoreksiModal(userId) {
    const f = koreksiForm[userId] || {};
    const nominal = Number(f.nominal);
    if (!nominal || nominal <= 0) { alert('Nominal harus lebih dari 0'); return; }
    if (!f.keterangan || !f.keterangan.trim()) { alert('Alasan koreksi wajib diisi'); return; }
    setKoreksiModalFor(userId);
  }

  async function konfirmasiKoreksi(userId) {
    const f = koreksiForm[userId] || {};
    const nominal = Number(f.nominal);
    setSavingKoreksi(userId);
    try {
      const res = await fetch('/api/admin/sahabat/koreksi-saldo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, nominal, keterangan: f.keterangan }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSavingKoreksi(null); return; }
      setKoreksiForm(prev => ({ ...prev, [userId]: { nominal: '', keterangan: '' } }));
      setKoreksiModalFor(null);
      muatKomisi(userId);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSavingKoreksi(null);
  }

  async function aksi(body) {
    setBusy(true);
    try {
      const res = await fetch('/api/status-pendaftaran-sahabat', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusy(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  async function approveVoucher(voucherId) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/vouchers', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: voucherId, approve: true }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusy(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  // Dual-role: tambah role Perwakilan ke akun sahabat yang sudah aktif —
  // KHUSUS direkrut langsung manajemen, dikonfirmasi user 2026-09-06. Mirror
  // tambahRoleKedua di /admin/database/[tipe] (arah sebaliknya).
  async function tambahRolePerwakilan(j) {
    if (!confirm(`Tambahkan role Perwakilan ke akun ${j.nama}? Orang ini tetap wajib lewat proses pendaftaran perwakilan lengkap — cuma jalur masuknya via admin, bukan link referral.`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: j.user_id, action: 'tambah_role_kedua', role_kedua: 'perwakilan' }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menambahkan role kedua'); setBusy(false); return; }
      alert('Role Perwakilan berhasil ditambahkan. Orangnya bisa lanjut proses pendaftaran lewat halaman Profil.');
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  function bukaDetail(j) {
    const membuka = expand !== j.user_id;
    setExpand(membuka ? j.user_id : null);
    if (membuka && !komisiPerUser[j.user_id]) muatKomisi(j.user_id);
  }

  function mulaiEdit(j) {
    setEditing(j.user_id);
    setForm({ target_minat: j.target_minat || '', target_estimasi_harga: j.target_estimasi_harga || '', target_bulan: j.target_bulan || '' });
  }

  async function simpanTarget(userId) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/sahabat/database', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, ...form }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error); setSaving(false); return; }
      setEditing(null);
      muat();
    } catch { alert('Gagal menyimpan'); }
    setSaving(false);
  }

  // Edit NIK/bank/no_rekening/nama_pemilik_rekening/rekening BSI/tabungan
  // umroh — SEKARANG ADMIN-ONLY (dikonfirmasi user 2026-08-30, dibalik dari
  // self-service Fase 1 karena "ngaruh kemana2"). Reuse PATCH /api/profil
  // yang sama (lolos guard di situ karena actor di sini admin/super_admin).
  function mulaiEditData(j) {
    setEditingData(j.user_id);
    setFormData({
      nik: j.nik || '', bank: j.bank || '', no_rekening: j.no_rekening || '', nama_pemilik_rekening: j.nama_pemilik_rekening || '',
      no_rekening_bsi_biasa: j.no_rekening_bsi_biasa || '', no_rekening_tabungan_umroh: j.no_rekening_tabungan_umroh || '',
    });
  }

  async function simpanData(j) {
    setSavingData(true);
    try {
      const res = await fetch('/api/profil', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: j.user_id, name: j.nama, email: j.user_email, wa: j.user_wa, ...formData }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSavingData(false); return; }
      setEditingData(null);
      muat();
    } catch { alert('Gagal menyimpan'); }
    setSavingData(false);
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  if (!user || !hopChecked || !isAdminOrHop) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <Layout title="💰 Database Jamaah Sahabat Baitullah" backHref="/admin/sahabat">
      <div className="text-xs text-gray-400 mb-4">
        Profil lengkap tiap Jamaah Sahabat Baitullah — status funnel, dokumen, saldo tabungan umroh &amp; progres menuju target keberangkatan. Klik nama buat buka detail lengkap.
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('daftar')}
          className={`text-xs font-bold px-4 py-2 rounded-full ${tab === 'daftar' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
          📋 Daftar Jamaah
        </button>
        <button onClick={() => setTab('hirarki')}
          className={`text-xs font-bold px-4 py-2 rounded-full ${tab === 'hirarki' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
          🌳 Hirarki Pohon
        </button>
      </div>

      {tab === 'daftar' && (<>
      {/* "Total Saldo Tabungan" dihapus (dikonfirmasi user 2026-09-03) —
          gak ada artinya dijumlah di sini karena tiap jamaah punya rekening
          tabungan umroh sendiri-sendiri, gak ada yg dikepul jadi satu
          rekening. Saldo per-orang (+ status cair/pending) tetap ada,
          cukup dilihat dari dashboard masing-masing jamaah. */}
      {/* 3 kartu status pertama diklik langsung ganti tab filter di bawah
          (dikonfirmasi user 2026-09-07) — biar dari angka ringkasan bisa
          langsung loncat lihat daftar akunnya + tahap prosesnya (baris
          "Tahap: ..." per orang begitu tab-nya "Pending"). */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <button onClick={() => setFilterStatus('semua')} className="bg-white rounded-xl border border-gray-200 p-3 text-center hover:border-[#1A4FA0] transition-colors">
          <div className="text-xl font-bold text-[#0E2F6E]">{ringkasan.total}</div>
          <div className="text-[10px] text-gray-400">Total Jamaah</div>
        </button>
        <button onClick={() => setFilterStatus('active')} className="bg-white rounded-xl border border-gray-200 p-3 text-center hover:border-[#1A4FA0] transition-colors">
          <div className="text-xl font-bold text-green-600">{ringkasan.aktif}</div>
          <div className="text-[10px] text-gray-400">Aktif</div>
        </button>
        <button onClick={() => setFilterStatus('pending')} className="bg-white rounded-xl border border-gray-200 p-3 text-center hover:border-[#1A4FA0] transition-colors">
          <div className="text-xl font-bold text-yellow-600">{ringkasan.proses}</div>
          <div className="text-[10px] text-gray-400">Dalam Proses</div>
        </button>
        <button onClick={() => setFilterSiap(v => !v)}
          className={`rounded-xl border p-3 text-center transition-colors ${filterSiap ? 'bg-amber-50 border-amber-400' : 'bg-white border-gray-200 hover:border-[#1A4FA0]'}`}>
          <div className="text-xl font-bold text-amber-600">{ringkasan.siap_berangkat}</div>
          <div className="text-[10px] text-gray-400">≥80% Siap Berangkat{filterSiap ? ' ✓' : ''}</div>
        </button>
      </div>

      {/* Tab status — dikonfirmasi user 2026-09-07: dulu dropdown filter
          doang, sekarang tab beneran biar tiap tahap kepisah jelas per klik,
          gak nyampur dalam 1 pandangan. */}
      <div className="flex flex-wrap gap-2 mb-3">
        {[{ k: 'semua', l: 'Semua' }, ...Object.entries(STATUS_LABEL).map(([k, l]) => ({ k, l }))].map(opt => (
          <button key={opt.k} onClick={() => setFilterStatus(opt.k)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
              filterStatus === opt.k ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            {opt.l}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <input value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama / kode / WA / NIK..."
          className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
          <option value="kode">Urut: Kode Unik</option>
          <option value="saldo">Urut: Saldo</option>
          <option value="nama">Urut: Nama</option>
          <option value="created_at">Urut: Tanggal Gabung</option>
          <option value="status">Urut: Status</option>
        </select>
        <button onClick={() => setDir(d => d === 'asc' ? 'desc' : 'asc')}
          title="Balik urutan"
          className="px-3 py-2 rounded-lg border-2 border-gray-200 text-sm font-bold text-gray-500 hover:border-[#1A4FA0] hover:text-[#1A4FA0]">
          {dir === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : jamaah.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
          {total === 0 && !cari && filterStatus === 'semua' ? 'Belum ada Jamaah Sahabat Baitullah.' : 'Gak ada yang cocok.'}
        </div>
      ) : (
        <div className="space-y-2">
          {jamaah.map(j => {
            const persen = persenKesiapan(j.saldo_tabungan_umroh, j.target_estimasi_harga);
            return (
              <div key={j.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <button onClick={() => bukaDetail(j)} className="text-left min-w-0 flex-1">
                      <div className="text-sm font-bold text-[#0E2F6E] truncate underline decoration-dotted">{j.nama} <span className="text-gray-400 font-normal">({j.kode_unik})</span></div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {fmtRp(j.saldo_tabungan_umroh)}
                        {j.saldo_updated_at && <span className="text-gray-400"> · diperbarui {fmtTanggal(j.saldo_updated_at)}</span>}
                      </div>
                      {/* Tahap funnel pendaftaran — cuma relevan selama akun
                          belum aktif (dikonfirmasi user 2026-09-07, mirror
                          "Tahap:" di Database Perwakilan). Begitu aktif,
                          detail tahap gak berarti apa2 lagi. */}
                      {j.user_status === 'pending' && (
                        <div className="text-[10px] text-gray-400 mt-0.5">Tahap: {PENDAFTARAN_STATUS_LABEL[j.status] || j.status}</div>
                      )}
                    </button>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_WARNA[j.user_status] || 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[j.user_status] || j.user_status}
                    </span>
                    {!isHop && (
                      <button onClick={() => mulaiEdit(j)} className="text-[10px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-2.5 py-1 rounded-full shrink-0">
                        ✏️ Target
                      </button>
                    )}
                  </div>

                  {editing === j.user_id ? (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col sm:flex-row gap-2">
                      <input value={form.target_minat} onChange={e => setForm(f => ({ ...f, target_minat: e.target.value }))}
                        placeholder="Tujuan/paket incaran (mis. Umroh 9 Hari)"
                        className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
                      <input type="number" value={form.target_estimasi_harga} onChange={e => setForm(f => ({ ...f, target_estimasi_harga: e.target.value }))}
                        placeholder="Estimasi harga (Rp)"
                        className="w-full sm:w-40 px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
                      <input type="number" value={form.target_bulan} onChange={e => setForm(f => ({ ...f, target_bulan: e.target.value }))}
                        placeholder="Target (bulan)"
                        className="w-full sm:w-32 px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
                      <div className="flex gap-2">
                        <button disabled={saving} onClick={() => simpanTarget(j.user_id)} className="bg-[#1A4FA0] text-white text-sm font-bold px-4 rounded-lg disabled:opacity-50">Simpan</button>
                        <button onClick={() => setEditing(null)} className="bg-gray-100 text-gray-500 text-sm font-bold px-4 rounded-lg">Batal</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2.5">
                      {j.target_estimasi_harga ? (
                        <>
                          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                            <span>{j.target_minat || 'Target belum diberi nama'} — {fmtRp(j.target_estimasi_harga)}{j.target_bulan ? ` · ${j.target_bulan} bulan` : ''}</span>
                            <span className="font-bold">{persen}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${warnaProgress(persen)}`} style={{ width: `${persen}%` }} />
                          </div>
                          {!isHop && !j.program_id && (
                            <button onClick={() => router.push(`/admin/programs?from_sahabat=${j.user_id}`)}
                              className="mt-1.5 text-[10px] font-bold text-[#C9952A] bg-[#FFF6E5] px-2.5 py-1 rounded-full">
                              🎯 Buat Program Eksklusif dari Target Ini →
                            </button>
                          )}
                          {j.program_id && (
                            <div className="mt-1.5 text-[10px] text-green-600 font-bold">✅ Sudah dibuatkan Program Eksklusif</div>
                          )}
                        </>
                      ) : (
                        <div className="text-[10px] text-gray-400">Belum ada target program.</div>
                      )}
                    </div>
                  )}
                </div>

                {expand === j.user_id && (
                  <div className="border-t border-gray-100 p-4 space-y-3 text-xs bg-gray-50/50">
                    {j.user_status === 'active' && !j.role_kedua && !isHop && (
                      <button onClick={() => tambahRolePerwakilan(j)} disabled={busy} className="w-full bg-[#0E2F6E] hover:bg-[#1A4FA0] text-white text-xs font-bold px-3 py-2 rounded-full disabled:opacity-50">
                        🤝 Tambahkan Role Perwakilan (direkrut manajemen)
                      </button>
                    )}
                    {j.role_kedua && (
                      <div className="w-full bg-[#E8F0FB] text-[#0E2F6E] text-xs font-semibold px-3 py-2 rounded-full text-center">
                        ✓ Akun ini juga terdaftar sebagai {j.role_kedua === 'perwakilan' ? 'Perwakilan' : 'Sahabat Baitullah'}
                      </div>
                    )}
                    {/* Saldo per-orang (dikonfirmasi user 2026-09-03) — total
                        di kartu ringkasan atas dihapus (gak berarti apa-apa
                        dijumlah lintas orang, tiap orang rekening sendiri),
                        tapi PER-ORANG di sini justru relevan — mirror persis
                        angka yang jamaah ini lihat sendiri di dashboardnya
                        (saldo_tabungan_umroh = sudah cair/dikonfirmasi,
                        saldo_pending = udah tercatat tapi belum di-ACC). */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white rounded-lg p-2 border border-gray-100 text-center">
                        <div className="font-bold text-[#0E2F6E]">{fmtRp(Number(j.saldo_tabungan_umroh || 0) + Number(j.saldo_pending || 0))}</div>
                        <div className="text-gray-400">Total Saldo</div>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-gray-100 text-center">
                        <div className="font-bold text-green-600">{fmtRp(j.saldo_tabungan_umroh)}</div>
                        <div className="text-gray-400">Sudah Cair</div>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-gray-100 text-center">
                        <div className="font-bold text-yellow-600">{fmtRp(j.saldo_pending)}</div>
                        <div className="text-gray-400">Pending</div>
                      </div>
                    </div>
                    <button onClick={() => bukaRekap(j)} className="w-full text-[#1A4FA0] font-bold hover:underline text-center">
                      📊 Lihat Rekap &amp; Download →
                    </button>

                    {editingData === j.user_id ? (
                      <div className="bg-white rounded-lg p-3 border border-gray-100 space-y-2">
                        <div className="font-bold text-[#0E2F6E]">Edit NIK &amp; Rekening (admin-only)</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-gray-400 mb-0.5">NIK</label>
                            <input value={formData.nik} onChange={e => setFormData(f => ({ ...f, nik: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-gray-400 mb-0.5">Bank</label>
                            <input value={formData.bank} onChange={e => setFormData(f => ({ ...f, bank: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-gray-400 mb-0.5">No. Rekening</label>
                            <input value={formData.no_rekening} onChange={e => setFormData(f => ({ ...f, no_rekening: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-gray-400 mb-0.5">Nama Pemilik Rekening</label>
                            <input value={formData.nama_pemilik_rekening} onChange={e => setFormData(f => ({ ...f, nama_pemilik_rekening: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-gray-400 mb-0.5">Rek. BSI Biasa</label>
                            <input value={formData.no_rekening_bsi_biasa} onChange={e => setFormData(f => ({ ...f, no_rekening_bsi_biasa: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-gray-400 mb-0.5">Rek. Tabungan Umroh</label>
                            <input value={formData.no_rekening_tabungan_umroh} onChange={e => setFormData(f => ({ ...f, no_rekening_tabungan_umroh: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none" />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => setEditingData(null)} className="flex-1 bg-gray-100 text-gray-500 font-bold py-1.5 rounded-lg">Batal</button>
                          <button disabled={savingData} onClick={() => simpanData(j)} className="flex-1 bg-[#1A4FA0] text-white font-bold py-1.5 rounded-lg disabled:opacity-50">
                            {savingData ? 'Menyimpan...' : 'Simpan'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 text-gray-500">
                        <div>WA: <b className="text-gray-700">{j.wa}</b></div>
                        <div>NIK: <b className="text-gray-700">{j.nik}</b></div>
                        <div>Bank: <b className="text-gray-700">{j.bank} - {j.no_rekening}</b></div>
                        <div>CIF BSI: <b className="text-gray-700">{j.cif_bsi || '-'}</b></div>
                        <div>Rek. BSI Biasa: <b className="text-gray-700">{j.no_rekening_bsi_biasa || '-'}</b></div>
                        <div>Rek. Tabungan Umroh: <b className="text-gray-700">{j.no_rekening_tabungan_umroh || '-'}</b></div>
                        <div>Perekrut: <b className="text-gray-700">{j.perekrut_nama || '-'}</b></div>
                        {!isHop && (
                          <div className="col-span-2">
                            <button onClick={() => mulaiEditData(j)} className="text-[10px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-2.5 py-1 rounded-full">
                              ✏️ Edit NIK &amp; Rekening
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button onClick={() => router.push(`/dashboard/sahabat/team?sahabat_id=${j.user_id}`)}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 hover:bg-purple-100">
                        🌳 Jaringan
                      </button>
                      <button onClick={() => router.push(`/dashboard/sahabat/riwayat?sahabat_id=${j.user_id}`)}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#E8F0FB] text-[#1A4FA0] hover:bg-blue-100">
                        📜 Riwayat Lengkap
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-white rounded-lg p-2 border border-gray-100">
                      <span>Voucher Rp1jt</span>
                      {j.voucher_kode ? (
                        j.voucher_used ? (
                          <span className="text-gray-500 font-bold">{j.voucher_kode} (sudah dipakai)</span>
                        ) : !j.voucher_disetujui_at ? (
                          isSuperAdmin ? (
                            <button disabled={busy} onClick={() => approveVoucher(j.voucher_id)}
                              className="text-[10px] font-bold text-white bg-[#1A4FA0] px-2.5 py-1.5 rounded-full disabled:opacity-50">
                              ✅ ACC {j.voucher_kode}
                            </button>
                          ) : (
                            <span className="text-yellow-600 font-bold">{j.voucher_kode} (menunggu ACC super_admin)</span>
                          )
                        ) : (
                          <span className="text-green-600 font-bold">{j.voucher_kode} {j.voucher_aktif ? '(siap dipakai)' : '(nonaktif)'}</span>
                        )
                      ) : (
                        <span className="text-gray-400">Belum terbit — otomatis pas akun aktif</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between bg-white rounded-lg p-2 border border-gray-100">
                      <span>Bukti Transfer Rp1jt</span>
                      {j.bukti_tf_path ? (
                        <div className="flex items-center gap-2">
                          <a href={j.bukti_tf_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">Lihat</a>
                          {!j.bukti_tf_verified_at && j.status === 'pending' && !isHop && (
                            <button disabled={busy} onClick={() => aksi({ action: 'verify_tf', user_id: j.user_id })}
                              className="bg-green-600 text-white font-bold px-3 py-1 rounded-full">Verifikasi</button>
                          )}
                          {j.bukti_tf_verified_at && <span className="text-green-600 font-bold">✅ Terverifikasi</span>}
                        </div>
                      ) : <span className="text-gray-400">Belum diunggah</span>}
                    </div>

                    <div className="flex items-center justify-between bg-white rounded-lg p-2 border border-gray-100">
                      <span>Rekening Tabungan Umroh</span>
                      {j.no_rekening_tabungan_umroh ? (
                        <span className="text-green-600 font-bold">✅ {j.no_rekening_tabungan_umroh}</span>
                      ) : <span className="text-gray-400">⏳ Belum diisi jamaah</span>}
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-lg p-2 border border-gray-100">
                      <span>Baca & Setuju SK-CIF/Surat Kuasa Blokir</span>
                      {j.setuju_sk_cif_pemblokiran_at ? (
                        <span className="text-green-600 font-bold">✅ Ya</span>
                      ) : <span className="text-gray-400">⏳ Belum</span>}
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-lg p-2 border border-gray-100">
                      <span>Dokumen CIF Fisik Diterima di Kantor</span>
                      {isHop ? (
                        <span className={j.dokumen_cif_fisik_diterima_at ? 'text-green-600 font-bold' : 'text-gray-400'}>
                          {j.dokumen_cif_fisik_diterima_at ? '✅ Sudah' : '⏳ Belum'}
                        </span>
                      ) : (
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={!!j.dokumen_cif_fisik_diterima_at} disabled={busy}
                            onChange={e => aksi({ action: 'toggle_cif_fisik', user_id: j.user_id, value: e.target.checked })}
                            className="w-4 h-4 accent-[#1A4FA0]" />
                          Sudah
                        </label>
                      )}
                    </div>

                    <div className="flex items-center justify-between bg-white rounded-lg p-2 border border-gray-100">
                      <span>Scan SK-CIF (fisik + materai)</span>
                      {j.dokumen_sk_cif_fisik_path ? (
                        <a href={j.dokumen_sk_cif_fisik_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">Lihat</a>
                      ) : <span className="text-gray-400">Belum diunggah</span>}
                    </div>

                    <div className="flex items-center justify-between bg-white rounded-lg p-2 border border-gray-100">
                      <span>Scan Surat Pernyataan Kuasa Blokir Rekening (fisik + materai)</span>
                      {j.dokumen_surat_pemblokiran_fisik_path ? (
                        <a href={j.dokumen_surat_pemblokiran_fisik_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">Lihat</a>
                      ) : <span className="text-gray-400">Belum diunggah</span>}
                    </div>

                    <div className="bg-white rounded-lg p-2 border border-gray-100">
                      <div className="font-bold text-[#0E2F6E] mb-1.5">💰 Riwayat Saldo Tabungan Umroh</div>
                      {!komisiPerUser[j.user_id] ? (
                        <div className="text-gray-400">Memuat...</div>
                      ) : komisiPerUser[j.user_id].length === 0 ? (
                        <div className="text-gray-400">Belum ada earning tercatat.</div>
                      ) : (
                        <div className="space-y-1.5">
                          {komisiPerUser[j.user_id].map(k => (
                            <div key={k.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2 border border-gray-100 gap-2">
                              <div className="min-w-0">
                                <div className="text-gray-700">{k.keterangan}</div>
                                <div className={`font-bold ${k.nominal < 0 ? 'text-red-600' : 'text-[#0E2F6E]'}`}>
                                  {k.nominal < 0 ? '-' : ''}{fmtRp(Math.abs(k.nominal))}
                                </div>
                              </div>
                              {k.dikonfirmasi_at ? (
                                <div className="text-right shrink-0">
                                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">✅ Confirmed</span>
                                  <div className="flex items-center gap-2 mt-1 justify-end">
                                    {k.bukti_tf_admin_path && (
                                      <a href={k.bukti_tf_admin_path} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#1A4FA0] font-bold">📎 Lihat Bukti</a>
                                    )}
                                    {isSuperAdmin && (
                                      <button disabled={busy} onClick={() => batalkanKonfirmasi(j.user_id, k.id)} className="text-[10px] text-gray-400 underline">
                                        Batalkan
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : isSuperAdmin ? (
                                k.jenis === 'pemakaian_saldo_sahabat' ? (
                                  <button disabled={busy} onClick={() => konfirmasiDenganBukti(j.user_id, k.id, null)}
                                    className="text-[10px] font-bold text-white bg-[#1A4FA0] px-2.5 py-1.5 rounded-full shrink-0 whitespace-nowrap disabled:opacity-50">
                                    ✅ Tandai Terpakai
                                  </button>
                                ) : (
                                  <label className="text-[10px] font-bold text-white bg-[#1A4FA0] px-2.5 py-1.5 rounded-full cursor-pointer shrink-0 whitespace-nowrap">
                                    📎 Tandai Sudah Transfer
                                    <input type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" disabled={busy}
                                      onChange={e => { const f = e.target.files?.[0]; if (f) konfirmasiDenganBukti(j.user_id, k.id, f); e.target.value = ''; }} />
                                  </label>
                                )
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 shrink-0">Menunggu</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {!isSuperAdmin && (
                        <div className="text-[10px] text-gray-400 mt-1.5">Konfirmasi transfer cuma bisa dilakukan super_admin.</div>
                      )}

                      {/* Setoran mandiri jamaah — bukan ujroh/closing, gak
                          lewat approval kayak baris lain, langsung tercatat
                          confirmed begitu admin submit (lihat catatan di
                          catatSetoranMandiri di atas). */}
                      {!isHop && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <div className="text-[10px] text-gray-500 mb-1">➕ Catat setoran mandiri (hasil cek mutasi rekening sore ini)</div>
                          <div className="flex gap-1.5">
                            <input type="number" placeholder="Nominal" value={setoranForm[j.user_id]?.nominal || ''}
                              onChange={e => setSetoranForm(prev => ({ ...prev, [j.user_id]: { ...prev[j.user_id], nominal: e.target.value } }))}
                              className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-[10px]" />
                            <input type="text" placeholder="Catatan (opsional)" value={setoranForm[j.user_id]?.keterangan || ''}
                              onChange={e => setSetoranForm(prev => ({ ...prev, [j.user_id]: { ...prev[j.user_id], keterangan: e.target.value } }))}
                              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-[10px]" />
                            <button disabled={savingSetoran === j.user_id} onClick={() => catatSetoranMandiri(j.user_id)}
                              className="text-[10px] font-bold text-white bg-emerald-600 px-2.5 py-1 rounded-lg shrink-0 disabled:opacity-50">
                              {savingSetoran === j.user_id ? '...' : 'Catat'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Koreksi Saldo (kurangi manual) — super_admin only,
                          "angka fatal" (dikonfirmasi user 2026-09-21). Beda
                          dari Setoran Mandiri: keterangan WAJIB, dan wajib
                          lewat modal konfirmasi ketik-ulang sebelum tersimpan
                          (lihat bukaKoreksiModal/konfirmasiKoreksi di atas). */}
                      {isSuperAdmin && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <div className="text-[10px] text-red-500 mb-1">➖ Koreksi saldo (kurangi manual) — alasan wajib diisi</div>
                          <div className="flex gap-1.5">
                            <input type="number" placeholder="Nominal" value={koreksiForm[j.user_id]?.nominal || ''}
                              onChange={e => setKoreksiForm(prev => ({ ...prev, [j.user_id]: { ...prev[j.user_id], nominal: e.target.value } }))}
                              className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-[10px]" />
                            <input type="text" placeholder="Alasan koreksi (wajib)" value={koreksiForm[j.user_id]?.keterangan || ''}
                              onChange={e => setKoreksiForm(prev => ({ ...prev, [j.user_id]: { ...prev[j.user_id], keterangan: e.target.value } }))}
                              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-[10px]" />
                            <button disabled={savingKoreksi === j.user_id} onClick={() => bukaKoreksiModal(j.user_id)}
                              className="text-[10px] font-bold text-white bg-red-600 px-2.5 py-1 rounded-lg shrink-0 disabled:opacity-50">
                              Kurangi
                            </button>
                          </div>
                          {koreksiModalFor === j.user_id && (
                            <ModalKoreksiSaldo
                              nama={j.nama}
                              saldoSaatIni={j.saldo_tabungan_umroh}
                              nominal={Number(koreksiForm[j.user_id]?.nominal || 0)}
                              keterangan={koreksiForm[j.user_id]?.keterangan || ''}
                              saving={savingKoreksi === j.user_id}
                              onBatal={() => setKoreksiModalFor(null)}
                              onKonfirmasi={() => konfirmasiKoreksi(j.user_id)}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {!isHop && (
                      <div className="flex gap-2 pt-1">
                        {j.status === 'menunggu_bsi' && (
                          <button disabled={busy} onClick={() => aksi({ action: 'advance', user_id: j.user_id, status_baru: 'menunggu_sk_cif' })}
                            className="flex-1 bg-[#1A4FA0] text-white font-bold py-2 rounded-full disabled:opacity-50">
                            Lanjut ke Menunggu SK-CIF →
                          </button>
                        )}
                        {j.status === 'menunggu_sk_cif' && (
                          <button disabled={busy} onClick={() => aksi({ action: 'advance', user_id: j.user_id, status_baru: 'active' })}
                            className="flex-1 bg-[#1A4FA0] text-white font-bold py-2 rounded-full disabled:opacity-50">
                            Aktifkan Jamaah Sahabat Baitullah →
                          </button>
                        )}
                        {j.status !== 'active' && j.status !== 'ditolak' && (
                          <button disabled={busy} onClick={() => { if (confirm('Tolak pendaftaran ini?')) aksi({ action: 'reject', user_id: j.user_id }); }}
                            className="bg-gray-100 text-gray-500 font-bold px-4 py-2 rounded-full disabled:opacity-50">
                            Tolak
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && total > 0 && (
        <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
          <span>Halaman {page} dari {totalPages} · {total} jamaah</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-gray-200 font-bold disabled:opacity-40 hover:border-[#1A4FA0] hover:text-[#1A4FA0]">
              ← Sebelumnya
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-gray-200 font-bold disabled:opacity-40 hover:border-[#1A4FA0] hover:text-[#1A4FA0]">
              Selanjutnya →
            </button>
          </div>
        </div>
      )}
      </>)}

      {tab === 'hirarki' && (
        <>
          <div className="text-xs text-gray-400 mb-3">
            Semua akar jaringan Sahabat Baitullah (anggota yang gak punya perekrut di atasnya). Klik "Lihat Tree" buat buka struktur jaringan lengkap di bawahnya.
          </div>
          <input value={cariAkar} onChange={e => setCariAkar(e.target.value)} placeholder="Cari nama / kode..."
            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm mb-3" />
          {loadingAkar ? (
            <div className="text-center text-gray-400 py-10">Memuat...</div>
          ) : (() => {
            const q = cariAkar.trim().toLowerCase();
            const filteredAkar = q ? akar.filter(a => [a.name, a.kode_unik].some(v => String(v || '').toLowerCase().includes(q))) : akar;
            return filteredAkar.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
                {akar.length === 0 ? 'Belum ada akar jaringan.' : 'Gak ada yang cocok.'}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {filteredAkar.map(a => (
                  <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#0E2F6E] truncate">{a.name} <span className="text-gray-400 font-normal">({a.kode_unik})</span></div>
                        <div className="text-[10px] text-gray-400 mt-0.5">Daftar {fmtTanggal(a.created_at)}</div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${PENDAFTARAN_STATUS_WARNA[a.funnel_status] || 'bg-gray-100 text-gray-500'}`}>
                        {PENDAFTARAN_STATUS_LABEL[a.funnel_status] || a.funnel_status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="text-xs text-gray-500">
                        <span className="font-bold text-purple-700">{a.jumlah_downline}</span> downline
                      </div>
                      <button onClick={() => router.push(`/dashboard/sahabat/team?sahabat_id=${a.id}`)}
                        className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 hover:bg-purple-100">
                        🌳 Lihat Tree →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}

      {rekapFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRekapFor(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-bold text-[#0E2F6E] text-lg">Rekap Saldo — {rekapFor.nama}</div>
                <div className="text-xs text-gray-400">{rekapFor.kode_unik}</div>
              </div>
              <button onClick={() => setRekapFor(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <select value={rekapFilter.tahun} onChange={e => setRekapFilter(f => ({ ...f, tahun: e.target.value }))}
                className="px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs">
                <option value="">Semua Tahun</option>
                {PILIHAN_TAHUN.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={rekapFilter.bulan} onChange={e => setRekapFilter(f => ({ ...f, bulan: e.target.value }))} disabled={!rekapFilter.tahun}
                className="px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs disabled:opacity-50">
                <option value="">Semua Bulan</option>
                {BULAN_LABEL.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
              </select>
              <select value={rekapFilter.jenis} onChange={e => setRekapFilter(f => ({ ...f, jenis: e.target.value }))}
                className="px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs">
                <option value="">Semua Jenis</option>
                {Object.entries(JENIS_SALDO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>

            <button disabled={downloadingRekap} onClick={downloadRekap}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-3 py-2 rounded-full disabled:opacity-50 mb-3">
              {downloadingRekap ? 'Menyiapkan file...' : '⬇️ Download Excel (sesuai filter)'}
            </button>

            {rekapLoading ? (
              <div className="text-center text-gray-400 py-6 text-sm">Memuat...</div>
            ) : rekapData.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-4 text-center text-xs text-gray-400">Gak ada data di periode/jenis ini.</div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-gray-500 mb-1">
                  Total: {fmtRp(rekapData.reduce((s, k) => s + Number(k.nominal || 0), 0))} ({rekapData.length} baris)
                </div>
                {rekapData.map(k => (
                  <div key={k.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold text-gray-700">{JENIS_SALDO_LABEL[k.jenis] || k.jenis}</div>
                      <div className="text-gray-400 truncate">{new Date(k.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}{k.keterangan ? ` · ${k.keterangan}` : ''}</div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                      <div className={`font-bold ${k.nominal < 0 ? 'text-red-600' : 'text-[#C9952A]'}`}>{k.nominal < 0 ? '-' : ''}{fmtRp(Math.abs(k.nominal))}</div>
                      <div className={k.dikonfirmasi_at ? 'text-green-600' : 'text-yellow-600'}>{k.dikonfirmasi_at ? 'Cair' : 'Pending'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
