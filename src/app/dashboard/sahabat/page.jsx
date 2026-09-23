'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { CollapsibleSection } from '@/app/components/Collapsible';
import { useCurrentUser } from '@/lib/useCurrentUser';
import DownlineModalSahabat from '@/app/components/DownlineModalSahabat';
import TombolWA from '@/app/components/TombolWA';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

function fmtTanggalJam(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const tanggal = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${tanggal}, ${jam}`;
}

// Restrukturisasi Beranda (dikonfirmasi user 2026-09-22): Status Keanggotaan
// & Voucher Pendaftaran pindah ke Profil (/profil), "Rekrutan Anda" dihapus
// (udah kecover di Team), "Lihat rincian" di kartu Ujroh Terkonfirmasi
// diganti jadi link keluar ke Riwayat Tabungan Umroh (infonya udah lengkap
// di sana), "Saldo Pending" pindah gabung ke header + rename "Ujroh
// Pending", dan "Perlu Perhatian" pindah ke paling bawah.
export default function DashboardSahabatPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [drillDownId, setDrillDownId] = useState(null);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'sahabat_baitullah') { router.push('/'); return; }
    // Belum aktif (masih dalam funnel pendaftaran) — arahkan ke status
    // tracker, bukan dashboard yang isinya masih kosong semua.
    if (user.status !== 'active') { router.push('/status-pendaftaran-sahabat'); return; }
    fetch(`/api/sahabat/dashboard?sahabat_id=${user.id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  if (loading || !data?.akun) return <Layout title="🤝 Dashboard Sahabat Baitullah"><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

  const link = typeof window !== 'undefined' ? `${window.location.origin}/register?role=sahabat&ref=${data.akun.kode_unik}` : '';
  // Kode invite BEDA dari kode akun (kode_unik) — khusus buat mengundang
  // orang jadi Jamaah Sahabat Baitullah BARU (dikonfirmasi user 2026-09-03,
  // mirror kode_invite_perwakilan). Link referral biasa di atas TETAP dipakai
  // buat jamaah checkout/daftar sebagai jamaah biasa via link Anda.
  const linkInvite = typeof window !== 'undefined' && data.akun.kode_invite_sahabat
    ? `${window.location.origin}/register?role=sahabat&ref=${data.akun.kode_invite_sahabat}` : '';

  const skema = data.skema || {};
  const perluPerhatian = data.perlu_perhatian || { belum_tf: [], menunggu_bsi: [], menunggu_sk_cif: [] };
  const adaYangPerlu = perluPerhatian.belum_tf.length + perluPerhatian.menunggu_bsi.length + perluPerhatian.menunggu_sk_cif.length > 0;
  const closingLangsung = data.closing_langsung || { items: [], total_confirmed: 0, total_pending: 0 };
  const forecast = data.forecast || { calon_ujroh: [], potensi_total: 0 };
  const adaPending = data.ringkasan.saldo_pending > 0;

  function salinLink() {
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  function salinLinkInvite() {
    navigator.clipboard.writeText(linkInvite).then(() => { setCopiedInvite(true); setTimeout(() => setCopiedInvite(false), 2000); });
  }

  return (
    <Layout title="🤝 Dashboard Sahabat Baitullah">
      <div className="max-w-2xl mx-auto space-y-4">

        <div className="bg-gradient-to-r from-[#0E2F6E] to-[#2060C0] rounded-xl p-4 text-white">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm opacity-80">{data.akun.name} · {data.akun.kode_unik}</div>
            {skema.is_hop && (
              <span className="bg-white/15 border border-white/30 rounded-full px-2.5 py-1 text-[10px] font-bold shrink-0">👑 Head of Program</span>
            )}
          </div>
          <div className={`grid gap-3 mt-3 text-center ${adaPending ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <button onClick={() => router.push('/dashboard/sahabat/team')} className="cursor-pointer">
              <div className="text-xl font-bold underline decoration-dotted">{data.ringkasan.jumlah_rekrutan}</div>
              <div className="text-[10px] opacity-80">Team</div>
            </button>
            <button onClick={() => router.push('/dashboard/sahabat/riwayat')} className="cursor-pointer">
              <div className="text-xl font-bold underline decoration-dotted">{fmtRp(data.ringkasan.saldo_tabungan_umroh)}</div>
              <div className="text-[10px] opacity-80">Saldo Tabungan Umroh</div>
              {data.ringkasan.saldo_updated_at && (
                <div className="text-[9px] opacity-60 mt-0.5">Diperbarui {fmtTanggalJam(data.ringkasan.saldo_updated_at)}</div>
              )}
            </button>
            {/* Ujroh Pending — digabung ke header, sebelah Saldo Tabungan
                Umroh (dikonfirmasi user 2026-09-22, dulu badge kecil sendiri
                di kartu Ujroh Terkonfirmasi). Klik -> Riwayat Tabungan Umroh,
                langsung buka section "Ujroh Pending". */}
            {adaPending && (
              <button onClick={() => router.push('/dashboard/sahabat/riwayat?section=pending')} className="cursor-pointer">
                <div className="text-xl font-bold underline decoration-dotted">{fmtRp(data.ringkasan.saldo_pending)}</div>
                <div className="text-[10px] opacity-80">Ujroh Pending</div>
              </button>
            )}
          </div>
        </div>

        {/* Total Ujroh Terkonfirmasi — klik keluar ke Riwayat Tabungan Umroh
            (dikonfirmasi user 2026-09-22, rincian per kategori udah ada
            lengkap di sana, gak perlu expand ganda di sini). */}
        <div onClick={() => router.push('/dashboard/sahabat/riwayat')}
          className="bg-gradient-to-r from-[#0E2F6E] to-[#1A4FA0] text-white rounded-2xl p-6 cursor-pointer">
          <div className="text-xs opacity-75 uppercase tracking-wider mb-1">Total Ujroh Terkonfirmasi</div>
          <div className="text-3xl font-black text-[#C9952A] mb-2">{fmtRp(data.ringkasan.saldo_tabungan_umroh)}</div>
          <div className="text-xs opacity-75">Dari {data.ringkasan.jumlah_rekrutan} rekrutan langsung · Lihat riwayat pencairan →</div>
          <div className="bg-white/10 rounded-xl p-4 mt-4 text-sm space-y-1">
            <div className="font-bold mb-2">💡 Skema Ujroh Sahabat Baitullah</div>
            <div className="opacity-85">Ujroh 5-Generasi: Gen1 {fmtRp(skema.gen?.[0])} · Gen2 {fmtRp(skema.gen?.[1])} · Gen3 {fmtRp(skema.gen?.[2])} · Gen4 {fmtRp(skema.gen?.[3])} · Gen5 {fmtRp(skema.gen?.[4])}</div>
            <div className="opacity-85">Cair sekali per rekrutan yang jadi aktif — dibayar ke perekrut langsung (Gen1) sampai 5 tingkat ke atas rantai referral.</div>
            <div className="opacity-85">Saldo Awal Pendaftaran: {fmtRp(skema.tabungan_awal)} · Closing Langsung (checkout diri sendiri): {skema.closing_persen}% dari harga booking</div>
            {skema.is_hop && <div className="opacity-85">Komisi Head of Program: {fmtRp(skema.hop_nominal)} per registrasi baru</div>}
            <div className="mt-2 text-yellow-300">Terkonfirmasi = sudah di-ACC &amp; ditransfer manual ke Tabungan Umroh oleh admin.</div>
          </div>
        </div>

        {/* Forecast — potensi ujroh generasi yang BELUM cair, dari downline
            dalam jaringan (sampai gen5) yang masih dalam funnel pendaftaran.
            Otomatis hilang begitu downline-nya aktif (masuk hitungan Ujroh
            Terkonfirmasi/Pending di atas, bukan di sini lagi). Klik keluar
            ke tab Forecast di Riwayat Tabungan Umroh (dikonfirmasi user
            2026-09-23 — ini nyangkut nominal, jadi tempatnya di situ, bukan
            di Riwayat Closing Jaringan yang sengaja qty-only). Di sana juga
            digabung sama forecast closing jamaah umroh biasa. */}
        <div onClick={() => router.push('/dashboard/sahabat/riwayat?tab=forecast')}
          className="bg-white rounded-xl border-2 border-[#e0e8f0] hover:border-[#C9952A] p-4 cursor-pointer transition-all">
          <div className="text-xs text-gray-400 mb-1">📊 Forecast — Calon Ujroh dari Jaringan</div>
          <div className="font-black text-[#C9952A] text-lg">{fmtRp(forecast.potensi_total)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Menunggu {forecast.calon_ujroh.length} downline dalam 5 generasi aktif · Lihat rincian →</div>
        </div>

        {/* Closing Langsung & Referral Reguler — mirror "Margin Reseller"
            milik dashboard perwakilan, tapi sumbernya beda (bantu closing
            jamaah publik / perekrut permanen jamaah reguler). */}
        {closingLangsung.items.length > 0 && (
          <CollapsibleSection
            title={<h3 className="font-bold text-[#0E2F6E]">💼 Closing Langsung &amp; Referral Reguler</h3>}
            badge={fmtRp(closingLangsung.total_confirmed)}
          >
            <div className="text-xs text-gray-400 mb-3">
              Ujroh dari bantu closing booking jamaah publik, atau jamaah yang Anda rekrut lewat referral permanen — terpisah dari ujroh 5-generasi di atas.
              {closingLangsung.total_pending > 0 && <span> Saldo pending: <b className="text-yellow-600">{fmtRp(closingLangsung.total_pending)}</b>.</span>}
            </div>
            <div className="space-y-2">
              {closingLangsung.items.map(c => (
                <div key={c.id} className="flex justify-between items-start text-xs bg-gray-50 rounded-lg px-3 py-2 gap-2">
                  <div className="text-gray-600 min-w-0">
                    <div className="font-semibold">{c.jenis === 'referral_closing_reguler_sahabat' ? 'Referral Closing Reguler' : 'Closing Langsung'}</div>
                    <div className="text-gray-400 truncate">{c.keterangan}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-[#1A4FA0]">{fmtRp(c.nominal)}</div>
                    {c.dikonfirmasi_at ? (
                      <div className="text-[10px] text-green-600 font-bold">✅ Terkonfirmasi</div>
                    ) : (
                      <div className="text-[10px] text-gray-400">⏳ Pending</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
          <div className="font-bold text-[#0E2F6E] mb-2">🔗 Link Referral Anda</div>
          <div className="flex gap-2">
            <input readOnly value={link} className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-100 bg-gray-50 text-xs text-gray-500" />
            <button onClick={salinLink} className="bg-[#1A4FA0] text-white text-xs font-bold px-4 rounded-lg">
              {copied ? '✓' : 'Salin'}
            </button>
          </div>
          <div className="text-[10px] text-gray-400 mt-1">Siapa pun yang daftar lewat link ini otomatis tercatat sebagai rekrutan Anda.</div>
        </div>

        {linkInvite && (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
            <div className="font-bold text-[#0E2F6E] mb-2">🔗 Kode &amp; Link Rekrut Anggota Baru</div>
            <div className="flex gap-2 mb-1">
              <div className="px-3 py-2 rounded-lg border-2 border-gray-100 bg-gray-50 text-sm font-bold text-[#0E2F6E]">{data.akun.kode_invite_sahabat}</div>
              <input readOnly value={linkInvite} className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-100 bg-gray-50 text-xs text-gray-500" />
              <button onClick={salinLinkInvite} className="bg-[#1A4FA0] text-white text-xs font-bold px-4 rounded-lg">
                {copiedInvite ? '✓' : 'Salin'}
              </button>
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Kode ini BEDA dari kode akun Anda ({data.akun.kode_unik}) — khusus buat mengundang orang jadi Jamaah Sahabat Baitullah baru.</div>
          </div>
        )}

        {skema.is_hop && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div className="font-bold text-purple-800 mb-1">👑 Anda Head of Program</div>
            <p className="text-sm text-purple-600">Anda dapat komisi {fmtRp(skema.hop_nominal)} per registrasi anggota baru di seluruh jaringan Sahabat Baitullah, plus bagian dari closing langsung jamaah lain. Buka <button onClick={() => router.push('/dashboard/sahabat/team')} className="underline font-bold">Team</button> untuk melihat & lompat ke jaringan siapa pun, bukan cuma downline Anda sendiri.</p>
          </div>
        )}

        {/* Perlu Perhatian — dipindah ke paling bawah (dikonfirmasi user
            2026-09-22). Rekrutan langsung yang masih nyangkut di funnel. */}
        <CollapsibleSection
          title={<h3 className={`font-bold ${adaYangPerlu ? 'text-red-600' : 'text-green-600'}`}>{adaYangPerlu ? '🔴' : '✅'} Perlu Perhatian</h3>}
        >
          {!adaYangPerlu ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 text-center">
              ✅ Semua rekrutan langsung sudah aktif, tidak ada yang perlu ditindaklanjuti.
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { key: 'belum_tf', label: 'Belum Upload Bukti TF', icon: '📝', warna: 'border-yellow-200 bg-yellow-50' },
                { key: 'menunggu_bsi', label: 'Menunggu Verifikasi BSI', icon: '🏦', warna: 'border-blue-200 bg-blue-50' },
                { key: 'menunggu_sk_cif', label: 'Menunggu SK-CIF', icon: '📄', warna: 'border-purple-200 bg-purple-50' },
              ].filter(c => perluPerhatian[c.key].length > 0).map(c => (
                <div key={c.key} className={`border ${c.warna} rounded-xl p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-gray-700 text-sm">{c.icon} {c.label}</div>
                    <span className="text-xs font-black px-2 py-1 rounded-full bg-red-500 text-white">{perluPerhatian[c.key].length}</span>
                  </div>
                  <div className="space-y-1">
                    {perluPerhatian[c.key].slice(0, 5).map(r => (
                      <div key={r.id} onClick={() => setDrillDownId(r.id)}
                        className="flex items-center justify-between gap-2 text-xs text-gray-600 bg-white/60 hover:bg-white rounded px-2 py-1 cursor-pointer">
                        <span className="truncate">{r.name} · {r.kode_unik}</span>
                        {r.wa && (
                          <div onClick={e => e.stopPropagation()} className="shrink-0">
                            <TombolWA nomor={r.wa} label="WA" className="inline-flex items-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" />
                          </div>
                        )}
                      </div>
                    ))}
                    {perluPerhatian[c.key].length > 5 && <div className="text-[10px] text-gray-400 pl-2">+{perluPerhatian[c.key].length - 5} lainnya...</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {drillDownId && (
          <DownlineModalSahabat targetId={drillDownId} onClose={() => setDrillDownId(null)} />
        )}
      </div>
    </Layout>
  );
}
