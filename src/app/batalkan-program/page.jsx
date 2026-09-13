'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

export default function BatalkanProgramPage() {
  return (
    <Suspense fallback={<Layout backHref="/dashboard/jamaah"><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <BatalkanProgramPageInner />
    </Suspense>
  );
}

function BatalkanProgramPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('booking_id');

  const [booking, setBooking] = useState(null);
  const [alasan, setAlasan] = useState('');
  const [setuju, setSetuju] = useState(false);
  const [loading, setLoading] = useState(true);
  const [proses, setProses] = useState(false);

  const isDirty = !!alasan.trim() || setuju;
  useUnsavedGuard(isDirty);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }
    const parsed = JSON.parse(u);

    fetch(`/api/bookings?user_id=${parsed.id}`)
      .then(r => r.json())
      .then(d => {
        const found = (d.bookings || []).find(b => b.id === bookingId);
        setBooking(found || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [bookingId]);

  async function ajukan() {
    if (!alasan.trim()) {
      alert('Alasan pembatalan wajib diisi.');
      return;
    }
    if (!setuju) {
      alert('Centang persetujuan terlebih dahulu.');
      return;
    }

    if (!confirm('Ajukan pembatalan? Keputusan ada pada admin JM Travel.')) return;

    setProses(true);
    try {
      const res = await fetch('/api/pembatalan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, alasan }),
      });
      const d = await res.json();
      if (res.ok) {
        alert(d.message);
        router.push('/dashboard/jamaah');
      } else {
        alert(d.error || 'Gagal memproses');
      }
    } catch {
      alert('Terjadi kesalahan');
    }
    setProses(false);
  }

  if (loading) return <Layout backHref="/dashboard/jamaah"><div className="text-center py-20 text-gray-400">Memuat...</div></Layout>;
  if (!booking) return <Layout backHref="/dashboard/jamaah"><div className="text-center py-20 text-gray-400">Booking tidak ditemukan.</div></Layout>;

  const sudahBayar = booking.dp_status === 'confirmed';
  const sudahLunas = booking.pelunasan_status === 'paid';

  // Tidak bisa dibatalkan
  if (booking.status === 'selesai') {
    return (
      <Layout title="❌ Batalkan Program" backHref="/dashboard/jamaah">
        <div className="max-w-md mx-auto bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
          <div className="text-3xl mb-2">✅</div>
          <h4 className="font-bold text-blue-800 mb-1">Perjalanan Sudah Selesai</h4>
          <p className="text-sm text-blue-600">Booking yang sudah selesai tidak bisa dibatalkan.</p>
        </div>
      </Layout>
    );
  }
  if (booking.status === 'menunggu_batal') {
    return (
      <Layout title="❌ Batalkan Program" backHref="/dashboard/jamaah">
        <div className="max-w-md mx-auto bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-center">
          <div className="text-3xl mb-2">⏳</div>
          <h4 className="font-bold text-yellow-800 mb-1">Pengajuan Sedang Diproses</h4>
          <p className="text-sm text-yellow-700">Admin JM Travel sedang meninjau pengajuan pembatalan Anda.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="❌ Batalkan Program" backHref="/dashboard/jamaah" confirmLeave={isDirty}
      confirmMessage="Yakin ingin keluar? Alasan/persetujuan yang sudah diisi akan hilang.">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Ringkasan booking */}
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5">
          <div className="font-bold text-[#0E2F6E]">{booking.prog_name}</div>
          <div className="text-xs text-gray-400 mt-0.5 capitalize">
            {booking.id} · {booking.paket} · {booking.kamar} · {booking.jumlah_jamaah} jamaah
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Harga</span>
              <span className="font-semibold text-[#0E2F6E]">{rp(booking.total_harga)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status DP</span>
              <span className={`font-semibold ${sudahBayar ? 'text-green-600' : 'text-gray-500'}`}>
                {sudahBayar ? 'Sudah dibayar' : 'Belum dibayar'}
              </span>
            </div>
            {sudahLunas && (
              <div className="flex justify-between">
                <span className="text-gray-400">Pelunasan</span>
                <span className="font-semibold text-green-600">Lunas</span>
              </div>
            )}
          </div>
        </div>

        {/* Semua pengajuan — dibayar maupun belum — wajib ditinjau admin,
            tidak ada lagi jalur batal-langsung. */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="font-bold text-yellow-800 text-sm mb-1">⚠️ Perlu Pengajuan</div>
          <p className="text-xs text-yellow-700 leading-relaxed">
            Pembatalan booking apa pun harus diajukan dan akan ditinjau oleh admin JM Travel
            sebelum benar-benar dibatalkan.
          </p>
        </div>

        {/* Ketentuan refund hanya relevan kalau sudah ada pembayaran */}
        {sudahBayar && (
          <div className="bg-white rounded-xl border-2 border-[#C9952A] p-4">
            <div className="font-bold text-[#0E2F6E] text-sm mb-2">💰 Ketentuan Pengembalian Dana</div>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex gap-2">
                <span className="text-green-600 font-bold">100%</span>
                <span>Jika pembatalan disebabkan <b>kesalahan pihak JM Travel</b>
                  (mis. pembatalan jadwal keberangkatan oleh manajemen).</span>
              </div>
              <div className="flex gap-2">
                <span className="text-yellow-600 font-bold">S&K</span>
                <span>Jika pembatalan atas <b>permintaan jamaah</b>, pengembalian
                  dana mengikuti syarat &amp; ketentuan yang berlaku.
                  Nominal ditentukan oleh manajemen.</span>
              </div>
            </div>
            <div className="mt-3 bg-gray-50 rounded-lg p-2 text-[11px] text-gray-500">
              Keputusan akhir dan besaran pengembalian dana sepenuhnya menjadi
              kewenangan manajemen JM Travel setelah meninjau pengajuan Anda.
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5">
          <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">
            Alasan Pembatalan *
          </label>
          <textarea
            value={alasan}
            onChange={e => setAlasan(e.target.value)}
            rows={4}
            placeholder="Jelaskan alasan Anda membatalkan program ini..."
            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"
          />
          <div className="text-[10px] text-gray-400 mt-1">
            Semakin jelas alasan Anda, semakin cepat admin dapat meninjau.
          </div>
        </div>

        {/* Persetujuan */}
        <label className="flex items-start gap-3 bg-white rounded-xl border border-[#e0e8f0] p-4 cursor-pointer">
          <input type="checkbox" checked={setuju} onChange={e => setSetuju(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#1A4FA0] flex-shrink-0" />
          <span className="text-sm text-gray-600 leading-relaxed">
            Saya memahami bahwa pengajuan ini akan ditinjau admin JM Travel, dan besaran
            pengembalian dana (jika ada) mengikuti ketentuan yang berlaku.
          </span>
        </label>

        <div className="flex gap-2">
          <button onClick={() => {
              if (isDirty && !confirm('Yakin ingin keluar? Alasan/persetujuan yang sudah diisi akan hilang.')) return;
              router.back();
            }}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full">
            Kembali
          </button>
          <button onClick={ajukan} disabled={proses || !setuju}
            className="flex-[2] bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-full disabled:opacity-40">
            {proses ? 'Memproses...' : '📤 Ajukan Pembatalan'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
