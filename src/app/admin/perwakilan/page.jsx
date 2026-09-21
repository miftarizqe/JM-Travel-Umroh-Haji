'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

// Urutan proses pendaftaran perwakilan s.d. aktif — SAMA PERSIS
// pathUntukMetode()/STEP_PENDAFTARAN di /api/status-pendaftaran/route.js,
// jangan diubah sendiri2 di sini. `jalur` membatasi step ke metode
// pendaftaran tertentu (kantor/paket) — dua-duanya share `pending` & `active`.
//
// Halaman ini SENGAJA cuma nampilin tahap yang BELUM aktif (dikonfirmasi
// user 2026-09-06) — 'active'/'ditolak' (dulu section "Riwayat") DIHAPUS
// dari sini, gak dipindah kemanapun (beda dari Sahabat Baitullah yang punya
// closing/saldo/voucher buat dipindah ke dashboard) — akun aktif udah keliatan
// di Database Perwakilan, ditolak gak butuh tindak lanjut apa pun lagi.
const PROSES = [
  { key: 'pending', icon: '📝', color: 'border-gray-200 bg-gray-50', label: 'Verifikasi Data oleh Admin' },
  { key: 'waiting_visit', icon: '🏢', color: 'border-blue-200 bg-blue-50', label: 'Menunggu Kunjungan Kantor', jalur: 'kantor' },
  { key: 'docs_sent', icon: '📦', color: 'border-blue-200 bg-blue-50', label: 'Perjanjian Dikirim ke Alamat', jalur: 'paket' },
  { key: 'waiting_docs_return', icon: '📮', color: 'border-purple-200 bg-purple-50', label: 'Menunggu Rangkapan Dikirim Kembali', jalur: 'paket' },
];
// pathUntukMetode() butuh tau urutan LENGKAP termasuk 'active' buat nentuin
// step selanjutnya yang valid — dipisah dari PROSES (yang cuma buat render
// cluster) biar 'active' gak ikut ke-render sebagai cluster tapi tetap bisa
// dihitung sebagai tujuan "Aktifkan".
const SEMUA_STEP = [...PROSES, { key: 'active', label: '✅ Aktifkan' }];

// Jalur applicant sendiri (kantor ATAU paket) — dipakai nentuin step
// SELANJUTNYA yang valid, sama persis pathUntukMetode() di API. `pending`
// dan `active` dipakai kedua jalur.
function pathUntukMetode(metode) {
  const keys = metode === 'paket'
    ? ['pending', 'docs_sent', 'waiting_docs_return', 'active']
    : ['pending', 'waiting_visit', 'active'];
  return keys.map(k => SEMUA_STEP.find(s => s.key === k));
}

function syaratBelum(p) {
  if (p.status === 'pending') {
    return [
      !p.formulir_ttd_selesai && 'TTD Digital Formulir',
      !p.pks_disetujui && 'Persetujuan PKS',
      !p.pendaftaran_metode && 'Pemilihan Metode',
    ].filter(Boolean);
  }
  return [];
}

