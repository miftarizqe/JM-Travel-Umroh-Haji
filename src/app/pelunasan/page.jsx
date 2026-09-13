'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import UploadBukti from '@/app/components/UploadBukti';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useMetodePembayaran } from '@/lib/useMetodePembayaran';

export default function PelunasanPage() {
  return (
    <Suspense fallback={<Layout title="💳 Pelunasan"><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <PelunasanPageInner />
    </Suspense>
  );
}

function PelunasanPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('booking_id');

  const [user] = useCurrentUser();
  const [metodePembayaran] = useMetodePembayaran();
  const [booking, setBooking] = useState(null);
  const [voucher, setVoucher] = useState(null);
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherError, setVoucherError] = useState('');
  const [buktiPath, setBuktiPath] = useState(null);
  const [buktiNama, setBuktiNama] = useState(null);
  const [loading, setLoading] = useState(false);
  const [kodeUnik] = useState(() => Math.floor(Math.random() * 900) + 100);

  // Udah cek voucher atau upload bukti — sayang kalau ilang
  const isDirty = !!voucher || !!buktiPath;
  useUnsavedGuard(isDirty);

  // Kalkulasi harga — didefinisikan di atas agar bisa dipakai submitPelunasan
  const dp = booking?.dp_amount || 0;
  const total = booking?.total_harga || 0;
  const diskon = voucher?.potongan || 0;
  const sisaBayar = total - dp - diskon;

  useEffect(() => {
    if (!user) return;

    if (bookingId) {
      fetch(`/api/bookings?user_id=${user.id}`)
        .then(r => r.json())
        .then(d => {
          const found = (d.bookings || []).find(b => b.id === bookingId);
          if (found) setBooking(found);
        });
    }
  }, [user, bookingId]);

  async function cekVoucher() {
    setVoucherError('');
    if (!voucherInput) return;
    const res = await fetch(`/api/vouchers?kode=${voucherInput}&user_id=${user.id}`);
    const data = await res.json();
    if (!res.ok) { setVoucherError(data.error); return; }
    setVoucher(data.voucher);
  }

  async function submitPelunasan() {
    setLoading(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          user_id: user.id,
          type: 'lunas',
          amount: sisaBayar + kodeUnik,
          bukti_path: buktiPath,
          bukti_nama: buktiNama,
          kode_unik: kodeUnik
        })
      });
      if (res.ok) {
        // Kalau pakai voucher, tandai terpakai biar tidak bisa dipakai lagi
        if (voucher?.kode) {
          try {
            await fetch('/api/vouchers', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kode: voucher.kode })
            });
          } catch { /* abaikan, pelunasan tetap sukses */ }
        }
        alert('Bukti pelunasan terkirim! Menunggu konfirmasi admin.');
        router.push('/dashboard/jamaah');
      } else {
        alert('Gagal mengirim bukti pelunasan');
      }
    } catch (e) {
      alert('Terjadi kesalahan');
    }
    setLoading(false);
  }

  if (!user || !booking) return (
    <Layout><div className="flex items-center justify-center py-20 text-gray-400">Memuat data booking...</div></Layout>
  );

  const formBelumLengkap = (booking.form_filled || 0) < (booking.form_total || booking.jumlah_jamaah || 1);
  // Defense-in-depth — jalur normal (dashboard jamaah) sudah menahan tombol
  // "Lanjut Pelunasan" sampai Perjanjian Jamaah beneran selesai (materai +
  // TTD, digital atau fisik), bukan cuma centang setuju. Gate ini jaga-jaga
  // kalau halaman ini diakses langsung lewat URL.
  const perjanjianBelumSelesai = !booking.setuju_pks || !(booking.perjanjian_scan_path || booking.perjanjian_sig?.fase === 'selesai');
  const adaPenyesuaianPending = !!booking.penyesuaian_pending;

  return (
    <Layout title="💳 Pelunasan" showBack confirmLeave={isDirty}
      confirmMessage="Yakin ingin keluar? Voucher/bukti pelunasan yang sudah diisi akan hilang.">
      <div className="max-w-2xl mx-auto space-y-4">

        {formBelumLengkap && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
            ⚠️ Formulir jamaah belum lengkap ({booking.form_filled}/{booking.form_total}). Lengkapi dulu sebelum bisa melunasi.
            <button onClick={() => router.push(`/form-jamaah?booking_id=${booking.id}`)}
              className="block mt-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-2 rounded-full transition-colors text-center">
              📋 Lengkapi Formulir Jamaah
            </button>
          </div>
        )}

        {!formBelumLengkap && perjanjianBelumSelesai && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
            ⚠️ Surat Perjanjian Jamaah Umroh Anda belum selesai (materai + tanda tangan). Selesaikan dulu sebelum bisa melunasi.
            <button onClick={() => router.push(`/pks?jenis=jamaah&booking_id=${booking.id}`)}
              className="block mt-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-2 rounded-full transition-colors text-center">
              📜 Baca & Setujui Perjanjian
            </button>
          </div>
        )}

        {!formBelumLengkap && !perjanjianBelumSelesai && adaPenyesuaianPending && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
            ⚠️ Ada penyesuaian harga yang perlu Anda setujui dulu sebelum bisa melunasi.
            <button onClick={() => router.push(`/penyesuaian-harga?booking_id=${booking.id}`)}
              className="block mt-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-2 rounded-full transition-colors text-center">
              💰 Lihat Penyesuaian Harga
            </button>
          </div>
        )}

        {/* Info Booking */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Program', val: booking.prog_name },
            { label: 'Paket', val: booking.paket },
            { label: 'Jamaah', val: booking.jumlah_jamaah + ' orang' },
            { label: 'Total Harga', val: 'Rp ' + total.toLocaleString('id-ID') },
          ].map(s => (
            <div key={s.label} className="bg-[#E8F0FB] rounded-xl p-3">
              <div className="text-xs text-gray-400">{s.label}</div>
              <div className="font-bold text-[#0E2F6E] text-sm mt-0.5">{s.val}</div>
            </div>
          ))}
        </div>

        {/* Voucher */}
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5">
          <div className="font-bold text-[#0E2F6E] mb-3">🎟️ Kode Voucher</div>
          <div className="flex gap-2">
            <input
              value={voucherInput}
              onChange={e => setVoucherInput(e.target.value.toUpperCase())}
              placeholder="Masukkan kode voucher..."
              className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
            {voucher ? (
              <button onClick={() => { setVoucher(null); setVoucherInput(''); }}
                className="bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
                ✕ Hapus
              </button>
            ) : (
              <button onClick={cekVoucher}
                className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
                Cek
              </button>
            )}
          </div>
          {voucherError && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 mt-2 text-xs">
              ❌ {voucherError}
            </div>
          )}
          {voucher && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mt-2 text-xs">
              ✅ Voucher valid! Diskon Rp {voucher.potongan.toLocaleString('id-ID')}
            </div>
          )}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3 text-xs text-yellow-700">
            ⚠️ Voucher hanya dari manajemen JM Travel · 1 voucher per booking
          </div>
        </div>

        {/* Invoice */}
        <div className="bg-[#E8F0FB] rounded-xl p-5 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0] mb-3">📋 Invoice Pelunasan</div>
          {[
            { label: 'Total harga paket', val: 'Rp ' + total.toLocaleString('id-ID'), normal: true },
            { label: 'DP sudah dibayar', val: '− Rp ' + dp.toLocaleString('id-ID'), green: true },
            ...(diskon > 0 ? [{ label: 'Diskon voucher', val: '− Rp ' + diskon.toLocaleString('id-ID'), red: true }] : []),
          ].map(r => (
            <div key={r.label} className="flex justify-between text-sm text-gray-500">
              <span>{r.label}</span>
              <span className={r.green ? 'text-green-600 font-semibold' : r.red ? 'text-red-600 font-bold' : 'font-semibold text-[#0E2F6E]'}>{r.val}</span>
            </div>
          ))}
          <div className="border-t border-blue-200 pt-2 flex justify-between font-bold">
            <span className="text-sm">Sisa Pelunasan</span>
            <span className="text-red-600">Rp {sisaBayar.toLocaleString('id-ID')}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>Kode Unik</span>
            <span className="font-bold text-red-600">+Rp {kodeUnik}</span>
          </div>
          <div className="border-t border-blue-200 pt-2 flex justify-between font-bold text-base">
            <span>Transfer Tepat</span>
            <span className="text-red-600">Rp {(sisaBayar + kodeUnik).toLocaleString('id-ID')}</span>
          </div>
        </div>

        {/* Rekening */}
        <div className="bg-white border-2 border-[#1A4FA0] rounded-xl p-5 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0]">🏦 Rekening Tujuan</div>
          {metodePembayaran.map(m => (
            <div key={m.id} className="text-sm text-gray-500 border-t border-gray-100 pt-2 first:border-0 first:pt-0">
              <div className="font-bold text-[#0E2F6E]">{m.nama}</div>
              {m.nomor && <div className="flex justify-between"><span>No. Rekening</span><span className="font-bold text-[#0E2F6E]">{m.nomor}</span></div>}
              {m.atas_nama && <div className="flex justify-between"><span>Atas Nama</span><span className="font-bold text-[#0E2F6E]">{m.atas_nama}</span></div>}
              {m.catatan && <div className="text-xs text-gray-400 mt-0.5">{m.catatan}</div>}
            </div>
          ))}
        </div>

        {/* Upload */}
        <UploadBukti
            onUploaded={(path, nama) => { setBuktiPath(path); setBuktiNama(nama); }}
            label="Klik untuk upload bukti pelunasan"
          />

        <button onClick={submitPelunasan} disabled={!buktiPath || loading || formBelumLengkap || perjanjianBelumSelesai || adaPenyesuaianPending}
          className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? 'Memproses...' : 'Kirim Bukti Pelunasan →'}
        </button>

      </div>
    </Layout>
  );
}