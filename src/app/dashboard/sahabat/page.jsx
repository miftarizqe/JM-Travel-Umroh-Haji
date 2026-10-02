'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { CollapsibleSection } from '@/app/components/Collapsible';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { hariIniWib, keTanggal } from '@/lib/jadwalTarget';
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
  const [menyimpanPersetujuan, setMenyimpanPersetujuan] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [drillDownId, setDrillDownId] = useState(null);
  // Popup Ganti Target Impian (dikonfirmasi user 2026-09-30) — SENGAJA
  // cuma reminder singkat + PILIH program di sini, TIDAK langsung
  // ngajuin dari popup ini ("jgn dibuat semudah itu"). Klik "Lanjutkan"
  // langsung ke /program/[id] program yang dipilih (skip halaman /programs
  // sama sekali) — proses baca S&K + konfirmasi eksplisit ada di sana.
  const [gantiPopupOpen, setGantiPopupOpen] = useState(false);
  const [programEksklusif, setProgramEksklusif] = useState([]);
  const [loadingProgramEksklusif, setLoadingProgramEksklusif] = useState(false);
  const [pilihanProgramId, setPilihanProgramId] = useState(null);
  const [pembatalanLoading, setPembatalanLoading] = useState(false);

  async function setujuDataPribadi() {
    setMenyimpanPersetujuan(true);
    try {
      const res = await fetch('/api/sahabat/setuju-data-pribadi', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error || 'Gagal menyimpan persetujuan'); setMenyimpanPersetujuan(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setMenyimpanPersetujuan(false);
  }

  function muat() {
    fetch(`/api/sahabat/dashboard?sahabat_id=${user.id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  function bukaGantiPopup() {
    setGantiPopupOpen(true);
    setPilihanProgramId(null);
    if (programEksklusif.length === 0) {
      setLoadingProgramEksklusif(true);
      fetch('/api/programs').then(r => r.json())
        .then(d => {
          const hariIni = hariIniWib();
          setProgramEksklusif((d.programs || []).filter(p => p.publish_type === 'sahabat_baitullah'
            && (!keTanggal(p.tanggal_berangkat) || keTanggal(p.tanggal_berangkat) >= hariIni)));
        })
        .catch(() => setProgramEksklusif([]))
        .finally(() => setLoadingProgramEksklusif(false));
    }
  }

  function lanjutkanKeProgram() {
    if (!pilihanProgramId) return;
    router.push(`/program/${pilihanProgramId}`);
  }

  async function batalkanPengajuan() {
    if (!confirm('Ajukan pembatalan pengajuan ganti target ini? Tetap perlu menunggu ACC admin.')) return;
    setPembatalanLoading(true);
    try {
      const res = await fetch('/api/sahabat/ganti-target', { method: 'PATCH' });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setPembatalanLoading(false); return; }
      alert(d.message);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setPembatalanLoading(false);
  }

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'sahabat_baitullah') { router.push('/'); return; }
    // Belum aktif (masih dalam funnel pendaftaran) — arahkan ke status
    // tracker, bukan dashboard yang isinya masih kosong semua.
    if (user.status !== 'active') { router.push('/status-pendaftaran-sahabat'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Catatan SYSTEM UJROH E3: jadwal keberangkatan target lewat (atau program
  // target dinonaktifkan) sebelum target tercapai -> WAJIB pilih program lain.
  // Popup Ganti Target dibuka otomatis sekali per sesi browser.
  const wajibGantiTarget = !!(data?.target && !(data.target.nominal > 0 && data.ringkasan?.saldo_tabungan_umroh >= data.target.nominal)
    && (data.target.jadwal_terlewat || !data.target.program_aktif)
    && !['diajukan', 'pembatalan_diajukan'].includes(data.target.ganti_status));
  useEffect(() => {
    if (!wajibGantiTarget) return;
    try {
      if (sessionStorage.getItem('popupWajibGantiTarget')) return;
      sessionStorage.setItem('popupWajibGantiTarget', '1');
    } catch { /* storage diblokir — tetap tampilkan popup */ }
    bukaGantiPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wajibGantiTarget]);

  if (loading || !data?.akun) return <Layout title="🤝 Dashboard Sahabat Baitullah"><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

  // Persetujuan data pribadi untuk akun lama (dikonfirmasi user 2026-10-02) —
  // ditanya sekali sebelum dashboard terbuka. Selama belum setuju, server tidak
  // menampilkan nama/telepon/progres akun ini ke upline (lihat lib/jaringan.js).
  // Disimpan lewat endpoint Go POST /api/sahabat/setuju-data-pribadi.
  if (!data.akun.setuju_data_pribadi_at && String(data.akun.id) === String(user?.id)) {
    return (
      <Layout title="🤝 Dashboard Sahabat Baitullah">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-[#e0e8f0] p-6 space-y-4">
          <div className="text-3xl text-center">🔐</div>
          <div className="font-bold text-[#0E2F6E] text-center">Persetujuan Data Pribadi</div>
          <div className="text-sm text-gray-600 leading-relaxed">
            Di Program Sahabat Baitullah, pengajak (upline) Anda dapat melihat:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><b>Nama</b> Anda</li>
              <li><b>No. telepon</b> Anda — hanya untuk pengajak langsung Anda</li>
              <li><b>Progres tabungan umroh</b> Anda (persentase menuju target)</li>
            </ul>
            <div className="mt-2 text-xs text-gray-400">Tujuannya agar pengajak bisa berkomunikasi &amp; mendampingi Anda. Nominal saldo Anda tidak pernah ditampilkan.</div>
          </div>
          <button onClick={setujuDataPribadi} disabled={menyimpanPersetujuan}
            className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full disabled:opacity-50">
            {menyimpanPersetujuan ? 'Menyimpan...' : '✅ Saya Setuju'}
          </button>
        </div>
      </Layout>
    );
  }

  // Kode invite BEDA dari kode akun (kode_unik) — khusus buat mengundang
  // orang jadi Jamaah Sahabat Baitullah BARU (dikonfirmasi user 2026-09-03,
  // mirror kode_invite_perwakilan). Link referral berbasis kode_unik
  // (?role=sahabat&ref=SBJMxxxx) DIHAPUS dari Beranda (dikonfirmasi user
  // 2026-09-27) — isinya sama-sama buka pendaftaran Sahabat, bikin bingung,
  // & kode_unik sekuensial gampang ditebak. Cukup satu link rekrut ini.
  const linkInvite = typeof window !== 'undefined' && data.akun.kode_invite_sahabat
    ? `${window.location.origin}/register?role=sahabat_baitullah&ref=${data.akun.kode_invite_sahabat}` : '';

  const skema = data.skema || {};
  const perluPerhatian = data.perlu_perhatian || { belum_tf: [], menunggu_bsi: [], menunggu_sk_cif: [] };
  const adaYangPerlu = perluPerhatian.belum_tf.length + perluPerhatian.menunggu_bsi.length + perluPerhatian.menunggu_sk_cif.length > 0;
  const closingLangsung = data.closing_langsung || { items: [], total_confirmed: 0, total_pending: 0 };
  const forecast = data.forecast || { calon_ujroh: [], potensi_total: 0 };
  const adaPending = data.ringkasan.saldo_pending > 0;
  // Progress Tabungan vs Target Impian (dikonfirmasi user 2026-09-29) —
  // target.nominal = target_estimasi_harga yang dikunci di wizard
  // daftar-sahabat (program eksklusif yang dipilih paling awal), BUKAN
  // harga program yang bisa berubah belakangan. Saldo cukup begitu
  // saldo_tabungan_umroh >= nominal target, munculin tombol checkout.
  const target = data.target;
  const persenTarget = target?.nominal > 0 ? Math.min(100, Math.round((data.ringkasan.saldo_tabungan_umroh / target.nominal) * 100)) : 0;
  const targetTercapai = target?.nominal > 0 && data.ringkasan.saldo_tabungan_umroh >= target.nominal;

  function salinLinkInvite() {
    navigator.clipboard.writeText(linkInvite).then(() => { setCopiedInvite(true); setTimeout(() => setCopiedInvite(false), 2000); });
  }

  return (
    <Layout title="🤝 Dashboard Sahabat Baitullah">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Status keaktifan ujroh (aturan 6 bulan, dihitung server —
            lib/keaktifanSahabat.js, dikonfirmasi user 2026-10-02). */}
        {data.keaktifan_ujroh?.berlaku_sampai && (
          data.keaktifan_ujroh.aktif ? (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-xs text-green-700">
              ✅ <b>Ujroh aktif</b> sampai {new Date(data.keaktifan_ujroh.berlaku_sampai).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}. Ajak minimal 1 Sahabat baru (Gen1) sebelum tanggal itu supaya ujroh tetap masuk.
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-700">
              ⏸️ <b>Ujroh baru sedang berhenti</b> — sudah lebih dari 6 bulan tanpa Sahabat baru (Gen1). Ajak 1 Sahabat baru untuk mengaktifkan kembali. Saldo Anda yang sudah ada tidak terpengaruh.
            </div>
          )
        )}
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
            <div className="opacity-85">Saldo Awal Pendaftaran: {fmtRp(skema.tabungan_awal)} · Closing Langsung (checkout diri sendiri): margin penuh (harga jual − HPP) ke Head of Program</div>
            {skema.is_hop && <div className="opacity-85">Komisi Head of Program: {fmtRp(skema.hop_nominal)} per registrasi baru</div>}
            <div className="mt-2 text-yellow-300">Terkonfirmasi = sudah di-ACC &amp; ditransfer manual ke Tabungan Umroh oleh admin.</div>
          </div>
        </div>

        {/* Progress Tabungan vs Target Impian (dikonfirmasi user
            2026-09-29) — jamaah pilih program eksklusif di awal
            (daftar-sahabat), di sini dibandingin langsung saldo tabungan
            umroh vs harga target itu. Begitu saldo udah cukup, muncul
            tombol lanjut checkout ke program yang sama — kalau program
            targetnya somehow dinonaktifkan admin, tombol diganti pesan
            hubungi admin (bukan disembunyikan diam-diam). */}
        {target && (
          <div className={`bg-white rounded-xl border-2 p-4 ${wajibGantiTarget ? 'border-red-300' : 'border-[#e0e8f0]'}`}>
            {wajibGantiTarget && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-xs text-red-700">
                <div className="font-bold text-sm mb-1">⏰ Wajib Pilih Program Lain</div>
                {target.jadwal_terlewat
                  ? <>Jadwal keberangkatan <b>{target.program_name}</b>{target.tanggal_berangkat ? ` (${new Date(target.tanggal_berangkat).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })})` : ''} sudah lewat sebelum target tabungan Anda tercapai.</>
                  : <>Program <b>{target.program_name}</b> sudah tidak aktif sebelum target tabungan Anda tercapai.</>}
                {' '}Silakan pilih program lain — target akan mengikuti harga program baru setelah disetujui admin. Saldo Anda tetap aman.
                <button onClick={bukaGantiPopup}
                  className="mt-2 w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-full">
                  🔄 Pilih Program Lain
                </button>
              </div>
            )}
            <div className="text-xs text-gray-400 mb-1">🎯 Progress Tabungan — {target.program_name || 'Target Impian'}</div>
            <div className="flex items-end justify-between mb-2">
              <div className="text-xl font-black text-[#0E2F6E]">{fmtRp(data.ringkasan.saldo_tabungan_umroh)}</div>
              <div className="text-xs text-gray-400">dari target {fmtRp(target.nominal)}</div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${targetTercapai ? 'bg-green-500' : 'bg-[#1A4FA0]'}`} style={{ width: `${persenTarget}%` }} />
            </div>
            <div className="text-[10px] text-gray-400 mt-1">{persenTarget}% tercapai</div>
            {targetTercapai ? (
              target.program_aktif ? (
                <button onClick={() => router.push(`/program/${target.program_id}`)}
                  className="mt-3 w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold py-2.5 rounded-full">
                  ✅ Saldo Cukup — Lanjutkan Checkout →
                </button>
              ) : (
                <div className="text-xs text-yellow-600 mt-2">Saldo Anda sudah cukup, tapi program target ini sudah tidak aktif. Hubungi admin JM Travel untuk melanjutkan.</div>
              )
            ) : (
              <div className="text-[10px] text-gray-400 mt-1">Kurang {fmtRp(Math.max(0, target.nominal - data.ringkasan.saldo_tabungan_umroh))} lagi menuju target.</div>
            )}
            {/* Ganti Target Impian — popup reminder+pilih program, LANGSUNG
                ke /program/[id] pas "Lanjutkan" (dikonfirmasi user
                2026-09-30, "jgn dibuat semudah itu" — bukan submit
                instan dari sini). Alur ajukan beneran (baca S&K
                scroll-gate + konfirmasi eksplisit) ada di halaman detail
                program itu. Pembatalan JUGA wajib ACC admin, konsisten
                sama filosofi fitur ini — gak ada yang instan sepihak. */}
            {target.ganti_status === 'diajukan' ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 text-xs text-yellow-700 mt-3">
                <div className="mb-2">⏳ Menunggu ACC admin — pengajuan pindah ke <b>{target.ganti_program_name}</b>.</div>
                <button onClick={batalkanPengajuan} disabled={pembatalanLoading}
                  className="w-full text-[11px] font-bold text-red-600 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-full">
                  {pembatalanLoading ? 'Mengajukan...' : 'Batalkan Pengajuan'}
                </button>
              </div>
            ) : target.ganti_status === 'pembatalan_diajukan' ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 text-xs text-yellow-700 mt-3">
                ⏳ Pembatalan sedang menunggu ACC admin — target sementara masih <b>{target.program_name}</b>.
              </div>
            ) : !wajibGantiTarget && (
              <button onClick={bukaGantiPopup}
                className="mt-3 w-full text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d9e6f7] px-4 py-2 rounded-full">
                🔄 Ganti Target Impian
              </button>
            )}
          </div>
        )}

        {gantiPopupOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setGantiPopupOpen(false)}>
            <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-3">
                <div className="font-bold text-[#0E2F6E] text-lg">🎯 Ganti Target Impian</div>
                <button onClick={() => setGantiPopupOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>
              <div className="text-xs text-gray-500 bg-[#E8F0FB] rounded-lg p-3 mb-3">
                {wajibGantiTarget && <b className="block text-red-600 mb-1">Jadwal target Anda sudah lewat — wajib pilih program lain.</b>}
                Mengganti Target Impian akan menonaktifkan sementara program aktif Anda saat ini sampai disetujui admin. Pilih dulu program tujuannya di bawah — detail syarat & konfirmasi ada di halaman program tersebut.
              </div>
              {loadingProgramEksklusif ? (
                <div className="text-center text-gray-400 text-sm py-6">Memuat...</div>
              ) : programEksklusif.filter(p => p.id !== target?.program_id).length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-6">Belum ada program eksklusif lain yang aktif.</div>
              ) : (
                <div className="space-y-2 mb-4">
                  {programEksklusif.filter(p => p.id !== target?.program_id).map(p => (
                    <div key={p.id} onClick={() => setPilihanProgramId(p.id)}
                      className={`flex items-center justify-between rounded-lg px-3 py-2.5 border-2 cursor-pointer transition-colors ${pilihanProgramId === p.id ? 'border-[#1A4FA0] bg-[#E8F0FB]' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#0E2F6E] truncate">{p.name}</div>
                        <div className="text-[10px] text-gray-400">{p.type} · {p.durasi} Hari</div>
                      </div>
                      <div className={`shrink-0 w-4 h-4 rounded-full border-2 ${pilihanProgramId === p.id ? 'border-[#1A4FA0] bg-[#1A4FA0]' : 'border-gray-300'}`} />
                    </div>
                  ))}
                </div>
              )}
              <button onClick={lanjutkanKeProgram} disabled={!pilihanProgramId}
                className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-full transition-colors">
                Lanjutkan →
              </button>
            </div>
          </div>
        )}

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

        {linkInvite && (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
            <div className="font-bold text-[#0E2F6E] mb-2">🔗 Link Rekrut Sahabat Baitullah</div>
            <div className="flex gap-2 mb-1">
              <div className="px-3 py-2 rounded-lg border-2 border-gray-100 bg-gray-50 text-sm font-bold text-[#0E2F6E]">{data.akun.kode_invite_sahabat}</div>
              <input readOnly value={linkInvite} className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-100 bg-gray-50 text-xs text-gray-500" />
              <button onClick={salinLinkInvite} className="bg-[#1A4FA0] text-white text-xs font-bold px-4 rounded-lg">
                {copiedInvite ? '✓' : 'Salin'}
              </button>
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Bagikan link ini untuk mengajak orang jadi anggota Sahabat Baitullah baru — otomatis tercatat sebagai rekrutan Anda (generasi berikutnya).</div>
          </div>
        )}

        {/* Kartu dokumen (Unduh PDF blanko + link scan yang sudah
            ditandatangani) DIPINDAH ke Profil (dikonfirmasi user
            2026-09-29) — dikonsolidasi 1 tempat, gak dobel lagi di sini.
            Beranda fokus ke ujroh/aktivitas/target sesuai keputusan awal
            2026-09-22. */}

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