// Mirror /admin/sahabat/page.jsx (cluster reminder per tahap, klik nama buka
// popup detail+aksi) — dibuat 2026-09-06 supaya Perwakilan punya "rumah"
// section sendiri setara Sahabat Baitullah, gak numpang lagi di tab generik
// /admin?tab=pendaftaran. Profil lengkap ada di /admin/perwakilan/database.
export default function AdminPerwakilanPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openCluster, setOpenCluster] = useState(null);
  const [detailUserId, setDetailUserId] = useState(null);
  // Link referral admin/super_admin sendiri — mirror /admin/sahabat/page.jsx
  // (dikonfirmasi user 2026-09-19), buat ngerekrut Perwakilan baru langsung
  // dari panel tanpa lewat link anggota aktif.
  const [kodeInvite, setKodeInvite] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  function muat() {
    fetch('/api/admin/perwakilan').then(r => r.json()).then(d => {
      setList(d.pendaftaran || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muat();
    fetch('/api/admin/kode-invite?tipe=perwakilan').then(r => r.json())
      .then(d => setKodeInvite(d.kode || '')).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const linkInvite = (typeof window !== 'undefined' && kodeInvite)
    ? `${window.location.origin}/register?role=perwakilan&ref=${kodeInvite}` : '';
  function salinLinkInvite() {
    navigator.clipboard.writeText(linkInvite).then(() => { setCopiedInvite(true); setTimeout(() => setCopiedInvite(false), 2000); });
  }

  async function aksiPendaftaran(pendaftaranId, statusBaru) {
    setBusy(true);
    try {
      const res = await fetch('/api/status-pendaftaran', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendaftaran_id: pendaftaranId, status_baru: statusBaru }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusy(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  // Legacy: akun pending yang gak pernah punya baris agen_pendaftaran
  // (pra-fitur formulir digital) — ACC/Tolak langsung lewat /api/admin/users,
  // sama persis jalur lama di tab generik.
  async function aksiUser(userId, action) {
    setBusy(true);
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, action }),
      });
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

  if (!user || !['admin', 'super_admin'].includes(user.role)) {
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
          <div className="font-bold text-gray-700 text-sm">{proses.icon} {proses.label}{proses.jalur ? <span className="text-gray-400 font-normal"> ({proses.jalur})</span> : ''}</div>
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
                <button key={p.user_id} onClick={() => setDetailUserId(p.user_id)}
                  className="w-full flex items-center justify-between bg-white/70 hover:bg-white rounded-lg px-3 py-2 text-left transition-colors">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#0E2F6E] truncate">
                      {p.nama} <span className="text-gray-400 font-normal">({p.kode_unik})</span>
                      {p.untuk_role_kedua ? <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">dual-role</span> : ''}
                    </div>
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

  // Step selanjutnya yang valid buat `detail` (mengikuti jalur metode-nya) —
  // null kalau belum bisa dimajukan (metode belum dipilih applicant).
  const path = detail?.pendaftaran_metode ? pathUntukMetode(detail.pendaftaran_metode) : null;
  const idxSekarang = path ? path.findIndex(s => s.key === detail.status) : -1;
  const stepSelanjutnya = path && idxSekarang !== -1 ? path[idxSekarang + 1] : null;

  return (
    <Layout title="🪪 Pendaftaran Perwakilan" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Reminder per tahap proses pendaftaran kemitraan Perwakilan, sampai aktif. Klik nama buat buka detail &amp; aksi. Profil lengkap (read-only) ada di{' '}
        <a href="/admin/perwakilan/database" className="text-[#1A4FA0] font-semibold hover:underline">Database Perwakilan</a>, pencairan ujroh ada di{' '}
        <a href="/admin/perwakilan/pencairan" className="text-[#1A4FA0] font-semibold hover:underline">Pencairan Komisi</a>.
      </div>

      <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 mb-4">
        <div className="font-bold text-[#0E2F6E] mb-1 text-sm">🔗 Link Referral — Rekrut Perwakilan</div>
        <div className="text-xs text-gray-400 mb-2">Bagikan link ini ke calon perwakilan yang mau daftar langsung dari kantor, tanpa lewat link anggota aktif.</div>
        <div className="flex gap-2">
          <input readOnly value={linkInvite} placeholder="Memuat..." className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-100 bg-gray-50 text-xs text-gray-500" />
          <button onClick={salinLinkInvite} disabled={!linkInvite} className="bg-[#1A4FA0] text-white text-xs font-bold px-4 rounded-lg disabled:opacity-50">
            {copiedInvite ? '✓' : 'Salin'}
          </button>
        </div>
      </div>

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
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>TTD Digital Formulir</span>
                {detail.formulir_ttd_selesai ? <span className="text-green-600 font-bold">✅ Selesai</span> : <span className="text-red-500 font-bold">⏳ Belum</span>}
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Persetujuan PKS</span>
                {detail.pks_disetujui ? <span className="text-green-600 font-bold">✅ Ya</span> : <span className="text-red-500 font-bold">⏳ Belum</span>}
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                <span>Metode Pendaftaran</span>
                <span className={detail.pendaftaran_metode ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                  {detail.pendaftaran_metode || '⏳ Belum dipilih'}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-4 flex-wrap">
              {!detail.pendaftaran_id && (
                <>
                  <button disabled={busy} onClick={() => aksiUser(detail.user_id, 'approve')}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-full disabled:opacity-50 text-sm">
                    ✅ ACC
                  </button>
                  <button disabled={busy} onClick={() => aksiUser(detail.user_id, 'reject')}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2.5 rounded-full disabled:opacity-50 text-sm">
                    ❌ Tolak
                  </button>
                </>
              )}
              {detail.pendaftaran_id && stepSelanjutnya && (
                <button disabled={busy} onClick={() => aksiPendaftaran(detail.pendaftaran_id, stepSelanjutnya.key)}
                  className="flex-1 bg-[#1A4FA0] text-white font-bold py-2.5 rounded-full disabled:opacity-50 text-sm">
                  Lanjut ke {stepSelanjutnya.label} →
                </button>
              )}
              {detail.pendaftaran_id && detail.status !== 'active' && detail.status !== 'ditolak' && (
                <button disabled={busy} onClick={() => { if (confirm('Tolak pendaftaran ini?')) aksiPendaftaran(detail.pendaftaran_id, 'ditolak'); }}
                  className="bg-gray-100 text-gray-500 font-bold px-4 py-2.5 rounded-full disabled:opacity-50 text-sm">
                  Tolak
                </button>
              )}
              <button onClick={() => window.open(`/admin/cetak-pks-mitra/${detail.user_id}`, '_blank')}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-full text-sm">
                📜 Cetak Perjanjian Kerjasama
              </button>
            </div>

            <a href="/admin/perwakilan/database" className="block text-center text-xs text-[#1A4FA0] font-semibold hover:underline mt-3">
              Lihat profil lengkap di Database Perwakilan →
            </a>
          </div>
        </div>
      )}
    </Layout>
  );
}
