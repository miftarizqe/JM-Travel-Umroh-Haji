'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
function namaPengajuan(p) { return p.prog_name || `Program #${p.prog_id}`; }

const STATUS_LABEL = { draft: 'Draft', diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak' };
const STATUS_WARNA = {
  draft: 'bg-gray-100 text-gray-500', diajukan: 'bg-yellow-100 text-yellow-700',
  disetujui: 'bg-green-100 text-green-700', ditolak: 'bg-red-100 text-red-700',
};

// Detail pengajuan pencairan ujroh agen — mirror struktur
// /admin/perwakilan/pencairan/[id] TAPI jauh lebih simpel: gak ada upload
// bukti TTD, gak ada rekening/konfirmasi TF per-penerima. "Setujui" itu 1
// aksi final — server langsung konfirmasi semua komisi_ledger terkait +
// catat rekening_ledger (dikonfirmasi user 2026-10-17 — "Gak perlu, cukup
// status tracker", transfer ke leader dilakukan manual di luar sistem).
export default function PencairanAgenDetailPage() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const [user] = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const isSuperAdmin = user?.role === 'super_admin';

  function muat() {
    fetch(`/api/admin/agen/rekap-ujroh?pengajuan_id=${id}`).then(r => r.json()).then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  async function transisi(action) {
    if (action === 'tolak' && !confirm('Tolak pengajuan ini? Baris di dalamnya akan lepas & masuk pengajuan berikutnya.')) return;
    if (action === 'setujui' && !confirm('Setujui pengajuan ini? Komisi langsung dianggap cair & tercatat di rekening — tindakan ini gak bisa dibatalkan.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/agen/pengajuan-ujroh/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusy(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  async function hapusPengajuan() {
    if (!confirm('Hapus pengajuan ini? Baris di dalamnya akan lepas & bisa masuk pengajuan lain nanti. Tindakan ini gak bisa dibatalkan.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/agen/pengajuan-ujroh/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusy(false); return; }
      router.push('/admin/agen/pencairan');
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  if (!user || !['admin', 'super_admin'].includes(user.role)) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }
  if (loading) {
    return <Layout title="💸 Detail Pencairan Agen" backHref="/admin/agen/pencairan"><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;
  }
  if (!data?.pengajuan) {
    return <Layout title="💸 Detail Pencairan Agen" backHref="/admin/agen/pencairan"><div className="text-center text-gray-400 py-10">Pengajuan tidak ditemukan.</div></Layout>;
  }

  const p = data.pengajuan;

  return (
    <Layout title="💸 Pencairan Komisi Agen" backHref="/admin/agen/pencairan">
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-bold text-[#0E2F6E]">{namaPengajuan(p)}</div>
            <div className="text-xs text-gray-400">#{p.id}</div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_WARNA[p.status] || 'bg-gray-100 text-gray-500'}`}>
            {STATUS_LABEL[p.status] || p.status}
          </span>
        </div>
        <div className="text-sm text-gray-500">Total <b className="text-[#0E2F6E]">{fmtRp(p.grand_total)}</b> · {p.jumlah_baris} baris</div>

        {isSuperAdmin && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {p.status === 'draft' && (
              <button disabled={busy} onClick={() => transisi('ajukan')} className="bg-[#1A4FA0] text-white text-xs font-bold px-4 py-2 rounded-full disabled:opacity-50">
                Ajukan →
              </button>
            )}
            {p.status === 'diajukan' && (
              <>
                <button disabled={busy} onClick={() => transisi('setujui')} className="bg-green-600 text-white text-xs font-bold px-4 py-2 rounded-full disabled:opacity-50">
                  ✅ Setujui (Cair)
                </button>
                <button disabled={busy} onClick={() => transisi('tolak')} className="bg-gray-100 text-gray-500 text-xs font-bold px-4 py-2 rounded-full disabled:opacity-50">
                  Tolak
                </button>
              </>
            )}
            {['draft', 'diajukan'].includes(p.status) && (
              <button disabled={busy} onClick={hapusPengajuan}
                className="bg-red-50 text-red-600 text-xs font-bold px-4 py-2 rounded-full disabled:opacity-50">
                🗑️ Hapus
              </button>
            )}
          </div>
        )}
        {p.status === 'disetujui' && (
          <div className="text-[10px] text-green-600 font-bold mt-2">
            ✅ Disetujui {p.diputuskan_at ? new Date(p.diputuskan_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} — komisi tercatat cair, transfer ke leader dilakukan manual di luar sistem.
          </div>
        )}
        {p.status === 'ditolak' && p.catatan_keputusan && (
          <div className="text-[10px] text-red-500 mt-2">Catatan: {p.catatan_keputusan}</div>
        )}
      </div>

      <div className="space-y-3">
        {data.kelompok.map(k => (
          <div key={k.penerima_id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-[#0E2F6E] text-sm">{k.penerima_nama} <span className="text-gray-400 font-normal">({k.kode_unik})</span></div>
              {k.items.every(it => it.dikonfirmasi_at) ? (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">✅ Cair</span>
              ) : (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">⏳ Pending</span>
              )}
            </div>
            <div className="space-y-1 text-xs mb-2">
              {k.items.map(it => (
                <div key={it.id} className="flex justify-between bg-gray-50 rounded-lg px-2.5 py-1.5">
                  <div className="text-gray-600">{it.keterangan} · {it.jumlah_jamaah} jamaah</div>
                  <div className="font-bold text-[#0E2F6E] shrink-0">{fmtRp(it.nominal)}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs font-bold text-[#0E2F6E] border-t border-gray-100 pt-1.5">
              <span>Subtotal</span><span>{fmtRp(k.subtotal)}</span>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
