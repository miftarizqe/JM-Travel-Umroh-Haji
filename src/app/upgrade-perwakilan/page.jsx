'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';

export default function UpgradePerwakilanPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }
    const parsed = JSON.parse(u);
    // Cek syarat dari DATABASE, bukan asumsi
    fetch(`/api/profil?user_id=${parsed.id}`)
      .then(r => r.json())
      .then(d => { setUser(d.user || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  if (!user) return <Layout><div className="text-center py-20 text-gray-400">Data tidak ditemukan.</div></Layout>;

  // Sudah jadi perwakilan (atau role lain non-jamaah)?
  if (user.role !== 'jamaah') {
    return (
      <Layout title="⬆️ Upgrade ke Perwakilan">
        <div className="max-w-2xl mx-auto">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
            <h4 className="font-bold text-blue-800 mb-1">Anda sudah terdaftar sebagai {user.role}</h4>
            <p className="text-sm text-blue-600">Tidak perlu upgrade lagi.</p>
          </div>
          <button onClick={() => router.back()}
            className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full">
            ← Kembali
          </button>
        </div>
      </Layout>
    );
  }

  // Syarat: harus sudah pernah umroh bareng JM Travel dulu.
  const memenuhiSyarat = !!user.sudah_umroh;

  return (
    <Layout title="⬆️ Upgrade ke Perwakilan">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Status syarat — dicek dari data nyata */}
        {memenuhiSyarat ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5">
            <h4 className="font-bold text-green-800 text-lg mb-1">✅ Syarat Upgrade Terpenuhi</h4>
            <p className="text-sm text-green-600">Anda telah menyelesaikan program umroh bersama JM Travel.</p>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
            <h4 className="font-bold text-yellow-800 text-lg mb-1">⏳ Syarat Belum Terpenuhi</h4>
            <p className="text-sm text-yellow-700">
              Untuk menjadi Perwakilan, Anda harus terlebih dahulu menunaikan umroh bersama JM Travel.
            </p>
            <p className="text-xs text-yellow-600 mt-2">
              Status ini otomatis diperbarui setelah perjalanan Anda ditandai selesai oleh admin.
            </p>
          </div>
        )}

        {/* Info skema — sesuai Perjanjian Kerja Sama Perwakilan (SPKA-Ins) resmi */}
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5">
          <div className="font-bold text-[#0E2F6E] mb-3">ℹ️ Yang Perlu Diketahui</div>
          <div className="space-y-2 text-sm text-gray-500">
            {[
              '✅ Perwakilan memasarkan program JM Travel di wilayah/lembaganya sendiri',
              '✅ Manajemen menetapkan HPP (harga pokok) untuk setiap paket',
              '✅ Perwakilan bebas menentukan harga jual ke jamaah',
              '✅ Selisih harga jual dengan HPP menjadi ujroh milik Perwakilan',
              '✅ Perubahan harga di luar ketentuan wajib diajukan & disetujui manajemen',
              '✅ Difasilitasi ID Card resmi Perwakilan JM Travel',
            ].map(t => <div key={t}>{t}</div>)}
          </div>
        </div>

        {/* Skema harga resmi */}
        <div className="bg-gradient-to-r from-[#C9952A] to-yellow-500 text-white rounded-xl p-5">
          <h4 className="font-bold mb-3">💰 Skema Harga Perwakilan</h4>
          <div className="space-y-3 text-sm opacity-95">
            <div className="bg-white/10 rounded-lg p-3">
              <div className="font-bold mb-1">Harga Pokok (HPP)</div>
              <div>Ditetapkan oleh manajemen JM Travel per paket/program.</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="font-bold mb-1">Harga Jual</div>
              <div>Ditentukan sendiri oleh Perwakilan kepada jamaah di wilayahnya.</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="font-bold mb-1">Ujroh Perwakilan</div>
              <div>Selisih antara harga jual dan HPP — sepenuhnya milik Perwakilan.</div>
            </div>
          </div>
          <div className="text-[10px] opacity-80 mt-3">
            Rincian lengkap tercantum dalam Surat Perjanjian Kerja Sama Perwakilan (SPK-PWK).
          </div>
        </div>

        {/* Tombol lanjut — hanya kalau syarat terpenuhi */}
        {memenuhiSyarat ? (
          <button onClick={() => router.push('/daftar-perwakilan')}
            className="w-full bg-[#C9952A] hover:bg-yellow-600 text-white font-bold py-3 rounded-full transition-colors">
            ⬆️ Lanjut Isi Formulir Perwakilan →
          </button>
        ) : (
          <button disabled
            className="w-full bg-gray-200 text-gray-400 font-bold py-3 rounded-full cursor-not-allowed">
            Belum bisa mendaftar — selesaikan umroh dulu
          </button>
        )}

        <button onClick={() => router.back()}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full transition-colors">
          ← Kembali
        </button>
      </div>
    </Layout>
  );
}
