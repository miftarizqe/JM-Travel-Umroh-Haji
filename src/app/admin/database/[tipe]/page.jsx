'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import SortTh from '@/app/components/SortTh';
import TombolWA from '@/app/components/TombolWA';
import { urutkan, cocok } from '@/lib/sortTable';
import { downloadExcel } from '@/lib/downloadExcel';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { pesanReminderFormulir } from '@/lib/waTemplates';

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const DOC_FIELDS = [
  ['doc_paspor', 'Scan Paspor'], ['doc_kk', 'Kartu Keluarga'], ['doc_ktp', 'KTP'],
  ['doc_vaksin', 'Bukti Vaksin'], ['doc_foto', 'Pas Foto'],
];

// Dipakai bareng utk kolom Nama perwakilan — klik buka modal
// formulir pendaftaran + SK BSI.
function renderNamaMitra(row, { onShowDetail }) {
  return (
    <button onClick={() => onShowDetail(row)} className="text-[#1A4FA0] font-bold hover:underline whitespace-nowrap">
      {row.name}
    </button>
  );
}

// NIK-nya sendiri jadi link download foto KTP kalau ada (sama pola kayak
// kolom Nomor Paspor di Manifest Jamaah) — gak perlu kolom "Foto KTP"
// terpisah, biar gak buang tempat. Kalau BELUM ada, tetap bisa diklik —
// bukan cuma teks mati — biar admin bisa langsung unggah dari sini kalau
// yang bersangkutan gak pernah upload sendiri (mayoritas kasus).
function renderNik(row, ctx) {
  return <NikKtpCell row={row} onUploaded={ctx.patchRow} />;
}

function NikKtpCell({ row, onUploaded }) {
  const [uploading, setUploading] = useState(false);

  async function pilihFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('user_id', row.id);
      const res = await fetch('/api/admin/upload-ktp-fisik', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) onUploaded(row.id, { foto_ktp_path: d.path });
      else alert(d.error || 'Gagal mengunggah KTP');
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploading(false);
  }

  if (row.foto_ktp_path) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <a href={row.foto_ktp_path} target="_blank" rel="noopener noreferrer" download
          title="Lihat/download foto KTP"
          className="text-[#1A4FA0] font-bold hover:underline">
          {row.nik} 📄
        </a>
        <label className="text-[10px] text-gray-400 hover:text-[#1A4FA0] cursor-pointer">
          {uploading ? '...' : '(ganti)'}
          <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" disabled={uploading}
            onChange={e => pilihFile(e.target.files?.[0])} />
        </label>
      </span>
    );
  }

  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap" title="Klik untuk unggah foto KTP">
      <span>{row.nik || '-'}</span>
      <span className="text-[10px] font-bold text-amber-600">
        {uploading ? 'Mengunggah...' : '⚠️ Belum diunggah — klik'}
      </span>
      <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" disabled={uploading}
        onChange={e => pilihFile(e.target.files?.[0])} />
    </label>
  );
}

// Sama pola dgn NikKtpCell — kalau SK BSI belum diunggah, admin bisa
// langsung unggah dari sini (mis. diterima via WhatsApp lalu di-scan admin).
function SkBsiButton({ row, onUploaded }) {
  const [uploading, setUploading] = useState(false);

  async function pilihFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('user_id', row.id);
      const res = await fetch('/api/admin/upload-sk-bsi', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) onUploaded(row.id, { sk_bsi_path: d.path });
      else alert(d.error || 'Gagal mengunggah SK BSI');
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploading(false);
  }

  if (row.sk_bsi_path) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <button onClick={() => window.open(row.sk_bsi_path, '_blank')}
          className="text-[10px] font-bold text-gray-400 hover:text-[#1A4FA0] whitespace-nowrap">
          📄 Lihat SK BSI
        </button>
        <label className="text-[10px] text-gray-400 hover:text-[#1A4FA0] cursor-pointer">
          {uploading ? '...' : '(ganti)'}
          <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" disabled={uploading}
            onChange={e => pilihFile(e.target.files?.[0])} />
        </label>
      </span>
    );
  }

  return (
    <label className="inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
      title="Klik untuk unggah SK BSI">
      <span className="text-[10px] font-bold text-amber-600">
        {uploading ? 'Mengunggah...' : '⚠️ SK BSI belum diunggah — klik'}
      </span>
      <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" disabled={uploading}
        onChange={e => pilihFile(e.target.files?.[0])} />
    </label>
  );
}

