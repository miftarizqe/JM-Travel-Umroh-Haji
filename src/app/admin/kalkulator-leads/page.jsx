'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const KAMAR_LABEL = { quad: 'Quad', triple: 'Triple', double: 'Double' };
const STATUS_LABEL = { estimasi: 'Baru Hitung', diajukan: 'Ajuan Budget' };
const STATUS_WARNA = { estimasi: 'bg-gray-100 text-gray-500', diajukan: 'bg-teal-100 text-teal-700' };
const TINDAK_LANJUT_LABEL = { baru: 'Baru', dihubungi: 'Dihubungi', selesai: 'Selesai' };
const TINDAK_LANJUT_WARNA = { baru: 'bg-red-100 text-red-700', dihubungi: 'bg-blue-100 text-blue-700', selesai: 'bg-green-100 text-green-700' };

// Database lead pengunjung yang pakai Kalkulator Estimasi Publik (baik yang
// cuma hitung doang maupun yang udah "Ajukan Budget Sekarang") — buat admin
// follow-up manual lewat WA, walaupun mereka gak jadi booking. Kartu di sini
// cuma ringkasan — detail lengkap (rincian wishlist, HPP/margin/komisi,
// aksi follow-up) ada di halaman /admin/kalkulator-leads/[id] (dikonfirmasi
// user 2026-08-21, mirip pola detail booking).
export default function KalkulatorLeadsPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTindakLanjut, setFilterTindakLanjut] = useState('');

  function muat() {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterTindakLanjut) params.set('status_tindak_lanjut', filterTindakLanjut);
    fetch(`/api/admin/kalkulator-leads?${params.toString()}`).then(r => r.json())
      .then(d => { setLeads(d.leads || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filterStatus, filterTindakLanjut]);

  if (!user || loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const inp = "px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs";

  return (
    <Layout title="🧮 Ajuan Budget Kalkulator" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Semua orang yang pernah pakai Kalkulator Estimasi Publik (di <span className="font-semibold">/kalkulator</span>) — termasuk yang
        cuma lihat estimasi tanpa jadi booking. Klik 1 baris buat lihat detail & follow up.
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inp}>
          <option value="">Semua Status</option>
          <option value="estimasi">Baru Hitung</option>
          <option value="diajukan">Ajuan Budget</option>
        </select>
        <select value={filterTindakLanjut} onChange={e => setFilterTindakLanjut(e.target.value)} className={inp}>
          <option value="">Semua Follow-up</option>
          <option value="baru">Baru</option>
          <option value="dihubungi">Dihubungi</option>
          <option value="selesai">Selesai</option>
        </select>
      </div>

      {leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">
          Belum ada yang pakai kalkulator.
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map(l => (
            <div key={l.id} onClick={() => router.push(`/admin/kalkulator-leads/${l.id}`)}
              className="bg-white rounded-xl border border-[#e0e8f0] p-4 cursor-pointer hover:shadow-md hover:border-[#1A4FA0] transition-all">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                <div>
                  <div className="font-bold text-[#0E2F6E]">{l.user_nama}</div>
                  <div className="text-xs text-gray-400">{l.user_email} {l.user_wa ? `· ${l.user_wa}` : ''}</div>
                </div>
                <div className="flex gap-2">
                  {l.tipe === 'custom' && <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-700">🎨 Custom</span>}
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATUS_WARNA[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${TINDAK_LANJUT_WARNA[l.status_tindak_lanjut]}`}>{TINDAK_LANJUT_LABEL[l.status_tindak_lanjut]}</span>
                </div>
              </div>
              <div className="text-sm text-gray-600">
                {l.tipe === 'custom'
                  ? <>🎨 {(l.catatan_custom || '').slice(0, 80)}{(l.catatan_custom || '').length > 80 ? '...' : ''}</>
                  : <>{l.template_nama} — {l.paket === 'campuran' ? 'Campuran' : `${PAKET_LABEL[l.paket] || l.paket}/${KAMAR_LABEL[l.kamar] || l.kamar}`} · <span className="font-bold text-[#1A4FA0]">{rp(l.harga_jual)}</span></>}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">Dihitung {tgl(l.created_at)}{l.diajukan_at && <> · Ajuan budget {tgl(l.diajukan_at)}</>}</div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
