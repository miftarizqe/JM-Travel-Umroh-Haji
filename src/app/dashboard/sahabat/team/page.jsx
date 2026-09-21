'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { warnaProgress } from '@/lib/kesiapanTabungan';

const FUNNEL_LABEL = {
  pending: 'Verifikasi TF', menunggu_bsi: 'Menunggu BSI', menunggu_sk_cif: 'Menunggu SK-CIF',
  active: 'Aktif', ditolak: 'Ditolak',
};

// Ujroh 5-generasi cuma dibayar sampai gen 5 ke atas (lihat loop
// `gen < 5` di /api/status-pendaftaran-sahabat/route.js) — jaringan di
// bawahnya TETAP kecatat & keliatan di sini (unlimited, cap teknis 20 level
// buat jaga-jaga), cuma gak lagi ngasih ujroh. Badge ini nandain bedanya
// biar gak ada yang nyangka SEMUA generasi dapat ujroh (dikonfirmasi user
// 2026-09-06).
const GEN_MAX_UJROH_SAHABAT = 5;
function GenBadge({ level }) {
  const dapatUjroh = level <= GEN_MAX_UJROH_SAHABAT;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${dapatUjroh ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-400'}`}
      title={dapatUjroh ? 'Dalam 5 generasi — dapat ujroh' : 'Di luar 5 generasi — tercatat, tidak dapat ujroh'}>
      Gen {level}{!dapatUjroh && ' 🔒'}
    </span>
  );
}

function StatusBadge({ t }) {
  return (
    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#E8F0FB] text-[#1A4FA0] whitespace-nowrap">
      {t.funnel_status ? (FUNNEL_LABEL[t.funnel_status] || t.funnel_status) : (t.status === 'active' ? 'Aktif' : 'Menunggu')}
    </span>
  );
}

