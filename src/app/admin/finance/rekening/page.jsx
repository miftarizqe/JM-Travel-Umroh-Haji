'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
function fmtTanggalJam(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function bulanIni() { return new Date().toISOString().slice(0, 7); }
function labelBulan(b) {
  if (!b) return '-';
  const [y, m] = b.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

const SUMBER_LABEL = {
  setoran_pendaftaran: 'Setoran Pendaftaran', ujroh_tf: 'Ujroh Sahabat Baitullah (keluar)',
  payment_dp: 'DP Booking', payment_lunas: 'Pelunasan Booking', ujroh_tf_perwakilan: 'Ujroh Perwakilan (keluar)',
  operasional_sahabat: 'Alokasi Operasional/Management', saldo_awal_manual: 'Saldo Awal (input manual)',
};

// Dashboard 3 rekening JM Travel (2026-09-02, dikonfirmasi user):
// Alkhalid Jaya Megah + Sahabat Baitullah (baru, dari rekening_ledger) +
// Cashflow (SUDAH ADA, cuma disurface bareng di sini — link ke halaman
// aslinya buat detail/submit periode, TIDAK dibikin ulang di sini).
export default function RekeningDashboardPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [bulan, setBulan] = useState(bulanIni());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expand, setExpand] = useState(null); // 'alkhalid' | 'sahabat_baitullah' | null
  const [editSaldoAwal, setEditSaldoAwal] = useState(null); // { kode, nominal, tanggal } | null
  const [savingSaldoAwal, setSavingSaldoAwal] = useState(false);
  const [rincianOpen, setRincianOpen] = useState(null); // id transaksi (rekening_ledger) lagi dibuka rinciannya
  const [rincianData, setRincianData] = useState({}); // { [transaksiId]: items[] }

  async function toggleRincian(t) {
    if (rincianOpen === t.id) { setRincianOpen(null); return; }
    setRincianOpen(t.id);
    if (!rincianData[t.id]) {
      try {
        const res = await fetch(`/api/admin/finance/rekening/rincian?ids=${t.sumber_id}`);
        const d = await res.json();
        if (res.ok) setRincianData(prev => ({ ...prev, [t.id]: d.items }));
      } catch {}
    }
  }

  function muat() {
    fetch(`/api/admin/finance/rekening?bulan=${bulan}`).then(r => r.json()).then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  async function bukaEditSaldoAwal(kode) {
    setEditSaldoAwal({ kode, nominal: '', tanggal: new Date().toISOString().slice(0, 10) });
    try {
      const res = await fetch(`/api/admin/finance/rekening/saldo-awal?rekening=${kode}`);
      const d = await res.json();
      if (res.ok && d.saldo_awal) {
        setEditSaldoAwal({
          kode, nominal: String(d.saldo_awal.nominal),
          tanggal: new Date(d.saldo_awal.created_at).toISOString().slice(0, 10),
        });
      }
    } catch {}
  }

  async function simpanSaldoAwal() {
    setSavingSaldoAwal(true);
    try {
      const res = await fetch('/api/admin/finance/rekening/saldo-awal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rekening: editSaldoAwal.kode, nominal: editSaldoAwal.nominal, tanggal: editSaldoAwal.tanggal }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSavingSaldoAwal(false); return; }
      setEditSaldoAwal(null);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSavingSaldoAwal(false);
  }

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { router.replace('/admin'); return; }
    setLoading(true);
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, bulan]);

  if (!user || user.role !== 'super_admin') {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  function RekeningCard({ kode, label, icon, warna, ringkasan }) {
    const isOpen = expand === kode;
    if (!ringkasan) return null;
    return (
      <div className={`border ${warna} rounded-xl overflow-hidden bg-white`}>
        <div className="p-4">
          <div className="text-xs font-bold text-gray-500 mb-1">{icon} {label}</div>
          <div className="text-2xl font-black text-[#0E2F6E]">{fmtRp(ringkasan.saldo_akhir)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Saldo akhir {labelBulan(bulan)}</div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-xs font-bold text-gray-600">{fmtRp(ringkasan.saldo_awal)}</div>
              <div className="text-[9px] text-gray-400">Saldo Awal</div>
            </div>
            <div className="bg-green-50 rounded-lg p-2">
              <div className="text-xs font-bold text-green-700">+{fmtRp(ringkasan.masuk)}</div>
              <div className="text-[9px] text-gray-400">Masuk</div>
            </div>
            <div className="bg-red-50 rounded-lg p-2">
              <div className="text-xs font-bold text-red-600">-{fmtRp(ringkasan.keluar)}</div>
              <div className="text-[9px] text-gray-400">Keluar</div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <button onClick={() => setExpand(isOpen ? null : kode)} className="text-xs font-bold text-[#1A4FA0]">
              {isOpen ? 'Tutup rincian ▲' : `Lihat ${ringkasan.transaksi.length} transaksi ▼`}
            </button>
            <button onClick={() => bukaEditSaldoAwal(kode)} className="text-xs font-bold text-gray-400 hover:text-[#1A4FA0]">
              ⚙️ Set Saldo Awal
            </button>
          </div>
          {editSaldoAwal?.kode === kode && (
            <div className="mt-3 pt-3 border-t border-gray-100 bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="text-[10px] text-gray-500">
                Saldo awal rekening ini (akan kehitung mulai tanggal yang dipilih). Kalau sudah pernah diisi, nilai lama otomatis tampil &amp; bisa dikoreksi.
              </div>
              <div className="flex gap-2">
                <input type="number" value={editSaldoAwal.nominal} placeholder="0"
                  onChange={e => setEditSaldoAwal(s => ({ ...s, nominal: e.target.value }))}
                  className="flex-1 px-2 py-1.5 rounded-lg border-2 border-gray-200 text-xs focus:border-[#1A4FA0] focus:outline-none" />
                <input type="date" value={editSaldoAwal.tanggal}
                  onChange={e => setEditSaldoAwal(s => ({ ...s, tanggal: e.target.value }))}
                  className="px-2 py-1.5 rounded-lg border-2 border-gray-200 text-xs focus:border-[#1A4FA0] focus:outline-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={simpanSaldoAwal} disabled={savingSaldoAwal}
                  className="bg-[#1A4FA0] text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">
                  {savingSaldoAwal ? 'Menyimpan...' : 'Simpan'}
                </button>
                <button onClick={() => setEditSaldoAwal(null)} disabled={savingSaldoAwal}
                  className="bg-gray-100 text-gray-500 text-xs font-bold px-3 py-1.5 rounded-lg">
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>
        {isOpen && (
          <div className="border-t border-gray-100 px-4 py-3 space-y-1.5 bg-gray-50/50">
            {ringkasan.transaksi.length === 0 ? (
              <div className="text-xs text-gray-400">Gak ada transaksi bulan ini.</div>
            ) : ringkasan.transaksi.map(t => {
              const bisaRincian = (t.sumber_id || '').includes(',');
              return (
              <div key={t.id} className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                <div className={`flex items-center justify-between px-3 py-2 text-xs ${bisaRincian ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                  onClick={bisaRincian ? () => toggleRincian(t) : undefined}>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-700">
                      {SUMBER_LABEL[t.sumber_tipe] || t.sumber_tipe}
                      {bisaRincian && <span className="text-[#1A4FA0] font-bold ml-1">{rincianOpen === t.id ? '▲ Tutup rincian' : '▼ Lihat rincian'}</span>}
                    </div>
                    <div className="text-gray-400 truncate">{t.keterangan}</div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-300">
                      <span>{fmtTanggalJam(t.created_at)}</span>
                      {t.bukti_path && (
                        <a href={t.bukti_path} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          className="text-[#1A4FA0] font-bold">📎 Lihat Bukti</a>
                      )}
                    </div>
                  </div>
                  <div className={`font-bold shrink-0 ${t.jenis === 'masuk' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.jenis === 'masuk' ? '+' : '-'}{fmtRp(t.nominal)}
                  </div>
                </div>
                {bisaRincian && rincianOpen === t.id && (
                  <div className="border-t border-gray-100 bg-gray-50/70 px-3 py-2 space-y-1">
                    {!rincianData[t.id] ? (
                      <div className="text-[10px] text-gray-400">Memuat rincian...</div>
                    ) : rincianData[t.id].map(it => (
                      <div key={it.id} className="flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-bold text-[#1A4FA0]">{it.jenis_label}</span>
                          <span className="text-gray-400"> — {it.penerima_nama}</span>
                        </div>
                        <div className="font-semibold text-gray-600">{fmtRp(it.nominal)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Layout title="🏦 Rekening 3-Bank" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Ringkasan bulanan 3 rekening JM Travel &mdash; Alkhalid Jaya Megah (revenue umroh biasa), Sahabat Baitullah (setoran &amp; ujroh &mdash; termasuk alokasi operasional/management, ditandai baris "Alokasi Operasional/Management" di rincian transaksi), dan Cashflow (operasional kantor, sudah ada sebelumnya).
      </div>

      <div className="flex items-center gap-2 mb-4">
        <input type="month" value={bulan} onChange={e => setBulan(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : (
        <div className="space-y-3">
          <RekeningCard kode="alkhalid" label="Alkhalid Jaya Megah" icon="🏢" warna="border-blue-200" ringkasan={data?.alkhalid} />
          <RekeningCard kode="sahabat_baitullah" label="Sahabat Baitullah" icon="🤝" warna="border-amber-200" ringkasan={data?.sahabat_baitullah} />

          <div className="border border-emerald-200 rounded-xl bg-white p-4">
            <div className="text-xs font-bold text-gray-500 mb-1">💵 Cashflow (Operasional Kantor)</div>
            {data?.cashflow ? (
              <>
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {data.cashflow.per_akun.map(a => (
                    <div key={a.akun_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <span className="font-semibold text-gray-600">{a.nama}</span>
                      <span className="font-bold text-[#0E2F6E]">{fmtRp(a.saldo_akhir)}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => router.push(`/admin/laporan/cashflow/${data.cashflow.periode_id}`)}
                  className="text-xs font-bold text-[#1A4FA0] mt-3">
                  Buka detail periode ini →
                </button>
              </>
            ) : (
              <div className="text-xs text-gray-400 mt-1">Belum ada periode cashflow buat {labelBulan(bulan)}.</div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
