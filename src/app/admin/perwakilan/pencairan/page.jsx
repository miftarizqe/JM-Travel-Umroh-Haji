'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { namaPengajuanPerwakilan } from '@/lib/pengajuanUjrohPerwakilan';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
function fmtTanggal(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_LABEL = { draft: 'Draft', diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak' };
const STATUS_WARNA = {
  draft: 'bg-gray-100 text-gray-500', diajukan: 'bg-yellow-100 text-yellow-700',
  disetujui: 'bg-green-100 text-green-700', ditolak: 'bg-red-100 text-red-700',
};

// Pencairan Ujroh Perwakilan — mirror /admin/sahabat/pencairan, bedanya
// dikelompokkan PER PROGRAM (bukan per rentang tanggal), dan cuma bisa
// diajukan buat program yang tanggal keberangkatannya udah lewat (server
// yang validasi, dikonfirmasi user 2026-09-02 — "ini closing program bukan
// closing rekrutan").
export default function PencairanPerwakilanPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [pengajuan, setPengajuan] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [progId, setProgId] = useState('');
  const isSuperAdmin = user?.role === 'super_admin';

  function muat() {
    fetch('/api/admin/perwakilan/pengajuan-ujroh').then(r => r.json()).then(d => {
      setPengajuan(d.pengajuan || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muat();
    fetch('/api/admin/programs').then(r => r.json()).then(d => setPrograms(d.programs || [])).catch(() => {});
  }, [user]);

  // Program yang bisa dipilih: udah lewat tanggal berangkat, DAN belum
  // punya pengajuan lain yang masih berlaku (status != ditolak) — dua
  // syarat ini juga dicek ulang server-side, ini cuma bantu UI biar admin
  // gak coba pilih yang bakal ditolak.
  const hariIni = new Date(new Date().toDateString());
  const progTerpakai = new Set(pengajuan.filter(p => p.status !== 'ditolak').map(p => p.prog_id));
  const programBisaDipilih = programs.filter(p => p.tanggal_berangkat && new Date(p.tanggal_berangkat) < hariIni && !progTerpakai.has(p.id));

  async function buatPengajuan() {
    if (!progId) { alert('Pilih program dulu'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/perwakilan/pengajuan-ujroh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prog_id: progId }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setCreating(false); return; }
      setShowForm(false);
      router.push(`/admin/perwakilan/pencairan/${d.pengajuan_id}`);
    } catch { alert('Terjadi kesalahan'); }
    setCreating(false);
  }

  if (!user || !['admin', 'super_admin'].includes(user.role)) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <Layout title="💸 Pencairan Ujroh Perwakilan" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Ujroh closing langsung + margin reseller perwakilan, dikelompokkan per program. Cuma bisa diajukan setelah program berangkat.
      </div>

      {isSuperAdmin ? (
        <div className="mb-4">
          {!showForm ? (
            <button onClick={() => setShowForm(true)} className="w-full bg-[#1A4FA0] text-white text-sm font-bold px-4 py-3 rounded-full">
              🗒️ Buat Pengajuan Baru
            </button>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="text-xs font-bold text-[#0E2F6E] mb-2">Pilih program yang sudah berangkat</div>
              <select value={progId} onChange={e => setProgId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2">
                <option value="">-- Pilih program --</option>
                {programBisaDipilih.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {fmtTanggal(p.tanggal_berangkat)}</option>
                ))}
              </select>
              {programBisaDipilih.length === 0 && (
                <div className="text-[10px] text-gray-400 mb-2">Gak ada program yang bisa diajukan (belum berangkat, atau semua udah punya pengajuan).</div>
              )}
              <div className="flex gap-2">
                <button onClick={buatPengajuan} disabled={creating || !progId}
                  className="flex-1 bg-[#1A4FA0] text-white text-xs font-bold px-4 py-2 rounded-full disabled:opacity-50">
                  {creating ? 'Membuat...' : 'Buat Pengajuan'}
                </button>
                <button onClick={() => setShowForm(false)} disabled={creating}
                  className="bg-gray-100 text-gray-500 text-xs font-bold px-4 py-2 rounded-full">
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400 mb-4">
          Bikin pengajuan cuma bisa dilakukan super_admin.
        </div>
      )}

      <div className="font-bold text-[#0E2F6E] mb-2 text-sm">Riwayat Pengajuan</div>
      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : pengajuan.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">Belum ada pengajuan.</div>
      ) : (
        <div className="space-y-2">
          {pengajuan.map(p => (
            <div key={p.id} onClick={() => router.push(`/admin/perwakilan/pencairan/${p.id}`)}
              className="bg-white rounded-xl border border-gray-200 p-3 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-[#0E2F6E]">{namaPengajuanPerwakilan(p)}</div>
                  <div className="text-xs text-gray-400">#{p.id} · Berangkat {fmtTanggal(p.tanggal_berangkat)} · {p.jumlah_baris} baris</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-[#0E2F6E]">{fmtRp(p.grand_total)}</div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_WARNA[p.status] || 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
