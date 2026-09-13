'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { downloadExcel } from '@/lib/downloadExcel';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
function fmtTanggal(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

const JENIS_LABEL = { ujroh_perwakilan: 'Ujroh Closing', reseller_perwakilan: 'Margin Reseller' };
const BULAN_LABEL = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const TAHUN_SEKARANG = new Date().getFullYear();
const PILIHAN_TAHUN = Array.from({ length: 5 }, (_, i) => TAHUN_SEKARANG - i);

// Reseller margin perwakilan cuma jalan 1 tingkat dari SI PEREKRUT (lihat
// closing.js — walau loopnya secara teknis bisa lanjut sampai 20 hop kalau
// tiap upline punya harga jual sendiri di perwakilan_harga, DALAM PRAKTIK
// cuma 1 tingkat yang keisi harganya, dikonfirmasi user 2026-09-06). Badge
// ini nandain gen 1 (relatif ke akar tree yang ditampilkan) vs gen 2+ yang
// cuma tercatat struktur doang — sama pola kayak GenBadge Sahabat Baitullah
// di /dashboard/sahabat/team, disalin ke sini persis kayak HierarkiNode.
const GEN_MAX_UJROH_PERWAKILAN = 1;
function GenBadgePerwakilan({ depth }) {
  const dapatUjroh = depth <= GEN_MAX_UJROH_PERWAKILAN;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${dapatUjroh ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-400'}`}
      title={dapatUjroh ? 'Gen 1 dari akar ini — berpotensi dapat margin reseller' : 'Di luar gen 1 — tercatat, di luar margin reseller akar ini'}>
      Gen {depth}{!dapatUjroh && ' 🔒'}
    </span>
  );
}

// Node pohon hierarki — sama pola HierarkiNode di src/app/admin/page.jsx,
// disalin ke sini biar tab "Hirarki Pohon" gak balik numpang di halaman lama.
function HierarkiNode({ node, depth, expanded, onToggle, onClickUser }) {
  const isExpanded = expanded[node.id] !== undefined ? expanded[node.id] : depth === 0;
  const hasChildren = node.children && node.children.length > 0;
  return (
    <div>
      <div className="flex items-center gap-2 py-2 border-b border-gray-100" style={{ paddingLeft: depth * 20 }}>
        {hasChildren ? (
          <button onClick={() => onToggle(node.id, isExpanded)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-[#1A4FA0] flex-shrink-0 text-xs">
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : <span className="w-5 flex-shrink-0"></span>}
        <div onClick={() => onClickUser(node)} className="flex-1 cursor-pointer flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-semibold text-[#0E2F6E] text-sm hover:underline">{node.name}</span>
          {depth > 0 && <GenBadgePerwakilan depth={depth} />}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${node.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{node.status}</span>
          <span className="text-xs text-gray-400">{node.kode_unik}</span>
        </div>
        <div className="text-xs text-gray-500 text-right flex-shrink-0">
          <div>{node.total_downline} downline · {node.jumlah_booking} booking</div>
          <div className="font-bold text-[#C9952A]">{fmtRp(node.total_komisi)}</div>
        </div>
      </div>
      {hasChildren && isExpanded && node.children.map(c => (
        <HierarkiNode key={c.id} node={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} onClickUser={onClickUser} />
      ))}
    </div>
  );
}

const EDIT_FIELDS = [
  ['nik', 'NIK'], ['wa', 'WhatsApp'], ['email', 'Email'], ['pekerjaan', 'Pekerjaan'],
  ['bank', 'Bank'], ['no_rekening', 'No. Rekening'], ['nama_pemilik_rekening', 'Nama Pemilik Rekening'],
  ['alamat_ktp', 'Alamat KTP'], ['alamat_domisili', 'Alamat Domisili'], ['wilayah', 'Wilayah'],
];

const STATUS_LABEL = { active: 'Aktif', pending: 'Pending', rejected: 'Ditolak', nonaktif: 'Nonaktif' };

// Sama persis label PROSES di /admin/perwakilan/page.jsx — dipakai di sini
// cuma buat tampilan info (read-only), bukan buat aksi lanjut/tolak.
const PENDAFTARAN_STATUS_LABEL = {
  pending: '📝 Verifikasi Data oleh Admin',
  waiting_visit: '🏢 Menunggu Kunjungan Kantor',
  docs_sent: '📦 Perjanjian Dikirim ke Alamat',
  waiting_docs_return: '📮 Menunggu Rangkapan Dikirim Kembali',
  active: '✅ Aktif',
  ditolak: '⛔ Ditolak',
};

// Database Perwakilan — mirror struktur /admin/sahabat/database (list +
// expand-row, bukan list+modal kayak /admin/database/[tipe] lama), dibuat
// 2026-09-06 supaya Perwakilan punya "rumah" section sendiri setara Sahabat
// Baitullah. Beda dari Sahabat: gak ada saldo tabungan/target keberangkatan
// (konsep itu spesifik program Sahabat Baitullah), dan riwayat ujroh di sini
// READ-ONLY — konfirmasi TF ujroh perwakilan WAJIB lewat batch pengajuan di
// /admin/perwakilan/pencairan (gak ada jalur konfirmasi lepas per baris).
export default function DatabasePerwakilanPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cari, setCari] = useState('');
  // `?cari=` di URL (link dari /admin/perwakilan/riwayat-closing "Lihat
  // Profil →") prefill kolom cari ini, dibaca sekali dari window.location
  // (dikonfirmasi user 2026-09-06, sama pola `?publish_type=` di /admin/programs).
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search).get('cari');
    if (qp) setCari(qp);
  }, []);
  // Search/filter/sort/pagination server-side — disamain persis ke pola
  // /admin/sahabat/database (dikonfirmasi user 2026-09-06, Perwakilan
  // diseragamkan ke gaya Sahabat Baitullah, siap skala besar dari awal).
  const [filterStatus, setFilterStatus] = useState('semua');
  const [sort, setSort] = useState('kode');
  const [dir, setDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [ringkasan, setRingkasan] = useState({ total: 0, aktif: 0, proses: 0 });
  const PER_PAGE = 25;
  const [expand, setExpand] = useState(null);
  const [editingData, setEditingData] = useState(null);
  const [formData, setFormData] = useState({});
  const [savingData, setSavingData] = useState(false);
  const [komisiPerUser, setKomisiPerUser] = useState({});
  // Rekap ujroh per-periode (dikonfirmasi user 2026-09-06) — modal terpisah
  // dari riwayat ujroh biasa di expand-row, filter Bulan/Tahun/Program +
  // download Excel. `rekapFor` = row yang lagi dibuka rekapnya (null = tutup).
  const [rekapFor, setRekapFor] = useState(null);
  const [rekapFilter, setRekapFilter] = useState({ tahun: String(TAHUN_SEKARANG), bulan: '', prog_id: '' });
  const [rekapData, setRekapData] = useState({ komisi: [], program_tersedia: [] });
  const [rekapLoading, setRekapLoading] = useState(false);
  const [downloadingRekap, setDownloadingRekap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('daftar');
  const [akar, setAkar] = useState([]);
  const [loadingAkar, setLoadingAkar] = useState(true);
  const [cariAkar, setCariAkar] = useState('');
  // Riwayat Closing PINDAH jadi halaman sendiri, /admin/perwakilan/
  // riwayat-closing (dikonfirmasi user 2026-09-06) — state & fetch-nya ikut
  // pindah kesana, gak numpang di sini lagi.
  const [expandedNodes, setExpandedNodes] = useState({});

  function muat() {
    const qs = new URLSearchParams({
      page: String(page), per_page: String(PER_PAGE), sort, dir,
      ...(cari.trim() ? { q: cari.trim() } : {}),
      ...(filterStatus !== 'semua' ? { status: filterStatus } : {}),
    });
    fetch(`/api/admin/perwakilan/database?${qs.toString()}`).then(r => r.json()).then(d => {
      setList(d.perwakilan || []);
      setTotal(d.total || 0);
      if (d.ringkasan) setRingkasan(d.ringkasan);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    fetch('/api/admin/hierarchy').then(r => r.json()).then(d => {
      setAkar(d.tree || []);
      setLoadingAkar(false);
    }).catch(() => setLoadingAkar(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => { setPage(1); }, [cari, filterStatus, sort, dir]);

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(muat, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cari, filterStatus, sort, dir, page]);

  function muatKomisi(userId) {
    fetch(`/api/admin/perwakilan/komisi?user_id=${userId}`).then(r => r.json())
      .then(d => setKomisiPerUser(prev => ({ ...prev, [userId]: d.komisi || [] })))
      .catch(() => {});
  }

  function bukaRekap(row) {
    setRekapFor(row);
    setRekapFilter({ tahun: String(TAHUN_SEKARANG), bulan: '', prog_id: '' });
  }

  function muatRekap() {
    if (!rekapFor) return;
    setRekapLoading(true);
    const qs = new URLSearchParams({ user_id: rekapFor.user_id });
    if (rekapFilter.tahun) qs.set('tahun', rekapFilter.tahun);
    if (rekapFilter.bulan) qs.set('bulan', rekapFilter.bulan);
    if (rekapFilter.prog_id) qs.set('prog_id', rekapFilter.prog_id);
    fetch(`/api/admin/perwakilan/komisi?${qs.toString()}`).then(r => r.json())
      .then(d => { setRekapData({ komisi: d.komisi || [], program_tersedia: d.program_tersedia || [] }); setRekapLoading(false); })
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
      const params = { penerima_id: rekapFor.user_id, jenis: ['ujroh_perwakilan', 'reseller_perwakilan'] };
      if (rekapFilter.tahun) {
        params.from = `${rekapFilter.tahun}-${rekapFilter.bulan ? String(rekapFilter.bulan).padStart(2, '0') : '01'}-01`;
        const bulanAkhir = rekapFilter.bulan ? Number(rekapFilter.bulan) : 12;
        const akhirDate = new Date(Number(rekapFilter.tahun), bulanAkhir, 0);
        params.to = akhirDate.toISOString().slice(0, 10);
      }
      if (rekapFilter.prog_id) params.prog_id = rekapFilter.prog_id;
      await downloadExcel('komisi', params);
    } catch (e) { alert(e.message || 'Gagal download'); }
    setDownloadingRekap(false);
  }

  function bukaDetail(row) {
    const membuka = expand !== row.user_id;
    setExpand(membuka ? row.user_id : null);
    setEditingData(null);
    if (membuka && !komisiPerUser[row.user_id]) muatKomisi(row.user_id);
  }

  function mulaiEditData(row) {
    setEditingData(row.user_id);
    setFormData(Object.fromEntries(EDIT_FIELDS.map(([k]) => [k, row[k] || ''])));
  }

  async function simpanData(row) {
    setSavingData(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: row.user_id, action: 'edit_data', fields: formData }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setSavingData(false); return; }
      setEditingData(null);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSavingData(false);
  }

  async function toggleStatus(row) {
    const target = row.status === 'active' ? 'nonaktif' : 'active';
    if (!confirm(`${target === 'active' ? 'Aktifkan' : 'Nonaktifkan'} ${row.nama}?`)) return;
    setBusy(true);
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: row.user_id, action: 'set_status', new_status: target }),
      });
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  // Dual-role: tambah role Sahabat Baitullah ke akun perwakilan yang sudah
  // aktif — KHUSUS direkrut langsung manajemen. Mirror tambahRolePerwakilan
  // di /admin/sahabat/database (arah sebaliknya).
  async function tambahRoleSahabat(row) {
    if (!confirm(`Tambahkan role Sahabat Baitullah ke akun ${row.nama}? Orang ini tetap wajib lewat proses lengkap (setoran, BSI, SK-CIF) — cuma jalur masuknya via admin, bukan link referral.`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: row.user_id, action: 'tambah_role_kedua', role_kedua: 'sahabat_baitullah' }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menambahkan role kedua'); setBusy(false); return; }
      alert('Role Sahabat Baitullah berhasil ditambahkan.');
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  function toggleNode(id, isExpanded) {
    setExpandedNodes(prev => ({ ...prev, [id]: !isExpanded }));
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const akarFiltered = useMemo(() => {
    const q = cariAkar.trim().toLowerCase();
    if (!q) return akar;
    return akar.filter(n => n.name.toLowerCase().includes(q) || String(n.kode_unik || '').toLowerCase().includes(q));
  }, [akar, cariAkar]);

  if (!user || !['admin', 'super_admin'].includes(user.role)) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <Layout title="🏢 Database Perwakilan" backHref="/admin/perwakilan">
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('daftar')} className={`text-sm font-bold px-4 py-2 rounded-full ${tab === 'daftar' ? 'bg-[#0E2F6E] text-white' : 'bg-gray-100 text-gray-500'}`}>Daftar Perwakilan</button>
        <button onClick={() => setTab('hirarki')} className={`text-sm font-bold px-4 py-2 rounded-full ${tab === 'hirarki' ? 'bg-[#0E2F6E] text-white' : 'bg-gray-100 text-gray-500'}`}>Hirarki Pohon</button>
      </div>

      {tab === 'daftar' && (
        <>
          {/* 3 kartu ini diklik langsung ganti tab filter di bawah
              (dikonfirmasi user 2026-09-07) — biar dari angka ringkasan bisa
              langsung loncat lihat daftar akunnya. */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button onClick={() => setFilterStatus('semua')} className="bg-white rounded-xl border border-gray-200 p-3 text-center hover:border-[#1A4FA0] transition-colors">
              <div className="text-xl font-bold text-[#0E2F6E]">{ringkasan.total}</div>
              <div className="text-[10px] text-gray-400">Total Perwakilan</div>
            </button>
            <button onClick={() => setFilterStatus('active')} className="bg-white rounded-xl border border-gray-200 p-3 text-center hover:border-[#1A4FA0] transition-colors">
              <div className="text-xl font-bold text-green-600">{ringkasan.aktif}</div>
              <div className="text-[10px] text-gray-400">Aktif</div>
            </button>
            <button onClick={() => setFilterStatus('pending')} className="bg-white rounded-xl border border-gray-200 p-3 text-center hover:border-[#1A4FA0] transition-colors">
              <div className="text-xl font-bold text-yellow-600">{ringkasan.proses}</div>
              <div className="text-[10px] text-gray-400">Dalam Proses</div>
            </button>
          </div>

          {/* Tab status — dikonfirmasi user 2026-09-07: dulu dropdown filter
              doang, sekarang tab beneran biar Aktif/Pending/Nonaktif/Rejected
              gak "nyampur" dalam 1 pandangan, jelas kepisah per klik. */}
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

          <div className="flex flex-wrap gap-2 mb-4">
            <input value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama, kode unik, NIK, WA, email..."
              className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
            <select value={sort} onChange={e => setSort(e.target.value)}
              className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
              <option value="kode">Urut: Kode Unik</option>
              <option value="nama">Urut: Nama</option>
              <option value="created_at">Urut: Tanggal Gabung</option>
              <option value="komisi">Urut: Total Komisi</option>
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
          ) : list.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">Tidak ada perwakilan.</div>
          ) : (
            <div className="space-y-2">
              {list.map(row => (
                <div key={row.user_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button onClick={() => bukaDetail(row)} className="w-full flex items-center justify-between p-4 text-left">
                    <div className="min-w-0">
                      <div className="font-bold text-[#0E2F6E] text-sm truncate">
                        {row.nama} <span className="text-gray-400 font-normal">({row.kode_unik})</span>
                        {row.role_kedua && (
                          <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                            + {row.role_kedua === 'sahabat_baitullah' ? 'Sahabat Baitullah' : row.role_kedua}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{row.wa} · {row.email}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${row.status === 'active' ? 'bg-green-100 text-green-700' : row.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                        {row.status}
                      </span>
                      <div className="text-[10px] text-gray-400 mt-0.5">{fmtRp(row.total_komisi)}</div>
                    </div>
                  </button>

                  {expand === row.user_id && (
                    <div className="border-t border-gray-100 p-4 space-y-3 text-xs bg-gray-50/50">
                      {/* Breakdown komisi per-orang — beda dari Sahabat
                          Baitullah (dikonfirmasi user 2026-09-06): kartu
                          pertama "Total Ujroh yang Didapat" itu PER TAHUN
                          BERJALAN (bukan all-time), soalnya ujroh perwakilan
                          sifatnya kayak komisi penjualan tahunan — beda dari
                          saldo tabungan sahabat yang emang ngendap sampai
                          dipakai. "Sudah Cair"/"Pending" tetap all-time. */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white rounded-lg p-2 border border-gray-100 text-center">
                          <div className="font-bold text-[#0E2F6E]">{fmtRp(row.total_komisi_tahun_ini)}</div>
                          <div className="text-gray-400">Total Ujroh {TAHUN_SEKARANG}</div>
                        </div>
                        <div className="bg-white rounded-lg p-2 border border-gray-100 text-center">
                          <div className="font-bold text-green-600">{fmtRp(row.total_komisi)}</div>
                          <div className="text-gray-400">Sudah Cair (all-time)</div>
                        </div>
                        <div className="bg-white rounded-lg p-2 border border-gray-100 text-center">
                          <div className="font-bold text-yellow-600">{fmtRp(row.total_komisi_pending)}</div>
                          <div className="text-gray-400">Pending</div>
                        </div>
                      </div>
                      <button onClick={() => bukaRekap(row)} className="w-full text-[#1A4FA0] font-bold hover:underline text-center">
                        📊 Lihat Rekap &amp; Download →
                      </button>

                      {row.status === 'active' && !row.role_kedua && (
                        <button onClick={() => tambahRoleSahabat(row)} disabled={busy} className="w-full bg-[#0E2F6E] hover:bg-[#1A4FA0] text-white text-xs font-bold px-3 py-2 rounded-full disabled:opacity-50">
                          🤝 Tambahkan Role Sahabat Baitullah (direkrut manajemen)
                        </button>
                      )}

                      {editingData === row.user_id ? (
                        <div className="bg-white rounded-lg p-3 border border-gray-100 space-y-2">
                          <div className="font-bold text-[#0E2F6E]">Edit Data (admin-only)</div>
                          <div className="grid grid-cols-2 gap-2">
                            {EDIT_FIELDS.map(([k, label]) => (
                              <div key={k}>
                                <label className="block text-gray-400 mb-0.5">{label}</label>
                                <input value={formData[k] || ''} onChange={e => setFormData(f => ({ ...f, [k]: e.target.value }))}
                                  className="w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none" />
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => setEditingData(null)} className="flex-1 bg-gray-100 text-gray-500 font-bold py-1.5 rounded-lg">Batal</button>
                            <button disabled={savingData} onClick={() => simpanData(row)} className="flex-1 bg-[#1A4FA0] text-white font-bold py-1.5 rounded-lg disabled:opacity-50">
                              {savingData ? 'Menyimpan...' : 'Simpan'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 text-gray-500">
                          <div>NIK: <b className="text-gray-700">{row.nik || '-'}</b></div>
                          <div>Pekerjaan: <b className="text-gray-700">{row.pekerjaan || '-'}</b></div>
                          <div>Bank: <b className="text-gray-700">{row.bank || '-'} {row.no_rekening}</b></div>
                          <div>Pemilik Rek.: <b className="text-gray-700">{row.nama_pemilik_rekening || '-'}</b></div>
                          <div className="col-span-2">Alamat KTP: <b className="text-gray-700">{row.alamat_ktp || '-'}</b></div>
                          <div>Perekrut: <b className="text-gray-700">{row.perekrut_nama || '-'}</b></div>
                          <div>Wilayah: <b className="text-gray-700">{row.wilayah || '-'}</b></div>
                          <div>Terdaftar: <b className="text-gray-700">{fmtTanggal(row.created_at) || '-'}</b></div>
                          {row.no_perjanjian_kerjasama && (
                            <div>No. Perjanjian: <b className="text-gray-700">{row.no_perjanjian_kerjasama}</b></div>
                          )}
                        </div>
                      )}

                      {/* Status pendaftaran — CUMA relevan selama masih proses
                          (belum aktif). Begitu status udah 'active', checklist
                          TTD/PKS/metode ini gak berarti apa2 lagi buat sebagian
                          BESAR akun (banyak akun asli diaktifkan SEBELUM fitur
                          TTD digital ada, jadi selamanya formulir_fase NULL /
                          setuju_pks 0 walau udah lama aktif) — nampilinnya terus
                          cuma bikin kesan "belum lengkap" yang menyesatkan
                          (ditemukan & diperbaiki 2026-09-06). Read-only, aksi
                          lanjut/tolak tetap di /admin/perwakilan. */}
                      {row.status !== 'active' && row.status !== 'rejected' && (
                        <div className="bg-white rounded-lg p-3 border border-gray-100">
                          <div className="font-bold text-[#0E2F6E] mb-1.5">Status Pendaftaran</div>
                          <div className="grid grid-cols-2 gap-2 text-gray-500">
                            <div>Tahap: <b className="text-gray-700">{row.pendaftaran_id ? (PENDAFTARAN_STATUS_LABEL[row.pendaftaran_status] || row.pendaftaran_status) : '— Belum ada pendaftaran formal'}</b></div>
                            <div>Metode: <b className="text-gray-700">{row.pendaftaran_metode || '-'}</b></div>
                            <div>TTD Digital Formulir: {row.formulir_ttd_selesai ? <span className="text-green-600 font-bold">✅ Selesai</span> : <span className="text-red-500 font-bold">⏳ Belum</span>}</div>
                            <div>Persetujuan PKS: {row.pks_disetujui ? <span className="text-green-600 font-bold">✅ Ya</span> : <span className="text-red-500 font-bold">⏳ Belum</span>}</div>
                            {row.jadwal_kunjungan && (
                              <div className="col-span-2">Jadwal Kunjungan: <b className="text-gray-700">{row.jadwal_kunjungan}</b></div>
                            )}
                          </div>
                          {row.pendaftaran_id && (
                            <a href="/admin/perwakilan" className="block text-[#1A4FA0] font-semibold hover:underline mt-2">
                              Lanjutkan proses di halaman Pendaftaran →
                            </a>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {editingData !== row.user_id && (
                          <button onClick={() => mulaiEditData(row)} className="text-[#1A4FA0] font-bold hover:underline">✏️ Edit Data</button>
                        )}
                        {row.status !== 'pending' && (
                          <button onClick={() => toggleStatus(row)} className="text-gray-500 font-bold hover:underline">
                            {row.status === 'active' ? '⛔ Nonaktifkan' : '✅ Aktifkan'}
                          </button>
                        )}
                        <button onClick={() => window.open(`/admin/cetak-pks-mitra/${row.user_id}`, '_blank')} className="text-gray-500 font-bold hover:underline">📜 Perjanjian Kerjasama</button>
                        <button onClick={() => window.open(`/api/admin/id-card/${row.user_id}`, '_blank')} className="text-gray-500 font-bold hover:underline">🪪 ID Card</button>
                        {row.foto_ktp_path && (
                          <a href={row.foto_ktp_path} target="_blank" rel="noopener noreferrer" className="text-gray-500 font-bold hover:underline">📄 Foto KTP</a>
                        )}
                      </div>

                      <div>
                        <div className="font-bold text-[#0E2F6E] mb-1.5">Riwayat Ujroh</div>
                        <div className="text-[10px] text-gray-400 mb-2">
                          Read-only — konfirmasi TF wajib lewat batch pengajuan di{' '}
                          <a href="/admin/perwakilan/pencairan" className="text-[#1A4FA0] font-semibold hover:underline">Pencairan Komisi</a>.
                        </div>
                        {(komisiPerUser[row.user_id] || []).length === 0 ? (
                          <div className="text-gray-400">Belum ada riwayat.</div>
                        ) : (
                          <div className="space-y-1.5">
                            {komisiPerUser[row.user_id].map(k => (
                              <div key={k.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                <div>
                                  <div className="font-bold text-gray-700">{JENIS_LABEL[k.jenis] || k.jenis}</div>
                                  <div className="text-gray-400">{fmtTanggal(k.created_at)} · {k.keterangan}</div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="font-bold text-[#C9952A]">{fmtRp(k.nominal)}</div>
                                  <div className={k.dikonfirmasi_at ? 'text-green-600' : 'text-yellow-600'}>
                                    {k.dikonfirmasi_at ? '✅ Cair' : '⏳ Pending'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && total > 0 && (
            <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
              <span>Halaman {page} dari {totalPages} · {total} perwakilan</span>
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
        </>
      )}

      {tab === 'hirarki' && (
        <div>
          <input value={cariAkar} onChange={e => setCariAkar(e.target.value)} placeholder="Cari nama atau kode unik..."
            className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm mb-4" />
          {loadingAkar ? (
            <div className="text-center text-gray-400 py-10">Memuat...</div>
          ) : akarFiltered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">Belum ada jaringan.</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              {akarFiltered.map(node => (
                <HierarkiNode key={node.id} node={node} depth={0} expanded={expandedNodes} onToggle={toggleNode}
                  onClickUser={n => { setTab('daftar'); setCari(n.kode_unik || n.name); }} />
              ))}
            </div>
          )}
        </div>
      )}

      {rekapFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRekapFor(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-bold text-[#0E2F6E] text-lg">Rekap Ujroh — {rekapFor.nama}</div>
                <div className="text-xs text-gray-400">{rekapFor.kode_unik}</div>
              </div>
              <button onClick={() => setRekapFor(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <select value={rekapFilter.tahun} onChange={e => setRekapFilter(f => ({ ...f, tahun: e.target.value }))}
                className="px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs">
                {PILIHAN_TAHUN.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={rekapFilter.bulan} onChange={e => setRekapFilter(f => ({ ...f, bulan: e.target.value }))}
                className="px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs">
                <option value="">Semua Bulan</option>
                {BULAN_LABEL.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
              </select>
              <select value={rekapFilter.prog_id} onChange={e => setRekapFilter(f => ({ ...f, prog_id: e.target.value }))}
                className="px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs">
                <option value="">Semua Program</option>
                {rekapData.program_tersedia.map(p => <option key={p.prog_id} value={p.prog_id}>{p.prog_name}</option>)}
              </select>
            </div>

            <button disabled={downloadingRekap} onClick={downloadRekap}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-3 py-2 rounded-full disabled:opacity-50 mb-3">
              {downloadingRekap ? 'Menyiapkan file...' : '⬇️ Download Excel (sesuai filter)'}
            </button>

            {rekapLoading ? (
              <div className="text-center text-gray-400 py-6 text-sm">Memuat...</div>
            ) : rekapData.komisi.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-4 text-center text-xs text-gray-400">Gak ada data di periode/program ini.</div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-gray-500 mb-1">
                  Total: {fmtRp(rekapData.komisi.reduce((s, k) => s + Number(k.nominal || 0), 0))} ({rekapData.komisi.length} baris)
                </div>
                {rekapData.komisi.map(k => (
                  <div key={k.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold text-gray-700">{JENIS_LABEL[k.jenis] || k.jenis}</div>
                      <div className="text-gray-400 truncate">{fmtTanggal(k.created_at)}{k.prog_name ? ` · ${k.prog_name}` : ''}</div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                      <div className="font-bold text-[#C9952A]">{fmtRp(k.nominal)}</div>
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
