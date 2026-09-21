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
  // Sinkron sama validasi PATCH /api/status-pendaftaran-sahabat action=advance.
  if (p.status === 'menunggu_sk_cif') {
    return [
      !p.spk_ak_selesai && 'SPK-AK',
      !p.cif_bsi && 'Nomor CIF',
      !p.setuju_sk_cif_pemblokiran_at && 'Baca & Setuju SK-CIF/Surat Blokir',
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
export default function AdminSahabatPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const { isAdminOrHop, isHop, checked: hopChecked } = useIsHop(user);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openCluster, setOpenCluster] = useState(null);
  const [detailUserId, setDetailUserId] = useState(null);
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
      if (!res.ok) { alert(d.error); setBusy(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
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
                <button key={p.id} onClick={() => setDetailUserId(p.user_id)}
                  className="w-full flex items-center justify-between bg-white/70 hover:bg-white rounded-lg px-3 py-2 text-left transition-colors">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#0E2F6E] truncate">{p.nama} <span className="text-gray-400 font-normal">({p.kode_unik})</span></div>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailUserId(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-bold text-[#0E2F6E] text-lg">{detail.nama}</div>
                <div className="text-xs text-gray-400">{detail.kode_unik} · Perekrut: {detail.perekrut_nama || '-'}</div>
              </div>
              <button onClick={() => setDetailUserId(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="space-y-2 text-xs">
              {/* Cuma 1 baris (dulu 2: "diunggah" + "diverifikasi" terpisah)
                  — sejak 2026-09-02 upload = otomatis langsung terverifikasi
                  (referral-only, gak ada gate admin di titik ini lagi, lihat
                  catatan di upload-bukti-tf/route.js), jadi "diverifikasi"
                  terpisah cuma bikin bingung (dikonfirmasi user 2026-09-19).
                  Tombol Verifikasi manual DIBIARKAN buat fallback baris lama
                  yang somehow masih nyangkut (lihat action 'verify_tf'). */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Bukti Transfer Rp1jt</span>
                {detail.bukti_tf_path ? (
                  <div className="flex items-center gap-2">
                    <a href={detail.bukti_tf_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">✅ Lihat</a>
                    {!detail.bukti_tf_verified_at && detail.status === 'pending' && !isHop && (
                      <button disabled={busy} onClick={() => aksi({ action: 'verify_tf', user_id: detail.user_id })}
                        className="text-[10px] font-bold text-white bg-green-600 px-3 py-1.5 rounded-full disabled:opacity-50">
                        Verifikasi
                      </button>
                    )}
                  </div>
                ) : <span className="text-red-500 font-bold">⏳ Belum diunggah</span>}
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>{detail.agama === 'non_islam' ? 'Surat Perjanjian Referral Non-Muslim' : 'SPK-AK'} selesai ditandatangani</span>
                {detail.spk_ak_selesai ? (
                  detail.spk_ak_doc_path ? (
                    <a href={detail.spk_ak_doc_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">✅ Lihat</a>
                  ) : <span className="text-green-600 font-bold">✅ Ya</span>
                ) : <span className="text-red-500 font-bold">⏳ Belum</span>}
              </div>
              {/* Rekening BSI Biasa dihapus (dikonfirmasi user 2026-09-03) —
                  Sahabat Baitullah cuma punya 1 rekening: Tabungan Umroh. */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Rekening Tabungan Umroh</span>
                {detail.no_rekening_tabungan_umroh ? (
                  <span className="text-green-600 font-bold">✅ {detail.no_rekening_tabungan_umroh}</span>
                ) : <span className="text-red-500 font-bold">⏳ Belum diisi jamaah</span>}
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Nomor CIF BSI</span>
                <span className={detail.cif_bsi ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{detail.cif_bsi || '⏳ Belum diisi'}</span>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Baca & Setuju SK-CIF/Surat Kuasa Blokir</span>
                {detail.setuju_sk_cif_pemblokiran_at ? (
                  <span className="text-green-600 font-bold">✅ Ya</span>
                ) : <span className="text-red-500 font-bold">⏳ Belum</span>}
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Scan SK-CIF (fisik + materai) <span className="text-gray-400 font-normal">— opsional, boleh nyusul</span></span>
                {detail.dokumen_sk_cif_fisik_path ? (
                  <a href={detail.dokumen_sk_cif_fisik_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">✅ Lihat</a>
                ) : <span className="text-red-500 font-bold">⏳ Belum</span>}
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Scan Surat Pernyataan Kuasa Blokir Rekening (fisik + materai) <span className="text-gray-400 font-normal">— opsional, boleh nyusul</span></span>
                {detail.dokumen_surat_pemblokiran_fisik_path ? (
                  <a href={detail.dokumen_surat_pemblokiran_fisik_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">✅ Lihat</a>
                ) : <span className="text-red-500 font-bold">⏳ Belum</span>}
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Dokumen CIF Fisik Diterima di Kantor</span>
                {isHop ? (
                  <span className={detail.dokumen_cif_fisik_diterima_at ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                    {detail.dokumen_cif_fisik_diterima_at ? '✅ Sudah' : '⏳ Belum'}
                  </span>
                ) : (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={!!detail.dokumen_cif_fisik_diterima_at} disabled={busy}
                      onChange={e => aksi({ action: 'toggle_cif_fisik', user_id: detail.user_id, value: e.target.checked })}
                      className="w-4 h-4 accent-[#1A4FA0]" />
                    Sudah
                  </label>
                )}
              </div>
            </div>

            {!isHop && (
              <div className="flex gap-2 pt-4">
                {detail.status === 'menunggu_sk_cif' && (
                  <button disabled={busy} onClick={() => aksi({ action: 'advance', user_id: detail.user_id, status_baru: 'active' })}
                    className="flex-1 bg-[#1A4FA0] text-white font-bold py-2.5 rounded-full disabled:opacity-50 text-sm">
                    ACC & Aktifkan Jamaah Sahabat Baitullah →
                  </button>
                )}
                {detail.status !== 'active' && detail.status !== 'ditolak' && (
                  <button disabled={busy} onClick={() => { if (confirm('Tolak pendaftaran ini?')) aksi({ action: 'reject', user_id: detail.user_id }); }}
                    className="bg-gray-100 text-gray-500 font-bold px-4 py-2.5 rounded-full disabled:opacity-50 text-sm">
                    Tolak
                  </button>
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
