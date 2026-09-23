'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { warnaProgress } from '@/lib/kesiapanTabungan';
import TombolWA from '@/app/components/TombolWA';

function fmtTanggal(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_BOOKING_LABEL = {
  active: 'Berjalan', selesai: 'Selesai', dibatalkan: 'Dibatalkan', menunggu_batal: 'Proses Batal',
};

const FUNNEL_LABEL = {
  pending: 'Belum Upload Bukti TF', menunggu_bsi: 'Menunggu BSI', menunggu_sk_cif: 'Menunggu SK-CIF',
  active: 'Aktif', ditolak: 'Ditolak',
};

// Riwayat Closing — versi jaringan sendiri dari /admin/sahabat/riwayat-closing
// (dikonfirmasi user 2026-09-21). Beda dari Team (yang nunjukin STRUKTUR
// jaringan): ini fokus ke PERFORMA — berapa yang udah closing (buka rekening)
// & closing langsung (booking), plus persen kesiapan tabungan masing2 orang
// — SENGAJA TANPA nominal Rupiah apa pun (bukan cuma tabungan, ujroh juga),
// beda dari /dashboard/sahabat/riwayat yang emang rekening koran pribadi.
// Forecast SENGAJA gak di sini (dikonfirmasi user 2026-09-23) — itu
// nyangkut nominal, tempatnya di /dashboard/sahabat/riwayat. Halaman ini
// murni alur akun & jamaah-jamaahnya, tanpa duit.
export default function RiwayatClosingSahabatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>}>
      <RiwayatClosingContent />
    </Suspense>
  );
}

function RiwayatClosingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user] = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('referral');
  const [dari, setDari] = useState('');
  const [sampai, setSampai] = useState('');

  const paramId = searchParams.get('sahabat_id');
  const isAdmin = user && ['admin', 'super_admin'].includes(user.role);
  const targetId = (paramId && isAdmin) ? paramId : user?.id;
  const lihatOrangLain = isAdmin && paramId && paramId !== user?.id;

  // Terima dari/sampai eksplisit (bukan baca dari state) — dipanggil dari
  // tombol Reset yang butuh fetch pakai nilai KOSONG segera, gak nunggu
  // state ke-update & re-render dulu (setState async, closure bakal stale
  // kalau baca dari/sampai dari state di titik ini).
  function muat(dariVal = dari, sampaiVal = sampai) {
    if (!targetId) return;
    const qs = new URLSearchParams({ sahabat_id: targetId });
    if (dariVal && sampaiVal) { qs.set('dari', dariVal); qs.set('sampai', sampaiVal); }
    fetch(`/api/sahabat/riwayat-closing?${qs.toString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['sahabat_baitullah', 'admin', 'super_admin'].includes(user.role)) { router.push('/dashboard/jamaah'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, targetId]);

  if (!user || loading || !data) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const r = data.ringkasan || {};
  const closingReferral = data.closing_referral || [];
  const closingLangsung = data.closing_langsung || [];

  return (
    <Layout title="📜 Riwayat Closing Jaringan" showBack>
      {lihatOrangLain && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-800">
          👁️ Mode admin — lagi lihat riwayat closing jaringan milik akun lain, bukan jaringan Anda sendiri.
        </div>
      )}

      <div className="text-xs text-gray-400 mb-3">
        Performa jaringan Anda (diri sendiri + seluruh downline) — berapa yang berhasil closing, tanpa rincian nominal. Jumlah jaringan lengkap ada di halaman <b>Team</b>.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Dari Tanggal</label>
          <input type="date" value={dari} onChange={e => setDari(e.target.value)}
            className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Sampai Tanggal</label>
          <input type="date" value={sampai} onChange={e => setSampai(e.target.value)}
            className="px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
        </div>
        <button onClick={muat} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          Terapkan Filter
        </button>
        {(dari || sampai) && (
          <button onClick={() => { setDari(''); setSampai(''); muat('', ''); }}
            className="text-xs text-gray-400 hover:text-gray-600 font-semibold underline">
            Reset periode
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-3 text-center">
          <div className="text-xl font-black text-purple-700">{r.total_closing_referral || 0}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Closing Sahabat Baitullah</div>
        </div>
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-3 text-center">
          <div className="text-xl font-black text-[#1A4FA0]">{r.total_closing_langsung || 0}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Closing Jamaah</div>
        </div>
      </div>

      <div className="flex gap-1 mb-3 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('referral')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${tab === 'referral' ? 'bg-white text-[#0E2F6E] shadow-sm' : 'text-gray-500'}`}>
          🤝 Closing Sahabat Baitullah
        </button>
        <button onClick={() => setTab('langsung')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${tab === 'langsung' ? 'bg-white text-[#0E2F6E] shadow-sm' : 'text-gray-500'}`}>
          💳 Closing Jamaah
        </button>
      </div>

      {tab === 'referral' && (
        closingReferral.length === 0 ? (
          <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">Belum ada rekrutan di jaringan Anda.</div>
        ) : (
          <div className="space-y-2">
            {closingReferral.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-[#e0e8f0] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-[#0E2F6E] text-sm truncate">{c.name} <span className="text-gray-400 font-normal">({c.kode_unik})</span></div>
                    <div className="text-[10px] text-gray-400">Direkrut oleh: {c.perekrut_nama || '-'} ({c.perekrut_kode_unik || '-'})</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Follow-up WA — cuma rekrutan LANGSUNG (API udah
                        nyaring, wa null buat downline yang lebih dalam),
                        dikonfirmasi user 2026-09-23. */}
                    {c.wa && (
                      <TombolWA nomor={c.wa} label="WA" className="inline-flex items-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap" />
                    )}
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {c.status === 'active' ? '✅ Aktif' : (FUNNEL_LABEL[c.funnel_status] || 'Menunggu')}
                    </span>
                  </div>
                </div>
                {c.status === 'active' && c.tanggal_aktif && (
                  <div className="text-[10px] text-gray-400 mt-1">Aktif sejak {fmtTanggal(c.tanggal_aktif)}</div>
                )}
                {c.persen_kesiapan !== null && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                      <span>Kesiapan tabungan {c.target_minat ? `— ${c.target_minat}` : ''}</span>
                      <span className="font-bold text-gray-600">{c.persen_kesiapan}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${warnaProgress(c.persen_kesiapan)}`} style={{ width: `${c.persen_kesiapan}%` }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'langsung' && (
        closingLangsung.length === 0 ? (
          <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">Belum ada closing jamaah di jaringan Anda.</div>
        ) : (
          <div className="space-y-2">
            {closingLangsung.map(b => (
              <div key={b.id} className="bg-white rounded-xl border border-[#e0e8f0] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-[#0E2F6E] text-sm truncate">{b.prog_name}</div>
                    <div className="text-[10px] text-gray-400">{b.jumlah_jamaah} jamaah · Via: {b.sahabat_nama} ({b.sahabat_kode_unik})</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{fmtTanggal(b.created_at)}</div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 shrink-0">
                    {STATUS_BOOKING_LABEL[b.status] || b.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </Layout>
  );
}
