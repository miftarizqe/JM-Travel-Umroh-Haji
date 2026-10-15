'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useIsHop } from '@/lib/useIsHop';

// Urutan proses pendaftaran s.d. aktif (SAMA PERSIS STEP_PENDAFTARAN_SAHABAT
// di /api/status-pendaftaran-sahabat/route.js — jangan diubah sendiri2,
// urutan+syarat advance ditentukan di situ, halaman ini cuma nampilin).
// `syarat` = daftar prasyarat yang DICEK SERVER pas admin klik "lanjut" ke
// step ini — ditampilkan sebagai chip "Menunggu: ..." biar admin gak baru
// tau blocker-nya setelah klik & kena error.
//
// Halaman ini SENGAJA cuma 2 tahap funnel (pending/menunggu_sk_cif) — step
// 'menunggu_bsi' DIHAPUS (2026-09-19, gerbang toggle admin akun_bsi_status/
// tabungan_haji_status dicabut, jamaah langsung isi CIF+data blokir begitu
// TF terverifikasi). 'active'/'ditolak' dkk (Riwayat, Closing Langsung,
// Closing Referral, Siap Berangkat, Voucher ACC, Ujroh Belum Diajukan)
// SEMUA PINDAH ke dashboard admin utama /admin (dikonfirmasi user
// 2026-09-06): "Pendaftaran" cuma buat akun yang BELUM aktif & butuh
// tindak lanjut, sisanya digabung 1 tempat di dashboard biar gak perlu cek
// satu-satu section.
const PROSES = [
  // 'pending' BUKAN LAGI perlu-tindakan-admin (2026-09-02) — TF auto-verify
  // begitu jamaah upload (referral-only = lebih dipercaya, lihat
  // upload-bukti-tf/route.js), jadi orang di tahap ini murni nunggu
  // JAMAAH sendiri unggah, bukan nunggu admin klik apa pun.
  { key: 'pending', icon: '📝', color: 'border-gray-200 bg-gray-50', label: 'Menunggu Upload Bukti TF' },
  { key: 'menunggu_sk_cif', icon: '📜', color: 'border-purple-200 bg-purple-50', label: 'Menunggu ACC Admin' },
];

function syaratBelum(p) {
  // Sinkron sama validasi PATCH /api/status-pendaftaran-sahabat action=advance
  // ke 'active' (dan badge /admin/sahabat di /api/admin/sidebar-badges).
  // TTD fisik Surat Perjanjian SENGAJA bukan syarat — nyusul setelah aktif
  // (SPK_AK_SEMENTARA_FISIK), yang wajib cuma jamaah udah SETUJU (/pks).
  if (p.status === 'menunggu_sk_cif') {
    return [
      !p.setuju_pks && 'Setuju Surat Perjanjian Jamaah Sahabat Baitullah',
      !p.bukti_tf_verified_at && 'Bukti TF',
      !p.no_rekening_tabungan_umroh && !p.bantuan_bsi_manual_disetujui_at && 'Rekening Tabungan Umroh',
      !p.setuju_sk_cif_pemblokiran_at && 'Baca & Setuju SK-CIF/Surat Blokir',
      !p.diajukan_at && 'Jamaah klik "Kirim Pendaftaran"',
    ].filter(Boolean);
  }
  if (p.status === 'pending') {
    return [!p.bukti_tf_path && 'Bukti TF'].filter(Boolean);
  }
  return [];
}

