'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import UploadBukti from '@/app/components/UploadBukti';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useMetodePembayaran } from '@/lib/useMetodePembayaran';
import { dpPerluResubmit } from '@/lib/dpPayments';

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

export default function BayarDpPage() {
  return (
    <Suspense fallback={<Layout title="💳 Upload Ulang DP"><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <BayarDpInner />
    </Suspense>
  );
}

function BayarDpInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('booking_id');

  const [user] = useCurrentUser();
  const [metodePembayaran] = useMetodePembayaran();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [buktiPath, setBuktiPath] = useState(null);
  const [buktiNama, setBuktiNama] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isDirty = !!buktiPath;
  useUnsavedGuard(isDirty);

  useEffect(() => {
    if (!user || !bookingId) return;
    fetch(`/api/bookings?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => {
        const found = (d.bookings || []).find(b => b.id === bookingId);
        setBooking(found || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user, bookingId]);

  const ditolak = booking ? dpPerluResubmit(booking.dp_payments) : null;

  async function submit() {
    if (!buktiPath) { alert('Bukti transfer wajib diunggah!'); return; }
    setSubmitting(true);
    try {
      // resubmit-dp UPDATE baris payment yang sama (bukan bikin baris baru)
      // — biar nomor "DP N"-nya gak ikut nambah tiap kali ditolak+diajukan
      // ulang (dikonfirmasi user 2026-10-14).
      const res = await fetch('/api/payments/resubmit-dp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: ditolak.id, bukti_path: buktiPath, bukti_nama: buktiNama }),
      });
      if (res.ok) {
        alert('Bukti DP baru terkirim! Menunggu konfirmasi admin.');
        router.push('/dashboard/jamaah');
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Gagal mengirim bukti DP');
      }
    } catch {
      alert('Terjadi kesalahan');
    }
    setSubmitting(false);
  }

  if (!user || loading) return (
    <Layout title="💳 Upload Ulang DP" showBack><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>
  );
  if (!booking) return (
    <Layout title="💳 Upload Ulang DP" showBack><div className="text-center py-20 text-gray-400">Booking tidak ditemukan.</div></Layout>
  );
  if (!ditolak) {
    return (
      <Layout title="💳 Upload Ulang DP" showBack>
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="text-5xl mb-3">✅</div>
          <div className="font-bold text-[#0E2F6E] mb-1">Tidak ada DP yang perlu diunggah ulang</div>
          <div className="text-sm text-gray-400">Booking {booking.id} tidak punya pembayaran DP yang ditolak saat ini.</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="💳 Upload Ulang DP" showBack confirmLeave={isDirty}
      confirmMessage="Yakin ingin keluar? Bukti yang sudah diunggah akan hilang.">
      <div className="max-w-2xl mx-auto space-y-4">

        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-sm font-bold text-red-700 mb-1">❌ DP {ditolak.urutan} Ditolak Admin</div>
          <div className="text-xs text-red-600">{ditolak.reject_reason || 'Tidak ada alasan spesifik.'}</div>
        </div>

        <div className="bg-[#E8F0FB] rounded-xl p-4">
          <div className="text-xs text-gray-400">Booking</div>
          <div className="font-bold text-[#0E2F6E]">{booking.prog_name} — {booking.id}</div>
          <div className="flex justify-between text-sm mt-2">
            <span className="text-gray-500">Nominal yang harus ditransfer ulang</span>
            <span className="font-bold text-[#0E2F6E]">{rp(ditolak.amount)}</span>
          </div>
        </div>

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

        <UploadBukti
          onUploaded={(path, nama) => { setBuktiPath(path); setBuktiNama(nama); }}
          label="Klik untuk upload bukti transfer DP baru"
        />

        <button onClick={submit} disabled={!buktiPath || submitting}
          className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {submitting ? 'Memproses...' : 'Kirim Bukti DP Baru →'}
        </button>
      </div>
    </Layout>
  );
}
