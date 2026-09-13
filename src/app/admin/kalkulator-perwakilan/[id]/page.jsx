'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import TombolWA from '@/app/components/TombolWA';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const KAMAR_LABEL = { quad: 'Quad', triple: 'Triple', double: 'Double' };
const RUTE_LABEL = { direct: 'Direct', transit: 'Transit' };
const STATUS_LABEL = { draft: 'Draft', diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak' };
const STATUS_WARNA = {
  draft: 'bg-gray-100 text-gray-500', diajukan: 'bg-yellow-100 text-yellow-700',
  disetujui: 'bg-green-100 text-green-700', ditolak: 'bg-red-100 text-red-600',
};

function RincianPilihan({ config }) {
  let c = config;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = null; } }
  if (!c) return null;
  const baris = [
    c.rute && `✈️ ${RUTE_LABEL[c.rute] || c.rute}`,
    c.hotel_mekkah && `🏨 Mekkah: ${c.hotel_mekkah}`,
    c.hotel_madinah && `🏨 Madinah: ${c.hotel_madinah}`,
    (c.malam_mekkah || c.malam_madinah) && `🌙 ${c.malam_mekkah || 0}N Mekkah + ${c.malam_madinah || 0}N Madinah`,
    c.mutawwif_hari != null && `🧭 Mutawwif ${c.mutawwif_hari} hari`,
    (c.jumlah_cowok || c.jumlah_cewek) && `👥 ${c.jumlah_cowok || 0} cowok + ${c.jumlah_cewek || 0} cewek`,
  ].filter(Boolean);
  if (baris.length === 0) return null;
  return <div className="text-sm text-gray-500 flex flex-wrap gap-x-3 gap-y-1 mb-3">{baris.map((b, i) => <span key={i}>{b}</span>)}</div>;
}

export default function KalkulatorPerwakilanDetailAdminPage() {
  const params = useParams();
  const router = useRouter();
  const [user] = useCurrentUser();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catatan, setCatatan] = useState('');

  function muat() {
    fetch(`/api/admin/kalkulator-perwakilan?id=${params.id}`).then(r => r.json())
      .then(d => { setLead(d.lead || null); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  if (!user || loading) return <Layout title="🧮 Ajuan Kalkulator Perwakilan" showBack><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>;
  if (!lead) return <Layout title="🧮 Ajuan Kalkulator Perwakilan" showBack><div className="text-center text-gray-400 py-20">Quote tidak ditemukan.</div></Layout>;

  async function proses(status) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/kalkulator-perwakilan', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id, status, catatan_admin: catatan }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal memproses'); setSaving(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";

  return (
    <Layout title="🧮 Detail Ajuan Kalkulator Perwakilan" showBack backHref="/admin/kalkulator-perwakilan">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <div>
              <div className="font-bold text-[#0E2F6E] text-lg">{lead.nama_quote || lead.perwakilan_nama}</div>
              <div className="text-sm text-gray-400">{lead.perwakilan_nama} · {lead.perwakilan_email} {lead.perwakilan_wa ? `· ${lead.perwakilan_wa}` : ''}</div>
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_WARNA[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
          </div>

          <div className="text-sm text-gray-600 mb-2">
            <span className="font-semibold">{lead.template_nama}</span> — {PAKET_LABEL[lead.paket] || lead.paket} / {KAMAR_LABEL[lead.kamar] || lead.kamar}
            {lead.tanggal_berangkat && <> · Berangkat {tgl(lead.tanggal_berangkat)}</>}
          </div>
          <RincianPilihan config={lead.addon_config} />

          <div className="bg-gray-50 rounded-xl p-4 space-y-1 mb-4 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">HPP</span><span className="font-semibold">{rp(lead.hpp_snapshot)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Margin/Ujroh Perwakilan</span><span className="font-semibold">{rp(lead.margin_perwakilan)}</span></div>
            <div className="flex justify-between border-t border-gray-200 pt-1 mt-1"><span className="font-bold text-[#0E2F6E]">Harga Jual Diajukan</span><span className="font-bold text-[#0E2F6E]">{rp(lead.harga_jual_perwakilan)}</span></div>
          </div>

          {lead.catatan_perwakilan && (
            <div className="text-sm text-gray-600 mb-4"><span className="font-semibold">Catatan perwakilan:</span> {lead.catatan_perwakilan}</div>
          )}

          <div className="text-xs text-gray-400 mb-4">
            Dibuat {tgl(lead.created_at)}{lead.diajukan_at && <> · Diajukan {tgl(lead.diajukan_at)}</>}{lead.diproses_at && <> · Diproses {tgl(lead.diproses_at)}</>}
          </div>

          {lead.status === 'diajukan' ? (
            <>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Catatan Admin (opsional)</label>
              <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={2} className={`${inp} mb-3`} />
              <div className="flex gap-2 mb-2">
                <TombolWA nomor={lead.perwakilan_wa} label="Hubungi Perwakilan"
                  pesan={`Halo ${lead.perwakilan_nama}, mengenai ajuan quote ${lead.template_nama} (${PAKET_LABEL[lead.paket]||lead.paket} ${KAMAR_LABEL[lead.kamar]||lead.kamar}) — ${rp(lead.harga_jual_perwakilan)}, ada yang mau saya diskusikan dulu.`} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => proses('disetujui')} disabled={saving} className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-full">✅ Setujui</button>
                <button onClick={() => proses('ditolak')} disabled={saving} className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-full">❌ Tolak</button>
              </div>
            </>
          ) : lead.status === 'disetujui' ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
              ✅ Disetujui.
              {lead.program_id ? (
                <>
                  {' '}Program eksklusif sudah dibuat dari quote ini.{' '}
                  <button onClick={() => router.push('/admin/programs?publish_type=perwakilan')} className="font-bold underline">Lihat di Kelola Program →</button>
                </>
              ) : (
                <>
                  {' '}Program belum dibuat — quote ini otomatis jadi program{' '}
                  <b>khusus {lead.perwakilan_nama}</b> (cuma dia yang bisa checkout).{' '}
                  <button onClick={() => router.push(`/admin/programs?from_lead=${lead.id}`)} className="font-bold underline">Buat Program Eksklusif dari Quote Ini →</button>
                </>
              )}
              {lead.catatan_admin && <div className="mt-2 text-xs">Catatan: {lead.catatan_admin}</div>}
            </div>
          ) : lead.status === 'ditolak' ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
              ❌ Ditolak. {lead.catatan_admin && <div className="mt-1 text-xs">Catatan: {lead.catatan_admin}</div>}
            </div>
          ) : (
            <div className="text-xs text-gray-400">Perwakilan belum mengajukan quote ini (masih draft).</div>
          )}
        </div>
      </div>
    </Layout>
  );
}
