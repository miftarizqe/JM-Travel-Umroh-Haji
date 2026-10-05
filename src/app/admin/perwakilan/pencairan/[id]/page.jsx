'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { namaPengajuanPerwakilan } from '@/lib/pengajuanUjrohPerwakilan';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

// File input browser polos ("Choose File — No file chosen") susah dibedain
// antar satu sama lain kalau ada beberapa di 1 halaman (dikonfirmasi user
// 2026-10-04) — dibungkus biar ada label jelas + nama file yang kepilih
// kelihatan, bukan cuma teks bawaan browser yang sama semua.
function FilePicker({ file, onChange, disabled, label = '📎 Pilih File' }) {
  return (
    <label className={`flex-1 min-w-0 flex items-center gap-2 text-xs border-2 border-dashed rounded-lg px-3 py-2 ${
      disabled ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed' : 'bg-white border-gray-200 text-gray-500 cursor-pointer hover:border-[#1A4FA0]'}`}>
      <span className={`font-bold shrink-0 ${disabled ? 'text-gray-300' : 'text-[#1A4FA0]'}`}>{label}</span>
      <span className="truncate">{file ? file.name : 'Belum ada file dipilih'}</span>
      <input type="file" accept="image/jpeg,image/png,application/pdf" disabled={disabled} className="hidden"
        onChange={e => onChange(e.target.files?.[0] || null)} />
    </label>
  );
}

