'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
function fmtTanggal(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Riwayat Closing Agen — mirror /admin/perwakilan/riwayat-closing, TAPI cuma
// 1 seksi (jenis 'ujroh_agen' doang, 1 penerima per booking, gak ada rantai
// reseller/upline buat di-expand) (dikonfirmasi user 2026-10-17).
export default function RiwayatClosingAgenPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [closing, setClosing] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    fetch('/api/admin/agen/closing').then(r => r.json()).then(d => {
      setClosing(d.closing || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  if (!user || !['admin', 'super_admin'].includes(user.role)) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <Layout title="🔁 Riwayat Closing Agen" backHref="/admin/agen">
      <div className="text-xs text-gray-400 mb-4">
        Booking yang closing lewat link referral agen (jenis <code>ujroh_agen</code>). 100 baris terbaru.
      </div>
      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : closing.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">Belum ada closing via agen.</div>
      ) : (
        <div className="space-y-2">
          {closing.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-3 text-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-[#0E2F6E]">{c.prog_name}</div>
                  <div className="text-xs text-gray-400">Booking #{c.booking_id} · {c.jumlah_jamaah} jamaah</div>
                  <div className="text-xs text-gray-400 mt-0.5">Via: <b className="text-[#1A4FA0]">{c.agen_nama}</b>{c.agen_kode_unik && ` (${c.agen_kode_unik})`}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold text-[#C9952A]">{fmtRp(c.nominal)}</div>
                  <div className={`text-[10px] ${c.dikonfirmasi_at ? 'text-green-600' : 'text-yellow-600'}`}>
                    {c.dikonfirmasi_at ? `Cair — ${fmtTanggal(c.dikonfirmasi_at)}` : 'Pending'}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{fmtTanggal(c.created_at)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
