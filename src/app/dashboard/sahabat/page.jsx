'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { CollapsibleSection } from '@/app/components/Collapsible';
import { useCurrentUser } from '@/lib/useCurrentUser';
import DownlineModalSahabat from '@/app/components/DownlineModalSahabat';
import TombolWA from '@/app/components/TombolWA';

const FUNNEL_LABEL = {
  pending: 'Upload Bukti TF', menunggu_bsi: 'Menunggu BSI', menunggu_sk_cif: 'Menunggu SK-CIF',
  active: 'Aktif', ditolak: 'Ditolak',
};

// Sama daftar kategori kayak /dashboard/sahabat/riwayat, dipakai buat
// pecah kartu "Total Ujroh Terkonfirmasi" & "Saldo Pending" per jenis.
const KATEGORI_LABEL = {
  komisi_sahabat: 'Ujroh 5-Generasi',
  closing_langsung_sahabat: 'Closing Langsung',
  tabungan_awal_sahabat: 'Saldo Awal Pendaftaran',
  head_of_program_registrasi: 'Komisi Head of Program',
  pemakaian_saldo_sahabat: 'Pemakaian Saldo',
  setoran_mandiri_sahabat: 'Setoran Mandiri',
  referral_closing_reguler_sahabat: 'Referral Closing Reguler',
  koreksi_saldo_sahabat: 'Koreksi Saldo (Admin)',
};

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