// Pendaftaran = dashboard REMINDER per tahap proses (bukan list per-nama) —
// dikelompokkan per status ala widget "🔴 Perlu Perhatian" di dashboard
// admin utama (src/app/admin/page.jsx, kotak pastel + badge count), biar
// gaya konsisten se-aplikasi. Klik nama BUKA POPUP detail+aksi orang itu
// (bukan pindah halaman) — halaman ini murni buat hal yang butuh aksi
// admin/super_admin. Profil lengkap (read-only, gak butuh aksi) ada di
// Database Jamaah. Direstruktur 2026-08-29, dipangkas lagi 2026-09-06.
// Pilihan alasan "Minta Perbaiki" (dikonfirmasi user 2026-10-14: pilih dari
// dropdown, bukan ketik bebas) — teksnya langsung dikirim ke jamaah lewat
// notifikasi & banner status pendaftaran, jadi ditulis buat dibaca jamaah.
const ALASAN_PERBAIKAN = [
  'Data diri tidak sesuai KTP',
  'Foto/scan KTP tidak jelas atau tidak valid',
  'Data atau scan paspor tidak sesuai',
  'Alamat belum lengkap atau tidak sesuai',
  'Bukti transfer Rp1.000.000 tidak valid',
  'Nomor/nama pemilik Rekening Tabungan Umroh tidak sesuai',
  'Dokumen (Surat Perjanjian / SK-CIF / Surat Pemblokiran) belum lengkap atau salah',
];
const ALASAN_LAINNYA = '__lainnya__';

