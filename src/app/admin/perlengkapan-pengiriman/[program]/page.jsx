'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const URUTAN_STATUS = ['belum_diproses', 'disiapkan', 'dikirim', 'diterima'];
const STATUS_LABEL = { belum_diproses: 'Belum Diproses', disiapkan: 'Disiapkan', dikirim: 'Dikirim', diterima: 'Diterima' };
const STATUS_WARNA = {
  belum_diproses: 'bg-gray-100 text-gray-500',
  disiapkan: 'bg-blue-100 text-blue-700',
  dikirim: 'bg-yellow-100 text-yellow-700',
  diterima: 'bg-green-100 text-green-700',
};
const jkSingkat = (jk) => jk === 'Laki-Laki' ? 'L' : jk === 'Perempuan' ? 'P' : '-';

// Modal checklist item sebelum tandai "Dikirim" — admin bisa contreng
// satu-satu atau klik "Pilih Semua". Item yang gak dicontreng gak dikurangi
// dari stok & gak muncul di Tanda Terima (belum ikut dikirim).
function ModalChecklistKirim({ jamaah, onClose, onKirim, mengirim }) {
  const [items, setItems] = useState(null);
  const [dipilih, setDipilih] = useState(new Set());

  useEffect(() => {
    fetch(`/api/admin/perlengkapan-pengiriman/items?jk=${encodeURIComponent(jamaah.jk || '')}`)
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setDipilih(new Set((d.items || []).map(i => i.id))); })
      .catch(() => setItems([]));
  }, [jamaah.jk]);

  function toggle(id) {
    setDipilih(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-5 w-full max-w-sm">
        <div className="font-bold text-[#0E2F6E] mb-1">📦 Kirim Perlengkapan</div>
        <div className="text-xs text-gray-400 mb-3">{jamaah.nama} — contreng item yang benar-benar dikirim.</div>

        {items == null ? (
          <div className="text-center text-gray-400 text-sm py-4">Memuat...</div>
        ) : (
          <>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setDipilih(new Set(items.map(i => i.id)))}
                className="text-xs font-bold text-[#1A4FA0]">Pilih Semua</button>
              <button onClick={() => setDipilih(new Set())}
                className="text-xs font-bold text-gray-400">Kosongkan</button>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto mb-4">
              {items.map(it => (
                <label key={it.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={dipilih.has(it.id)} onChange={() => toggle(it.id)}
                    className="w-4 h-4 accent-[#1A4FA0]" />
                  <span>{it.nama}</span>
                </label>
              ))}
              {items.length === 0 && <div className="text-xs text-gray-400">Tidak ada item terdaftar.</div>}
            </div>
          </>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-full text-sm">Batal</button>
          <button onClick={() => onKirim([...dipilih])} disabled={mengirim || dipilih.size === 0}
            className="flex-1 bg-[#1A4FA0] text-white font-bold py-2 rounded-full text-sm disabled:opacity-50">
            {mengirim ? 'Mengirim...' : `Kirim (${dipilih.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PerlengkapanPengirimanPage() {
  const router = useRouter();
  const params = useParams();
  const programName = params?.program ? decodeURIComponent(params.program) : '';

  const [user] = useCurrentUser();
  const [jamaah, setJamaah] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [modalKirimUntuk, setModalKirimUntuk] = useState(null);

  function muat() {
    fetch(`/api/admin/perlengkapan-pengiriman?program=${encodeURIComponent(programName)}`)
      .then(r => r.json())
      .then(d => { setJamaah(d.jamaah || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    if (!programName) return;
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, programName]);

  async function kirimStatus(j, statusBaru, itemIds) {
    const key = `${j.booking_id}:${j.idx}`;
    setUpdating(key);
    try {
      const res = await fetch('/api/admin/perlengkapan-pengiriman', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: j.booking_id, jamaah_idx: j.idx, jk: j.jk, status: statusBaru, item_ids: itemIds }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setUpdating(null); return; }
      setModalKirimUntuk(null);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setUpdating(null);
  }

  function majukanStatus(j) {
    const idx = URUTAN_STATUS.indexOf(j.status);
    const statusBaru = URUTAN_STATUS[idx + 1];
    if (!statusBaru) return;
    if (statusBaru === 'dikirim') { setModalKirimUntuk(j); return; }
    kirimStatus(j, statusBaru);
  }

  if (loading) return <Layout title="📦 Status Pengiriman Perlengkapan"><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

  return (
    <Layout title="📦 Status Pengiriman Perlengkapan" showBack>
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="text-sm text-gray-500">Program: <b className="text-[#0E2F6E]">{programName}</b></div>
        <div className="text-xs text-gray-400">Cuma jamaah yang DP-nya sudah dikonfirmasi yang muncul di sini.</div>

        {(jamaah || []).length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">
            Belum ada jamaah DP-confirmed untuk program ini.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">JK</th>
                  <th className="px-3 py-2">Pemesan</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {jamaah.map(j => {
                  const key = `${j.booking_id}:${j.idx}`;
                  const idx = URUTAN_STATUS.indexOf(j.status);
                  const next = URUTAN_STATUS[idx + 1];
                  const sudahDikirim = idx >= URUTAN_STATUS.indexOf('dikirim');
                  return (
                    <tr key={key} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-[#0E2F6E]">{j.nama}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5 max-w-[220px]">
                          📦 {j.alamat_kirim || <span className="text-red-400">Alamat belum diisi</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{jkSingkat(j.jk)}</td>
                      <td className="px-3 py-2 text-gray-500">{j.pemesan_nama}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_WARNA[j.status]}`}>
                          {STATUS_LABEL[j.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {sudahDikirim && (
                            <a href={`/admin/cetak-tanda-terima-perlengkapan/${encodeURIComponent(j.booking_id)}/${j.idx}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[10px] font-bold text-gray-400 hover:text-[#1A4FA0] whitespace-nowrap">
                              🖨️ Tanda Terima
                            </a>
                          )}
                          {next && (
                            <button onClick={() => majukanStatus(j)} disabled={updating === key}
                              className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-3 py-1.5 rounded-full disabled:opacity-50 whitespace-nowrap">
                              {updating === key ? '...' : `→ ${STATUS_LABEL[next]}`}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalKirimUntuk && (
        <ModalChecklistKirim jamaah={modalKirimUntuk} mengirim={updating === `${modalKirimUntuk.booking_id}:${modalKirimUntuk.idx}`}
          onClose={() => setModalKirimUntuk(null)}
          onKirim={(itemIds) => kirimStatus(modalKirimUntuk, 'dikirim', itemIds)} />
      )}
    </Layout>
  );
}
