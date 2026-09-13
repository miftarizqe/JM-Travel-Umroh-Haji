'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const KAMAR_LABEL = { quad: 'Quad', triple: 'Triple', double: 'Double' };
const STATUS_LABEL = { draft: 'Draft', diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak' };
const STATUS_WARNA = {
  draft: 'bg-gray-100 text-gray-500', diajukan: 'bg-yellow-100 text-yellow-700',
  disetujui: 'bg-green-100 text-green-700', ditolak: 'bg-red-100 text-red-600',
};

// Ajuan quote dari Kalkulator Perwakilan — perwakilan eksplorasi HPP+margin
// sendiri, ajukan ke sini kalau mau dipertimbangkan jadi program resmi.
// Approve/reject TIDAK auto-publish — admin yang bikin programnya manual di
// /admin/programs kalau setuju (dikonfirmasi user 2026-08-21).
export default function KalkulatorPerwakilanAdminPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('diajukan');

  function muat() {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    fetch(`/api/admin/kalkulator-perwakilan?${params.toString()}`).then(r => r.json())
      .then(d => { setLeads(d.leads || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filterStatus]);

  if (!user || loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const inp = "px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs";

  return (
    <Layout title="🧮 Ajuan Kalkulator Perwakilan" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Quote yang diajukan perwakilan lewat Kalkulator Perwakilan (HPP + margin/ujroh sendiri) buat dipertimbangkan jadi program resmi.
        Setujui/tolak di sini TIDAK otomatis bikin program — kalau setuju, buat programnya manual di Kelola Program.
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inp}>
          <option value="">Semua Status</option>
          <option value="diajukan">Diajukan</option>
          <option value="draft">Draft</option>
          <option value="disetujui">Disetujui</option>
          <option value="ditolak">Ditolak</option>
        </select>
      </div>

      {leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Belum ada ajuan.</div>
      ) : (
        <div className="space-y-2">
          {leads.map(l => (
            <div key={l.id} onClick={() => router.push(`/admin/kalkulator-perwakilan/${l.id}`)}
              className="bg-white rounded-xl border border-[#e0e8f0] p-4 cursor-pointer hover:shadow-md hover:border-[#1A4FA0] transition-all">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                <div>
                  <div className="font-bold text-[#0E2F6E]">{l.nama_quote || l.perwakilan_nama}</div>
                  <div className="text-xs text-gray-400">{l.perwakilan_nama} · {l.perwakilan_email} {l.perwakilan_wa ? `· ${l.perwakilan_wa}` : ''}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATUS_WARNA[l.status]}`}>{STATUS_LABEL[l.status]}</span>
              </div>
              <div className="text-sm text-gray-600">
                {l.template_nama} — {PAKET_LABEL[l.paket] || l.paket}/{KAMAR_LABEL[l.kamar] || l.kamar} ·
                HPP {rp(l.hpp_snapshot)} + Margin {rp(l.margin_perwakilan)} = <span className="font-bold text-[#1A4FA0]">{rp(l.harga_jual_perwakilan)}</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">Dibuat {tgl(l.created_at)}{l.diajukan_at && <> · Diajukan {tgl(l.diajukan_at)}</>}</div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
