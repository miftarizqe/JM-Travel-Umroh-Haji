'use client';
import { useEffect, useState } from 'react';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
const JENIS_LABEL = { invoice: 'Invoice', kwitansi: 'Kwitansi Pembayaran', tanda_terima: 'Tanda Terima Uang' };

// Daftar dokumen (Invoice/Kwitansi/Tanda Terima Uang) milik 1 booking yang
// sudah dikirim admin — dipakai di dashboard jamaah, baik untuk booking aktif
// maupun riwayat (booking tidak aktif cuma status flag, dokumennya tetap
// harus bisa dilihat, lihat src/app/api/bookings/[id]/dokumen/route.js).
export default function DokumenSayaList({ bookingId }) {
  const [dokumen, setDokumen] = useState(null);

  useEffect(() => {
    if (!bookingId) return;
    fetch(`/api/bookings/${bookingId}/dokumen`)
      .then(r => r.json())
      .then(d => setDokumen(d.dokumen || []))
      .catch(() => setDokumen([]));
  }, [bookingId]);

  if (dokumen === null) return null;

  return (
    <div className="mt-3 bg-gray-50 rounded-xl p-3">
      <div className="text-xs font-bold text-[#0E2F6E] mb-2">📄 Dokumen Saya</div>
      {dokumen.length === 0 ? (
        <div className="text-xs text-gray-400">Belum ada dokumen.</div>
      ) : (
        <div className="space-y-1.5">
          {dokumen.map(d => (
            <div key={d.id} className="flex items-center justify-between text-xs gap-2">
              <div className="text-gray-600">
                <span className="font-semibold">{JENIS_LABEL[d.jenis] || d.jenis}</span> — {tgl(d.tanggal)} · {rp(d.nominal)}
              </div>
              {d.file_url ? (
                <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-bold text-white bg-[#1A4FA0] hover:bg-[#0E2F6E] px-2 py-0.5 rounded-full whitespace-nowrap">
                  Lihat/Unduh
                </a>
              ) : d.link_ttd ? (
                <a href={d.link_ttd} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-bold text-white bg-[#C9952A] hover:bg-[#b9821a] px-2 py-0.5 rounded-full whitespace-nowrap">
                  ✍️ Tanda Tangani
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
