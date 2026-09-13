'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

export default function PenyesuaianHargaPage() {
  return (
    <Suspense fallback={<Layout><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <PenyesuaianHargaInner />
    </Suspense>
  );
}

function PenyesuaianHargaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('booking_id');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!bookingId);
  const [setuju, setSetuju] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useUnsavedGuard(setuju);

  useEffect(() => {
    if (!bookingId) return;
    fetch(`/api/penyesuaian-harga?booking_id=${bookingId}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookingId]);

  async function submit() {
    if (!setuju || !data?.penyesuaian) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/penyesuaian-harga/${data.penyesuaian.id}/setuju`, { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        alert('Penyesuaian harga disetujui!');
        router.push('/dashboard/jamaah');
      } else alert(d.error || 'Gagal menyetujui');
    } catch { alert('Terjadi kesalahan'); }
    setSubmitting(false);
  }

  if (loading) return <Layout title="💰 Penyesuaian Harga" showBack><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

  if (!data?.penyesuaian) {
    return (
      <Layout title="💰 Penyesuaian Harga" showBack>
        <div className="max-w-xl mx-auto text-center text-sm text-gray-400 py-10">
          Tidak ada penyesuaian harga yang menunggu persetujuan untuk booking ini.
        </div>
      </Layout>
    );
  }

  const p = data.penyesuaian;

  return (
    <Layout title="💰 Penyesuaian Harga" showBack confirmLeave={setuju}
      confirmMessage="Yakin ingin keluar? Persetujuan belum disimpan.">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
          ⚠️ Ada penyesuaian harga untuk program <strong>{data.prog_name}</strong>. Mohon baca alasannya dan setujui sebelum bisa melanjutkan pelunasan.
        </div>

        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Harga Lama</span>
            <span className="font-semibold text-gray-400 line-through">{rp(p.harga_lama)}</span>
          </div>
          <div className="flex justify-between text-base">
            <span className="font-bold text-[#0E2F6E]">Harga Baru</span>
            <span className="font-bold text-red-600">{rp(p.harga_baru)}</span>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <div className="text-xs font-bold text-gray-500 mb-1">Alasan</div>
            <div className="text-sm text-gray-600 whitespace-pre-wrap">{p.alasan}</div>
          </div>
        </div>

        <label className="flex items-start gap-3 p-4 rounded-xl border-2 bg-white border-gray-200 cursor-pointer">
          <input type="checkbox" checked={setuju} onChange={e => setSetuju(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#1A4FA0] flex-shrink-0" />
          <span className="text-sm text-gray-600 leading-relaxed">
            Saya memahami dan menyetujui penyesuaian harga di atas sebagai bagian dari Surat Perjanjian Jamaah Umroh.
          </span>
        </label>

        <button onClick={submit} disabled={!setuju || submitting}
          className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full disabled:opacity-40">
          {submitting ? 'Memproses...' : '✅ Setujui Penyesuaian Harga'}
        </button>
      </div>
    </Layout>
  );
}
