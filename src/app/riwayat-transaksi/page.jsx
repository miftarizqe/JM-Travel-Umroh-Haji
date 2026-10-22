'use client';
import { useEffect, useState } from 'react';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
function fmtTanggal(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

const JENIS_LABEL = { invoice: 'Invoice', kwitansi: 'Kwitansi', tanda_terima: 'Tanda Terima Uang' };
const JENIS_WARNA = {
  invoice: 'bg-blue-50 text-blue-700', kwitansi: 'bg-green-50 text-green-700', tanda_terima: 'bg-amber-50 text-amber-700',
};

// Halaman "Riwayat Transaksi" — 1 tempat buat SEMUA Invoice/Kwitansi/Tanda
// Terima Uang milik akun yang login, APAPUN sumbernya (nempel booking atau
// bookingless self-service) & APAPUN rolenya (jamaah/perwakilan/sahabat
// Baitullah, dikonfirmasi user 2026-10-22). Sebelumnya dokumen cuma bisa
// diakses per-booking lewat halaman booking masing-masing, gak ada tempat
// liat SEMUA dokumen sekaligus — gap ditemukan user pas Kwitansi setoran
// pendaftaran Sahabat Baitullah gak punya "rumah" buat ditemukan.
export default function RiwayatTransaksiPage() {
  const [user] = useCurrentUser();
  const [dokumen, setDokumen] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetch('/api/riwayat-transaksi').then(r => r.json())
      .then(d => { setDokumen(d.dokumen || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <Layout title="🧾 Riwayat Transaksi" showBack>
      <div className="text-xs text-gray-400 mb-4">
        Semua Invoice, Kwitansi, &amp; Tanda Terima Uang yang sudah dikirim admin ke akun Anda.
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : dokumen.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
          Belum ada dokumen yang dikirim ke akun Anda.
        </div>
      ) : (
        <div className="space-y-2">
          {dokumen.map(d => (
            <a key={d.id} href={d.link_url || `/admin/cetak-invoice/${d.id}`} target="_blank" rel="noopener noreferrer"
              className="block bg-white rounded-xl border border-gray-200 p-3 hover:border-[#1A4FA0] transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${JENIS_WARNA[d.jenis] || 'bg-gray-100 text-gray-600'}`}>
                      {JENIS_LABEL[d.jenis] || d.jenis}
                    </span>
                    <span className="text-xs text-gray-400">{d.nomor || '(belum ada nomor)'}</span>
                  </div>
                  <div className="text-sm font-bold text-[#0E2F6E] mt-1 truncate">
                    {d.judul || (d.booking_id ? d.prog_name : null) || JENIS_LABEL[d.jenis] || d.jenis}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {fmtTanggal(d.tanggal)}{d.booking_id ? ` · Booking #${d.booking_id}` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-[#0E2F6E]">{fmtRp(d.nominal)}</div>
                  <div className="text-[10px] text-[#1A4FA0] font-bold mt-1">Lihat →</div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </Layout>
  );
}
