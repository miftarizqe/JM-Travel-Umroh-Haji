'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

function fmtTanggalJam(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Halaman ACC pengajuan ganti Target Impian (dikonfirmasi user 2026-09-29)
// — jamaah ajukan sendiri dari Profil (POST /api/sahabat/ganti-target),
// admin/super_admin approve/reject di sini. Approve = program_id/
// target_estimasi_harga beneran ditimpa server-side; SENGAJA TIDAK
// menyentuh dokumen legal (SK-CIF/Surat Pemblokiran/SPK-AK) yang udah
// ditandatangani — ganti target gak butuh perjanjian baru.
export default function AdminGantiTargetPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  function muat() {
    fetch('/api/admin/sahabat/ganti-target').then(r => r.json()).then(d => {
      setList(d.pengajuan || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function proses(item, action) {
    const label = item.tipe === 'pembatalan_diajukan'
      ? (action === 'approve' ? `Setujui pembatalan untuk ${item.user_name}? Target akan balik ke "${item.target_lama_name}".` : `Tolak pembatalan — pengajuan ganti target ${item.user_name} lanjut jalan lagi?`)
      : `Tolak pengajuan ganti target ${item.user_name}?`;
    if ((action === 'reject' || item.tipe === 'pembatalan_diajukan') && !confirm(label)) return;
    setBusyId(item.user_id);
    try {
      const res = await fetch('/api/admin/sahabat/ganti-target', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: item.user_id, action }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusyId(null); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusyId(null);
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <Layout title="🎯 Pengajuan Ganti Target" backHref="/admin/sahabat">
      <div className="text-xs text-gray-400 mb-4">
        Pengajuan ganti Target Impian (program eksklusif) dari anggota Sahabat Baitullah — menunggu ACC. Approve langsung mengganti program target di data pendaftaran; tidak berdampak ke dokumen legal yang sudah ditandatangani.
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
          Tidak ada pengajuan ganti target yang menunggu.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(item => {
            const isPembatalan = item.tipe === 'pembatalan_diajukan';
            return (
            <div key={item.id} className={`bg-white rounded-xl border p-4 ${isPembatalan ? 'border-red-200' : 'border-purple-200'}`}>
              {isPembatalan && (
                <div className="inline-block bg-red-100 text-red-700 text-[10px] font-bold px-2.5 py-1 rounded-full mb-2">🚫 Permintaan Pembatalan</div>
              )}
              <div className="font-bold text-[#0E2F6E] text-sm mb-2">{item.user_name} <span className="text-gray-400 font-normal">({item.kode_unik})</span></div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <div className="text-gray-400 mb-0.5">Target Lama</div>
                  <div className="font-semibold text-gray-600">{item.target_lama_name || '-'}</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-2.5">
                  <div className="text-purple-400 mb-0.5">Target Baru {isPembatalan ? '(diajukan, mau dibatalkan)' : '(diajukan)'}</div>
                  <div className="font-semibold text-purple-700">{item.target_baru_name || '-'}</div>
                </div>
              </div>
              <div className="text-[10px] text-gray-400 mb-3">Diajukan {fmtTanggalJam(item.target_ganti_diajukan_at)}</div>
              <div className="flex gap-2">
                <button disabled={busyId === item.user_id} onClick={() => proses(item, 'approve')}
                  className="flex-1 bg-[#1A4FA0] text-white font-bold py-2 rounded-full disabled:opacity-50 text-xs">
                  {isPembatalan ? '✅ Setujui Pembatalan' : '✅ Setujui'}
                </button>
                <button disabled={busyId === item.user_id} onClick={() => proses(item, 'reject')}
                  className="bg-gray-100 text-gray-500 font-bold px-4 py-2 rounded-full disabled:opacity-50 text-xs">
                  {isPembatalan ? 'Tolak Pembatalan' : 'Tolak'}
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