function fmtTanggalJam(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const tanggal = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${tanggal}, ${jam}`;
}

export default function DashboardSahabatPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [drillDownId, setDrillDownId] = useState(null);
  const [expandTerkonfirmasi, setExpandTerkonfirmasi] = useState(false);
  const [expandForecast, setExpandForecast] = useState(false);

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
  const rincianKonfirmasi = data.ringkasan.rincian_konfirmasi || [];

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
          <div className="grid grid-cols-2 gap-3 mt-3 text-center">
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
          </div>
        </div>

        {/* Total Ujroh Terkonfirmasi — klik buat lihat rincian per kategori
            (mirror kartu "Total Ujroh Terkonfirmasi" dashboard perwakilan). */}
        <div onClick={() => setExpandTerkonfirmasi(v => !v)}
          className="bg-gradient-to-r from-[#0E2F6E] to-[#1A4FA0] text-white rounded-2xl p-6 cursor-pointer">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs opacity-75 uppercase tracking-wider mb-1">Total Ujroh Terkonfirmasi</div>
            {data.ringkasan.saldo_pending > 0 && (
              <div className="text-right shrink-0">
                <div className="text-xs font-bold bg-white/15 rounded-full px-2.5 py-1">⏳ {fmtRp(data.ringkasan.saldo_pending)}</div>
                <div className="text-[9px] opacity-70 mt-0.5">Saldo Pending</div>
              </div>
            )}
          </div>
          <div className="text-3xl font-black text-[#C9952A] mb-2">{fmtRp(data.ringkasan.saldo_tabungan_umroh)}</div>
          <div className="text-xs opacity-75">Dari {data.ringkasan.jumlah_rekrutan} rekrutan langsung · {expandTerkonfirmasi ? 'Tutup ▲' : 'Lihat rincian ▼'}</div>
          <div className="bg-white/10 rounded-xl p-4 mt-4 text-sm space-y-1">
            <div className="font-bold mb-2">💡 Skema Ujroh Sahabat Baitullah</div>
            <div className="opacity-85">Ujroh 5-Generasi: Gen1 {fmtRp(skema.gen?.[0])} · Gen2 {fmtRp(skema.gen?.[1])} · Gen3 {fmtRp(skema.gen?.[2])} · Gen4 {fmtRp(skema.gen?.[3])} · Gen5 {fmtRp(skema.gen?.[4])}</div>
            <div className="opacity-85">Cair sekali per rekrutan yang jadi aktif — dibayar ke perekrut langsung (Gen1) sampai 5 tingkat ke atas rantai referral.</div>
            <div className="opacity-85">Saldo Awal Pendaftaran: {fmtRp(skema.tabungan_awal)} · Closing Langsung (checkout diri sendiri): {skema.closing_persen}% dari harga booking</div>
            {skema.is_hop && <div className="opacity-85">Komisi Head of Program: {fmtRp(skema.hop_nominal)} per registrasi baru</div>}
            <div className="mt-2 text-yellow-300">Terkonfirmasi = sudah di-ACC &amp; ditransfer manual ke Tabungan Umroh oleh admin.</div>
          </div>
        </div>

        {expandTerkonfirmasi && (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 space-y-2">
            <div className="font-bold text-[#0E2F6E] text-sm mb-1">📋 Rincian per Kategori</div>
            {rincianKonfirmasi.length === 0 ? (
              <div className="text-xs text-gray-400">Belum ada yang terkonfirmasi.</div>
            ) : rincianKonfirmasi.map(r => (
              <div key={r.jenis} className="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-gray-600">{KATEGORI_LABEL[r.jenis] || r.jenis}</span>
                <span className={`font-bold ${r.nominal < 0 ? 'text-red-500' : 'text-[#1A4FA0]'}`}>{r.nominal < 0 ? '-' : ''}{fmtRp(Math.abs(r.nominal))}</span>
              </div>
            ))}
          </div>
        )}

        {/* Forecast — potensi ujroh generasi yang BELUM cair, dari downline
            dalam jaringan (sampai gen5) yang masih dalam funnel pendaftaran. */}
        <div onClick={() => setExpandForecast(v => !v)}
          className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all ${expandForecast ? 'border-[#C9952A]' : 'border-[#e0e8f0] hover:border-[#C9952A]'}`}>
          <div className="text-xs text-gray-400 mb-1">📊 Forecast — Calon Ujroh dari Jaringan</div>
          <div className="font-black text-[#C9952A] text-lg">{fmtRp(forecast.potensi_total)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Menunggu {forecast.calon_ujroh.length} downline dalam 5 generasi aktif · {expandForecast ? 'Tutup ▲' : 'Lihat rincian ▼'}</div>
        </div>

        {expandForecast && (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 space-y-2">
            <div className="font-bold text-[#0E2F6E] text-sm mb-1">📋 Downline dalam Funnel Pendaftaran</div>
            {forecast.calon_ujroh.length === 0 ? (
              <div className="text-xs text-gray-400">Semua downline dalam 5 generasi sudah aktif, atau belum ada downline sama sekali.</div>
            ) : forecast.calon_ujroh.map(c => (
              <div key={c.id} className="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-gray-600">{c.name} · Gen{c.level} · {FUNNEL_LABEL[c.funnel_status] || 'Menunggu'}</span>
                <span className="font-bold text-[#C9952A]">{fmtRp(c.potensi_nominal)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Perlu Perhatian — rekrutan langsung yang masih nyangkut di funnel */}
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

        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
          <div className="font-bold text-[#0E2F6E] mb-2">📋 Status Keanggotaan</div>
          {/* Cuma 2 badge (dikonfirmasi user 2026-09-03) — "Akun BSI" dihapus,
              Sahabat Baitullah cuma punya 1 rekening (Tabungan Umroh). */}
          <div className="grid grid-cols-2 gap-2 text-center mb-3">
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-lg">{data.akun.tabungan_haji_status ? '✅' : '⏳'}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Tabungan Umroh</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-lg">{data.akun.cif_bsi ? '✅' : '⏳'}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">CIF BSI</div>
            </div>
          </div>
          {data.akun.cif_bsi && <div className="text-xs text-gray-400 mb-3">Nomor CIF: <b className="text-gray-600">{data.akun.cif_bsi}</b></div>}
          <div className="flex flex-wrap gap-2">
            {data.dokumen.spk_ak && (
              <a href={data.dokumen.spk_ak} target="_blank" rel="noopener noreferrer"
                className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full">📄 SPK-AK</a>
            )}
            {data.dokumen.sk_cif && (
              <a href={data.dokumen.sk_cif} target="_blank" rel="noopener noreferrer"
                className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full">📄 SK-CIF</a>
            )}
          </div>
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
          <div className="font-bold text-[#0E2F6E] mb-2">🎟️ Voucher Pendaftaran</div>
          {data.voucher ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-[#0E2F6E]">{data.voucher.kode} — {fmtRp(data.voucher.potongan)}</div>
                <div className="text-[10px] text-gray-400">
                  {data.voucher.valid_until ? `Berlaku sampai ${new Date(data.voucher.valid_until).toLocaleDateString('id-ID')}` : 'Tanpa batas waktu'}
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${data.voucher.blocked_hop ? 'bg-gray-100 text-gray-500' : data.voucher.used ? 'bg-gray-100 text-gray-500' : data.voucher.aktif ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {data.voucher.blocked_hop ? 'Tidak berlaku (Head of Program)' : data.voucher.used ? 'Sudah dipakai' : data.voucher.aktif ? 'Siap dipakai' : 'Nonaktif'}
              </span>
            </div>
          ) : (
            <div className="text-center text-gray-400 text-sm py-4">Voucher belum diterbitkan admin.</div>
          )}
        </div>

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

        <CollapsibleSection
          title={<h3 className="font-bold text-[#0E2F6E]">👥 Rekrutan Anda</h3>}
          badge={data.rekrutan.length}
        >
          {data.rekrutan.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-6">Belum ada yang direkrut lewat link Anda.</div>
          ) : (
            <div className="space-y-2">
              {data.rekrutan.map(r => (
                <div key={r.id} onClick={() => setDrillDownId(r.id)}
                  className="flex items-center justify-between gap-2 p-2.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm cursor-pointer">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#0E2F6E] truncate">{r.name}</div>
                    <div className="text-[10px] text-gray-400">{r.kode_unik}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Follow-up WA — cuma rekrutan LANGSUNG (dikonfirmasi
                        user 2026-09-22), bukan seluruh jaringan/Team. stopPropagation
                        biar klik tombol WA gak ikut buka modal drill-down. */}
                    {r.wa && (
                      <div onClick={e => e.stopPropagation()}>
                        <TombolWA nomor={r.wa} label="WA" className="inline-flex items-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap" />
                      </div>
                    )}
                    <span className="text-[10px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-2.5 py-1 rounded-full whitespace-nowrap">
                      {r.funnel_status ? (FUNNEL_LABEL[r.funnel_status] || r.funnel_status) : (r.status === 'active' ? 'Aktif' : 'Menunggu')}
                    </span>
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