const STATUS_LABEL = { draft: 'Draft', diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak' };
const STATUS_WARNA = {
  draft: 'bg-gray-100 text-gray-500', diajukan: 'bg-yellow-100 text-yellow-700',
  disetujui: 'bg-green-100 text-green-700', ditolak: 'bg-red-100 text-red-700',
};
const KATEGORI_LABEL = { ujroh_perwakilan: 'Ujroh Closing', reseller_perwakilan: 'Margin Reseller' };

// Detail 1 pengajuan pencairan ujroh perwakilan — mirror PERSIS
// /admin/sahabat/pencairan/[id]/page.jsx (lihat komentar di sana buat
// penjelasan tiap bagian), cuma ganti endpoint & label "per program".
export default function PencairanPerwakilanDetailPage() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const [user] = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fileByPenerima, setFileByPenerima] = useState({});
  const [buktiTtdFile, setBuktiTtdFile] = useState(null);
  const isSuperAdmin = user?.role === 'super_admin';

  function muat() {
    fetch(`/api/admin/perwakilan/rekap-ujroh?pengajuan_id=${id}`).then(r => r.json()).then(d => {
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

  async function transisi(action, file) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('action', action);
      if (file) fd.append('file', file);
      const res = await fetch(`/api/admin/perwakilan/pengajuan-ujroh/${id}`, { method: 'PATCH', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusy(false); return; }
      setBuktiTtdFile(null);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  async function hapusPengajuan() {
    if (!confirm('Hapus pengajuan ini? Baris di dalamnya akan lepas & bisa masuk pengajuan lain nanti. Tindakan ini gak bisa dibatalkan.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/perwakilan/pengajuan-ujroh/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusy(false); return; }
      router.push('/admin/perwakilan/pencairan');
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  async function konfirmasiPenerima(k) {
    const file = fileByPenerima[k.penerima_id];
    if (!file) { alert('Pilih bukti transfer dulu'); return; }
    setBusy(true);
    try {
      const belumConfirm = k.items.filter(it => !it.dikonfirmasi_at);
      const fd = new FormData();
      fd.append('ids', JSON.stringify(belumConfirm.map(it => it.id)));
      fd.append('file', file);
      const res = await fetch('/api/admin/perwakilan/komisi/konfirmasi-batch', { method: 'PATCH', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setBusy(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  if (!user || !['admin', 'super_admin'].includes(user.role)) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }
  if (loading) {
    return <Layout title="💸 Detail Pencairan Perwakilan" backHref="/admin/perwakilan/pencairan"><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;
  }
  if (!data?.pengajuan) {
    return <Layout title="💸 Detail Pencairan Perwakilan" backHref="/admin/perwakilan/pencairan"><div className="text-center text-gray-400 py-10">Pengajuan tidak ditemukan.</div></Layout>;
  }

  const p = data.pengajuan;
  const semuaItem = data.kelompok.flatMap(k => k.items);
  const jumlahConfirmed = semuaItem.filter(it => it.dikonfirmasi_at).length;

  return (
    <Layout title="💸 Pencairan Ujroh Perwakilan" backHref="/admin/perwakilan/pencairan">
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-bold text-[#0E2F6E]">{namaPengajuanPerwakilan(p)}</div>
            <div className="text-xs text-gray-400">#{p.id}</div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_WARNA[p.status] || 'bg-gray-100 text-gray-500'}`}>
            {STATUS_LABEL[p.status] || p.status}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-500">Total <b className="text-[#0E2F6E]">{fmtRp(p.grand_total)}</b> · {p.jumlah_baris} baris</div>
          <div className="text-gray-500">TF: <b className="text-green-600">{jumlahConfirmed}/{semuaItem.length}</b></div>
        </div>

        {isSuperAdmin && (
          <div className="flex gap-2 mt-3 flex-wrap">
            <button onClick={() => window.open(`/admin/cetak-rekap-ujroh-perwakilan?pengajuan_id=${p.id}`, '_blank')}
              disabled={!!p.bukti_ttd_path}
              title={p.bukti_ttd_path ? 'Udah di-ACC, gak perlu cetak ulang' : undefined}
              className="bg-gray-100 text-gray-600 text-xs font-bold px-4 py-2 rounded-full disabled:opacity-40 disabled:cursor-not-allowed">
              🖨️ Cetak
            </button>
            {p.status === 'draft' && (
              <button disabled={busy} onClick={() => transisi('ajukan')} className="bg-[#1A4FA0] text-white text-xs font-bold px-4 py-2 rounded-full disabled:opacity-50">
                Ajukan buat TTD Bos →
              </button>
            )}
            {p.status === 'diajukan' && (
              <button disabled={busy} onClick={() => { if (confirm('Tolak pengajuan ini? Baris di dalamnya akan lepas & masuk pengajuan berikutnya.')) transisi('tolak'); }}
                className="bg-gray-100 text-gray-500 text-xs font-bold px-4 py-2 rounded-full disabled:opacity-50">
                Tolak
              </button>
            )}
            {['draft', 'diajukan'].includes(p.status) && (
              <button disabled={busy} onClick={hapusPengajuan}
                className="bg-red-50 text-red-600 text-xs font-bold px-4 py-2 rounded-full disabled:opacity-50">
                🗑️ Hapus
              </button>
            )}
          </div>
        )}
        {p.status === 'draft' && <div className="text-[10px] text-gray-400 mt-2">Cetak dulu, minta TTD bos, baru klik &quot;Ajukan&quot; biar tercatat.</div>}

        {isSuperAdmin && p.status === 'diajukan' && (
          <div className="flex gap-2 items-center mt-3 pt-3 border-t border-gray-100">
            <FilePicker file={buktiTtdFile} onChange={setBuktiTtdFile} disabled={busy} label="📎 Pilih Bukti ACC" />
            <button disabled={busy || !buktiTtdFile} onClick={() => transisi('setujui', buktiTtdFile)}
              className="text-xs font-bold text-white bg-green-600 px-3 py-2 rounded-full disabled:opacity-50 whitespace-nowrap">
              ✅ Upload Bukti TTD (ACC)
            </button>
          </div>
        )}
        {p.status === 'diajukan' && <div className="text-[10px] text-gray-400 mt-2">Sudah di-TTD bos? Unggah scan-nya di atas — otomatis jadi &quot;Disetujui&quot; begitu ke-upload. Konfirmasi TF per-penerima baru bisa dilakukan setelahnya.</div>}
        {p.status === 'disetujui' && p.bukti_ttd_path && (
          <div className="text-[10px] text-gray-400 mt-2">
            📎 <a href={p.bukti_ttd_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">Lihat bukti TTD (ACC)</a> — udah jadi rujukan resmi, gak bisa diganti.
          </div>
        )}

        {/* Nutup gap buat pengajuan LAMA yang disetujui sebelum aturan
            wajib-upload ini ada — ISI SEKALI, BUKAN jalur ganti (dikonfirmasi
            user 2026-10-04, upload bukti TTD itu sendiri trigger status
            'disetujui', gak boleh bisa diubah lagi setelah terisi). */}
        {isSuperAdmin && p.status === 'disetujui' && !p.bukti_ttd_path && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-[10px] text-amber-600 font-bold mb-1.5">
              ⚠️ Pengajuan ini disetujui sebelum fitur bukti TTD ada — belum ada scan tersimpan.
            </div>
            <div className="flex gap-2 items-center">
              <FilePicker file={buktiTtdFile} onChange={setBuktiTtdFile} disabled={busy} label="📎 Pilih Bukti ACC" />
              <button disabled={busy || !buktiTtdFile} onClick={() => transisi('lampirkan_bukti_ttd', buktiTtdFile)}
                className="text-xs font-bold text-white bg-amber-600 px-3 py-2 rounded-full disabled:opacity-50 whitespace-nowrap">
                📎 Lampirkan Sekarang
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {data.kelompok.map(k => {
          const semuaConfirmed = k.items.every(it => it.dikonfirmasi_at);
          return (
            <div key={k.penerima_id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-bold text-[#0E2F6E] text-sm">{k.penerima_nama} <span className="text-gray-400 font-normal">({k.kode_unik})</span></div>
                  <div className="text-xs text-gray-500">Rekening: <b>{k.bank ? `${k.bank} ${k.no_rekening} a.n. ${k.nama_pemilik_rekening || k.penerima_nama}` : 'BELUM DIISI'}</b></div>
                </div>
                {semuaConfirmed ? (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">✅ Sudah TF</span>
                ) : (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">⏳ Belum TF</span>
                )}
              </div>

              <div className="space-y-1 text-xs mb-2">
                {k.items.map(it => (
                  <div key={it.id} className="flex justify-between bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <div>
                      <span className="text-[10px] font-bold text-[#1A4FA0]">{KATEGORI_LABEL[it.jenis] || it.jenis}</span>
                      <div className="text-gray-600">{it.keterangan}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-[#0E2F6E]">{fmtRp(it.nominal)}</div>
                      {it.dikonfirmasi_at ? (
                        <div className="flex items-center gap-1.5 justify-end">
                          {it.bukti_tf_admin_path && (
                            <a href={it.bukti_tf_admin_path} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-[#1A4FA0] font-bold">📎 Lihat Bukti</a>
                          )}
                          <span className="text-green-600">✅</span>
                        </div>
                      ) : <span className="text-gray-300">⏳</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs font-bold text-[#0E2F6E] border-t border-gray-100 pt-1.5 mb-2">
                <span>Subtotal</span><span>{fmtRp(k.subtotal)}</span>
              </div>

              {isSuperAdmin && p.status === 'disetujui' && !semuaConfirmed && (
                k.bank && k.no_rekening ? (
                  <div className="flex gap-2 items-center pt-1 border-t border-gray-100">
                    <FilePicker file={fileByPenerima[k.penerima_id]} disabled={busy}
                      onChange={f => setFileByPenerima(prev => ({ ...prev, [k.penerima_id]: f }))} />
                    <button disabled={busy || !fileByPenerima[k.penerima_id]} onClick={() => konfirmasiPenerima(k)}
                      className="text-xs font-bold text-white bg-[#1A4FA0] px-3 py-1.5 rounded-full disabled:opacity-50 whitespace-nowrap">
                      Tandai Sudah TF
                    </button>
                  </div>
                ) : (
                  // Belum ada tujuan transfer sama sekali — jangan kasih
                  // jalan buat ditandai TF (dikonfirmasi user 2026-10-04).
                  <div className="pt-1 border-t border-gray-100 text-[10px] text-amber-600 font-bold">
                    ⚠️ Rekening belum diisi, ujroh belum bisa di transfer!
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
