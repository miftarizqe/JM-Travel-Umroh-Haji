'use client';
import { Fragment, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { CollapsibleSection } from '@/app/components/Collapsible';
import SearchableSelect from '@/app/components/SearchableSelect';
import TombolWA from '@/app/components/TombolWA';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan } from '@/lib/usePengaturan';
import { urutkan, cocok } from '@/lib/sortTable';
import { downloadExcel as downloadExcelFile } from '@/lib/downloadExcel';
import SortTh from '@/app/components/SortTh';
import { pesanDpDikonfirmasi, pesanPelunasanDikonfirmasi, pesanReferralBaru, pesanReminderPelunasan } from '@/lib/waTemplates';

function parseJamaahData(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
  return Array.isArray(raw) ? raw : [];
}

const PAKET_OPSI = [
  { value: 'deluxe', label: 'Deluxe' },
  { value: 'eksekutif', label: 'Eksekutif' },
  { value: 'signature', label: 'Signature' },
];
const KAMAR_OPSI = ['Quad (4/Kamar)', 'Triple (3/Kamar)', 'Double (2/Kamar)'];
// Status booking yang masih boleh diedit paket/kamar-nya atau dibatalkan
// langsung admin — sudah dibatalkan/selesai/lagi diproses jamaah gak relevan lagi.
const BOOKING_BISA_DIUBAH = (status) => !['dibatalkan', 'selesai', 'menunggu_batal'].includes(status);

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'}) : '-';
const tglJam = (t) => t ? new Date(t).toLocaleString('id-ID', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '-';

// Status closing booking — cermin dari syarat di src/lib/closing.js (cekSyaratClosing).
// 'siap' = semua syarat lolos tapi sweep otomatis belum sempat jalan (boleh diproses manual).
function statusClosing(b) {
  if (b.status === 'selesai') return { kind: 'selesai' };
  if (b.status !== 'active') return { kind: 'lain', label: `Booking berstatus "${b.status}".` };
  if (b.pelunasan_status !== 'paid') return { kind: 'belum-lunas' };
  if (!b.form_lengkap) return { kind: 'form-belum' };
  if (b.ada_pembatalan_aktif) return { kind: 'pembatalan' };
  if (!b.tanggal_berangkat) return { kind: 'tanpa-tanggal' };
  const berangkat = new Date(b.tanggal_berangkat);
  const hariIni = new Date(new Date().toDateString());
  if (berangkat >= hariIni) return { kind: 'menunggu-tanggal', tanggal: b.tanggal_berangkat };
  return { kind: 'siap' };
}

function Field({ label, value, full }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="font-semibold text-gray-700 break-words">{value || value === 0 ? value : '-'}</div>
    </div>
  );
}

// Ratakan pohon jadi daftar baris urutan DFS (tiap orang langsung diikuti downline-nya),
// dengan info depth per baris — dipakai tabel genealogi (gaya laporan MLM: Young Living dkk).
function flattenGenealogi(nodes, depth = 0) {
  let rows = [];
  for (const node of nodes) {
    rows.push({ ...node, depth });
    if (node.children && node.children.length > 0) {
      rows = rows.concat(flattenGenealogi(node.children, depth + 1));
    }
  }
  return rows;
}