// Progress kesiapan tabungan menuju goal masing2 anggota (dikonfirmasi user
// 2026-09-21) — cuma persentase, TANPA nominal (API-nya juga gak pernah
// balikin saldo mentah, lihat /api/sahabat/team). null = anggota belum
// punya target tabungan yang diset, gak ada apa2 buat ditampilin.
function ProgressKesiapan({ persen }) {
  if (persen === null || persen === undefined) return null;
  return (
    <div className="mt-1 max-w-[160px]">
      <div className="flex justify-between text-[9px] text-gray-400 mb-0.5">
        <span>Kesiapan tabungan</span><span className="font-bold text-gray-500">{persen}%</span>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${warnaProgress(persen)}`} style={{ width: `${persen}%` }} />
      </div>
    </div>
  );
}

// Node rekursif buat tampilan "Pohon" — indent per depth, expand/collapse
// per cabang. Default expanded (jaringan masih kecil di tahap ini).
function TeamTreeNode({ member, depth, childrenOf }) {
  const [open, setOpen] = useState(true);
  const anak = childrenOf.get(member.id) || [];
  const punyaAnak = anak.length > 0;

  return (
    <div>
      <div
        className={`flex items-center justify-between gap-2 py-2 px-2 rounded-lg ${punyaAnak ? 'cursor-pointer hover:bg-gray-50' : ''}`}
        style={{ paddingLeft: depth * 20 + 8 }}
        onClick={() => punyaAnak && setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {punyaAnak && (
            <span className="text-gray-400 text-xs w-3 shrink-0">{open ? '▼' : '▶'}</span>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-[#0E2F6E] text-sm truncate">
              {member.name}
              {punyaAnak && <span className="text-[10px] text-gray-400 font-normal ml-1.5">({anak.length} downline)</span>}
            </div>
            <div className="text-[10px] text-gray-400 flex items-center gap-1.5">{member.kode_unik} · <GenBadge level={member.level} /></div>
            <ProgressKesiapan persen={member.persen_kesiapan} />
          </div>
        </div>
        <StatusBadge t={member} />
      </div>
      {punyaAnak && open && (
        <div>
          {anak.map(a => (
            <TeamTreeNode key={a.id} member={a} depth={depth + 1} childrenOf={childrenOf} />
          ))}
        </div>
      )}
    </div>
  );
}

// Section akordeon buat tampilan "Per Level" — 1 section per generasi,
// default tertutup, independen satu sama lain.
function LevelSection({ level, members }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#e0e8f0] last:border-b-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="font-bold text-[#0E2F6E] text-sm flex items-center gap-1.5">
          <GenBadge level={level} /> <span className="text-gray-400 font-normal">({members.length} orang)</span>
        </span>
        <span className="text-gray-400 text-xs">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">Nama</th>
                <th className="px-4 py-2 text-left">Kode Unik</th>
                <th className="px-4 py-2 text-left">Direkrut Oleh</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Kesiapan Tabungan</th>
              </tr>
            </thead>
            <tbody>
              {members.map((t, i) => (
                <tr key={t.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-2.5 font-semibold text-[#0E2F6E]">{t.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{t.kode_unik}</td>
                  <td className="px-4 py-2.5 text-gray-500">{t.perekrut_nama || '-'}</td>
                  <td className="px-4 py-2.5"><StatusBadge t={t} /></td>
                  <td className="px-4 py-2.5">
                    {t.persen_kesiapan === null || t.persen_kesiapan === undefined ? (
                      <span className="text-gray-300 text-xs">-</span>
                    ) : <ProgressKesiapan persen={t.persen_kesiapan} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: 'pohon', label: '🌳 Pohon' },
  { key: 'level', label: '📊 Per Level' },
  { key: 'semua', label: '📋 Semua' },
];

// Halaman database Team sahabat — SELURUH jaringan berjenjang diratakan
// (bukan cuma rekrutan langsung), dituju dari klik kartu "Team" di
// /dashboard/sahabat (bukan lewat nav utama, pola sama kayak
// /dashboard/downline milik perwakilan). 3 cara pandang atas data yang SAMA
// (flat array dari API, gak ada fetch tambahan): pohon ber-indent, akordeon
// per generasi, dan tabel flat yang sudah ada sebelumnya.
export default function DashboardSahabatTeamPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>}>
      <TeamContent />
    </Suspense>
  );
}

function TeamContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user] = useCurrentUser();
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pohon');
  const [targetInfo, setTargetInfo] = useState(null);
  // Head of Program (dikonfirmasi user 2026-09-07) — wewenang baru, boleh
  // liat SELURUH jaringan Sahabat Baitullah dari dashboard akunnya sendiri,
  // bukan cuma downline dia. Dideteksi lewat berhasil/gaknya fetch
  // /api/admin/sahabat/hirarki (endpoint itu sekarang ngasih akses HOP juga,
  // bukan cuma admin) — kalau berhasil buat akun non-admin, berarti dia HOP.
  const [semuaAkar, setSemuaAkar] = useState(null); // null = belum dicek/bukan HOP
  const [loadingAkar, setLoadingAkar] = useState(false);

  // Admin/super_admin ATAU Head of Program boleh buka jaringan siapa pun
  // lewat ?sahabat_id=, bukan cuma jaringan diri sendiri — anggota biasa
  // yang coba ini bakal ke-403 di /api/sahabat/team (gerbang akses gak
  // berubah, cuma halaman ini sekarang bisa nunjukkin hasilnya).
  const paramId = searchParams.get('sahabat_id');
  const isAdmin = user && ['admin', 'super_admin'].includes(user.role);
  const isHop = semuaAkar !== null;
  const bolehLihatSemua = isAdmin || isHop;
  const targetId = (paramId && bolehLihatSemua) ? paramId : user?.id;
  const lihatJaringanOrangLain = bolehLihatSemua && paramId && paramId !== user?.id;

  // Cek status HOP cuma buat akun sahabat_baitullah biasa (admin udah pasti
  // boleh lihat semua lewat jalur lain, gak perlu cek ini).
  useEffect(() => {
    if (!user || user.role !== 'sahabat_baitullah') return;
    setLoadingAkar(true);
    fetch('/api/admin/sahabat/hirarki')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setSemuaAkar(d.akar || []))
      .catch(() => setSemuaAkar(null))
      .finally(() => setLoadingAkar(false));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!['sahabat_baitullah', 'admin', 'super_admin'].includes(user.role)) { router.push('/dashboard/jamaah'); return; }
    if (!targetId) return;
    fetch(`/api/sahabat/team?sahabat_id=${targetId}`)
      .then(r => r.json())
      .then(d => { setTeam(d.team || []); setLoading(false); })
      .catch(() => setLoading(false));
    if (lihatJaringanOrangLain) {
      fetch(`/api/sahabat/downline/${targetId}`)
        .then(r => r.json())
        .then(d => setTargetInfo(d.target || null))
        .catch(() => {});
    } else {
      setTargetInfo(null);
    }
  }, [user, targetId]);

  const childrenOf = useMemo(() => {
    const m = new Map();
    for (const t of team) {
      const arr = m.get(t.perekrut_id) || [];
      arr.push(t);
      m.set(t.perekrut_id, arr);
    }
    return m;
  }, [team]);

  const byLevel = useMemo(() => {
    const m = new Map();
    for (const t of team) {
      const arr = m.get(t.level) || [];
      arr.push(t);
      m.set(t.level, arr);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [team]);

  // Ringkasan jumlah per generasi (dikonfirmasi user 2026-09-21) — Gen1-5
  // dipisah (masih dapat ujroh), Gen6 ke atas digabung jadi 1 angka (di luar
  // 5 generasi, gak dapat ujroh lagi — lihat GEN_MAX_UJROH_SAHABAT).
  const genCounts = useMemo(() => {
    const perGen = [0, 0, 0, 0, 0];
    let gen6Plus = 0;
    for (const t of team) {
      if (t.level <= GEN_MAX_UJROH_SAHABAT) perGen[t.level - 1]++;
      else gen6Plus++;
    }
    return { perGen, gen6Plus };
  }, [team]);

  if (!user || loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const rootIds = targetId ? childrenOf.get(targetId) || [] : [];

  return (
    <Layout title="🌳 Team Sahabat Baitullah" showBack>
      {lihatJaringanOrangLain && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-800">
          👁️ Mode {isAdmin ? 'admin' : 'Head of Program'} — lagi lihat jaringan milik <b>{targetInfo?.name || '...'}</b> {targetInfo?.kode_unik ? `(${targetInfo.kode_unik})` : ''}, bukan jaringan Anda sendiri.
        </div>
      )}

      {/* Wewenang Head of Program (dikonfirmasi user 2026-09-07) — bisa
          loncat lihat SELURUH jaringan Sahabat Baitullah, gak cuma downline
          dia sendiri. Ditaruh SEBELUM guard "team.length === 0" biar tetap
          keliatan walau jaringan pribadinya sendiri masih kosong. */}
      {isHop && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-3">
          <div className="text-xs font-bold text-purple-800 mb-2">👑 Head of Program — Lihat Jaringan Lain</div>
          {loadingAkar ? (
            <div className="text-xs text-purple-600">Memuat daftar jaringan...</div>
          ) : semuaAkar.length === 0 ? (
            <div className="text-xs text-purple-600">Belum ada akar jaringan.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => router.push('/dashboard/sahabat/team')}
                className={`text-[10px] font-bold px-2.5 py-1.5 rounded-full transition-colors ${
                  targetId === user.id ? 'bg-purple-700 text-white' : 'bg-white text-purple-700 border border-purple-300 hover:bg-purple-100'
                }`}>
                🙋 Jaringan Saya
              </button>
              {semuaAkar.map(a => (
                <button key={a.id} onClick={() => router.push(`/dashboard/sahabat/team?sahabat_id=${a.id}`)}
                  className={`text-[10px] font-bold px-2.5 py-1.5 rounded-full transition-colors ${
                    targetId === a.id ? 'bg-purple-700 text-white' : 'bg-white text-purple-700 border border-purple-300 hover:bg-purple-100'
                  }`}>
                  {a.name} ({a.kode_unik}) · {a.jumlah_downline} downline
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {team.length === 0 ? (
        <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">
          Belum ada anggota team. Bagikan link referral Anda dari dashboard buat mulai merekrut.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mb-4">
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-3 text-center">
              <div className="text-lg font-black text-[#0E2F6E]">{team.length}</div>
              <div className="text-[9px] text-gray-400 mt-0.5">Total Jaringan</div>
            </div>
            {genCounts.perGen.map((jml, i) => (
              <div key={i} className="bg-white rounded-xl border border-[#e0e8f0] p-3 text-center">
                <div className="text-lg font-black text-purple-700">{jml}</div>
                <div className="text-[9px] text-gray-400 mt-0.5">Gen {i + 1}</div>
              </div>
            ))}
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-3 text-center">
              <div className="text-lg font-black text-gray-400">{genCounts.gen6Plus}</div>
              <div className="text-[9px] text-gray-400 mt-0.5">Gen 6+</div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[10px] text-gray-400 mb-2">
            <span className="flex items-center gap-1"><GenBadge level={1} /> = dalam 5 generasi, dapat ujroh</span>
            <span className="flex items-center gap-1"><GenBadge level={6} /> = di luar 5 generasi, tercatat tapi tidak dapat ujroh</span>
          </div>
          <div className="flex gap-1 mb-3 bg-gray-100 rounded-xl p-1 w-fit">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  tab === t.key ? 'bg-white text-[#0E2F6E] shadow-sm' : 'text-gray-500'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
            {tab === 'pohon' && (
              <div className="p-2">
                {rootIds.map(m => (
                  <TeamTreeNode key={m.id} member={m} depth={0} childrenOf={childrenOf} />
                ))}
              </div>
            )}

            {tab === 'level' && (
              <div>
                {byLevel.map(([level, members]) => (
                  <LevelSection key={level} level={level} members={members} />
                ))}
              </div>
            )}

            {tab === 'semua' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0E2F6E] text-white text-xs">
                      <th className="px-4 py-3 text-left">Nama</th>
                      <th className="px-4 py-3 text-left">Kode Unik</th>
                      <th className="px-4 py-3 text-left">Generasi</th>
                      <th className="px-4 py-3 text-left">Direkrut Oleh</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Kesiapan Tabungan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((t, i) => (
                      <tr key={t.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 font-semibold text-[#0E2F6E]">{t.name}</td>
                        <td className="px-4 py-3 text-gray-500">{t.kode_unik}</td>
                        <td className="px-4 py-3">
                          <GenBadge level={t.level} />
                        </td>
                        <td className="px-4 py-3 text-gray-500">{t.perekrut_nama || '-'}</td>
                        <td className="px-4 py-3"><StatusBadge t={t} /></td>
                        <td className="px-4 py-3">
                          {t.persen_kesiapan === null || t.persen_kesiapan === undefined ? (
                            <span className="text-gray-300 text-xs">-</span>
                          ) : <ProgressKesiapan persen={t.persen_kesiapan} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
