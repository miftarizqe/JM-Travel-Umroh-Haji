'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';

export default function UpgradePaketPage() {
  return (
    <Suspense fallback={<Layout title="⬆️ Upgrade Paket / Kamar"><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <UpgradePaketPageInner />
    </Suspense>
  );
}

function UpgradePaketPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('booking_id');

  const [data, setData] = useState(null);
  const [pilihan, setPilihan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bookingId) return;
    fetch(`/api/bookings/upgrade?booking_id=${bookingId}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setError('Gagal memuat data booking'));
  }, [bookingId]);

  async function ajukanUpgrade() {
    if (!pilihan) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/bookings/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, paket: pilihan.paket, kamar: pilihan.kamar })
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error); setLoading(false); return; }
      alert(d.message);
      router.push('/dashboard/jamaah');
    } catch {
      setError('Terjadi kesalahan');
      setLoading(false);
    }
  }

  if (!data) return (
    <Layout title="⬆️ Upgrade Paket / Kamar" showBack>
      <div className="flex items-center justify-center py-20 text-gray-400">
        {error || 'Memuat data booking...'}
      </div>
    </Layout>
  );

  const { booking, bisa_upgrade, opsi } = data;
  const opsiUpgrade = (opsi || []).filter(o => o.bisa_pilih);

  return (
    <Layout title="⬆️ Upgrade Paket / Kamar" showBack>
      <div className="max-w-2xl mx-auto space-y-4">

        <div className="bg-[#E8F0FB] rounded-xl p-4 space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0] mb-2">📋 Booking Sekarang</div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>Program</span><span className="font-semibold text-[#0E2F6E]">{booking.prog_name}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>Paket saat ini</span>
            <span className="font-semibold text-[#0E2F6E]">{booking.paket} · {booking.kamar_label}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>Jumlah jamaah</span><span className="font-semibold text-[#0E2F6E]">{booking.jumlah_jamaah} orang</span>
          </div>
          <div className="border-t border-blue-200 pt-2 flex justify-between font-bold">
            <span className="text-sm">Total Sekarang</span>
            <span className="text-[#0E2F6E]">Rp {booking.total_sekarang.toLocaleString('id-ID')}</span>
          </div>
        </div>

        {!bisa_upgrade ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
            ⚠️ Booking ini sudah lunas/selesai — upgrade paket/kamar tidak bisa dilakukan lagi.
          </div>
        ) : (
          <>
            <div>
              <div className="font-bold text-[#0E2F6E] mb-3">Pilih Paket / Kamar Baru</div>
              {opsiUpgrade.length === 0 ? (
                <div className="bg-white border border-[#e0e8f0] rounded-xl p-4 text-sm text-gray-400 text-center">
                  Tidak ada opsi upgrade — paket Anda sudah yang tertinggi.
                </div>
              ) : (
                <div className="space-y-3">
                  {opsiUpgrade.map(o => (
                    <div key={`${o.paket}_${o.kamar}`}
                      onClick={() => setPilihan(o)}
                      className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        pilihan?.paket === o.paket && pilihan?.kamar === o.kamar
                          ? 'border-[#1A4FA0] bg-[#E8F0FB]' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <div>
                        <div className="font-bold text-[#0E2F6E] capitalize">{o.paket} · {o.kamar_label}</div>
                        <div className="text-xs text-gray-400">Total baru Rp {o.total.toLocaleString('id-ID')}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-[#C9952A]">+Rp {o.selisih.toLocaleString('id-ID')}</div>
                        {pilihan?.paket === o.paket && pilihan?.kamar === o.kamar && (
                          <div className="text-xs text-[#1A4FA0] font-semibold">✓ Dipilih</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 text-xs">❌ {error}</div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-xs text-yellow-700">
              ⚠️ Selisih harga upgrade akan ditambahkan ke total, dibayar saat pelunasan.
            </div>

            <button onClick={ajukanUpgrade} disabled={!pilihan || loading}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Memproses...' : 'Ajukan Upgrade →'}
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}