export default function AdminSahabatPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const { isAdminOrHop, isHop, checked: hopChecked } = useIsHop(user);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openCluster, setOpenCluster] = useState(null);
  const [detailUserId, setDetailUserId] = useState(null);
  // Alur tombol "Tolak" di modal detail: null -> 'pilih' (Minta Perbaiki /
  // Tolak Permanen) -> 'perbaiki' (dropdown alasan) | 'permanen' (yakin?).
  const [modeTolak, setModeTolak] = useState(null);
  const [alasanPilih, setAlasanPilih] = useState('');
  const [alasanLain, setAlasanLain] = useState('');
  const [keteranganTambahan, setKeteranganTambahan] = useState('');
  function resetTolak() {
    setModeTolak(null); setAlasanPilih(''); setAlasanLain(''); setKeteranganTambahan('');
  }
  function bukaDetail(userId) {
    resetTolak();
    setDetailUserId(userId);
  }
  // Link referral admin/super_admin sendiri — buat ngerekrut jamaah jadi
  // Sahabat Baitullah baru langsung dari panel, tanpa lewat link anggota
  // aktif (dikonfirmasi user 2026-09-19, mirror punya perwakilan/anggota).
  const [kodeInvite, setKodeInvite] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  function muat() {
    fetch('/api/admin/sahabat').then(r => r.json()).then(d => {
      setList(d.pendaftaran || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user || !hopChecked) return;
    if (!isAdminOrHop) { router.replace('/login'); return; }
    muat();
    if (user.role === 'admin' || user.role === 'super_admin') {
      fetch('/api/admin/kode-invite?tipe=sahabat_baitullah').then(r => r.json())
        .then(d => setKodeInvite(d.kode || '')).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hopChecked, isAdminOrHop]);

  const linkInvite = (typeof window !== 'undefined' && kodeInvite)
    ? `${window.location.origin}/register?role=sahabat_baitullah&ref=${kodeInvite}` : '';
  function salinLinkInvite() {
    navigator.clipboard.writeText(linkInvite).then(() => { setCopiedInvite(true); setTimeout(() => setCopiedInvite(false), 2000); });
  }

  async function aksi(body) {
    setBusy(true);
    try {
      const res = await fetch('/api/status-pendaftaran-sahabat', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusy(false); return false; }
      muat();
      setBusy(false);
      return true;
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
    return false;
  }

  // "Minta Perbaiki" = tolak tapi jamaah tetap bisa login & isi ulang data
  // diri (dikonfirmasi user 2026-10-11); "Tolak Permanen" ngeblok login
  // (akun spam/palsu). Dua-duanya sekarang di balik 1 tombol "Tolak"
  // (dikonfirmasi user 2026-10-14) — lihat modeTolak.
  async function kirimMintaPerbaikan(j) {
    const alasan = alasanPilih === ALASAN_LAINNYA ? alasanLain.trim() : alasanPilih;
    if (!alasan) { alert('Pilih alasan dulu supaya jamaah tahu apa yang harus diperbaiki.'); return; }
    const tambahan = keteranganTambahan.trim();
    const catatan = tambahan ? `${alasan} — ${tambahan}` : alasan;
    if (await aksi({ action: 'minta_perbaikan', user_id: j.user_id, catatan_admin: catatan })) resetTolak();
  }
  async function kirimTolakPermanen(j) {
    const tambahan = keteranganTambahan.trim();
    if (await aksi({ action: 'reject', user_id: j.user_id, catatan_admin: tambahan || undefined })) resetTolak();
  }

  // Admin unggah scan dokumen fisik yang udah diterima di kantor -- endpoint
  // upload-dokumen-sahabat-fisik dari awal udah ngebolehin admin, cuma
  // tombolnya belum ada di sini (ketemu user 2026-10-09).
  async function unggahScan(jenis, userId, file) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('user_id', userId);
      fd.append('jenis', jenis);
      const res = await fetch('/api/admin/upload-dokumen-sahabat-fisik', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal mengunggah dokumen'); setBusy(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setBusy(false);
  }

  const kelompok = useMemo(() => {
    const m = Object.fromEntries(PROSES.map(p => [p.key, []]));
    for (const p of list) { if (m[p.status]) m[p.status].push(p); }
    return m;
  }, [list]);

  const detail = useMemo(() => list.find(p => p.user_id === detailUserId) || null, [list, detailUserId]);

  if (!user || !hopChecked || !isAdminOrHop) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const totalButuhTindakan = PROSES.reduce((s, p) => s + kelompok[p.key].length, 0);

  function ClusterBox({ proses }) {
    const rows = kelompok[proses.key];
    const isOpen = openCluster === proses.key;
    const badgeMerah = rows.length > 0;
    return (
      <div className={`border ${proses.color} rounded-xl overflow-hidden`}>
        <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setOpenCluster(isOpen ? null : proses.key)}>
          <div className="font-bold text-gray-700 text-sm">{proses.icon} {proses.label}</div>
          <span className={`text-xs font-black px-2 py-1 rounded-full ${badgeMerah ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
            {rows.length}
          </span>
        </div>
        {isOpen && (
          <div className="px-4 pb-4 space-y-1.5">
            {rows.length === 0 ? (
              <div className="text-xs text-gray-400">Gak ada yang di tahap ini.</div>
            ) : rows.map(p => {
              const kurang = syaratBelum(p);
              return (
                <button key={p.id} onClick={() => bukaDetail(p.user_id)}
                  className="w-full flex items-center justify-between bg-white/70 hover:bg-white rounded-lg px-3 py-2 text-left transition-colors">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#0E2F6E] truncate">{p.nama}{p.kode_unik && <span className="text-gray-400 font-normal"> ({p.kode_unik})</span>}</div>
                    {kurang.length > 0 && (
                      <div className="text-[10px] text-red-500 mt-0.5">Menunggu: {kurang.join(', ')}</div>
                    )}
                  </div>
                  <span className="text-gray-300 text-xs shrink-0">Detail →</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Layout title="🪪 Pendaftaran Sahabat Baitullah" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Reminder per tahap proses pendaftaran Program Sahabat Baitullah, sampai aktif jadi Jamaah Sahabat Baitullah. Klik nama buat buka detail &amp; aksi. Profil lengkap, riwayat closing, saldo, &amp; voucher ada di{' '}
        <a href="/admin/sahabat/database" className="text-[#1A4FA0] font-semibold hover:underline">Database Jamaah</a> dan{' '}
        <a href="/admin?tab=dashboard" className="text-[#1A4FA0] font-semibold hover:underline">Dashboard Admin</a>.
      </div>

      {(user.role === 'admin' || user.role === 'super_admin') && (
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 mb-4">
          <div className="font-bold text-[#0E2F6E] mb-1 text-sm">🔗 Link Referral — Rekrut Jamaah Sahabat Baitullah</div>
          <div className="text-xs text-gray-400 mb-2">Bagikan link ini ke jamaah yang mau daftar jadi Sahabat Baitullah langsung dari kantor, tanpa lewat link anggota aktif.</div>
          <div className="flex gap-2">
            <input readOnly value={linkInvite} placeholder="Memuat..." className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-100 bg-gray-50 text-xs text-gray-500" />
            <button onClick={salinLinkInvite} disabled={!linkInvite} className="bg-[#1A4FA0] text-white text-xs font-bold px-4 rounded-lg disabled:opacity-50">
              {copiedInvite ? '✓' : 'Salin'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : totalButuhTindakan === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
          Gak ada pendaftaran yang butuh tindak lanjut.
        </div>
      ) : (
        <div className="space-y-3">
          {PROSES.map(proses => <ClusterBox key={proses.key} proses={proses} />)}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => bukaDetail(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-bold text-[#0E2F6E] text-lg">{detail.nama}</div>
                <div className="text-xs text-gray-500">{detail.kode_unik}</div>
                <div className="inline-flex items-center gap-2 mt-2 bg-[#C9952A]/10 border border-[#C9952A] rounded-lg px-3 py-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9952A]">🤝 Perekrut</span>
                  <span className="text-sm font-bold text-[#0E2F6E]">{detail.perekrut_nama || '-'}</span>
                </div>
              </div>
              <button onClick={() => bukaDetail(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="space-y-2 text-xs">
              {/* Semua dokumen & aksi pendaftaran digabung di 1 tempat ini
                  (dikonfirmasi user 2026-10-08, sebelumnya mencar-car: cetak
                  dokumen lewat halaman/endpoint terpisah) -- tombol ini
                  nge-generate PDF gabungan SPK-AK+SK-CIF+Pemblokiran (+
                  Formulir BSI kalau relevan) punya ORANG INI, admin boleh
                  buka punya siapa aja lewat ?user_id= (lihat
                  /api/sahabat/dokumen-legal/unduh-lengkap). */}
              {/* HoP gak punya akses ke dokumen pribadi/legal sama sekali
                  (ditegakkan server di /api/dokumen/[...slug] & endpoint
                  unduh-lengkap -- klik link ini bakal 403 buat HoP), jadi
                  tombol cetak & link "Lihat" DIHILANGKAN TOTAL buat HoP
                  (dikonfirmasi user 2026-10-12), ganti checklist status
                  doang kayak item lain di bawah. */}
              {!isHop && (
              <button onClick={() => window.open(`/api/sahabat/dokumen-legal/unduh-lengkap?user_id=${detail.user_id}`, '_blank')}
                className="w-full text-xs font-bold text-white bg-[#1A4FA0] py-2.5 rounded-lg">
                🖨️ Lihat &amp; Cetak Dokumen Lengkap (SPK-AK, SK-CIF, Surat Pemblokiran{detail.bantuan_bsi_manual_disetujui_at ? ', Formulir BSI' : ''})
              </button>
              )}
              {/* KTP wajib diunggah pas daftar-sahabat, Paspor opsional --
                  sebelumnya gak ada link buka keduanya sama sekali di admin
                  (ditemukan user 2026-10-08). */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>KTP</span>
                {isHop ? (
                  <span className={detail.foto_ktp_path ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                    {detail.foto_ktp_path ? '✅ Sudah' : '⏳ Belum diunggah'}
                  </span>
                ) : detail.foto_ktp_path ? (
                  <a href={detail.foto_ktp_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">✅ Lihat</a>
                ) : <span className="text-red-500 font-bold">⏳ Belum diunggah</span>}
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Paspor</span>
                {isHop ? (
                  <span className={detail.foto_paspor_path ? 'text-green-600 font-bold' : 'text-gray-400'}>
                    {detail.foto_paspor_path ? '✅ Sudah' : '- (opsional)'}
                  </span>
                ) : detail.foto_paspor_path ? (
                  <a href={detail.foto_paspor_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">✅ Lihat</a>
                ) : <span className="text-gray-400">- (opsional)</span>}
              </div>
              {/* Cuma 1 baris (dulu 2: "diunggah" + "diverifikasi" terpisah)
                  — sejak 2026-09-02 upload = otomatis langsung terverifikasi
                  (referral-only, gak ada gate admin di titik ini lagi, lihat
                  catatan di upload-bukti-tf/route.js), jadi "diverifikasi"
                  terpisah cuma bikin bingung (dikonfirmasi user 2026-09-19).
                  Tombol Verifikasi manual DIBIARKAN buat fallback baris lama
                  yang somehow masih nyangkut (lihat action 'verify_tf'). */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Bukti Transfer Rp1jt</span>
                {isHop ? (
                  <span className={detail.bukti_tf_path ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                    {detail.bukti_tf_path ? '✅ Sudah' : '⏳ Belum diunggah'}
                  </span>
                ) : detail.bukti_tf_path ? (
                  <div className="flex items-center gap-2">
                    <a href={detail.bukti_tf_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">✅ Lihat</a>
                    {!detail.bukti_tf_verified_at && detail.status === 'pending' && (
                      <button disabled={busy} onClick={() => aksi({ action: 'verify_tf', user_id: detail.user_id })}
                        className="text-[10px] font-bold text-white bg-green-600 px-3 py-1.5 rounded-full disabled:opacity-50">
                        Verifikasi
                      </button>
                    )}
                  </div>
                ) : <span className="text-red-500 font-bold">⏳ Belum diunggah</span>}
              </div>
              {/* Dulu nampilin spk_ak_selesai (TTD FISIK) di sini — bikin
                  bingung (dikonfirmasi user 2026-10-09): jamaah yang udah
                  SETUJU (syarat ACC beneran, lihat syaratBelum() di atas &
                  validasi action=advance di /api/status-pendaftaran-sahabat)
                  keliatan "⏳ Belum" karena TTD fisiknya emang sengaja boleh
                  nyusul (SPK_AK_SEMENTARA_FISIK). Sekarang disamain posisi &
                  isinya sama kayak "Baca & Setuju SK-CIF/Surat Kuasa Blokir"
                  di bawah -- status TTD fisiknya sendiri tetap ada, di
                  checklist "Dokumen Fisik ... Diterima di Kantor" bareng
                  SK-CIF & Surat Pemblokiran. */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Baca & Setuju {detail.agama === 'non_islam' ? 'Surat Perjanjian Referral Non-Muslim' : 'Surat Perjanjian Jamaah Sahabat Baitullah'}</span>
                {detail.setuju_pks ? (
                  <span className="text-green-600 font-bold">✅ Ya</span>
                ) : <span className="text-red-500 font-bold">⏳ Belum</span>}
              </div>
              {/* Rekening BSI Biasa dihapus (dikonfirmasi user 2026-09-03) —
                  Sahabat Baitullah cuma punya 1 rekening: Tabungan Umroh. */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Rekening Tabungan Umroh</span>
                {detail.no_rekening_tabungan_umroh ? (
                  <span className="text-green-600 font-bold">
                    ✅ {isHop ? 'Sudah diisi' : detail.no_rekening_tabungan_umroh}
                  </span>
                ) : detail.bantuan_bsi_manual_disetujui_at ? (
                  <span className="text-amber-600 font-bold">🏦 Dibantu BSI manual</span>
                ) : <span className="text-red-500 font-bold">⏳ Belum diisi jamaah</span>}
              </div>
              {/* Checklist "udah submit Formulir Pendaftaran Rekening BSI ke
                  bank" — cuma relevan selama rekeningnya sendiri belum jadi
                  (ditemukan user 2026-10-08, sebelumnya gak ada cara admin
                  nandain progres pengajuan manual ini). Informasional,
                  mirror pola 3 checkbox "Dokumen Fisik...Diterima" di bawah. */}
              {!detail.no_rekening_tabungan_umroh && (
                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                  <span>Formulir Pendaftaran Rekening BSI Disubmit ke Bank</span>
                  {isHop ? (
                    <span className={detail.formulir_bsi_disubmit_at ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                      {detail.formulir_bsi_disubmit_at ? '✅ Sudah' : '⏳ Belum'}
                    </span>
                  ) : (
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={!!detail.formulir_bsi_disubmit_at} disabled={busy}
                        onChange={e => aksi({ action: 'toggle_formulir_bsi_disubmit', user_id: detail.user_id, value: e.target.checked })}
                        className="w-4 h-4 accent-[#1A4FA0]" />
                      Sudah
                    </label>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Baca & Setuju SK-CIF/Surat Kuasa Blokir</span>
                {detail.setuju_sk_cif_pemblokiran_at ? (
                  <span className="text-green-600 font-bold">✅ Ya</span>
                ) : <span className="text-red-500 font-bold">⏳ Belum</span>}
              </div>
              {/* Scan-upload gak lagi jadi sinyal utama (opsional, boleh
                  nyusul) — diganti 3 checkbox "diterima di kantor" per
                  dokumen (dikonfirmasi user 2026-10-03), mirror pola
                  dokumen_cif_fisik_diterima_at yang udah ada. Cuma relevan
                  buat metode 'kirim' — 'kantor' gak butuh ini sama sekali,
                  dokumennya diserahkan & ditandatangani langsung di tempat. */}
              {/* Jamaah konfirmasi sendiri "sudah kirim" (resi+tanggal) --
                  info doang, BUKAN syarat, admin tetep yang nentuin
                  "diterima" lewat checklist di bawah (dikonfirmasi user
                  2026-10-08). */}
              {detail.metode_ttd_sahabat === 'kirim' && detail.dokumen_fisik_dikirim_at && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-[10px] text-[#1A4FA0]">
                  📦 Jamaah konfirmasi sudah kirim pada {new Date(detail.dokumen_fisik_dikirim_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {detail.dokumen_fisik_resi && <> · Resi: <b>{detail.dokumen_fisik_resi}</b></>}
                  {detail.dokumen_fisik_resi_foto_path && <> · <a href={detail.dokumen_fisik_resi_foto_path} target="_blank" rel="noopener noreferrer" className="font-bold underline hover:text-[#0E2F6E]">Lihat foto resi</a></>}
                </div>
              )}
              {detail.metode_ttd_sahabat === 'kirim' && [
                { label: 'Dokumen Fisik Surat Perjanjian Jamaah Sahabat Baitullah Diterima di Kantor', field: 'dokumen_spk_ak_fisik_diterima_at', action: 'toggle_spk_ak_fisik', jenis: 'spk_ak', scanPath: detail.dokumen_spk_ak_fisik_path },
                { label: 'Dokumen Fisik SK-CIF Diterima di Kantor', field: 'dokumen_cif_fisik_diterima_at', action: 'toggle_cif_fisik', jenis: 'sk_cif', scanPath: detail.dokumen_sk_cif_fisik_path },
                { label: 'Dokumen Fisik Surat Pemblokiran Diterima di Kantor', field: 'dokumen_pemblokiran_fisik_diterima_at', action: 'toggle_pemblokiran_fisik', jenis: 'surat_pemblokiran', scanPath: detail.dokumen_surat_pemblokiran_fisik_path },
                // Dokumen ke-4 cuma relevan buat jamaah yang juga setuju
                // bantuan BSI manual -- bundelnya 4 dokumen, bukan 3
                // (dikonfirmasi user 2026-10-08). jenis/scanPath sempat
                // null (dikonfirmasi user 2026-10-09, link "Unggah scan"
                // kosong) -- dibenerin sejajar 3 dokumen lain, lihat
                // migration 217 + JENIS_KOLOM.formulir_bsi.
                ...(detail.bantuan_bsi_manual_disetujui_at ? [
                  { label: 'Dokumen Fisik Formulir Pendaftaran Rekening BSI Diterima di Kantor', field: 'dokumen_formulir_bsi_fisik_diterima_at', action: 'toggle_formulir_bsi_fisik', jenis: 'formulir_bsi', scanPath: detail.dokumen_formulir_bsi_fisik_path },
                ] : []),
              ].map(({ label, field, action, jenis, scanPath }) => (
                <div key={field} className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                  <span>{label}{scanPath && (
                    <a href={scanPath} target="_blank" rel="noopener noreferrer" className="ml-1.5 text-[#1A4FA0] underline whitespace-nowrap">(lihat scan)</a>
                  )}
                  {!isHop && jenis && (
                    <label className={`ml-1.5 text-[#C9952A] font-bold underline whitespace-nowrap ${busy ? 'opacity-50' : 'cursor-pointer'}`}>
                      {scanPath ? '(ganti scan)' : '📎 Unggah scan'}
                      <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" disabled={busy}
                        onChange={e => { unggahScan(jenis, detail.user_id, e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                  )}</span>
                  {isHop ? (
                    <span className={detail[field] ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                      {detail[field] ? '✅ Sudah' : '⏳ Belum'}
                    </span>
                  ) : (
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={!!detail[field]} disabled={busy}
                        onChange={e => aksi({ action, user_id: detail.user_id, value: e.target.checked })}
                        className="w-4 h-4 accent-[#1A4FA0]" />
                      Sudah
                    </label>
                  )}
                </div>
              ))}
            </div>

            {detail.perbaikan_diminta_at && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                ↺ Menunggu jamaah memperbaiki data{detail.catatan_admin ? ` — ${detail.catatan_admin}` : ''}
              </div>
            )}
            {detail.status === 'menunggu_sk_cif' && !detail.perbaikan_diminta_at && !detail.diajukan_at && (
              <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
                ⏳ Jamaah belum klik &quot;Kirim Pendaftaran&quot; — isiannya masih draft & bisa berubah.
              </div>
            )}
            {!isHop && detail.status !== 'active' && detail.status !== 'ditolak' && (
              <div className="pt-4 space-y-2">
                {!modeTolak && (
                  <div className="flex items-center gap-1.5">
                    {detail.status === 'menunggu_sk_cif' && !detail.perbaikan_diminta_at && detail.diajukan_at && (
                      <button disabled={busy} onClick={() => aksi({ action: 'advance', user_id: detail.user_id, status_baru: 'active' })}
                        className="flex-1 whitespace-nowrap bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold px-2 py-1.5 rounded-full disabled:opacity-50 text-[11px] transition-colors">
                        ✅ ACC & Aktifkan
                      </button>
                    )}
                    <button disabled={busy} onClick={() => setModeTolak(detail.perbaikan_diminta_at ? 'permanen' : 'pilih')}
                      className="flex-1 whitespace-nowrap bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold px-2 py-1.5 rounded-full disabled:opacity-50 text-[11px] transition-colors">
                      ✖ Tolak
                    </button>
                  </div>
                )}

                {modeTolak === 'pilih' && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-bold text-[#0E2F6E]">Tolak pendaftaran {detail.nama}?</div>
                    <button disabled={busy} onClick={() => setModeTolak('perbaiki')}
                      className="w-full text-left bg-white hover:bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 disabled:opacity-50 transition-colors">
                      <div className="text-xs font-bold text-amber-700">↺ Minta Perbaiki</div>
                      <div className="text-[10px] text-gray-500">Jamaah tetap bisa login &amp; progresnya tidak hilang, tinggal perbaiki data yang salah.</div>
                    </button>
                    <button disabled={busy} onClick={() => setModeTolak('permanen')}
                      className="w-full text-left bg-white hover:bg-red-50 border border-red-200 rounded-lg px-3 py-2 disabled:opacity-50 transition-colors">
                      <div className="text-xs font-bold text-red-600">⛔ Tolak Permanen</div>
                      <div className="text-[10px] text-gray-500">Akun tidak bisa login lagi — untuk akun spam/palsu.</div>
                    </button>
                    <button onClick={resetTolak} className="w-full text-[11px] text-gray-500 font-bold py-1 hover:underline">Batal</button>
                  </div>
                )}

                {modeTolak === 'perbaiki' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-bold text-amber-800">↺ Minta {detail.nama} memperbaiki data</div>
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-1">Alasan <span className="text-red-500">*</span></label>
                      <select value={alasanPilih} onChange={e => setAlasanPilih(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs bg-white">
                        <option value="">— Pilih alasan —</option>
                        {ALASAN_PERBAIKAN.map(a => <option key={a} value={a}>{a}</option>)}
                        <option value={ALASAN_LAINNYA}>Lainnya (tulis sendiri)</option>
                      </select>
                    </div>
                    {alasanPilih === ALASAN_LAINNYA && (
                      <input value={alasanLain} onChange={e => setAlasanLain(e.target.value)} placeholder="Tulis alasannya..."
                        className="w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs" />
                    )}
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-1">Keterangan tambahan (opsional)</label>
                      <textarea value={keteranganTambahan} onChange={e => setKeteranganTambahan(e.target.value)} rows={2}
                        placeholder="Mis. nama di KTP beda ejaan dengan yang diisi"
                        className="w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs" />
                    </div>
                    <div className="flex gap-1.5">
                      <button disabled={busy} onClick={() => setModeTolak('pilih')}
                        className="flex-1 bg-white border border-gray-200 text-gray-500 font-bold py-1.5 rounded-full text-[11px] disabled:opacity-50">← Kembali</button>
                      <button disabled={busy || !alasanPilih || (alasanPilih === ALASAN_LAINNYA && !alasanLain.trim())} onClick={() => kirimMintaPerbaikan(detail)}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-1.5 rounded-full text-[11px] disabled:opacity-50 transition-colors">
                        {busy ? 'Mengirim...' : 'Kirim Permintaan Perbaikan'}
                      </button>
                    </div>
                  </div>
                )}

                {modeTolak === 'permanen' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-bold text-red-700">⛔ Yakin tolak permanen pendaftaran {detail.nama}?</div>
                    <div className="text-[11px] text-red-700">
                      Akun ini <b>tidak akan bisa login lagi</b> dan tidak bisa dibatalkan dari sini. Pakai hanya untuk akun spam/palsu —
                      kalau datanya cuma ada yang salah, pilih &quot;Minta Perbaiki&quot;.
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-1">Alasan (opsional)</label>
                      <textarea value={keteranganTambahan} onChange={e => setKeteranganTambahan(e.target.value)} rows={2}
                        className="w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-red-400 focus:outline-none text-xs bg-white" />
                    </div>
                    <div className="flex gap-1.5">
                      <button disabled={busy} onClick={() => (detail.perbaikan_diminta_at ? resetTolak() : setModeTolak('pilih'))}
                        className="flex-1 bg-white border border-gray-200 text-gray-500 font-bold py-1.5 rounded-full text-[11px] disabled:opacity-50">Tidak, Batal</button>
                      <button disabled={busy} onClick={() => kirimTolakPermanen(detail)}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 rounded-full text-[11px] disabled:opacity-50 transition-colors">
                        {busy ? 'Memproses...' : 'Ya, Tolak Permanen'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <a href="/admin/sahabat/database" className="block text-center text-xs text-[#1A4FA0] font-semibold hover:underline mt-3">
              Lihat profil &amp; riwayat saldo lengkap di Database Jamaah →
            </a>
          </div>
        </div>
      )}
    </Layout>
  );
}