// Node pohon hierarki perwakilan — bisa expand/collapse rekursif.
// Root (depth 0) default kebuka, level di bawahnya default tertutup.
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
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{node.role}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${node.status==='active'?'bg-green-50 text-green-700':'bg-gray-100 text-gray-500'}`}>{node.status}</span>
          <span className="text-xs text-gray-400">{node.kode_unik}</span>
        </div>
        <div className="text-xs text-gray-500 text-right flex-shrink-0">
          <div>{node.total_downline} downline · {node.jumlah_booking} booking</div>
          <div className="font-bold text-[#C9952A]">{rp(node.total_komisi)}</div>
        </div>
      </div>
      {hasChildren && isExpanded && node.children.map(c => (
        <HierarkiNode key={c.id} node={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} onClickUser={onClickUser} />
      ))}
    </div>
  );
}

const AKSI_LABEL = {
  approve_dp: 'Approve DP', reject_dp: 'Reject DP',
  approve_pelunasan: 'Approve Pelunasan', reject_pelunasan: 'Reject Pelunasan',
  booking_selesai: 'Tandai Selesai',
  approve_pembatalan: 'Approve Pembatalan', reject_pembatalan: 'Reject Pembatalan',
  approve_user: 'ACC Akun', reject_user: 'Tolak Akun',
  aktifkan_user: 'Aktifkan Akun', nonaktifkan_user: 'Nonaktifkan Akun',
  edit_data_user: 'Edit Data Akun',
  update_reg_status: 'Update Status Pendaftaran',
  approve_custom_harga: 'Approve Custom Harga', reject_custom_harga: 'Reject Custom Harga',
  buat_voucher: 'Buat Voucher', aktifkan_voucher: 'Aktifkan Voucher',
  nonaktifkan_voucher: 'Nonaktifkan Voucher', hapus_voucher: 'Hapus Voucher',
  tambah_transaksi_cashflow: 'Tambah Transaksi Cashflow', edit_transaksi_cashflow: 'Edit Transaksi Cashflow',
  hapus_transaksi_cashflow: 'Hapus Transaksi Cashflow', transfer_antar_akun_cashflow: 'Transfer Antar Akun Cashflow',
  submit_cashflow: 'Submit Cashflow', buka_cashflow: 'Buka Kembali Cashflow',
};
// Tahapan agen_pendaftaran.status — HARUS sama persis dengan step registrasi
// di src/app/api/status-pendaftaran/route.js (itu yang menegakkan urutan &
// syarat SK BSI). Dropdown ini cuma dipakai kalau baris pendaftaran BENERAN
// ada (ap.id, dari alur /daftar-perwakilan) — pendaftaran perwakilan langsung
// via /register tidak punya SK BSI apa pun untuk diverifikasi, jadi tetap
// pakai ACC/Tolak biner saja.
const REG_STAGES = [
  { key: 'pending', label: '📝 Formulir Terkirim' },
  { key: 'sk_bsi_verified', label: '✅ SK BSI Diverifikasi' },
  { key: 'waiting_visit', label: '🏢 Menunggu Kunjungan Kantor', jalur: 'kantor' },
  { key: 'docs_sent', label: '📦 Dokumen Dikirim', jalur: 'paket' },
  { key: 'waiting_docs_return', label: '📮 Menunggu Dokumen Balik', jalur: 'paket' },
  { key: 'active', label: '🎉 Aktifkan (final)' },
];
const TARGET_TYPE_LABEL = {
  payment: '💳 Pembayaran', booking: '📦 Booking', pembatalan: '🚫 Pembatalan',
  user: '👤 Akun', custom_harga: '💰 Custom Harga', voucher: '🎟️ Voucher',
  cashflow_transaksi: '💵 Cashflow Transaksi', cashflow_periode: '🔒 Cashflow Periode',
};

export default function AdminPage() {
  return (
    <Suspense fallback={<Layout><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <AdminPageInner />
    </Suspense>
  );
}

function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user] = useCurrentUser();
  const [pengaturan] = usePengaturan();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState(null);            // ringkasan dashboard
  const [payments, setPayments] = useState([]);
  const [users, setUsers] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [pembatalan, setPembatalan] = useState([]);
  const [loading, setLoading] = useState(true);

  // sub-view
  const [openPayment, setOpenPayment] = useState(null);
  const [openPembatalan, setOpenPembatalan] = useState(null);
  const [pembatalanForm, setPembatalanForm] = useState({ penyebab: 'lainnya', refund_nominal: 0, catatan_admin: '' });
  const [openProgram, setOpenProgram] = useState(null);
  const [progJamaah, setProgJamaah] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [vForm, setVForm] = useState({
    kode:'', potongan:0,
    batasKuota:true, kuota:1,
    batasTanggal:false, valid_until:'',
    prog_id:'', catatan:'',
    akses_role:'publik', for_user:'',
    tampil:true,
  });
  const [auditLog, setAuditLog] = useState([]);
  const [auditFilter, setAuditFilter] = useState('');
  const [downloadingIdCard, setDownloadingIdCard] = useState(null);
  const [detailUser, setDetailUser] = useState(null);
  const [detailBooking, setDetailBooking] = useState(null);
  const [editPaketForm, setEditPaketForm] = useState(null); // { paket, kamar, harga_custom } — null = form tertutup
  const [editPaketBusy, setEditPaketBusy] = useState(false);
  const [batalForm, setBatalForm] = useState(null); // { penyebab, refund_nominal, catatan_admin } — null = form tertutup
  const [batalBusy, setBatalBusy] = useState(false);
  const [exporting, setExporting] = useState(null); // nama tipe export yang lagi diproses, misal 'users'
  const [hierarki, setHierarki] = useState(null); // { tree, flat }
  const [hierarkiView, setHierarkiView] = useState('tree'); // 'tree' | 'flat'
  const [hierarkiFrom, setHierarkiFrom] = useState('');
  const [hierarkiTo, setHierarkiTo] = useState('');
  const [expandedNodes, setExpandedNodes] = useState({});
  const [expandedFlatRows, setExpandedFlatRows] = useState({});
  const [expandCluster, setExpandCluster] = useState(null);
  const [expandProgBooking, setExpandProgBooking] = useState(null);
  const [expandJamaahModal, setExpandJamaahModal] = useState(0);

  // Search & filter tabel admin
  const [searchPayments, setSearchPayments] = useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('');
  const [searchUsers, setSearchUsers] = useState('');
  const [filterUserStatus, setFilterUserStatus] = useState('');
  const [searchPrograms, setSearchPrograms] = useState('');
  const [searchAudit, setSearchAudit] = useState('');

  // Sort per tabel (klik header kolom) — key = nama tabel, value = {field, dir}
  const [sortState, setSortState] = useState({
    users: { field: 'name', dir: 'asc' },
    ranking: { field: 'total_komisi', dir: 'desc' },
    voucher: { field: 'kode', dir: 'asc' },
    auditlog: { field: 'created_at', dir: 'desc' },
  });
  function toggleSort(table, field) {
    setSortState(prev => {
      const cur = prev[table];
      const dir = cur.field === field && cur.dir === 'asc' ? 'desc' : 'asc';
      return { ...prev, [table]: { field, dir } };
    });
  }

  // Sinkron tab aktif dengan ?tab= di URL — dipakai tombol nav header
  // (Dashboard/Program/Pengguna/Pembayaran) biar beneran pindah tab,
  // bukan cuma reload ke tab Dashboard terus-terusan. Klik tombol tab
  // TIDAK mengubah URL, jadi ini murni satu arah: URL berubah -> tab ikut.
  // Disinkron langsung di render (bukan efek) biar gak kena flag
  // react-hooks/set-state-in-effect — dibandingkan ke nilai terakhir yang
  // sudah disinkron, bukan ke activeTab itu sendiri.
  const TAB_KEYS = ['dashboard', 'payments', 'pembatalan', 'pendaftaran', 'users', 'programs', 'hierarki', 'customharga', 'voucher', 'auditlog'];
  const [syncedTabParam, setSyncedTabParam] = useState(null);
  const tabParam = searchParams.get('tab');
  if (tabParam !== syncedTabParam) {
    setSyncedTabParam(tabParam);
    if (tabParam && TAB_KEYS.includes(tabParam)) {
      setActiveTab(tabParam);
      setOpenProgram(null);
    }
  }

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama (lihat
    // useCurrentUser) — BUKAN berarti belum login/salah role. Dependency
    // array kosong sebelumnya bikin effect ini cuma jalan sekali pas user
    // masih null, jadi admin yang beneran login malah kelempar ke '/'.
    // Tunggu render berikutnya pas user beneran keisi.
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.push('/'); return; }
    loadAll();
  }, [user]);

  async function loadAll() {
    const [dash, p, u, pr, v, pb] = await Promise.all([
      fetch('/api/admin/dashboard').then(r => r.json()),
      fetch('/api/payments').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json()),
      fetch('/api/admin/programs').then(r => r.json()),
      fetch('/api/admin/vouchers').then(r => r.json()).catch(() => ({vouchers:[]})),
      fetch('/api/pembatalan').then(r => r.json()).catch(() => ({pembatalan:[]})),
    ]);
    setData(dash);
    setPayments(p.payments || []);
    setUsers(u.users || []);
    setPrograms(pr.programs || []);
    setVouchers(v.vouchers || []);
    setPembatalan(pb.pembatalan || []);
    setLoading(false);
  }

  useEffect(() => {
    if (activeTab !== 'auditlog') return;
    const qs = auditFilter ? `?target_type=${auditFilter}` : '';
    fetch(`/api/admin/audit-log${qs}`)
      .then(r => r.json())
      .then(d => setAuditLog(d.audit_log || []))
      .catch(() => {});
  }, [activeTab, auditFilter]);

  function loadHierarki() {
    const qs = new URLSearchParams();
    if (hierarkiFrom) qs.set('from', hierarkiFrom);
    if (hierarkiTo) qs.set('to', hierarkiTo);
    fetch(`/api/admin/hierarchy?${qs.toString()}`)
      .then(r => r.json())
      .then(d => setHierarki(d))
      .catch(() => {});
  }

  // Auto-muat ulang saat tab dibuka ATAU tanggal filter diganti — didebounce
  // dikit biar gak nembak fetch tiap ketikan, TANPA perlu tombol "Terapkan".
  useEffect(() => {
    if (activeTab !== 'hierarki') return;
    const t = setTimeout(() => loadHierarki(), 350);
    return () => clearTimeout(t);
  }, [activeTab, hierarkiFrom, hierarkiTo]);

  async function buatVoucher() {
    if (!vForm.kode.trim()) { alert('Kode voucher wajib diisi!'); return; }
    if (!vForm.potongan || vForm.potongan <= 0) { alert('Nominal potongan wajib diisi!'); return; }
    if (vForm.akses_role === 'akun' && !vForm.for_user) { alert('Pilih akun tujuan voucher!'); return; }
    const res = await fetch('/api/admin/vouchers', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        kode: vForm.kode, potongan: vForm.potongan,
        kuota: vForm.batasKuota ? vForm.kuota : null,
        valid_until: vForm.batasTanggal ? vForm.valid_until : null,
        prog_id: vForm.prog_id, catatan: vForm.catatan,
        akses_role: vForm.akses_role, for_user: vForm.akses_role === 'akun' ? vForm.for_user : null,
        tampil: vForm.tampil,
        dibuat_oleh: user.id,
      })
    });
    const d = await res.json();
    if (res.ok) {
      alert(d.message);
      setVForm({
        kode:'', potongan:0, batasKuota:true, kuota:1, batasTanggal:false, valid_until:'',
        prog_id:'', catatan:'', akses_role:'publik', for_user:'', tampil:true,
      });
      loadAll();
    } else alert(d.error || 'Gagal membuat voucher');
  }

  async function toggleVoucher(v) {
    await fetch('/api/admin/vouchers', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: v.id, aktif: v.aktif ? 0 : 1 })
    });
    loadAll();
  }

  async function hapusVoucher(v) {
    if (!confirm(`Hapus voucher ${v.kode}?`)) return;
    const res = await fetch(`/api/admin/vouchers?id=${v.id}`, { method:'DELETE' });
    const d = await res.json();
    if (res.ok) { alert(d.message); loadAll(); }
    else alert(d.error || 'Gagal menghapus');
  }

  // `opts.skipReload` dipakai pas approve/tolak SEKALIGUS beberapa payment
  // dalam 1 grup (Promise.all) — biar loadAll()/setOpenPayment(null) cuma
  // jalan SEKALI di akhir batch (lihat pemanggilnya), bukan tiap payment.
  async function patchPayment(id, action, opts = {}) {
    await fetch('/api/payments', {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ payment_id: id, action, reject_reason: action==='reject'?'Ditolak admin':undefined })
    });
    if (opts.skipReload) return;
    loadAll();
    setOpenPayment(null);
  }

  async function patchPembatalan(id, action) {
    if (action === 'approve' && pembatalanForm.penyebab !== 'kesalahan_jm_travel' && !(Number(pembatalanForm.refund_nominal) >= 0)) {
      alert('Nominal refund wajib diisi'); return;
    }
    const res = await fetch('/api/pembatalan', {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        id, action,
        penyebab: action === 'approve' ? pembatalanForm.penyebab : undefined,
        refund_nominal: action === 'approve' ? pembatalanForm.refund_nominal : undefined,
        catatan_admin: pembatalanForm.catatan_admin || undefined,
      })
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal memproses pengajuan'); return; }
    alert(d.message);
    setPembatalanForm({ penyebab: 'lainnya', refund_nominal: 0, catatan_admin: '' });
    loadAll();
    setOpenPembatalan(null);
  }

  async function patchUser(id, action, extra={}) {
    await fetch('/api/admin/users', {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ user_id: id, action, ...extra })
    });
    loadAll();
  }

  // Majukan tahap pendaftaran perwakilan (SK BSI dst) — endpoint ini yang
  // menegakkan urutan step & syarat SK BSI, beda dari patchUser di atas.
  async function patchStatusPendaftaran(pendaftaranId, statusBaru) {
    const res = await fetch('/api/status-pendaftaran', {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ pendaftaran_id: pendaftaranId, status_baru: statusBaru })
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal memperbarui status pendaftaran'); return; }
    loadAll();
  }

  async function toggleUser(u) {
    const to = u.status === 'active' ? 'nonaktif' : 'active';
    if (!confirm(`${to==='active'?'Aktifkan':'Nonaktifkan'} ${u.name}?`)) return;
    await patchUser(u.id, 'set_status', { new_status: to });
  }

  function toggleHierarkiNode(id, isExpanded) {
    setExpandedNodes(prev => ({ ...prev, [id]: !isExpanded }));
  }

  async function openProgramDetail(p) {
    setOpenProgram(p);
    const d = await fetch(`/api/admin/program-jamaah?prog_id=${p.id}`).then(r => r.json());
    setProgJamaah(d.bookings || []);
  }

  function printFormulir(bookingId) {
    window.open(`/admin/cetak-formulir/${bookingId}`, '_blank');
  }

  // Cetak invoice/kwitansi OTOMATIS — server yang validasi syarat (DP/pelunasan
  // harus sudah confirmed) & idempotensi nomor (klik ulang gak bikin nomor baru).
  async function cetakInvoiceOtomatis(bookingId, jenis) {
    try {
      const res = await fetch('/api/admin/invoice-kwitansi/auto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, jenis }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal membuat dokumen'); return; }
      window.open(`/admin/cetak-invoice/${d.id}`, '_blank');
    } catch {
      alert('Terjadi kesalahan saat membuat dokumen');
    }
  }

  async function downloadIdCard(u) {
    setDownloadingIdCard(u.id);
    try {
      const res = await fetch(`/api/admin/id-card/${u.id}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Gagal membuat ID card');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ID-Card-${u.kode_unik || u.name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Terjadi kesalahan saat membuat ID card');
    } finally {
      setDownloadingIdCard(null);
    }
  }

  async function openUserDetail(u) {
    setDetailUser({ loading: true });
    const d = await fetch(`/api/admin/user-detail?user_id=${u.id}`).then(r => r.json());
    setDetailUser(d);
  }

  async function resetPassword(u) {
    const baru = prompt(`Password baru untuk ${u.name} (minimal 6 karakter):`);
    if (!baru) return;
    if (baru.length < 6) { alert('Password minimal 6 karakter'); return; }
    const res = await fetch('/api/profil/password', {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ user_id: u.id, password_baru: baru })
    });
    const d = await res.json();
    alert(res.ok ? `Password ${u.name} berhasil direset. Sampaikan password baru ini ke yang bersangkutan.` : (d.error || 'Gagal reset password'));
  }

  async function openBookingDetail(bookingId) {
    setExpandJamaahModal(0);
    setEditPaketForm(null);
    setBatalForm(null);
    setDetailBooking({ loading: true });
    const d = await fetch(`/api/bookings/${bookingId}`).then(r => r.json());
    setDetailBooking(d.booking || { error: d.error || 'Booking tidak ditemukan' });
  }

  async function simpanEditPaket() {
    setEditPaketBusy(true);
    try {
      const res = await fetch(`/api/bookings/${detailBooking.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paket: editPaketForm.paket, kamar: editPaketForm.kamar,
          harga_custom: editPaketForm.harga_custom ? Number(editPaketForm.harga_custom) : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setEditPaketBusy(false); return; }
      setEditPaketForm(null);
      openBookingDetail(detailBooking.id);
      loadAll();
    } catch { alert('Terjadi kesalahan'); }
    setEditPaketBusy(false);
  }

  async function batalkanBookingLangsung() {
    if (!confirm(`Batalkan booking ${detailBooking.id} sekarang juga? Seat langsung dilepas & jamaah dikabari.`)) return;
    setBatalBusy(true);
    try {
      const res = await fetch('/api/pembatalan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: detailBooking.id, admin_langsung: true,
          penyebab: batalForm.penyebab, refund_nominal: Number(batalForm.refund_nominal) || 0,
          catatan_admin: batalForm.catatan_admin,
        }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal membatalkan'); setBatalBusy(false); return; }
      alert(`Booking dibatalkan. Refund Rp ${Number(d.refund_nominal || 0).toLocaleString('id-ID')}.`);
      setBatalForm(null);
      openBookingDetail(detailBooking.id);
      loadAll();
    } catch { alert('Terjadi kesalahan'); }
    setBatalBusy(false);
  }

  // Export Excel langsung dari tab terkait, pakai filter yang lagi aktif di tab itu.
  async function downloadExcel(type, params = {}) {
    setExporting(type);
    try {
      await downloadExcelFile(type, params);
    } catch (e) {
      alert(e.message || 'Terjadi kesalahan saat export data');
    } finally {
      setExporting(null);
    }
  }

  async function tandaiSelesai(bookingId) {
    if (!confirm('Proses closing booking ini sekarang? Komisi akan langsung dicairkan.')) return;
    const res = await fetch('/api/admin/booking-selesai', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ booking_id: bookingId })
    });
    const d = await res.json();
    if (res.ok) {
      alert('Booking ditandai selesai!');
      if (openProgram) openProgramDetail(openProgram);
      loadAll();
    } else {
      alert(d.error || 'Gagal menandai selesai');
    }
  }

  async function patchCustomHarga(id, action) {
    let catatan = '';
    if (action === 'reject') {
      catatan = prompt('Alasan penolakan (opsional):') || '';
    }
    const res = await fetch('/api/custom-harga', {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ id, action, catatan_admin: catatan })
    });
    const d = await res.json();
    if (res.ok) { alert(d.message); loadAll(); }
    else alert(d.error || 'Gagal memproses');
  }

  if (!user || loading || !data) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const pending = data.pending || {};
  const stat = data.stat || {};

  // Konfig cluster pending
  const clusters = [
    {key:'program_umroh', label:'Pending Pendaftaran Program Umroh', icon:'🕌', color:'border-blue-200 bg-blue-50', items: pending.program_umroh||[]},
    {key:'custom_harga', label:'Pending Pengajuan Custom Harga', icon:'💰', color:'border-orange-200 bg-orange-50', items: pending.custom_harga||[]},
    {key:'pembayaran', label:'Pending Konfirmasi Pembayaran', icon:'💳', color:'border-red-200 bg-red-50', items: pending.pembayaran||[]},
    {key:'akun_jamaah', label:'Pending Pendaftaran Akun Jamaah', icon:'🧳', color:'border-green-200 bg-green-50', items: pending.akun_jamaah||[]},
    {key:'akun_perwakilan', label:'Pending Pendaftaran Akun Perwakilan', icon:'🏢', color:'border-purple-200 bg-purple-50', items: pending.akun_perwakilan||[]},
    {key:'perlengkapan', label:'Perlengkapan Perlu Dikirim', icon:'📦', color:'border-yellow-200 bg-yellow-50', items: pending.perlengkapan||[]},
  ];

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-700 text-white rounded-2xl p-6 mb-6">
        <h2 className="text-xl md:text-2xl font-bold">⚙️ Admin Panel — JM Travel</h2>
        <p className="text-sm opacity-75 mt-1">Selamat datang, {user.name}</p>
      </div>


      {/* ================= DASHBOARD TAB ================= */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">

          {/* Ringkasan — tiap kartu klik-able, ke halaman database masing-masing */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {label:'Jamaah', val:stat.jamaah||0, color:'text-green-700', bg:'bg-green-50', tipe:'jamaah'},
              {label:'Perwakilan', val:stat.perwakilan||0, color:'text-purple-700', bg:'bg-purple-50', tipe:'perwakilan'},
              {label:'Program Aktif', val:stat.program||0, color:'text-[#C9952A]', bg:'bg-[#FEF3DC]', tipe:'program'},
            ].map(s => (
              <div key={s.label} onClick={() => router.push(`/admin/database/${s.tipe}`)}
                className={`${s.bg} rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow`}>
                <div className="text-xs text-gray-400 mb-1">{s.label}</div>
                <div className={`font-black text-xl ${s.color}`}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Cluster pending */}
          <CollapsibleSection title={<h3 className="font-bold text-red-600">🔴 Perlu Perhatian</h3>}>
            <div className="space-y-3">
              {clusters.map(c => {
                const isOpen = expandCluster === c.key;
                const tampil = isOpen ? c.items : c.items.slice(0,3);
                return (
                <div key={c.key} className={`border ${c.color} rounded-xl p-4`}>
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => c.items.length > 3 && setExpandCluster(isOpen ? null : c.key)}>
                    <div className="font-bold text-gray-700 text-sm">{c.icon} {c.label}</div>
                    <span className={`text-xs font-black px-2 py-1 rounded-full ${c.items.length>0?'bg-red-500 text-white':'bg-gray-200 text-gray-400'}`}>
                      {c.items.length}
                    </span>
                  </div>
                  {c.items.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {tampil.map((it,idx) => (
                        <div key={idx}
                          onClick={c.key==='perlengkapan' ? () => router.push(`/admin/perlengkapan-pengiriman/${encodeURIComponent(it.prog_name)}`) : undefined}
                          className={`text-xs text-gray-500 bg-white/60 rounded px-2 py-1 ${c.key==='perlengkapan' ? 'cursor-pointer hover:bg-white hover:text-[#1A4FA0]' : ''}`}>
                          {c.key==='pembayaran' ? `${it.nama||'User'} — ${it.booking_id} (${(it.type||'').toUpperCase()})`
                            : c.key==='program_umroh' ? `${it.pemesan||'User'} — ${it.prog_name} (${it.form_filled}/${it.form_total} form)`
                            : c.key==='custom_harga' ? `${it.pengaju_nama||'User'} — ${it.prog_name} (${rp(it.harga_diajukan)})`
                            : c.key==='perlengkapan' ? `${it.nama} — ${it.prog_name} (${it.status.replace('_',' ')})`
                            : `${it.name} — ${it.email||it.wa||''}`}
                        </div>
                      ))}
                      {c.items.length>3 && (
                        <div className="text-[10px] text-gray-400 pl-2 cursor-pointer underline" onClick={() => setExpandCluster(isOpen ? null : c.key)}>
                          {isOpen ? 'Tutup ▲' : `+${c.items.length-3} lainnya...`}
                        </div>
                      )}
                      <button onClick={() => {
                        if (c.key==='pembayaran') setActiveTab('payments');
                        else if (c.key.startsWith('akun_')) { setActiveTab('users'); setFilterUserStatus('pending'); }
                        else if (c.key==='program_umroh') setActiveTab('programs');
                        else if (c.key==='custom_harga') setActiveTab('customharga');
                        else if (c.key==='perlengkapan' && c.items[0]) router.push(`/admin/perlengkapan-pengiriman/${encodeURIComponent(c.items[0].prog_name)}`);
                      }} className="text-xs font-bold text-[#1A4FA0] underline mt-1">Tindak lanjut →</button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* ================= PAYMENTS TAB ================= */}
      {activeTab === 'payments' && (
        <div className="space-y-3">
          <h3 className="font-bold text-[#0E2F6E] mb-1">💳 Konfirmasi Pembayaran</h3>
          <p className="text-xs text-gray-400 mb-3">Cek pembayaran masuk, lalu approve. Tombol cetak formulir muncul setelah pembayaran dikonfirmasi.</p>

          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input value={searchPayments} onChange={e => setSearchPayments(e.target.value)}
              placeholder="Cari nama atau booking ID..."
              className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
            <select value={filterPaymentStatus} onChange={e => setFilterPaymentStatus(e.target.value)}
              className="px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
              <option value="">Semua status</option>
              <option value="pending">⏳ Pending</option>
              <option value="confirmed">✅ Confirmed</option>
              <option value="rejected">❌ Rejected</option>
            </select>
            <button onClick={() => downloadExcel('payments', { status: filterPaymentStatus })} disabled={exporting==='payments'}
              className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-sm font-bold px-4 py-2.5 rounded-xl whitespace-nowrap">
              {exporting==='payments' ? 'Menyiapkan...' : '⬇️ Export Excel'}
            </button>
          </div>

          {(() => {
            const filtered = payments
              .filter(p => cocok(searchPayments, p.nama, p.booking_id))
              .filter(p => !filterPaymentStatus || p.status === filterPaymentStatus);
            if (filtered.length === 0) {
              return <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Tidak ada pembayaran yang cocok.</div>;
            }
            // Kelompokkan payment yang lahir dari 1x submit keranjang (batch_id
            // sama — banyak booking, tapi 1x transfer beneran & 1x bukti) jadi
            // 1 kartu, biar bukti transfernya gak keliatan berulang-ulang per
            // booking (resiko admin lengah/dobel-cek — dikonfirmasi user
            // 2026-07-28). Payment lama/tanpa batch_id tetap tampil sendiri2
            // kayak sebelumnya (fallback key = id-nya sendiri).
            const grupMap = new Map();
            for (const p of filtered) {
              const key = p.batch_id || p.id;
              if (!grupMap.has(key)) grupMap.set(key, []);
              grupMap.get(key).push(p);
            }
            const grup = [...grupMap.entries()].map(([key, members]) => ({
              key, members,
              totalAmount: members.reduce((s, m) => s + Number(m.amount || 0), 0),
              semuaSama: (f) => members.every(m => f(m) === f(members[0])),
            })).sort((a, b) => new Date(b.members[0].created_at) - new Date(a.members[0].created_at));

            return grup.map(g => {
              const first = g.members[0];
              const statusSama = g.semuaSama(m => m.status);
              const statusGroup = statusSama ? first.status : 'campuran';
              return (
              <div key={g.key} className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
                <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setOpenPayment(openPayment===g.key?null:g.key)}>
                  <div>
                    <div className="font-bold text-[#0E2F6E] text-sm">
                      {first.nama || 'User'} — {g.members.length > 1 ? `${g.members.length} booking dalam 1 transaksi` : first.booking_id}
                    </div>
                    <div className="text-xs text-gray-400">{(first.type||'').toUpperCase()} · {tgl(first.created_at)} · {rp(g.totalAmount)}</div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    statusGroup==='confirmed'?'bg-green-100 text-green-700':statusGroup==='rejected'?'bg-red-100 text-red-600':statusGroup==='campuran'?'bg-amber-100 text-amber-700':'bg-yellow-100 text-yellow-700'
                  }`}>{statusGroup==='confirmed'?'✅ Confirmed':statusGroup==='rejected'?'❌ Rejected':statusGroup==='campuran'?'⚠️ Sebagian diproses':'⏳ Pending'}</span>
                </div>

                {/* Detail saat diklik */}
                {openPayment === g.key && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50 text-sm space-y-2">
                    <div className="flex justify-between"><span className="text-gray-400">Pemesan</span><span className="font-semibold">{first.nama||'-'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Jenis</span><span className="font-semibold">{(first.type||'').toUpperCase()}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Total ({g.members.length} booking)</span><span className="font-semibold">{rp(g.totalAmount)}</span></div>

                    {/* Rincian per booking — cuma buat dilihat detailnya, aksinya digabung */}
                    <div className="space-y-1.5 pt-1">
                      {g.members.map(m => (
                        <div key={m.id} className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-3 py-2">
                          <div>
                            <div className="font-semibold text-xs text-gray-700">{m.booking_id}</div>
                            <div className="text-[10px] text-gray-400">{rp(m.amount)}</div>
                          </div>
                          <button onClick={() => openBookingDetail(m.booking_id)} className="text-[10px] font-bold text-[#1A4FA0] hover:underline">Lihat Detail</button>
                        </div>
                      ))}
                    </div>

                    {/* Bukti transfer — SATU aja (semua booking di grup ini
                        emang bukti-nya sama persis, dari 1x upload yang sama). */}
                    <div className="pt-2">
                      <div className="text-gray-400 text-xs mb-1">Bukti Transfer</div>
                      {first.bukti_path ? (
                        <a href={first.bukti_path} target="_blank" rel="noopener noreferrer"
                          className="block bg-white border-2 border-[#1A4FA0] rounded-lg p-3 text-center hover:bg-[#E8F0FB] transition-colors">
                          <div className="text-2xl mb-1">📎</div>
                          <div className="text-xs font-bold text-[#1A4FA0]">Lihat Bukti Transfer</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{first.bukti_nama || 'bukti'}</div>
                        </a>
                      ) : (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-600 text-center">
                          ⚠️ Tidak ada bukti transfer terlampir
                        </div>
                      )}
                    </div>

                    {g.members.some(m => m.status === 'pending') && (
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => Promise.all(g.members.filter(m => m.status === 'pending').map(m => patchPayment(m.id, 'approve', { skipReload: true }))).then(() => { loadAll(); setOpenPayment(null); })}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 rounded-full">
                          ✅ Approve {g.members.length > 1 ? `Semua (${g.members.length})` : ''}
                        </button>
                        <button onClick={() => Promise.all(g.members.filter(m => m.status === 'pending').map(m => patchPayment(m.id, 'reject', { skipReload: true }))).then(() => { loadAll(); setOpenPayment(null); })}
                          className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-2 rounded-full">
                          ❌ Tolak {g.members.length > 1 ? `Semua (${g.members.length})` : ''}
                        </button>
                      </div>
                    )}

                    {/* Kirim WA — cuma muncul setelah confirmed, ke tiap jamaah per
                        booking dalam grup ini (termasuk yang gak bikin akun sendiri,
                        dipesankan admin/perwakilan) + ke perwakilan perekrutnya kalau ada. */}
                    {statusGroup === 'confirmed' && g.members.map(p => {
                      const jamaahList = parseJamaahData(p.jamaah_data).filter(j => j.wa);
                      const ctx = {
                        progName: p.prog_name, totalHarga: p.total_harga, dpAmount: p.dp_amount,
                        namaKantor: pengaturan.nama_perusahaan,
                      };
                      return (
                        <div key={p.id} className="pt-2 border-t border-gray-200 mt-2 space-y-1.5">
                          <div className="text-gray-400 text-xs mb-1">Kirim Info via WhatsApp — {p.booking_id}</div>
                          {jamaahList.length === 0 && (
                            <div className="text-[11px] text-gray-400">Belum ada nomor WA jamaah tercatat untuk booking ini.</div>
                          )}
                          {jamaahList.map((j, i) => (
                            <TombolWA key={i} nomor={j.wa}
                              label={`Kirim WA ke ${j.nama || 'Jamaah'}`}
                              className="w-full inline-flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-2 rounded-full"
                              pesan={p.type === 'lunas'
                                ? pesanPelunasanDikonfirmasi({ namaJamaah: j.nama, ...ctx })
                                : pesanDpDikonfirmasi({ namaJamaah: j.nama, ...ctx })}
                            />
                          ))}
                          {p.referral_perw_id && p.referral_wa && (
                            <TombolWA nomor={p.referral_wa}
                              label={`Kirim WA ke ${p.referral_nama || 'Perwakilan'} (referral)`}
                              className="w-full inline-flex items-center justify-center gap-1.5 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-3 py-2 rounded-full"
                              pesan={pesanReferralBaru({
                                namaPenerima: p.referral_nama, namaJamaah: p.nama, progName: p.prog_name,
                                jumlahJamaah: p.jumlah_jamaah, kodeUnik: p.referral_kode,
                              })}
                            />
                          )}
                          <button onClick={() => printFormulir(p.booking_id)} className="w-full mt-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold py-2 rounded-full">
                            🖨️ Cetak Formulir Jamaah — {p.booking_id}
                          </button>
                          {/* Invoice sekarang selalu manual (judul+nominal
                              admin) — tombol ini nge-link ke halaman Invoice
                              & Kwitansi dengan booking ini udah pre-filled. */}
                          <button onClick={() => window.open(`/admin/invoice-kwitansi?booking_id=${p.booking_id}`, '_blank')}
                            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold py-2 rounded-full">
                            🧾 Buat Invoice — {p.booking_id}
                          </button>
                          {/* Kwitansi cuma keluar begitu LUNAS TOTAL — biasanya
                              udah auto kebuat sendiri dari hook approve
                              pembayaran 'lunas' di /api/payments, tombol ini
                              fallback manual. Makanya cuma muncul kalau
                              pembayaran yang barusan di-approve ini tipenya
                              'lunas' (bukan DP). */}
                          {p.type === 'lunas' && (
                            <button onClick={() => cetakInvoiceOtomatis(p.booking_id, 'kwitansi')}
                              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold py-2 rounded-full">
                              🧾 Cetak Kwitansi Pembayaran — {p.booking_id}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            });
          })()}
        </div>
      )}

      {/* ================= PEMBATALAN TAB ================= */}
      {activeTab === 'pembatalan' && (
        <div className="space-y-3">
          <h3 className="font-bold text-[#0E2F6E] mb-1">🚫 Pengajuan Pembatalan</h3>
          <p className="text-xs text-gray-400 mb-3">Booking yang DP/pembayarannya sudah confirmed wajib diajukan dulu dan diputuskan di sini. Booking yang belum pernah bayar dibatalkan otomatis oleh jamaah, tidak muncul di daftar ini.</p>

          {pembatalan.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Belum ada pengajuan pembatalan.</div>
          ) : pembatalan.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
              <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setOpenPembatalan(openPembatalan===p.id?null:p.id)}>
                <div>
                  <div className="font-bold text-[#0E2F6E] text-sm">{p.pemohon_nama || 'User'} — {p.booking_id}</div>
                  <div className="text-xs text-gray-400">{p.prog_name} · {tgl(p.created_at)} · Sudah dibayar {rp(p.total_sudah_dibayar)}</div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                  p.status==='disetujui'?'bg-green-100 text-green-700':p.status==='ditolak'?'bg-red-100 text-red-600':'bg-yellow-100 text-yellow-700'
                }`}>{p.status==='disetujui'?'✅ Disetujui':p.status==='ditolak'?'❌ Ditolak':'⏳ Menunggu'}</span>
              </div>

              {openPembatalan === p.id && (
                <div className="border-t border-gray-100 p-4 bg-gray-50 text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-gray-400">Booking ID</span><span className="font-semibold">{p.booking_id}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Program</span><span className="font-semibold">{p.prog_name} — {p.paket}/{p.kamar}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Pemohon</span><span className="font-semibold">{p.pemohon_nama} ({p.pemohon_wa})</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Total Harga</span><span className="font-semibold">{rp(p.total_harga)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Sudah Dibayar</span><span className="font-semibold">{rp(p.total_sudah_dibayar)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Alasan</span><span className="font-semibold text-right max-w-[60%]">{p.alasan || '-'}</span></div>

                  {p.bukti_path && (
                    <a href={p.bukti_path} target="_blank" rel="noopener noreferrer"
                      className="block bg-white border-2 border-[#1A4FA0] rounded-lg p-3 text-center hover:bg-[#E8F0FB] transition-colors">
                      <div className="text-xs font-bold text-[#1A4FA0]">📎 Lihat Lampiran Pengajuan</div>
                    </a>
                  )}

                  {p.status === 'menunggu' ? (
                    <div className="pt-2 space-y-2">
                      <div>
                        <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Penyebab</label>
                        <select value={pembatalanForm.penyebab} onChange={e => setPembatalanForm({...pembatalanForm, penyebab: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                          <option value="lainnya">Lainnya (ikuti S&K, tentukan nominal)</option>
                          <option value="kesalahan_jm_travel">Kesalahan JM Travel (refund 100%)</option>
                        </select>
                      </div>
                      {pembatalanForm.penyebab !== 'kesalahan_jm_travel' && (
                        <div>
                          <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Nominal Refund (maks. {rp(p.total_sudah_dibayar)})</label>
                          <input type="number" value={pembatalanForm.refund_nominal}
                            onChange={e => setPembatalanForm({...pembatalanForm, refund_nominal: e.target.value})}
                            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Catatan Admin (opsional)</label>
                        <input value={pembatalanForm.catatan_admin}
                          onChange={e => setPembatalanForm({...pembatalanForm, catatan_admin: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => patchPembatalan(p.id,'approve')} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 rounded-full">✅ Setujui</button>
                        <button onClick={() => patchPembatalan(p.id,'reject')} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-2 rounded-full">❌ Tolak</button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 space-y-1">
                      {p.status === 'disetujui' && (
                        <div className="flex justify-between"><span className="text-gray-400">Refund</span><span className="font-semibold">{rp(p.refund_nominal)} ({p.refund_persen}%)</span></div>
                      )}
                      {p.catatan_admin && (
                        <div className="flex justify-between"><span className="text-gray-400">Catatan Admin</span><span className="font-semibold text-right max-w-[60%]">{p.catatan_admin}</span></div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ================= PENDAFTARAN TAB =================
          Khusus akun perwakilan yang masih pending — jamaah tidak
          masuk sini krn di /api/auth/register jamaah langsung status
          'active' (gak pernah pending), jadi gak ada yang perlu di-ACC
          atau dicetakkan dokumen apa pun. */}
      {activeTab === 'pendaftaran' && (
        <div className="space-y-3">
          <h3 className="font-bold text-[#0E2F6E] mb-1">🪪 Pendaftaran Perwakilan</h3>
          <p className="text-xs text-gray-400 mb-3">ACC/Tolak pendaftaran, lalu cetak Perjanjian Kerjasama. SK BSI bisa dilihat setelah diunggah.</p>

          {(() => {
            const pendaftar = users.filter(u => u.role === 'perwakilan' && u.status === 'pending');
            if (pendaftar.length === 0) {
              return <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Tidak ada pendaftaran yang menunggu.</div>;
            }
            return pendaftar.map(u => (
              <div key={u.id} className="bg-white rounded-xl border border-[#e0e8f0] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-bold text-[#0E2F6E] text-sm">{u.name} <span className="text-gray-400 font-normal">— Perwakilan</span></div>
                    <div className="text-xs text-gray-400">{u.email || u.wa}{u.perekrut_nama ? ` · Perekrut: ${u.perekrut_nama}` : ''}</div>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">⏳ Pending</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                  {u.pendaftaran_id ? (
                    <select value={u.pendaftaran_status || 'pending'}
                      onChange={e => patchStatusPendaftaran(u.pendaftaran_id, e.target.value)}
                      className="text-xs font-semibold border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 bg-white">
                      {REG_STAGES.filter(s => !s.jalur || s.jalur === (u.pendaftaran_metode === 'paket' ? 'paket' : 'kantor')).map(s => (
                        <option key={s.key} value={s.key} disabled={s.key === 'sk_bsi_verified' && !u.sk_bsi_path}>
                          {s.label}{s.key === 'sk_bsi_verified' && !u.sk_bsi_path ? ' (belum diunggah)' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <button onClick={() => patchUser(u.id,'approve')} className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-full">✅ ACC</button>
                      <button onClick={() => patchUser(u.id,'reject')} className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full">❌ Tolak</button>
                    </>
                  )}

                  <button onClick={() => window.open(`/admin/cetak-pks-mitra/${u.id}`, '_blank')}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-full">
                    📜 Cetak Perjanjian Kerjasama
                  </button>

                  <button onClick={() => u.sk_bsi_path && window.open(u.sk_bsi_path, '_blank')} disabled={!u.sk_bsi_path}
                    className="bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 text-xs font-bold px-3 py-1.5 rounded-full">
                    📄 {u.sk_bsi_path ? 'Lihat SK BSI' : 'SK BSI belum diunggah'}
                  </button>

                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* ================= USERS TAB ================= */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={searchUsers} onChange={e => setSearchUsers(e.target.value)}
              placeholder="Cari nama, email, WA, atau NIK..."
              className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
            <select value={filterUserStatus} onChange={e => setFilterUserStatus(e.target.value)}
              className="px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
              <option value="">Semua status</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="nonaktif">Nonaktif</option>
              <option value="rejected">Rejected</option>
            </select>
            <button onClick={() => downloadExcel('users', { status: filterUserStatus })} disabled={exporting==='users'}
              className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-sm font-bold px-4 py-2.5 rounded-xl whitespace-nowrap">
              {exporting==='users' ? 'Menyiapkan...' : '⬇️ Export Akun'}
            </button>
            <button onClick={() => downloadExcel('komisi')} disabled={exporting==='komisi'}
              className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-sm font-bold px-4 py-2.5 rounded-xl whitespace-nowrap">
              {exporting==='komisi' ? 'Menyiapkan...' : '⬇️ Export Komisi'}
            </button>
          </div>
          {['perwakilan','jamaah'].map(role => {
            const roleUsers = urutkan(
              users
                .filter(u => u.role === role)
                .filter(u => cocok(searchUsers, u.name, u.email, u.wa, u.nik))
                .filter(u => !filterUserStatus || u.status === filterUserStatus),
              sortState.users.field, sortState.users.dir
            );
            const label = role==='perwakilan'?'🏢 Perwakilan':'🧳 Jamaah';
            const isMitra = role==='perwakilan';
            return (
              <CollapsibleSection key={role} title={<h3 className="font-bold text-[#0E2F6E]">{label}</h3>} badge={roleUsers.length}>
                <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#0E2F6E] text-white text-xs">
                      <SortTh field="name" sort={sortState.users} onSort={f => toggleSort('users', f)}>Nama</SortTh>
                      <th className="px-4 py-3 text-left">Kontak</th>
                      <SortTh field="status" sort={sortState.users} onSort={f => toggleSort('users', f)}>Status</SortTh>
                      {isMitra && <th className="px-4 py-3 text-left">Perekrut</th>}
                      <th className="px-4 py-3 text-left">Aksi</th>
                      {isMitra && <th className="px-4 py-3 text-left">ID Card</th>}
                    </tr></thead>
                    <tbody>
                      {roleUsers.map((u,i) => (
                        <tr key={u.id} onClick={() => openUserDetail(u)}
                          className={`cursor-pointer hover:bg-blue-50 ${i%2===0?'bg-white':'bg-gray-50'}`}>
                          <td className="px-4 py-3 font-semibold text-[#0E2F6E]">{u.name}<div className="text-[10px] text-gray-400 font-normal">{u.kode_unik||''}</div></td>
                          <td className="px-4 py-3 text-gray-500">{u.email||u.wa||'-'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                              u.status==='active'?'bg-green-100 text-green-700':u.status==='nonaktif'?'bg-gray-200 text-gray-500':u.status==='pending'?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-600'
                            }`}>{u.status}</span>
                          </td>
                          {isMitra && (
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              {u.perekrut_nama ? (
                                <span onClick={() => openUserDetail({ id: u.perekrut_id })} className="text-[#1A4FA0] hover:underline cursor-pointer">{u.perekrut_nama}</span>
                              ) : <span className="text-gray-400">-</span>}
                            </td>
                          )}
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            {u.status==='pending' ? (
                              isMitra ? (
                                // ACC/Tolak/SK BSI/cetak PKS perwakilan sekarang di tab Pendaftaran
                                // (grup Approval) — biar gak ada dua tempat aksi buat data yang sama.
                                <button onClick={() => router.push('/admin?tab=pendaftaran')}
                                  className="text-xs font-bold text-[#1A4FA0] hover:underline whitespace-nowrap">
                                  ⏳ Lihat di tab Pendaftaran →
                                </button>
                              ) : (
                                <div className="flex gap-2">
                                  <button onClick={() => patchUser(u.id,'approve')} className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1 rounded-full">✅ ACC</button>
                                  <button onClick={() => patchUser(u.id,'reject')} className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">❌ Tolak</button>
                                </div>
                              )
                            ) : isMitra && (u.status==='active'||u.status==='nonaktif') ? (
                              <button onClick={() => toggleUser(u)}
                                className={`text-xs font-bold px-3 py-1 rounded-full ${u.status==='active'?'bg-red-100 text-red-600 hover:bg-red-200':'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                                {u.status==='active'?'Nonaktifkan':'Aktifkan'}
                              </button>
                            ) : <span className="text-xs text-gray-400">-</span>}
                          </td>
                          {isMitra && (
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <div className="flex flex-col gap-1 items-start">
                                <button onClick={() => downloadIdCard(u)} disabled={downloadingIdCard===u.id}
                                  className="text-xs font-bold text-[#1A4FA0] hover:text-[#0E2F6E] disabled:opacity-40 whitespace-nowrap">
                                  {downloadingIdCard===u.id ? 'Memproses...' : '📇 Download'}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {roleUsers.length===0 && <tr><td colSpan={isMitra?6:4} className="px-4 py-6 text-center text-gray-400">Belum ada.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            );
          })}
        </div>
      )}

      {/* ================= PROGRAMS TAB ================= */}
      {activeTab === 'programs' && !openProgram && (
        <CollapsibleSection
          title={<h3 className="font-bold text-[#0E2F6E]">📦 Program</h3>}
          badge={programs.length}
          actions={
            <div className="flex gap-2">
              <button onClick={() => downloadExcel('programs')} disabled={exporting==='programs'}
                className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-sm font-bold px-4 py-2 rounded-full">
                {exporting==='programs' ? 'Menyiapkan...' : '⬇️ Export Program'}
              </button>
              <a href="/admin/programs" className="bg-[#1A4FA0] text-white text-sm font-bold px-4 py-2 rounded-full hover:bg-[#0E2F6E] transition-colors">⚙️ Kelola Program</a>
            </div>
          }
        >
        <div className="space-y-4">
          <input value={searchPrograms} onChange={e => setSearchPrograms(e.target.value)}
            placeholder="Cari nama program..."
            className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {programs.filter(p => cocok(searchPrograms, p.name)).map(p => (
              <div key={p.id} onClick={() => openProgramDetail(p)}
                className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden hover:shadow-md hover:border-[#1A4FA0] transition-all cursor-pointer">
                <div className="bg-gradient-to-r from-[#0E2F6E] to-[#2060C0] p-4 text-white">
                  <div className="text-xs opacity-75">{p.type} · {p.durasi} Hari</div>
                  <div className="font-bold mt-1">{p.name}</div>
                </div>
                <div className="p-4 text-sm flex justify-between items-center">
                  <span className="text-gray-400">Seat {p.used_seat||0}/{p.total_seat}</span>
                  <span className="text-xs font-bold text-[#1A4FA0]">Lihat Jamaah →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        </CollapsibleSection>
      )}

      {/* Program detail: daftar jamaah */}
      {activeTab === 'programs' && openProgram && (
        <div>
          <button onClick={() => setOpenProgram(null)} className="text-sm text-gray-500 mb-4 hover:text-[#1A4FA0]">← Kembali ke daftar program</button>
          <div className="flex justify-between items-start flex-wrap gap-2 mb-4">
            <div>
              <h3 className="font-bold text-[#0E2F6E] mb-1">{openProgram.name}</h3>
              <p className="text-xs text-gray-400">Daftar jamaah yang mendaftar di program ini</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => downloadExcel('bookings', { prog_id: openProgram.id })} disabled={exporting==='bookings'}
                className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-xs font-bold px-3 py-2 rounded-full whitespace-nowrap">
                {exporting==='bookings' ? 'Menyiapkan...' : '⬇️ Export Booking'}
              </button>
              <button onClick={() => downloadExcel('jamaah', { prog_id: openProgram.id })} disabled={exporting==='jamaah'}
                className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-xs font-bold px-3 py-2 rounded-full whitespace-nowrap">
                {exporting==='jamaah' ? 'Menyiapkan...' : '⬇️ Export Data Jamaah'}
              </button>
            </div>
          </div>

          {progJamaah.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Belum ada jamaah mendaftar.</div>
          ) : (
            <div className="space-y-3">
              {progJamaah.map(b => {
                const isOpen = expandProgBooking === b.id;
                return (
                <div key={b.id} className="bg-white rounded-xl border border-[#e0e8f0] p-4">
                  <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => setExpandProgBooking(isOpen ? null : b.id)}>
                    <div>
                      <div className="font-bold text-[#0E2F6E] text-sm">{b.pemesan_nama||'User'} — {b.id}</div>
                      <div className="text-xs text-gray-400">
                        {b.paket} · {b.kamar} · {b.jumlah_jamaah} jamaah · Sumber: <strong>{b.sumber}</strong>
                        {b.referral_kode ? ` (${b.referral_kode})` : ''}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${b.dp_status==='confirmed'?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}`}>
                        {b.dp_status==='confirmed'?'DP OK':'DP Pending'}
                      </span>
                      <span className="text-[10px] text-[#1A4FA0] font-bold">{isOpen?'Tutup ▲':'Detail ▼'}</span>
                    </div>
                  </div>

                  {isOpen && (
                    <>
                      {/* Daftar nama jamaah dalam booking */}
                      {b.jamaah && b.jamaah.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1 mb-2">
                          {b.jamaah.map((j,idx) => (
                            <div key={idx} className="flex justify-between">
                              <span className="text-gray-600">{idx+1}. {j.nama||'(belum diisi)'}</span>
                              <span className="text-gray-400">{j.wa||''}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <button onClick={() => openBookingDetail(b.id)} className="w-full mb-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold py-2 rounded-full">
                        🔍 Detail Lengkap Booking
                      </button>

                      {/* Print hanya kalau form sudah lengkap */}
                      {b.form_lengkap ? (
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => printFormulir(b.id)} className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold py-2 rounded-full">
                            🖨️ Cetak Formulir Jamaah
                          </button>
                          <button onClick={() => window.open(`/admin/cetak-perjanjian/${b.id}`, '_blank')} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold py-2 rounded-full">
                            📜 Cetak Surat Perjanjian
                          </button>
                          {/* Invoice sekarang selalu manual (judul+nominal
                              admin, bisa DP/Pelunasan/cicilan) — tombol ini
                              cuma nge-link ke halaman Invoice & Kwitansi
                              dengan booking ini udah pre-filled. */}
                          {b.dp_status === 'confirmed' && (
                            <button onClick={() => window.open(`/admin/invoice-kwitansi?booking_id=${b.id}`, '_blank')} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold py-2 rounded-full">
                              🧾 Buat Invoice
                            </button>
                          )}
                          {/* Kwitansi cuma keluar begitu LUNAS TOTAL. */}
                          {b.pelunasan_status === 'paid' && (
                            <button onClick={() => cetakInvoiceOtomatis(b.id, 'kwitansi')} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold py-2 rounded-full">
                              🧾 Kwitansi Pembayaran
                            </button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => router.push(`/form-jamaah?booking_id=${b.id}`)} className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold py-2 rounded-full">
                          📋 Lengkapi Formulir ({b.form_filled}/{b.form_total})
                        </button>
                      )}

                      {/* Closing (ujroh terhitung) diproses otomatis begitu booking lunas, form
                          lengkap, tidak ada pembatalan aktif, dan tanggal keberangkatan lewat.
                          Tombol manual hanya muncul kalau semua syarat itu SUDAH terpenuhi —
                          jadi bukan jalur bypass, cuma mempercepat daripada nunggu sweep berikutnya. */}
                      {(() => {
                        const sc = statusClosing(b);
                        if (sc.kind === 'selesai') {
                          return <div className="text-center text-xs text-green-600 font-bold py-1 mt-1">✅ Perjalanan Selesai — closing tercatat</div>;
                        }
                        if (sc.kind === 'siap') {
                          return (
                            <button onClick={() => tandaiSelesai(b.id)} className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 rounded-full">
                              🔄 Proses Sekarang (syarat closing lengkap)
                            </button>
                          );
                        }
                        if (sc.kind === 'menunggu-tanggal') {
                          return <div className="text-center text-xs text-gray-400 py-1 mt-1">⏳ Menunggu tanggal keberangkatan ({tgl(sc.tanggal)}) — closing diproses otomatis setelahnya.</div>;
                        }
                        if (sc.kind === 'tanpa-tanggal') {
                          return <div className="text-center text-xs text-yellow-600 py-1 mt-1">⚠️ Program belum punya tanggal keberangkatan — lengkapi dulu di Kelola Program.</div>;
                        }
                        if (sc.kind === 'pembatalan') {
                          return <div className="text-center text-xs text-red-500 py-1 mt-1">🚫 Ada pengajuan pembatalan aktif.</div>;
                        }
                        if (sc.kind === 'belum-lunas') {
                          const jamaahWa = (b.jamaah || []).filter(j => j.wa);
                          const sisaBayar = Math.max(0, Number(b.total_harga || 0) - Number(b.dp_amount || 0));
                          return (
                            <div className="border-t border-gray-100 mt-2 pt-2 space-y-1.5">
                              <div className="text-[10px] text-gray-400">⏳ Belum lunas — sisa {rp(sisaBayar)}. Kirim reminder pelunasan:</div>
                              {jamaahWa.length === 0 && <div className="text-[11px] text-gray-400">Belum ada nomor WA jamaah tercatat untuk booking ini.</div>}
                              {jamaahWa.map((j, i) => (
                                <TombolWA key={i} nomor={j.wa}
                                  label={`Reminder Pelunasan ke ${j.nama || 'Jamaah'}`}
                                  className="w-full inline-flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-full"
                                  pesan={pesanReminderPelunasan({
                                    namaJamaah: j.nama, progName: b.prog_name, sisaBayar,
                                    namaBank: pengaturan.bank_nama, noRekening: pengaturan.bank_rekening, atasNama: pengaturan.bank_atas_nama,
                                  })}
                                />
                              ))}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= HIERARKI & CLOSING TAB ================= */}
      {activeTab === 'hierarki' && (
        <div className="space-y-4">
          <div className="flex justify-between items-start flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-[#0E2F6E] mb-1">🌳 Hierarki & Laporan Closing</h3>
              <p className="text-xs text-gray-400">Struktur perekrutan perwakilan (berjenjang) beserta performa closing & komisi masing-masing.</p>
            </div>
            <button onClick={() => downloadExcel('closing', { from: hierarkiFrom, to: hierarkiTo })} disabled={exporting==='closing'}
              className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-xs font-bold px-3 py-2 rounded-full whitespace-nowrap">
              {exporting==='closing' ? 'Menyiapkan...' : '⬇️ Export Laporan Closing'}
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-2 bg-white rounded-xl border border-[#e0e8f0] p-3">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Dari Tanggal</label>
              <input type="date" value={hierarkiFrom} onChange={e => setHierarkiFrom(e.target.value)} className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Sampai Tanggal</label>
              <input type="date" value={hierarkiTo} onChange={e => setHierarkiTo(e.target.value)} className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
            </div>
            {(hierarkiFrom || hierarkiTo) && (
              <button onClick={() => { setHierarkiFrom(''); setHierarkiTo(''); }}
                className="text-gray-400 hover:text-red-500 text-xs font-bold px-3 py-2">✕ Reset</button>
            )}
            <p className="text-[10px] text-gray-400 w-full">Hasil update otomatis begitu tanggal diisi. Kosongkan tanggal untuk melihat performa sepanjang waktu (all-time).</p>
          </div>

          <div className="flex gap-2">
            {[{k:'tree',label:'🌳 Pohon Hierarki'},{k:'genealogi',label:'📋 Tabel Genealogi'},{k:'flat',label:'📊 Laporan Ranking'}].map(v => (
              <button key={v.k} onClick={() => setHierarkiView(v.k)}
                className={`text-sm font-bold px-4 py-2 rounded-full ${hierarkiView===v.k?'bg-[#1A4FA0] text-white':'bg-white text-gray-500 border border-gray-200'}`}>
                {v.label}
              </button>
            ))}
          </div>

          <CollapsibleSection title={<h4 className="font-bold text-[#0E2F6E] text-sm">
            {hierarkiView==='tree'?'🌳 Pohon Hierarki':hierarkiView==='genealogi'?'📋 Tabel Genealogi':'📊 Laporan Ranking'}
          </h4>}>
          {!hierarki ? (
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Memuat...</div>
          ) : hierarkiView === 'tree' ? (
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
              {hierarki.tree.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-6">Belum ada perwakilan.</div>
              ) : hierarki.tree.map(node => (
                <HierarkiNode key={node.id} node={node} depth={0} expanded={expandedNodes} onToggle={toggleHierarkiNode} onClickUser={openUserDetail} />
              ))}
            </div>
          ) : hierarkiView === 'genealogi' ? (
            <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead><tr className="bg-[#0E2F6E] text-white text-xs">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Nama (berjenjang)</th>
                  <th className="px-4 py-3 text-left">Level</th>
                  <th className="px-4 py-3 text-left">Kode</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Downline Langsung</th>
                  <th className="px-4 py-3 text-right">Total Downline</th>
                  <th className="px-4 py-3 text-right">Booking</th>
                  <th className="px-4 py-3 text-right">Jamaah</th>
                  <th className="px-4 py-3 text-right">Total Komisi</th>
                </tr></thead>
                <tbody>
                  {flattenGenealogi(hierarki.tree).map((f, i) => (
                    <tr key={f.id} onClick={() => openUserDetail(f)}
                      className={`cursor-pointer hover:bg-blue-50 ${i%2===0?'bg-white':'bg-gray-50'}`}>
                      <td className="px-4 py-3 text-gray-400">{i+1}</td>
                      <td className="px-4 py-3 font-semibold text-[#0E2F6E]" style={{ paddingLeft: 16 + f.depth * 24 }}>
                        {f.depth > 0 && <span className="text-gray-300 mr-1">└</span>}
                        {f.name}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{f.depth + 1}</td>
                      <td className="px-4 py-3 text-gray-500">{f.kode_unik}</td>
                      <td className="px-4 py-3 text-gray-500">{f.role}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${f.status==='active'?'bg-green-100 text-green-700':'bg-gray-200 text-gray-500'}`}>{f.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{f.children?.length || 0}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{f.total_downline}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{f.jumlah_booking}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{f.jumlah_jamaah}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#C9952A]">{rp(f.total_komisi)}</td>
                    </tr>
                  ))}
                  {hierarki.tree.length===0 && <tr><td colSpan={11} className="px-4 py-6 text-center text-gray-400">Belum ada perwakilan.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#0E2F6E] text-white text-xs">
                  <th className="px-4 py-3 text-left">#</th>
                  <SortTh field="name" sort={sortState.ranking} onSort={f => toggleSort('ranking', f)}>Nama</SortTh>
                  <SortTh field="role" sort={sortState.ranking} onSort={f => toggleSort('ranking', f)}>Role</SortTh>
                  <SortTh field="status" sort={sortState.ranking} onSort={f => toggleSort('ranking', f)}>Status</SortTh>
                  <th className="px-4 py-3 text-left">Perekrut</th>
                  <SortTh field="jumlah_booking" sort={sortState.ranking} onSort={f => toggleSort('ranking', f)}>Booking</SortTh>
                  <SortTh field="jumlah_jamaah" sort={sortState.ranking} onSort={f => toggleSort('ranking', f)}>Jamaah</SortTh>
                  <SortTh field="total_komisi" sort={sortState.ranking} onSort={f => toggleSort('ranking', f)}>Total Komisi</SortTh>
                </tr></thead>
                <tbody>
                  {urutkan(hierarki.flat, sortState.ranking.field, sortState.ranking.dir).map((f,i) => (
                    <Fragment key={f.id}>
                      <tr onClick={() => setExpandedFlatRows(prev => ({...prev, [f.id]: !prev[f.id]}))}
                        className={`cursor-pointer hover:bg-blue-50 ${i%2===0?'bg-white':'bg-gray-50'}`}>
                        <td className="px-4 py-3 text-gray-400">{i+1}</td>
                        <td className="px-4 py-3 font-semibold text-[#0E2F6E]">
                          {f.komisi_breakdown.length>0 && <span className="text-gray-400 mr-1">{expandedFlatRows[f.id]?'▼':'▶'}</span>}
                          {f.name}<div className="text-[10px] text-gray-400 font-normal">{f.kode_unik}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{f.role}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${f.status==='active'?'bg-green-100 text-green-700':'bg-gray-200 text-gray-500'}`}>{f.status}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500" onClick={e => e.stopPropagation()}>
                          {f.perekrut_nama ? (
                            <span onClick={() => openUserDetail({ id: f.perekrut_id })} className="text-[#1A4FA0] hover:underline cursor-pointer">{f.perekrut_nama}</span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{f.jumlah_booking}</td>
                        <td className="px-4 py-3 text-gray-500">{f.jumlah_jamaah}</td>
                        <td className="px-4 py-3 font-bold text-[#C9952A]">{rp(f.total_komisi)}</td>
                      </tr>
                      {expandedFlatRows[f.id] && f.komisi_breakdown.length > 0 && (
                        <tr className="bg-gray-50">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Breakdown Komisi</div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {f.komisi_breakdown.map(k => (
                                <div key={k.jenis} className="flex justify-between text-xs bg-white rounded px-2 py-1 border border-gray-100">
                                  <span className="text-gray-500">{k.jenis} ({k.jumlah}x)</span>
                                  <span className="font-bold text-[#C9952A]">{rp(k.total)}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {hierarki.flat.length===0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Belum ada data.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          </CollapsibleSection>
        </div>
      )}

      {/* ================= CUSTOM HARGA TAB ================= */}
      {activeTab === 'customharga' && (
        <CollapsibleSection
          title={<h3 className="font-bold text-[#0E2F6E]">💰 Pengajuan Custom Harga</h3>}
          badge={(pending.custom_harga || []).length}
          actions={
            <button onClick={() => downloadExcel('customharga')} disabled={exporting==='customharga'}
              className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-xs font-bold px-3 py-2 rounded-full whitespace-nowrap">
              {exporting==='customharga' ? 'Menyiapkan...' : '⬇️ Export Excel'}
            </button>
          }
        >
          <p className="text-xs text-gray-400 mb-4">Tinjau pengajuan harga custom dari perwakilan. Export mengambil semua riwayat (bukan cuma yang pending).</p>
          {(pending.custom_harga || []).length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Tidak ada pengajuan custom harga yang pending.</div>
          ) : (
            <div className="space-y-3">
              {(pending.custom_harga || []).map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-[#e0e8f0] p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-bold text-[#0E2F6E] text-sm">{r.pengaju_nama} <span className="text-xs font-normal text-gray-400">({r.pengaju_role})</span></div>
                      <div className="text-xs text-gray-400 mt-0.5">{r.prog_name}</div>
                      <div className="text-xs text-gray-500 mt-1 capitalize">{r.paket} · {r.kamar} · <strong className="text-[#C9952A]">{rp(r.harga_diajukan)}</strong></div>
                      {r.alasan && <div className="text-xs text-gray-500 mt-1 italic">&quot;{r.alasan}&quot;</div>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => patchCustomHarga(r.id,'approve')} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 rounded-full">✅ Setujui</button>
                    <button onClick={() => patchCustomHarga(r.id,'reject')} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-2 rounded-full">❌ Tolak</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}
      {/* ================= VOUCHER TAB ================= */}
      {activeTab === 'voucher' && (
        <div>
          <h3 className="font-bold text-[#0E2F6E] mb-1">🎟️ Kelola Voucher</h3>
          <p className="text-xs text-gray-400 mb-4">
            Hanya admin yang membuat kode voucher. Perwakilan memakainya saat closing jamaah.
            Diskon memotong ujroh pribadi perwakilan (bukan HPP).
          </p>

          {/* Form buat voucher */}
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-6 space-y-3">
            <div className="font-bold text-[#0E2F6E] text-sm">+ Buat Voucher Baru</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Kode Voucher *</label>
                <input value={vForm.kode} onChange={e => setVForm({...vForm, kode:e.target.value.toUpperCase()})}
                  placeholder="MISAL: PROMO2026"
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm uppercase"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Potongan / Jamaah (Rp) *</label>
                <input value={vForm.potongan ? Number(vForm.potongan).toLocaleString('id-ID') : ''}
                  onChange={e => setVForm({...vForm, potongan:Number(e.target.value.replace(/\D/g,''))})}
                  inputMode="numeric" placeholder="0"
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
              </div>
            </div>
            {/* Batasan tanggal & kuota — independen, boleh dua-duanya aktif
                sekaligus (voucher habis begitu salah satu kena duluan),
                boleh juga dua-duanya dimatikan (tanpa batas sama sekali). */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-[#0E2F6E] mb-1">
                  <input type="checkbox" checked={vForm.batasKuota} onChange={e => setVForm({...vForm, batasKuota:e.target.checked})} />
                  Batasi Kuota Jamaah
                </label>
                <input value={vForm.kuota} disabled={!vForm.batasKuota}
                  onChange={e => setVForm({...vForm, kuota:Number(e.target.value.replace(/\D/g,''))||1})}
                  inputMode="numeric" placeholder="Jumlah jamaah"
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm disabled:bg-gray-100 disabled:text-gray-400"/>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-[#0E2F6E] mb-1">
                  <input type="checkbox" checked={vForm.batasTanggal} onChange={e => setVForm({...vForm, batasTanggal:e.target.checked})} />
                  Batasi Tanggal Berakhir
                </label>
                <input type="date" value={vForm.valid_until} disabled={!vForm.batasTanggal}
                  onChange={e => setVForm({...vForm, valid_until:e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm disabled:bg-gray-100 disabled:text-gray-400"/>
              </div>
            </div>

            {/* Akses: siapa yang boleh pakai — independen dari tampil di bawah */}
            <div>
              <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Siapa yang Boleh Pakai</label>
              <select value={vForm.akses_role} onChange={e => setVForm({...vForm, akses_role:e.target.value, for_user:''})}
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                <option value="publik">Publik (semua akun)</option>
                <option value="perwakilan">Khusus Perwakilan</option>
                <option value="akun">Khusus 1 Akun Tertentu</option>
              </select>
              {vForm.akses_role === 'akun' && (
                <div className="mt-2">
                  <SearchableSelect
                    value={vForm.for_user}
                    onChange={v => setVForm({...vForm, for_user:v})}
                    placeholder="Cari nama akun tujuan..."
                    options={users.filter(u => u.role !== 'admin' && u.role !== 'super_admin').map(u => ({ value: u.id, label: `${u.name} (${u.role}${u.kode_unik ? ' · ' + u.kode_unik : ''})` }))}
                  />
                </div>
              )}
            </div>

            {/* Tampil: apakah muncul di halaman /voucher, atau search-only
                (dipakai buat kode promo live IG/TikTok — nggak boleh browsable,
                cuma bisa dipakai kalau ketik kodenya manual). */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-[#0E2F6E]">
                <input type="checkbox" checked={vForm.tampil} onChange={e => setVForm({...vForm, tampil:e.target.checked})} />
                Tampilkan di halaman Voucher publik
              </label>
              {!vForm.tampil && (
                <div className="text-[10px] text-gray-400 mt-1">
                  Voucher nggak akan muncul di /voucher buat siapa pun — cuma bisa dipakai kalau ketik kode manual saat checkout (mis. kode promo live IG/TikTok).
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Khusus Program (opsional)</label>
              <select value={vForm.prog_id} onChange={e => setVForm({...vForm, prog_id:e.target.value})}
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                <option value="">Semua program</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Catatan (opsional)</label>
              <input value={vForm.catatan} onChange={e => setVForm({...vForm, catatan:e.target.value})}
                placeholder="Misal: promo akhir tahun"
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
            </div>
            <div className="bg-[#FEF3DC] rounded-lg p-3 text-xs text-[#8a6516]">
              ⚠️ Batas maksimal diskon = porsi ujroh pribadi perwakilan:
              Signature Rp 3jt · Eksekutif Rp 2jt · Deluxe Rp 1jt (per jamaah).
              Voucher di atas batas akan ditolak saat dipakai.
            </div>
            <button onClick={buatVoucher}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-2.5 rounded-full transition-colors">
              🎟️ Buat Voucher
            </button>
          </div>

          {/* Daftar voucher */}
          <CollapsibleSection
            title={<div className="font-bold text-[#0E2F6E]">Daftar Voucher</div>}
            badge={vouchers.length}
            actions={
              <button onClick={() => downloadExcel('vouchers')} disabled={exporting==='vouchers'}
                className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-xs font-bold px-3 py-2 rounded-full whitespace-nowrap">
                {exporting==='vouchers' ? 'Menyiapkan...' : '⬇️ Export Excel'}
              </button>
            }
          >
          {vouchers.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Belum ada voucher.</div>
          ) : (
            <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#0E2F6E] text-white text-xs">
                    <SortTh field="kode" sort={sortState.voucher} onSort={f => toggleSort('voucher', f)}>Kode</SortTh>
                    <SortTh field="potongan" sort={sortState.voucher} onSort={f => toggleSort('voucher', f)}>Potongan</SortTh>
                    <th className="px-4 py-3 text-left">Kuota (jamaah)</th>
                    <SortTh field="valid_until" sort={sortState.voucher} onSort={f => toggleSort('voucher', f)}>Berlaku</SortTh>
                    <th className="px-4 py-3 text-left">Akses</th>
                    <SortTh field="aktif" sort={sortState.voucher} onSort={f => toggleSort('voucher', f)}>Status</SortTh>
                    <th className="px-4 py-3 text-left">Aksi</th>
                  </tr></thead>
                  <tbody>
                    {urutkan(vouchers, sortState.voucher.field, sortState.voucher.dir).map((v,i) => (
                      <tr key={v.id} className={i%2===0?'bg-white':'bg-gray-50'}>
                        <td className="px-4 py-3 font-bold text-[#0E2F6E]">{v.kode}
                          {v.prog_name && <div className="text-[10px] text-gray-400 font-normal">{v.prog_name}</div>}
                        </td>
                        <td className="px-4 py-3 text-[#C9952A] font-bold">{rp(v.potongan)}</td>
                        <td className="px-4 py-3 text-gray-500">{v.terpakai||0}/{v.kuota ?? '∞'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{v.valid_until ? tgl(v.valid_until) : 'Tanpa batas'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              v.akses_role==='publik' ? 'bg-blue-50 text-blue-700' :
                              v.akses_role==='perwakilan' ? 'bg-indigo-50 text-indigo-700' :
                              'bg-purple-50 text-purple-700'
                            }`}>
                              {v.akses_role==='publik'?'Publik':v.akses_role==='perwakilan'?'Khusus Perwakilan':'Khusus Akun'}
                            </span>
                            <span className="text-[10px] text-gray-400">{v.tampil ? '👁️ Tampil' : '🙈 Search-only'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${v.aktif?'bg-green-100 text-green-700':'bg-gray-200 text-gray-500'}`}>
                            {v.aktif?'Aktif':'Nonaktif'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => toggleVoucher(v)} className="text-xs font-bold text-[#1A4FA0] underline">
                              {v.aktif?'Nonaktifkan':'Aktifkan'}
                            </button>
                            <button onClick={() => hapusVoucher(v)} className="text-xs font-bold text-red-500 underline">Hapus</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </CollapsibleSection>
        </div>
      )}

      {activeTab === 'auditlog' && (
        <div>
          <h3 className="font-bold text-[#0E2F6E] mb-1">🕵️ Audit Trail</h3>
          <p className="text-xs text-gray-400 mb-4">
            Riwayat siapa yang approve/reject/tandai apa dan kapan — untuk akuntabilitas keputusan yang menyangkut uang & komisi.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input value={searchAudit} onChange={e => setSearchAudit(e.target.value)}
              placeholder="Cari nama admin atau keterangan..."
              className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
            <select value={auditFilter} onChange={e => setAuditFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
              <option value="">Semua jenis</option>
              {Object.entries(TARGET_TYPE_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <button onClick={() => downloadExcel('audit', { target_type: auditFilter })} disabled={exporting==='audit'}
              className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-sm font-bold px-4 py-2.5 rounded-xl whitespace-nowrap">
              {exporting==='audit' ? 'Menyiapkan...' : '⬇️ Export Excel'}
            </button>
          </div>

          {(() => {
            const auditRows = urutkan(
              auditLog.filter(a => cocok(searchAudit, a.actor_nama, a.keterangan)),
              sortState.auditlog.field, sortState.auditlog.dir
            );
            return (
          <CollapsibleSection
            title={<div className="font-bold text-[#0E2F6E]">Riwayat</div>}
            badge={auditRows.length}
          >
          {auditRows.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Belum ada riwayat yang cocok.</div>
          ) : (
            <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#0E2F6E] text-white text-xs">
                    <SortTh field="created_at" sort={sortState.auditlog} onSort={f => toggleSort('auditlog', f)}>Waktu</SortTh>
                    <SortTh field="actor_nama" sort={sortState.auditlog} onSort={f => toggleSort('auditlog', f)}>Admin</SortTh>
                    <SortTh field="aksi" sort={sortState.auditlog} onSort={f => toggleSort('auditlog', f)}>Aksi</SortTh>
                    <SortTh field="target_type" sort={sortState.auditlog} onSort={f => toggleSort('auditlog', f)}>Target</SortTh>
                    <th className="px-4 py-3 text-left">Keterangan</th>
                  </tr></thead>
                  <tbody>
                    {auditRows.map((a, i) => (
                      <tr key={a.id} className={i%2===0?'bg-white':'bg-gray-50'}>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{tglJam(a.created_at)}</td>
                        <td className="px-4 py-3 font-semibold text-[#0E2F6E]">{a.actor_nama || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#E8F0FB] text-[#1A4FA0]">
                            {AKSI_LABEL[a.aksi] || a.aksi}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {TARGET_TYPE_LABEL[a.target_type] || a.target_type}
                          <div className="text-gray-400">{a.target_id}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{a.keterangan || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </CollapsibleSection>
            );
          })()}
        </div>
      )}

      {/* ================= MODAL DETAIL USER ================= */}
      {detailUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailUser(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            {detailUser.loading ? (
              <div className="text-center text-gray-400 py-10">Memuat...</div>
            ) : detailUser.error ? (
              <div className="text-center text-red-500 py-10">{detailUser.error}</div>
            ) : (() => {
              const u = detailUser.user;
              const roleLabel = {perwakilan:'🏢 Perwakilan', jamaah:'🧳 Jamaah', admin:'⚙️ Admin', super_admin:'🔒 Super Admin'}[u.role] || u.role;
              return (
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-lg text-[#0E2F6E]">{u.name}</div>
                      <div className="text-xs text-gray-400">{roleLabel}{u.kode_unik ? ` · ${u.kode_unik}` : ''}</div>
                    </div>
                    <button onClick={() => setDetailUser(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
                  </div>

                  <div className="flex items-center gap-3">
                    {u.foto_path && (
                      <img src={u.foto_path} alt={u.name} className="w-24 h-24 rounded-xl object-cover border border-gray-200"/>
                    )}
                    <button onClick={() => resetPassword(u)} className="text-xs font-bold text-gray-400 hover:text-[#1A4FA0] whitespace-nowrap">
                      🔑 Reset Password
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Status" value={u.status} />
                    <Field label="Terverifikasi" value={u.terverifikasi ? 'Ya' : 'Belum'} />
                    <Field label="Email" value={u.email} />
                    <Field label="WhatsApp" value={u.wa} />
                    <Field label="NIK" value={u.nik} />
                    <Field label="Tanggal Lahir" value={tgl(u.tanggal_lahir)} />
                    <Field label="Jenis Kelamin" value={u.jenis_kelamin} />
                    <Field label="Nama Ibu Kandung" value={u.nama_ibu} />
                    <Field label="Pekerjaan" value={u.pekerjaan} />
                    <Field label="Wilayah" value={u.wilayah} />
                    <Field label="Alamat" value={u.alamat} full />
                    <Field label="Kode Pos" value={u.kode_pos} />
                    <Field label="Bergabung" value={tgl(u.created_at)} />
                    <Field label="Status Pendaftaran" value={u.reg_status} />
                    <Field label="Metode Daftar" value={u.reg_metode} />
                    <Field label="Jadwal" value={u.reg_jadwal} />
                    {u.reg_notes && <Field label="Catatan Pendaftaran" value={u.reg_notes} full />}
                    <Field label="Setuju PKS" value={u.setuju_pks ? `Ya (${tgl(u.setuju_pks_at)})` : 'Belum'} />
                  </div>

                  {u.role==='perwakilan' && (
                    <div className="border-t border-gray-100 pt-3 space-y-2">
                      <div className="font-bold text-sm text-[#0E2F6E]">Info {roleLabel}</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Perekrut</div>
                          {detailUser.perekrut_nama && u.perekrut_id ? (
                            <div onClick={() => openUserDetail({ id: u.perekrut_id })}
                              className="font-semibold text-[#1A4FA0] hover:underline cursor-pointer break-words">
                              {detailUser.perekrut_nama}
                            </div>
                          ) : (
                            <div className="font-semibold text-gray-700">-</div>
                          )}
                        </div>
                        <Field label="Downline" value={detailUser.downline_count} />
                        <Field label="Bank" value={u.bank} />
                        <Field label="No. Rekening" value={u.no_rekening} />
                        <Field label="Nama Pemilik Rekening" value={u.nama_pemilik_rekening} full />
                      </div>
                      {detailUser.komisi.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-gray-500 mt-2 mb-1">Ringkasan Komisi</div>
                          <div className="space-y-1">
                            {detailUser.komisi.map(k => (
                              <div key={k.jenis} className="flex justify-between text-xs bg-gray-50 rounded px-2 py-1">
                                <span className="text-gray-500">{k.jenis} ({k.jumlah}x)</span>
                                <span className="font-bold text-[#C9952A]">{rp(k.total)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {detailUser.bookings.length > 0 && (
                    <div className="border-t border-gray-100 pt-3">
                      <div className="font-bold text-sm text-[#0E2F6E] mb-2">Booking Terkait ({detailUser.bookings.length})</div>
                      <div className="space-y-1">
                        {detailUser.bookings.map(b => (
                          <div key={b.id} onClick={() => openBookingDetail(b.id)}
                            className="text-xs bg-gray-50 hover:bg-blue-50 rounded-lg px-3 py-2 cursor-pointer flex justify-between items-center">
                            <div>
                              <div className="font-semibold text-[#0E2F6E]">{b.id} — {b.prog_name}</div>
                              <div className="text-gray-400">{b.paket} · {b.jumlah_jamaah} jamaah · {tgl(b.created_at)}</div>
                            </div>
                            <span className="text-[#1A4FA0]">→</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ================= MODAL DETAIL BOOKING ================= */}
      {detailBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailBooking(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            {detailBooking.loading ? (
              <div className="text-center text-gray-400 py-10">Memuat...</div>
            ) : detailBooking.error ? (
              <div className="text-center text-red-500 py-10">{detailBooking.error}</div>
            ) : (() => {
              const b = detailBooking;
              return (
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-lg text-[#0E2F6E]">{b.id}</div>
                      <div className="text-xs text-gray-400">{b.prog_name}</div>
                    </div>
                    <button onClick={() => setDetailBooking(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="Pemesan" value={b.pemesan_nama} />
                    <Field label="Kontak Pemesan" value={b.pemesan_email || b.pemesan_wa} />
                    <Field label="Paket" value={b.paket} />
                    <Field label="Kamar" value={b.kamar} />
                    <Field label="Jumlah Jamaah" value={b.jumlah_jamaah} />
                    <Field label="Status Booking" value={b.status} />
                    <Field label="Total Harga" value={rp(b.total_harga)} />
                    <Field label="DP" value={`${rp(b.dp_amount)} (${b.dp_status})`} />
                    <Field label="Pelunasan" value={b.pelunasan_status} />
                    <Field label="Form Jamaah" value={`${b.form_filled}/${b.form_total}`} />
                    <Field label="Sumber Info" value={b.sumber_info} />
                    <Field label="Kode Referral" value={b.referral_kode} />
                    <Field label="Voucher" value={b.voucher_kode ? `${b.voucher_kode} (-${rp(b.voucher_nominal)})` : '-'} />
                    <Field label="Dipesan Oleh (Role)" value={b.ordered_by_role} />
                    <Field label="Tanggal Booking" value={tgl(b.created_at)} />
                  </div>

                  {/* Edit Paket/Kamar/Harga — koreksi manual booking yang udah
                      dibuat (mis. jamaah minta ganti paket via telepon).
                      Cuma muncul kalau bookingnya masih relevan diedit. */}
                  {BOOKING_BISA_DIUBAH(b.status) && (
                    <div className="border-t border-gray-100 pt-3">
                      {!editPaketForm ? (
                        <button onClick={() => setEditPaketForm({ paket: b.paket, kamar: b.kamar, harga_custom: '', hargaAwal: { paket: b.paket, kamar: b.kamar, total_harga: b.total_harga } })}
                          className="text-xs font-bold text-[#1A4FA0] hover:underline">✏️ Edit Paket/Kamar/Harga</button>
                      ) : (
                        <div className="bg-[#E8F0FB] rounded-lg p-3 space-y-2">
                          <div className="font-bold text-xs text-[#0E2F6E]">Edit Paket/Kamar/Harga</div>
                          <div className="text-xs bg-white rounded-lg px-3 py-2 border border-[#1A4FA0]/20">
                            <span className="text-gray-400">Harga awal (sebelum diedit):</span>{' '}
                            <span className="font-bold text-[#0E2F6E]">
                              {PAKET_OPSI.find(p => p.value === editPaketForm.hargaAwal.paket)?.label || editPaketForm.hargaAwal.paket} / {editPaketForm.hargaAwal.kamar} — {rp(editPaketForm.hargaAwal.total_harga)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <select value={editPaketForm.paket} onChange={e => setEditPaketForm({ ...editPaketForm, paket: e.target.value })}
                              className="px-3 py-2 rounded-lg border-2 border-gray-200 text-sm">
                              {PAKET_OPSI.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                            <select value={editPaketForm.kamar} onChange={e => setEditPaketForm({ ...editPaketForm, kamar: e.target.value })}
                              className="px-3 py-2 rounded-lg border-2 border-gray-200 text-sm">
                              {KAMAR_OPSI.map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                          </div>
                          <input type="number" value={editPaketForm.harga_custom} onChange={e => setEditPaketForm({ ...editPaketForm, harga_custom: e.target.value })}
                            placeholder="Custom harga per jamaah (kosongkan = ikut harga program)"
                            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm" />
                          <div className="text-[10px] text-gray-400">Total harga booking dihitung ulang otomatis (harga per jamaah × jumlah jamaah), opsi tambahan tetap dipertahankan.</div>
                          <div className="flex gap-2">
                            <button onClick={simpanEditPaket} disabled={editPaketBusy} className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-xs font-bold py-2 rounded-full">{editPaketBusy ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
                            <button onClick={() => setEditPaketForm(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2 rounded-full">Batal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Batalkan Booking langsung oleh admin — dipakai buat
                      jamaah yang telepon/dateng minta batal, gak perlu suruh
                      login & ngajuin sendiri dulu. Refund diisi manual admin
                      (sama kayak alur pengajuan biasa), bukan hitungan otomatis. */}
                  {BOOKING_BISA_DIUBAH(b.status) && (
                    <div className="border-t border-gray-100 pt-3">
                      {!batalForm ? (
                        <button onClick={() => setBatalForm({ penyebab: 'permintaan_jamaah', refund_nominal: '', catatan_admin: '' })}
                          className="text-xs font-bold text-red-500 hover:underline">🚫 Batalkan Booking Langsung</button>
                      ) : (
                        <div className="bg-red-50 rounded-lg p-3 space-y-2">
                          <div className="font-bold text-xs text-red-700">Batalkan Booking Langsung</div>
                          <div className="text-[10px] text-gray-500">DP: {rp(b.dp_amount)} ({b.dp_status}) · Total: {rp(b.total_harga)}. Nominal refund gak boleh lebih dari yang beneran udah dikonfirmasi dibayar.</div>
                          <select value={batalForm.penyebab} onChange={e => setBatalForm({ ...batalForm, penyebab: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm">
                            <option value="permintaan_jamaah">Permintaan Jamaah</option>
                            <option value="kesalahan_jm_travel">Kesalahan JM Travel (refund 100%)</option>
                            <option value="lainnya">Lainnya</option>
                          </select>
                          {batalForm.penyebab !== 'kesalahan_jm_travel' && (
                            <input type="number" value={batalForm.refund_nominal} onChange={e => setBatalForm({ ...batalForm, refund_nominal: e.target.value })}
                              placeholder="Nominal refund (0 kalau gak ada refund)"
                              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm" />
                          )}
                          <textarea value={batalForm.catatan_admin} onChange={e => setBatalForm({ ...batalForm, catatan_admin: e.target.value })}
                            placeholder="Catatan (opsional)" rows={2}
                            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm" />
                          <div className="flex gap-2">
                            <button onClick={batalkanBookingLangsung} disabled={batalBusy} className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-full">{batalBusy ? 'Memproses...' : 'Ya, Batalkan Sekarang'}</button>
                            <button onClick={() => setBatalForm(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2 rounded-full">Batal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {Array.isArray(b.jamaah_data) && b.jamaah_data.length > 0 && (
                    <div className="border-t border-gray-100 pt-3">
                      <div className="font-bold text-sm text-[#0E2F6E] mb-2">Data Jamaah ({b.jamaah_data.length})</div>
                      <div className="space-y-3">
                        {b.jamaah_data.map((j, idx) => {
                          const isOpen = expandJamaahModal === idx;
                          return (
                          <div key={idx} className="bg-gray-50 rounded-lg p-3">
                            <div className="font-bold text-sm text-[#0E2F6E] mb-2 cursor-pointer flex items-center justify-between"
                              onClick={() => setExpandJamaahModal(isOpen ? null : idx)}>
                              <span>{idx+1}. {j.nama || '(belum diisi)'}</span>
                              <span className="text-xs text-gray-400 font-normal">{isOpen ? '▲' : '▼'}</span>
                            </div>
                            {isOpen && (
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <Field label="NIK" value={j.nik} />
                                <Field label="Paspor" value={j.paspor} />
                                <Field label="Masa Berlaku Paspor" value={j.exp_mulai && j.exp_paspor ? `${tgl(j.exp_mulai)} s/d ${tgl(j.exp_paspor)}` : '-'} full />
                                <Field label="Tempat Keluar Paspor" value={j.tkp} />
                                <Field label="Tempat/Tgl Lahir" value={j.tl ? `${j.tl}, ${tgl(j.ttl)}` : '-'} />
                                <Field label="Jenis Kelamin" value={j.jk} />
                                <Field label="Alamat" value={j.alamat} full />
                                <Field label="WhatsApp" value={j.wa} />
                                <Field label="Email" value={j.email} />
                                <Field label="Pekerjaan" value={j.pkj} />
                                <Field label="Riwayat Penyakit" value={j.penyakit} />
                                <Field label="Mahram" value={j.mahram ? `${j.mahram} (${j.hub_mahram})` : '-'} full />
                                <Field label="Kontak Darurat" value={j.kdnama ? `${j.kdnama} · ${j.kdwa} (${j.kdhub})` : '-'} full />
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </Layout>
  );
}
