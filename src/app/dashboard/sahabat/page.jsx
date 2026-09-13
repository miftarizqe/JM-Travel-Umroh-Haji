'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import DownlineModalSahabat from '@/app/components/DownlineModalSahabat';

const FUNNEL_LABEL = {
  pending: 'Upload Bukti TF', menunggu_bsi: 'Menunggu BSI', menunggu_sk_cif: 'Menunggu SK-CIF',
  active: 'Aktif', ditolak: 'Ditolak',
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
            {data.ringkasan.saldo_pending > 0 && (
              <div className="text-right shrink-0">
                <div className="text-xs font-bold bg-white/15 rounded-full px-2.5 py-1">⏳ {fmtRp(data.ringkasan.saldo_pending)}</div>
                <div className="text-[9px] opacity-70 mt-0.5">Saldo Pending</div>
              </div>
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
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${data.voucher.used ? 'bg-gray-100 text-gray-500' : data.voucher.aktif ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {data.voucher.used ? 'Sudah dipakai' : data.voucher.aktif ? 'Siap dipakai' : 'Nonaktif'}
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

        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
          <div className="font-bold text-[#0E2F6E] mb-2">👥 Rekrutan Anda</div>
          {data.rekrutan.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-6">Belum ada yang direkrut lewat link Anda.</div>
          ) : (
            <div className="space-y-2">
              {data.rekrutan.map(r => (
                <div key={r.id} onClick={() => setDrillDownId(r.id)}
                  className="flex items-center justify-between p-2.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm cursor-pointer">
                  <div>
                    <div className="font-semibold text-[#0E2F6E]">{r.name}</div>
                    <div className="text-[10px] text-gray-400">{r.kode_unik}</div>
                  </div>
                  <span className="text-[10px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-2.5 py-1 rounded-full">
                    {r.funnel_status ? (FUNNEL_LABEL[r.funnel_status] || r.funnel_status) : (r.status === 'active' ? 'Aktif' : 'Menunggu')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {drillDownId && (
          <DownlineModalSahabat targetId={drillDownId} onClose={() => setDrillDownId(null)} />
        )}
      </div>
    </Layout>
  );
}
