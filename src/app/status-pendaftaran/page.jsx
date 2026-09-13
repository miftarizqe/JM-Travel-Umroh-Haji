'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { usePengaturan, waLink, waDisplay } from '@/lib/usePengaturan';

export default function StatusPendaftaranPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pengaturan] = usePengaturan();

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }
    const parsed = JSON.parse(u);
    // Ambil status TERKINI dari database — reg_status bisa berubah kapan saja oleh admin
    fetch(`/api/profil?user_id=${parsed.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.user) {
          setUser(d.user);
          localStorage.setItem('user', JSON.stringify({ ...parsed, ...d.user }));
        } else {
          setUser(parsed); // fallback
        }
        setLoading(false);
      })
      .catch(() => { setUser(parsed); setLoading(false); });
  }, []);

  if (loading || !user) return <Layout><div className="flex items-center justify-center py-20 text-gray-400">Loading...</div></Layout>;

  const isViaPacket = user.reg_metode === 'paket';

  const allSteps = [
    {
      key: 'pending',
      label: 'Verifikasi Data oleh Admin',
      desc: 'Admin sedang memverifikasi data pendaftaran Anda.',
      icon: '📝',
      both: true
    },
    {
      key: 'waiting_visit',
      label: 'Menunggu Kunjungan Kantor',
      desc: `Jadwal kunjungan: ${user.reg_jadwal || '-'}. Harap hadir ke kantor untuk TTD Perjanjian Kerjasama Perwakilan.`,
      icon: '🏢',
      kantor: true
    },
    {
      key: 'docs_sent',
      label: 'Perjanjian Dikirim ke Alamat Anda',
      desc: `JM Travel telah mengirimkan Perjanjian Kerjasama Perwakilan (2 rangkap) + info rekening BSI + ID Card ke: ${user.alamat_kirim || '-'}.`,
      icon: '📦',
      paket: true
    },
    {
      key: 'waiting_docs_return',
      label: 'Menunggu Rangkapan Dikirim Kembali',
      desc: 'Silakan TTD Perjanjian Kerjasama Perwakilan (2 rangkap) di atas materai, lalu kirim balik 1 rangkap + formulir rekening BSI ke kantor JM Travel.',
      icon: '📮',
      paket: true
    },
    {
      key: 'active',
      label: 'Akun Perwakilan Aktif! 🎉',
      desc: 'Selamat! Akun perwakilan Anda telah aktif. Anda sudah bisa mulai order jamaah.',
      icon: '🎉',
      both: true
    },
  ];

  const steps = allSteps.filter(s =>
    s.both || (isViaPacket ? s.paket : s.kantor)
  );

  const currentStatus = user.reg_status || 'pending';
  const currentIdx = steps.findIndex(s => s.key === currentStatus);

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    waiting_visit: 'bg-purple-100 text-purple-700 border-purple-300',
    docs_sent: 'bg-orange-100 text-orange-700 border-orange-300',
    waiting_docs_return: 'bg-pink-100 text-pink-700 border-pink-300',
    active: 'bg-green-100 text-green-700 border-green-300',
  };

  return (
    <Layout title="📋 Status Pendaftaran Perwakilan" showBack>
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#0E2F6E] to-[#2060C0] text-white rounded-2xl p-6">
          <div className="font-bold text-lg mb-1">Status Pendaftaran Perwakilan</div>
          <div className="text-sm opacity-85">{user.name}</div>
          <div className="flex items-center gap-3 mt-3">
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusColors[currentStatus]}`}>
              {steps[currentIdx]?.label || 'Pending'}
            </span>
            <span className="text-xs opacity-75">
              {isViaPacket ? '📦 Via Paket' : '🏢 Hadir ke Kantor'}
            </span>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5">
          <div className="font-bold text-[#0E2F6E] mb-4">📍 Progress Pendaftaran</div>
          <div className="space-y-0">
            {steps.map((s, i) => {
              const isDone = i < currentIdx;
              const isCurrent = i === currentIdx;
              const isPending = i > currentIdx;
              return (
                <div key={s.key} className="flex gap-4">
                  {/* Line & Circle */}
                  <div className="flex flex-col items-center">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 border-2 ${
                      isDone ? 'bg-[#C9952A] border-[#C9952A] text-white' :
                      isCurrent ? 'bg-[#1A4FA0] border-[#1A4FA0] text-white' :
                      'bg-gray-100 border-gray-200 text-gray-400'
                    }`}>
                      {isDone ? '✓' : s.icon}
                    </div>
                    {i < steps.length-1 && (
                      <div className={`w-0.5 h-12 mt-1 ${isDone ? 'bg-[#C9952A]' : 'bg-gray-200'}`}></div>
                    )}
                  </div>
                  {/* Content */}
                  <div className="pb-8 flex-1">
                    <div className={`font-bold text-sm ${isCurrent ? 'text-[#1A4FA0]' : isDone ? 'text-[#C9952A]' : 'text-gray-400'}`}>
                      {s.label}
                      {isCurrent && <span className="ml-2 text-xs bg-[#E8F0FB] text-[#1A4FA0] px-2 py-0.5 rounded-full">Saat ini</span>}
                      {isDone && <span className="ml-2 text-xs bg-[#FEF3DC] text-[#7a5500] px-2 py-0.5 rounded-full">Selesai</span>}
                    </div>
                    <div className={`text-xs mt-1 leading-relaxed ${isCurrent ? 'text-gray-600' : isPending ? 'text-gray-300' : 'text-gray-400'}`}>
                      {s.desc}
                    </div>

                    {/* Action khusus per step */}
                    {isCurrent && s.key === 'waiting_docs_return' && (
                      <div className="mt-2 bg-[#FEF3DC] border border-yellow-300 rounded-lg p-3 text-xs text-[#7a5500]">
                        <div className="font-bold mb-1">📮 Kirim dokumen ke:</div>
                        <div>PT. Alkhalid Jaya Megah Tours & Travel</div>
                        <div>{pengaturan.alamat_kantor}</div>
                        <div className="mt-1">📞 Konfirmasi: {waDisplay(pengaturan.wa_kantor)}</div>
                      </div>
                    )}
                    {isCurrent && s.key === 'waiting_visit' && (
                      <div className="mt-2 bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-700">
                        <div className="font-bold mb-1">📍 Lokasi Kantor:</div>
                        <div>{pengaturan.alamat_kantor}</div>
                        <div className="mt-1">⏰ Jadwal Anda: <strong>{user.reg_jadwal || '-'}</strong></div>
                        <div className="mt-1">📞 Info: {waDisplay(pengaturan.wa_kantor)}</div>
                      </div>
                    )}
                    {isCurrent && s.key === 'active' && (
                      <button onClick={() => router.push('/dashboard/perwakilan')}
                        className="mt-2 bg-[#1A4FA0] text-white text-xs font-bold px-4 py-2 rounded-full">
                        Buka Dashboard Perwakilan →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Info Kontak */}
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5">
          <div className="font-bold text-[#0E2F6E] mb-3">📞 Butuh Bantuan?</div>
          <div className="text-sm text-gray-500 space-y-2">
            <div>Hubungi tim JM Travel untuk informasi lebih lanjut:</div>
            <button
              onClick={() => window.open(waLink(pengaturan.wa_kantor, 'Halo JM Travel, saya ingin menanyakan status pendaftaran perwakilan saya.') || '#', '_blank')}
              className="w-full bg-[#25D366] text-white font-bold py-2.5 rounded-full text-sm">
              📲 WhatsApp: {waDisplay(pengaturan.wa_kantor)}
            </button>
          </div>
        </div>

      </div>
    </Layout>
  );
}