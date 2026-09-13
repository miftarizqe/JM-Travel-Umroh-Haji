'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { AddressFields, alamatLengkap } from '@/app/components/AddressFields';
import { langkahBerikutnyaPerwakilan } from '@/lib/perwakilanFlow';

const emptyForm = () => ({
  metode: 'kantor', jadwal: '',
  sama_domisili_kirim: true,
  jalan_kirim:'', norumah_kirim:'', rt_kirim:'', rw_kirim:'', kp_kirim:'', kel_kirim:'', kec_kirim:'', kota_kirim:'', provinsi_kirim:'', negara_kirim:'Indonesia',
});

// Langkah TERAKHIR pendaftaran kemitraan — baru bisa diakses SETELAH TTD
// digital formulir & persetujuan PKS selesai (dipindah ke sini dari step 3
// formulir lama, dikonfirmasi user 2026-08-19). Alamat pengiriman cuma
// relevan buat metode 'paket' — JM Travel ngirim Perjanjian Kerjasama fisik
// ke alamat ini, lalu nunggu 1 rangkap dikirim balik (lihat /status-pendaftaran).
export default function DaftarPerwakilanMetodePage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [form, setForm] = useState(emptyForm());
  const [cek, setCek] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isDirty = !!form.jadwal || !form.sama_domisili_kirim;
  useUnsavedGuard(isDirty);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!user) return;
    fetch('/api/status-pendaftaran').then(r => r.json()).then(d => setCek(d)).catch(() => {});
  }, [user]);

  // Belum boleh sampai sini — arahkan ke langkah yang benar (formulir/TTD/PKS
  // belum selesai, atau metode sudah pernah dipilih sebelumnya).
  const langkah = cek ? langkahBerikutnyaPerwakilan(cek) : null;
  useEffect(() => {
    if (langkah && langkah !== '/daftar-perwakilan/metode') router.replace(langkah);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langkah]);

  if (!user || !cek || (langkah && langkah !== '/daftar-perwakilan/metode')) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-[#0E2F6E] mb-1";

  async function submit() {
    setError('');
    if (form.metode === 'kantor' && !form.jadwal) {
      setError('Pilih jadwal kunjungan kantor!'); return;
    }
    if (form.metode === 'paket' && !form.sama_domisili_kirim && !alamatLengkap(form, '_kirim')) {
      setError('Alamat pengiriman wajib diisi lengkap!'); return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/daftar-perwakilan/metode', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Gagal menyimpan'); setLoading(false); return; }
      router.push('/status-pendaftaran');
    } catch { setError('Terjadi kesalahan'); }
    setLoading(false);
  }

  return (
    <Layout title="📮 Metode Pendaftaran" showBack confirmLeave={isDirty}
      confirmMessage="Yakin ingin keluar? Pilihan yang sudah diisi belum disimpan.">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 space-y-3">
          <div className="font-bold text-[#0E2F6E]">📮 Metode Pendaftaran</div>
          <p className="text-xs text-gray-400 -mt-2">
            Langkah terakhir — pilih bagaimana Perjanjian Kerjasama Perwakilan diselesaikan.
          </p>

          <div>
            <label className={lbl}>Metode Pendaftaran *</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: 'kantor', l: 'Datang ke Kantor', d: 'Jakarta & sekitarnya' },
                { v: 'paket', l: 'Kirim Paket', d: 'Luar Jakarta' },
              ].map(m => (
                <div key={m.v} onClick={() => setF('metode', m.v)}
                  className={`border-2 rounded-lg p-3 cursor-pointer text-center transition-all ${
                    form.metode === m.v ? 'border-[#1A4FA0] bg-[#E8F0FB]' : 'border-gray-200'}`}>
                  <div className="text-sm font-bold text-[#0E2F6E]">{m.l}</div>
                  <div className="text-[10px] text-gray-400">{m.d}</div>
                </div>
              ))}
            </div>
          </div>

          {form.metode === 'kantor' && (
            <div><label className={lbl}>Jadwal Kunjungan Kantor *</label>
              <input type="date" value={form.jadwal} onChange={e => { if (e.target.value) setF('jadwal', e.target.value); }} className={inp} /></div>
          )}

          {form.metode === 'paket' && (
            <div className="pt-1 border-t border-gray-100 space-y-3">
              <div className="font-bold text-[#0E2F6E] text-sm pt-2">📦 Alamat Pengiriman</div>
              <p className="text-xs text-gray-400 -mt-2">
                Perjanjian Kerjasama Perwakilan (2 rangkap) akan dikirim ke alamat ini.
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.sama_domisili_kirim}
                  onChange={e => setF('sama_domisili_kirim', e.target.checked)}
                  className="w-4 h-4 accent-[#1A4FA0]" />
                <span className="text-sm font-semibold text-[#0E2F6E]">Alamat pengiriman sama dengan alamat domisili</span>
              </label>
              {!form.sama_domisili_kirim && (
                <AddressFields form={form} setF={setF} suffix="_kirim" inp={inp} lbl={lbl} />
              )}
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg text-sm">⚠️ {error}</div>}

          <button onClick={submit} disabled={loading}
            className="w-full mt-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white font-bold py-3 rounded-full">
            {loading ? 'Menyimpan...' : 'Simpan & Selesai →'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