// Kolom sendiri (bukan di dalam modal nama) — perwakilan pasti punya nomor
// perjanjian, jadi ditaruh sebagai kolom biar langsung kelihatan & bisa
// diklik langsung ke surat cetaknya tanpa muter ke modal nama dulu.
// SK BSI ditaruh nempel di bawahnya, bukan di modal nama.
function renderNomorPerjanjian(row, ctx) {
  return (
    <div className="flex flex-col items-start gap-1">
      <button onClick={() => window.open(`/admin/cetak-pks-mitra/${row.id}`, '_blank')}
        className="text-[#1A4FA0] font-bold hover:underline whitespace-nowrap text-xs">
        {row.no_perjanjian_kerjasama || 'Belum ada — klik utk buat'}
      </button>
      <SkBsiButton row={row} onUploaded={ctx.patchRow} />
      <button onClick={() => window.open(`/admin/cetak-formulir-mitra/${row.id}`, '_blank')}
        className="text-[10px] font-bold text-gray-400 hover:text-[#1A4FA0] whitespace-nowrap">
        📋 Formulir Pendaftaran
      </button>
    </div>
  );
}

// Kolom paling kanan — cuma status (bisa diklik buat aktifkan/nonaktifkan).
// ID Card & Verifikasi sekarang di dalam modal nama, bukan di sini.
function renderAksiMitra(row, { onToggleStatus }) {
  return (
    row.status === 'pending' ? (
      <span className="text-xs font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 whitespace-nowrap">⏳ Pending — cek tab Pendaftaran</span>
    ) : (
      <button onClick={() => onToggleStatus(row)}
        className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap transition-colors ${
          row.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600' : 'bg-gray-200 text-gray-500 hover:bg-green-100 hover:text-green-700'
        }`}>
        {row.status === 'active' ? '✅ Aktif' : '⛔ Nonaktif'} · ubah
      </button>
    )
  );
}

const TIPE_CONFIG = {
  jamaah: {
    title: '🧳 Database Jamaah',
    // 1 baris = 1 orang (dedup by NIK, fallback No. Paspor buat jamaah <=17 th
    // yang NIK-nya sengaja gak diisi di form-jamaah) — bukan 1 baris per
    // booking, krn jamaah yang sama bisa umroh berkali-kali dan tetap harus
    // kehitung 1 orang. Riwayat programnya ada di kolom "Program" (klik nama
    // buat lihat detail formulir, klik kolom Program buat lihat riwayat).
    searchFields: ['name', 'nik', 'paspor', 'email', 'wa', 'pemesan_nama', 'kode_unik'],
    searchPlaceholder: 'Cari nama, NIK, paspor, email, WA, atau pemesan...',
    exportType: 'users', exportParams: { role: 'jamaah' },
    defaultSort: { field: 'kode_unik', dir: 'asc' },
    // "Sudah berangkat" cuma yang PERNAH punya minimal 1 booking beneran
    // 'selesai' (closing sudah lewat tanggal keberangkatan) — sekali pernah,
    // selamanya masuk grup ini walau ada juga booking lain yang batal/nunggu.
    splitGroups: [
      { key: 'berangkat', label: '✅ Sudah Pernah Berangkat', match: r => r.status_jamaah === 'Sudah Berangkat' },
      { key: 'belum_clear', label: '⏳ Belum Clear Keberangkatan', match: r => r.status_jamaah !== 'Sudah Berangkat' },
    ],
    columns: [
      {
        key: 'name', label: 'Nama',
        render: (row, { onShowDetail }) => (
          <button onClick={() => onShowDetail(row)} className="text-[#1A4FA0] font-bold hover:underline whitespace-nowrap">
            {row.name}
          </button>
        ),
      },
      {
        // NIK jadi link download KTP kalau jamaah sempat unggah dokumennya
        // di form-jamaah (opsional, lihat DOC_FIELDS) — sama pola kayak
        // kolom NIK Database Perwakilan.
        key: 'nik', label: 'NIK',
        render: (row) => row.formulir?.doc_ktp ? (
          <a href={row.formulir.doc_ktp} target="_blank" rel="noopener noreferrer" download
            title="Lihat/download KTP" className="text-[#1A4FA0] font-bold hover:underline whitespace-nowrap">
            {row.nik} 📄
          </a>
        ) : (row.nik || '-'),
      },
      { key: 'paspor', label: 'No. Paspor' },
      { key: 'wa', label: 'WhatsApp' },
      { key: 'email', label: 'Email' },
      { key: 'jenis_kelamin', label: 'JK' },
      { key: 'alamat', label: 'Alamat' },
      { key: 'pekerjaan', label: 'Pekerjaan' },
      {
        key: 'jumlah_program', label: 'Program', align: 'right',
        render: (row, { onShowHistory }) => (
          <button onClick={() => onShowHistory(row)} className="text-[#1A4FA0] font-bold hover:underline whitespace-nowrap">
            {row.jumlah_program}x ▸
          </button>
        ),
      },
      { key: 'status_jamaah', label: 'Status Jamaah' },
      { key: 'pemesan_nama', label: 'Dipesankan Oleh' },
      { key: 'kode_unik', label: 'Kode Akun' },
      { key: 'akun_status', label: 'Status Akun' },
      { key: 'keberangkatan_pertama', label: 'Keberangkatan Pertama', format: tgl },
    ],
  },
  perwakilan: {
    title: '🏢 Database Perwakilan',
    searchFields: ['name', 'kode_unik', 'nik', 'email', 'wa'],
    searchPlaceholder: 'Cari nama, kode unik, NIK, email, atau WA...',
    exportType: 'users', exportParams: { role: 'perwakilan' },
    defaultSort: { field: 'kode_unik', dir: 'asc' },
    columns: [
      { key: 'kode_unik', label: 'Kode Perwakilan' },
      { key: 'name', label: 'Nama Lengkap', render: renderNamaMitra },
      { key: 'nik', label: 'NO KTP', render: renderNik },
      { key: 'tempat_lahir', label: 'Tempat Lahir' },
      { key: 'tanggal_lahir', label: 'Tanggal Lahir', format: tgl },
      { key: 'jenis_kelamin', label: 'Jenis Kelamin' },
      { key: 'wilayah', label: 'Wilayah' },
      { key: 'alamat_ktp', label: 'Alamat KTP' },
      { key: 'alamat_domisili', label: 'Alamat Domisili' },
      { key: 'wa', label: 'No. Whatsapp' },
      { key: 'email', label: 'Email Aktif' },
      { key: 'perekrut_nama', label: 'Perekrut', format: v => v || 'JM Travel' },
      { key: 'bank', label: 'Nama Bank' },
      { key: 'no_rekening', label: 'No. Rekening' },
      { key: 'nama_pemilik_rekening', label: 'Nama Pemilik Rekening' },
      { key: 'created_at', label: 'Bergabung', format: tgl },
      { key: 'no_perjanjian_kerjasama', label: 'No. Perjanjian', render: renderNomorPerjanjian },
      { key: 'status', label: 'Aksi', render: renderAksiMitra },
    ],
  },
  program: {
    title: '🕌 Database Program',
    searchFields: ['name', 'type', 'kategori'],
    searchPlaceholder: 'Cari nama program, tipe, atau kategori...',
    exportType: 'programs', exportParams: {},
    defaultSort: { field: 'created_at', dir: 'desc' },
    columns: [
      {
        key: 'name', label: 'Nama Program',
        // Klik nama = buka Manifest Jamaah program ini (bukan ke editor
        // program — itu ada di menu Kelola Program tersendiri).
        render: (row, { router }) => (
          <div className="flex flex-col items-start gap-1">
            <button onClick={() => router.push(`/admin/manifest/${encodeURIComponent(row.name)}`)}
              className="text-[#1A4FA0] font-bold hover:underline whitespace-nowrap" title="Lihat manifest jamaah program ini">
              {row.name}
            </button>
            <button onClick={() => router.push(`/admin/perlengkapan-pengiriman/${encodeURIComponent(row.name)}`)}
              className="text-[10px] font-bold text-gray-400 hover:text-[#1A4FA0] whitespace-nowrap" title="Status pengiriman perlengkapan jamaah program ini">
              📦 Perlengkapan
            </button>
          </div>
        ),
      },
      { key: 'type', label: 'Tipe' },
      { key: 'kategori', label: 'Kategori' },
      { key: 'durasi', label: 'Durasi', align: 'right', format: v => `${v} hari` },
      { key: 'tanggal_berangkat', label: 'Berangkat', format: tgl },
      { key: 'total_seat', label: 'Total Seat', align: 'right' },
      { key: 'used_seat', label: 'Terpakai', align: 'right' },
      { key: 'dp', label: 'DP', align: 'right', format: rp },
      { key: 'harga_deluxe', label: 'Harga Deluxe', align: 'right', format: rp },
      { key: 'harga_eksekutif', label: 'Harga Eksekutif', align: 'right', format: rp },
      { key: 'harga_signature', label: 'Harga Signature', align: 'right', format: rp },
      { key: 'active', label: 'Status', format: v => v ? 'Aktif' : 'Nonaktif' },
      { key: 'created_at', label: 'Dibuat', format: tgl },
    ],
  },
};

export default function DatabasePage() {
  const router = useRouter();
  const params = useParams();
  const tipe = params?.tipe;
  const config = TIPE_CONFIG[tipe];

  const [user] = useCurrentUser();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(config?.defaultSort || { field: null, dir: 'asc' });
  const [exporting, setExporting] = useState(false);
  const [historyFor, setHistoryFor] = useState(null); // baris jamaah yang riwayat programnya lagi dibuka
  const [detailFor, setDetailFor] = useState(null); // baris yang detail formulirnya lagi dibuka
  const [downloadingId, setDownloadingId] = useState(null); // id user yang ID card-nya lagi diproses
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [perekrutOptions, setPerekrutOptions] = useState([]);

  function muatData() {
    fetch(`/api/admin/database?tipe=${tipe}`)
      .then(r => r.json())
      .then(d => { setRows(d.rows || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  // Update 1 baris di state lokal tanpa refetch semua data — dipakai
  // setelah upload dokumen langsung dari tabel (mis. NikKtpCell).
  function patchRow(id, changes) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...changes } : r));
  }

  useEffect(() => {
    // user null krn localStorage BELUM kebaca (lihat useCurrentUser) — bukan
    // berarti belum login, middleware sudah jamin ada sesi valid sebelum
    // halaman /admin/* ini kebuka. Jangan redirect duluan, tunggu render
    // berikutnya pas user beneran keisi (makanya user ikut jadi dependency).
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); return; }
    if (!config) { router.replace('/admin'); return; }
    muatData();
  }, [tipe, user]);

  if (!user || loading || !config) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  // Toggle aktif/nonaktif — dipakai kolom Aksi perwakilan (cuma
  // berlaku utk yang statusnya sudah active/nonaktif, bukan pending —
  // pending diproses di tab Pendaftaran krn ada tahap SK BSI-nya).
  async function toggleStatus(row) {
    const target = row.status === 'active' ? 'nonaktif' : 'active';
    if (!confirm(`${target === 'active' ? 'Aktifkan' : 'Nonaktifkan'} ${row.name}?`)) return;
    await fetch('/api/admin/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: row.id, action: 'set_status', new_status: target }),
    });
    muatData();
  }

  async function downloadIdCard(row) {
    setDownloadingId(row.id);
    try {
      const res = await fetch(`/api/admin/id-card/${row.id}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Gagal membuat ID card');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ID-Card-${row.kode_unik || row.name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Terjadi kesalahan saat membuat ID card');
    } finally {
      setDownloadingId(null);
    }
  }

  // Edit data akun (perwakilan) — dari modal detail formulir. no_perjanjian_kerjasama,
  // kode_unik, status TIDAK ikut diedit di sini (lihat whitelist di API).
  function mulaiEdit() {
    const f = detailFor.formulir || {};
    if (tipe === 'jamaah') {
      setEditForm({
        nama: f.nama || '', paspor: f.paspor || '',
        exp_mulai: f.exp_mulai ? String(f.exp_mulai).slice(0, 10) : '', exp_paspor: f.exp_paspor ? String(f.exp_paspor).slice(0, 10) : '',
        tkp: f.tkp || '', tl: f.tl || '', ttl: f.ttl ? String(f.ttl).slice(0, 10) : '',
        nik: f.nik || '', jk: f.jk || 'Laki-Laki', alamat: f.alamat || '',
        wa: f.wa || '', email: f.email || '', penyakit: f.penyakit || '', pkj: f.pkj || '',
        mahram: f.mahram || '', hub_mahram: f.hub_mahram || '',
        kdnama: f.kdnama || '', kdwa: f.kdwa || '', kdhub: f.kdhub || '',
      });
      setEditMode(true);
      return;
    }
    setEditForm({
      name: detailFor.name || '', nik: detailFor.nik || '',
      tempat_lahir: f.tempat_lahir || '', tanggal_lahir: f.tanggal_lahir ? String(f.tanggal_lahir).slice(0, 10) : '',
      jenis_kelamin: f.jenis_kelamin || 'Laki-Laki', nama_ibu: f.nama_ibu || '',
      alamat_ktp: f.alamat_ktp || '', alamat_domisili: f.alamat_domisili || '',
      wa: detailFor.wa || '', email: f.email || '', pekerjaan: f.pekerjaan || '',
      bank: f.bank || '', no_rekening: f.no_rekening || '', nama_pemilik_rekening: f.nama_pemilik_rekening || '',
      perekrut_id: detailFor.perekrut_id || '', wilayah: detailFor.wilayah || '',
    });
    setEditMode(true);
    if (perekrutOptions.length === 0) {
      fetch('/api/referral-list').then(r => r.json())
        .then(d => setPerekrutOptions(d.perwakilan || []))
        .catch(() => {});
    }
  }

  function batalEdit() {
    setEditMode(false);
    setEditForm(null);
  }

  function bukaDetail(row) {
    setDetailFor(row);
    setEditMode(false);
    setEditForm(null);
  }

  async function simpanEdit() {
    setSaving(true);
    try {
      if (tipe === 'jamaah') {
        // jamaah_data itu array 1 booking bisa banyak orang — ambil dulu
        // array LENGKAP-nya, ganti cuma index orang ini, baru PATCH balik.
        // Kalau ditimpa langsung pakai array 1 elemen, jamaah lain di
        // booking yang sama bisa ke-drop.
        const getRes = await fetch(`/api/bookings/${detailFor.latest_booking_id}`);
        const getData = await getRes.json();
        if (!getRes.ok || !getData.booking) { alert(getData.error || 'Gagal memuat booking'); return; }
        const arr = Array.isArray(getData.booking.jamaah_data) ? [...getData.booking.jamaah_data] : [];
        arr[detailFor.latest_index] = editForm;
        const res = await fetch(`/api/bookings/${detailFor.latest_booking_id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jamaah_data: arr, form_filled: getData.booking.form_filled }),
        });
        const d = await res.json();
        if (!res.ok) { alert(d.error || 'Gagal menyimpan perubahan'); return; }
        setEditMode(false);
        setEditForm(null);
        setDetailFor(null);
        muatData();
        return;
      }

      const res = await fetch('/api/admin/users', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: detailFor.id, action: 'edit_data', fields: editForm }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan perubahan'); return; }
      setEditMode(false);
      setEditForm(null);
      setDetailFor(null);
      muatData();
    } catch {
      alert('Terjadi kesalahan saat menyimpan');
    } finally {
      setSaving(false);
    }
  }

  const tampil = urutkan(
    rows.filter(r => cocok(search, ...config.searchFields.map(f => r[f]))),
    sort.field, sort.dir
  );

  function toggleSort(field) {
    setSort(prev => ({ field, dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' }));
  }

  async function handleExport() {
    setExporting(true);
    try {
      await downloadExcel(config.exportType, config.exportParams);
    } catch (e) {
      alert(e.message || 'Terjadi kesalahan saat export data');
    } finally {
      setExporting(false);
    }
  }

  // Tabel gaya spreadsheet — border tiap sel, header sticky, biar rapi kayak Excel.
  // Diekstrak jadi fungsi krn tipe 'jamaah' butuh 2 tabel terpisah (sudah
  // berangkat vs belum clear), sementara tipe lain cuma 1.
  function renderTable(rowsForTable, key) {
    return (
      <div key={key} className="border border-gray-300 rounded-lg overflow-auto max-h-[75vh]">
        <table className="border-collapse text-sm min-w-full">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#0E2F6E] text-white text-xs">
              <th className="border border-[#0E2F6E] px-3 py-2 text-left w-10">#</th>
              {config.columns.map(c => (
                <SortTh key={c.key} field={c.key} sort={sort} onSort={toggleSort} align={c.align || 'left'}>
                  {c.label}
                </SortTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsForTable.length === 0 ? (
              <tr><td colSpan={config.columns.length + 1} className="border border-gray-200 px-4 py-8 text-center text-gray-400">Tidak ada data.</td></tr>
            ) : rowsForTable.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="border border-gray-200 px-3 py-2 text-gray-400">{i + 1}</td>
                {config.columns.map(c => (
                  <td key={c.key} className={`border border-gray-200 px-3 py-2 whitespace-nowrap text-${c.align || 'left'}`}>
                    {c.render ? c.render(r, { onShowHistory: setHistoryFor, onShowDetail: bukaDetail, onToggleStatus: toggleStatus, onDownloadIdCard: downloadIdCard, downloadingId, router, patchRow }) : c.format ? c.format(r[c.key]) : (r[c.key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Layout title={config.title} backHref="/admin?tab=dashboard">
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={config.searchPlaceholder}
          className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
        <button onClick={handleExport} disabled={exporting}
          className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-sm font-bold px-4 py-2.5 rounded-xl whitespace-nowrap">
          {exporting ? 'Menyiapkan...' : '⬇️ Export Excel'}
        </button>
      </div>

      <div className="text-xs text-gray-400 mb-2">{tampil.length} dari {rows.length} data</div>

      {config.splitGroups ? (
        <div className="space-y-8">
          {config.splitGroups.map(g => {
            const groupRows = tampil.filter(g.match);
            return (
              <div key={g.key}>
                <h3 className="font-bold text-[#0E2F6E] mb-2">{g.label} <span className="text-gray-400 font-normal">({groupRows.length})</span></h3>
                {renderTable(groupRows, g.key)}
              </div>
            );
          })}
        </div>
      ) : renderTable(tampil, 'main')}

      {/* Riwayat program 1 jamaah — dia bisa umroh berkali-kali, semua bookingnya kelihatan di sini */}
      {historyFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setHistoryFor(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[#0E2F6E]">🕌 Riwayat Program — {historyFor.name}</h3>
              <button onClick={() => setHistoryFor(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="space-y-2">
              {historyFor.programs.map((p, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-semibold text-[#0E2F6E]">{p.prog_name}</div>
                    <div className="text-xs text-gray-400">{p.booking_id} · Berangkat {p.tanggal_berangkat ? tgl(p.tanggal_berangkat) : 'belum ada tanggal'}</div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                    p.status_jamaah === 'Sudah Berangkat' ? 'bg-green-100 text-green-700'
                      : p.status_jamaah === 'Cancel Program' ? 'bg-red-100 text-red-600'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>{p.status_jamaah}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Detail formulir pendaftaran — semua field dari jamaah_data (booking terbaru) */}
      {detailFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setDetailFor(null); batalEdit(); }}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 gap-2">
              <h3 className="font-bold text-[#0E2F6E]">📋 Detail Formulir — {detailFor.name}</h3>
              <div className="flex items-center gap-2 shrink-0">
                {!editMode && (
                  <button onClick={mulaiEdit} className="text-xs font-bold text-[#1A4FA0] hover:underline whitespace-nowrap">✏️ Edit</button>
                )}
                <button onClick={() => { setDetailFor(null); batalEdit(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
            </div>

            {tipe === 'jamaah' && detailFor.wa && detailFor.wa !== '-' && (
              <TombolWA nomor={detailFor.wa}
                label="Kirim WA ke Jamaah"
                className="w-full mb-3 inline-flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-2 rounded-full"
                pesan={pesanReminderFormulir({
                  namaJamaah: detailFor.name,
                  progName: detailFor.programs?.[0]?.prog_name || '-',
                })}
              />
            )}
            {(() => {
              const f = detailFor.formulir || {};
              const Field = ({ label, value }) => (
                <div className="flex justify-between gap-3 py-1.5 border-b border-gray-100 text-sm">
                  <span className="text-gray-400 shrink-0">{label}</span>
                  <span className="font-semibold text-right">{value || '-'}</span>
                </div>
              );

              if (tipe === 'jamaah') return (
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase mt-3 mb-1">Data Pribadi</div>
                  <Field label="Nama Sesuai Paspor" value={f.nama} />
                  <Field label="No. Paspor" value={f.paspor} />
                  <Field label="Masa Berlaku Paspor" value={f.exp_mulai || f.exp_paspor ? `${tgl(f.exp_mulai)} s/d ${tgl(f.exp_paspor)}` : ''} />
                  <Field label="Tempat Keluar Paspor" value={f.tkp} />
                  <Field label="Tempat, Tanggal Lahir" value={f.tl || f.ttl ? `${f.tl || ''}${f.tl && f.ttl ? ', ' : ''}${f.ttl ? tgl(f.ttl) : ''}` : ''} />
                  <Field label="NIK" value={f.nik} />
                  <Field label="Jenis Kelamin" value={f.jk} />
                  <Field label="Alamat" value={f.alamat} />
                  <Field label="WhatsApp" value={f.wa} />
                  <Field label="Email" value={f.email} />
                  <Field label="Riwayat Penyakit" value={f.penyakit} />
                  <Field label="Pekerjaan" value={f.pkj} />

                  <div className="text-xs font-bold text-gray-400 uppercase mt-4 mb-1">Mahram / Pendamping</div>
                  <Field label="Nama Mahram" value={f.mahram} />
                  <Field label="Hubungan dengan Jamaah" value={f.hub_mahram} />

                  <div className="text-xs font-bold text-gray-400 uppercase mt-4 mb-1">Kontak Darurat</div>
                  <Field label="Nama" value={f.kdnama} />
                  <Field label="WhatsApp" value={f.kdwa} />
                  <Field label="Hubungan" value={f.kdhub} />

                  {DOC_FIELDS.some(([k]) => f[k]) && (
                    <>
                      <div className="text-xs font-bold text-gray-400 uppercase mt-4 mb-1">Dokumen Pendukung</div>
                      {DOC_FIELDS.filter(([k]) => f[k]).map(([k, label]) => (
                        <Field key={k} label={label} value={<a href={f[k]} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] hover:underline">📄 Lihat</a>} />
                      ))}
                    </>
                  )}

                  {!f.nama && (
                    <div className="text-xs text-gray-400 text-center mt-4">Formulir belum diisi untuk booking terbaru orang ini.</div>
                  )}
                  {/* Cetak formulir SENGAJA gak ada di sini — Database Jamaah
                      itu ringkasan 1 orang lintas program (dedup by NIK), beda
                      dari Manifest Jamaah yang per-program & per-keberangkatan
                      (detail programnya beda-beda). Cetak formulir cuma masuk
                      akal di Manifest (lihat /admin/manifest/[program]). */}
                </div>
              );

              // Mode edit — perwakilan aja (jamaah blm didukung, lihat task terpisah).
              if (editMode && editForm && tipe === 'jamaah') {
                const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm mb-2.5";
                const lbl = "block text-xs font-semibold text-gray-500 mb-1";
                const setE = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
                return (
                  <div>
                    <div className="text-xs font-bold text-gray-400 uppercase mb-1">Data Pribadi</div>
                    <label className={lbl}>Nama Sesuai Paspor</label>
                    <input value={editForm.nama} onChange={e => setE('nama', e.target.value)} className={inp} />
                    <label className={lbl}>No. Paspor</label>
                    <input value={editForm.paspor} onChange={e => setE('paspor', e.target.value)} className={inp} />
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className={lbl}>Masa Berlaku (Mulai)</label>
                        <input type="date" value={editForm.exp_mulai} onChange={e => setE('exp_mulai', e.target.value)} className={inp} /></div>
                      <div><label className={lbl}>Masa Berlaku (Akhir)</label>
                        <input type="date" value={editForm.exp_paspor} onChange={e => setE('exp_paspor', e.target.value)} className={inp} /></div>
                    </div>
                    <label className={lbl}>Tempat Keluar Paspor</label>
                    <input value={editForm.tkp} onChange={e => setE('tkp', e.target.value)} className={inp} />
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className={lbl}>Tempat Lahir</label>
                        <input value={editForm.tl} onChange={e => setE('tl', e.target.value)} className={inp} /></div>
                      <div><label className={lbl}>Tanggal Lahir</label>
                        <input type="date" value={editForm.ttl} onChange={e => setE('ttl', e.target.value)} className={inp} /></div>
                    </div>
                    <label className={lbl}>NIK</label>
                    <input value={editForm.nik} onChange={e => setE('nik', e.target.value.replace(/\D/g, '').slice(0, 16))} inputMode="numeric" className={inp} />
                    <label className={lbl}>Jenis Kelamin</label>
                    <select value={editForm.jk} onChange={e => setE('jk', e.target.value)} className={inp}>
                      <option>Laki-Laki</option><option>Perempuan</option>
                    </select>
                    <label className={lbl}>Alamat</label>
                    <input value={editForm.alamat} onChange={e => setE('alamat', e.target.value)} className={inp} />
                    <label className={lbl}>WhatsApp</label>
                    <input value={editForm.wa} onChange={e => setE('wa', e.target.value)} className={inp} />
                    <label className={lbl}>Email</label>
                    <input value={editForm.email} onChange={e => setE('email', e.target.value)} className={inp} />
                    <label className={lbl}>Riwayat Penyakit</label>
                    <input value={editForm.penyakit} onChange={e => setE('penyakit', e.target.value)} className={inp} />
                    <label className={lbl}>Pekerjaan</label>
                    <input value={editForm.pkj} onChange={e => setE('pkj', e.target.value)} className={inp} />

                    <div className="text-xs font-bold text-gray-400 uppercase mt-3 mb-1">Mahram / Pendamping</div>
                    <label className={lbl}>Nama Mahram</label>
                    <input value={editForm.mahram} onChange={e => setE('mahram', e.target.value)} className={inp} />
                    <label className={lbl}>Hubungan dengan Jamaah</label>
                    <input value={editForm.hub_mahram} onChange={e => setE('hub_mahram', e.target.value)} className={inp} />

                    <div className="text-xs font-bold text-gray-400 uppercase mt-3 mb-1">Kontak Darurat</div>
                    <label className={lbl}>Nama</label>
                    <input value={editForm.kdnama} onChange={e => setE('kdnama', e.target.value)} className={inp} />
                    <label className={lbl}>WhatsApp</label>
                    <input value={editForm.kdwa} onChange={e => setE('kdwa', e.target.value)} className={inp} />
                    <label className={lbl}>Hubungan</label>
                    <input value={editForm.kdhub} onChange={e => setE('kdhub', e.target.value)} className={inp} />

                    <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                      <button onClick={batalEdit} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold py-2 rounded-full">Batal</button>
                      <button onClick={simpanEdit} disabled={saving} className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold py-2 rounded-full">
                        {saving ? 'Menyimpan...' : '💾 Simpan'}
                      </button>
                    </div>
                  </div>
                );
              }

              if (editMode && editForm) {
                const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm mb-2.5";
                const lbl = "block text-xs font-semibold text-gray-500 mb-1";
                const setE = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
                return (
                  <div>
                    <div className="text-xs font-bold text-gray-400 uppercase mb-1">Data Pendaftaran</div>
                    <label className={lbl}>Nama</label>
                    <input value={editForm.name} onChange={e => setE('name', e.target.value)} className={inp} />
                    <label className={lbl}>NIK</label>
                    <input value={editForm.nik} onChange={e => setE('nik', e.target.value.replace(/\D/g, '').slice(0, 16))} inputMode="numeric" className={inp} />
                    <label className={lbl}>Tempat Lahir</label>
                    <input value={editForm.tempat_lahir} onChange={e => setE('tempat_lahir', e.target.value)} className={inp} />
                    <label className={lbl}>Tanggal Lahir</label>
                    <input type="date" value={editForm.tanggal_lahir} onChange={e => setE('tanggal_lahir', e.target.value)} className={inp} />
                    <label className={lbl}>Jenis Kelamin</label>
                    <select value={editForm.jenis_kelamin} onChange={e => setE('jenis_kelamin', e.target.value)} className={inp}>
                      <option>Laki-Laki</option><option>Perempuan</option>
                    </select>
                    <label className={lbl}>Nama Ibu Kandung</label>
                    <input value={editForm.nama_ibu} onChange={e => setE('nama_ibu', e.target.value)} className={inp} />
                    <label className={lbl}>Alamat KTP</label>
                    <input value={editForm.alamat_ktp} onChange={e => setE('alamat_ktp', e.target.value)} className={inp} />
                    <label className={lbl}>Alamat Domisili</label>
                    <input value={editForm.alamat_domisili} onChange={e => setE('alamat_domisili', e.target.value)} className={inp} />
                    {tipe === 'perwakilan' && (<>
                      <label className={lbl}>Wilayah</label>
                      <input value={editForm.wilayah} onChange={e => setE('wilayah', e.target.value)} className={inp} />
                    </>)}
                    <label className={lbl}>WhatsApp</label>
                    <input value={editForm.wa} onChange={e => setE('wa', e.target.value)} className={inp} />
                    <label className={lbl}>Email</label>
                    <input value={editForm.email} onChange={e => setE('email', e.target.value)} className={inp} />
                    <label className={lbl}>Pekerjaan</label>
                    <input value={editForm.pekerjaan} onChange={e => setE('pekerjaan', e.target.value)} className={inp} />
                    <label className={lbl}>Perekrut</label>
                    <select value={editForm.perekrut_id} onChange={e => setE('perekrut_id', e.target.value)} className={inp}>
                      <option value="">-- JM Travel (tidak ada perekrut) --</option>
                      {perekrutOptions.filter(o => o.id !== detailFor.id).map(o => (
                        <option key={o.id} value={o.id}>{o.name} ({o.kode_unik})</option>
                      ))}
                    </select>

                    <div className="text-xs font-bold text-gray-400 uppercase mt-3 mb-1">Rekening</div>
                    <label className={lbl}>Bank</label>
                    <input value={editForm.bank} onChange={e => setE('bank', e.target.value)} className={inp} />
                    <label className={lbl}>No. Rekening</label>
                    <input value={editForm.no_rekening} onChange={e => setE('no_rekening', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inp} />
                    <label className={lbl}>Nama Pemilik Rekening</label>
                    <input value={editForm.nama_pemilik_rekening} onChange={e => setE('nama_pemilik_rekening', e.target.value)} className={inp} />

                    <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                      <button onClick={batalEdit} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold py-2 rounded-full">Batal</button>
                      <button onClick={simpanEdit} disabled={saving} className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold py-2 rounded-full">
                        {saving ? 'Menyimpan...' : '💾 Simpan'}
                      </button>
                    </div>
                  </div>
                );
              }

              // Perwakilan — formulir pendaftaran + link SK BSI + surat
              // perjanjian kerjasama.
              return (
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase mt-3 mb-1">Data Pendaftaran</div>
                  <Field label="Nama" value={f.nama} />
                  <Field label="NIK" value={f.nik} />
                  <Field label="Tempat Lahir" value={f.tempat_lahir} />
                  <Field label="Tanggal Lahir" value={f.tanggal_lahir ? tgl(f.tanggal_lahir) : ''} />
                  <Field label="Jenis Kelamin" value={f.jenis_kelamin} />
                  <Field label="Nama Ibu Kandung" value={f.nama_ibu} />
                  <Field label="Alamat KTP" value={f.alamat_ktp} />
                  <Field label="Alamat Domisili" value={f.alamat_domisili} />
                  {f.kode_pos && <Field label="Kode Pos" value={f.kode_pos} />}
                  <Field label="WhatsApp" value={f.wa} />
                  <Field label="Email" value={f.email} />
                  <Field label="Pekerjaan" value={f.pekerjaan} />
                  <Field label="Perekrut" value={detailFor.perekrut_nama || 'JM Travel'} />

                  <div className="text-xs font-bold text-gray-400 uppercase mt-4 mb-1">Rekening</div>
                  <Field label="Bank" value={f.bank} />
                  <Field label="No. Rekening" value={f.no_rekening} />
                  <Field label="Nama Pemilik Rekening" value={f.nama_pemilik_rekening} />
                  {f.jadwal_kunjungan && <Field label="Jadwal Kunjungan" value={f.jadwal_kunjungan} />}
                  {f.metode && <Field label="Metode Pendaftaran" value={f.metode === 'paket' ? 'Kirim Paket' : 'Kunjungan Kantor'} />}

                  <div className="flex flex-col gap-2 mt-5 pt-4 border-t border-gray-100">
                    <button onClick={() => downloadIdCard(detailFor)} disabled={downloadingId === detailFor.id}
                      className="w-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 text-sm font-bold py-2 rounded-full">
                      {downloadingId === detailFor.id ? 'Memproses...' : '📇 Download ID Card'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </Layout>
  );
}
