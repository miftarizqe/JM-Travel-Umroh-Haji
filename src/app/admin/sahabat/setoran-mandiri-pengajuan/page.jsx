'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
function fmtTanggalJam(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Review pengajuan setoran mandiri self-service (dikonfirmasi user
// 2026-09-29) — jamaah unggah bukti transfer duluan (via Riwayat Tabungan
// Umroh), admin di sini tinggal cocokkan sama mutasi rekening BSI beneran &
// Setujui/Tolak. Approve = saldo LANGSUNG bertambah (auto dikonfirmasi_at),
// beda dari entri komisi ledger lain yang butuh tahap confirm terpisah.
export default function AdminSetoranMandiriPengajuanPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  function muat() {
    fetch('/api/admin/sahabat/setoran-mandiri-pengajuan').then(r => r.json()).then(d => {
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
    let catatan_admin = null;
    if (action === 'reject') {
      catatan_admin = prompt('Alasan tolak (opsional):') || null;
    }
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/admin/sahabat/setoran-mandiri-pengajuan/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, catatan_admin }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusyId(null); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusyId(null);
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <Layout title="💵 Pengajuan Setoran Mandiri" backHref="/admin/sahabat">
      <div className="text-xs text-gray-400 mb-4">
        Bukti transfer yang diunggah jamaah sendiri (setelah menabung ke rekening tabungan umroh pribadinya) — cocokkan dengan mutasi rekening BSI sebelum Setujui. Setujui langsung menambah saldo tabungan umroh jamaah.
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
          Tidak ada pengajuan yang menunggu.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(item => (
            <div key={item.id} className="bg-white rounded-xl border border-emerald-200 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="font-bold text-[#0E2F6E] text-sm">{item.user_name} <span className="text-gray-400 font-normal">({item.kode_unik})</span></div>
                  <div className="text-[10px] text-gray-400">No. Rekening Tabungan Umroh: {item.no_rekening_tabungan_umroh || '-'}</div>
                </div>
                <div className="text-lg font-black text-emerald-700 shrink-0">{fmtRp(item.nominal)}</div>
              </div>
              <a href={item.bukti_path} target="_blank" rel="noopener noreferrer"
                className="inline-block text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full mb-2">
                📎 Lihat Bukti Transfer
              </a>
              <div className="text-[10px] text-gray-400 mb-3">Diajukan {fmtTanggalJam(item.created_at)}</div>
              <div className="flex gap-2">
                <button disabled={busyId === item.id} onClick={() => proses(item, 'approve')}
                  className="flex-1 bg-[#1A4FA0] text-white font-bold py-2 rounded-full disabled:opacity-50 text-xs">
                  ✅ Setujui — Tambah Saldo
                </button>
                <button disabled={busyId === item.id} onClick={() => proses(item, 'reject')}
                  className="bg-gray-100 text-gray-500 font-bold px-4 py-2 rounded-full disabled:opacity-50 text-xs">
                  Tolak
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
