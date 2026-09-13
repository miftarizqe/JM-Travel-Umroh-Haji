'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { CollapsibleSection } from '@/app/components/Collapsible';
import DokumenSayaList from '@/app/components/DokumenSayaList';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan, waLink } from '@/lib/usePengaturan';

export default function DashboardJamaah() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [pengaturan] = usePengaturan();
  const [bookings, setBookings] = useState([]);
  const [expandBooking, setExpandBooking] = useState(null);
  const [expandRiwayat, setExpandRiwayat] = useState(null);
  const [konfirmasiLoading, setKonfirmasiLoading] = useState(null);

  function muatBookings() {
    if (!user) return;
    fetch(`/api/bookings?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => setBookings(d.bookings || []));
  }
  useEffect(muatBookings, [user]);

  async function konfirmasiTerima(bookingId, idx) {
    const key = `${bookingId}:${idx}`;
    setKonfirmasiLoading(key);
    try {
      const res = await fetch('/api/perlengkapan-pengiriman/terima', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, jamaah_idx: idx }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setKonfirmasiLoading(null); return; }
      muatBookings();
    } catch { alert('Terjadi kesalahan'); }
    setKonfirmasiLoading(null);
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen text-gray-500">Loading...</div>;

  // 'menunggu_batal' ikut ditampilkan di sini (bukan hilang begitu saja dari
  // dashboard) — jamaah tetap perlu lihat booking yang pengajuan batalnya
  // sedang ditinjau admin.
  const active = bookings.filter(b => b.status === 'active' || b.status === 'menunggu_batal');
  // Booking dibatalkan tetap masuk histori, bukan hilang begitu saja.
  const done = bookings.filter(b => b.status === 'selesai' || b.status === 'dibatalkan');

  // Tentukan tahap booking (1-5) untuk progress bar & tombol lanjut
  // 1 = DP dikirim, 2 = DP dikonfirmasi, 3 = form selesai, 4 = perjanjian
  // selesai (siap lunas), 5 = lunas. Perjanjian Jamaah SEKARANG step wajib
  // tersendiri (materai + TTD, digital atau fisik) — bukan lagi cuma gate
  // checkbox tersembunyi di /pelunasan (lihat src/lib/materaiRule.js).
  function perjanjianSelesai(b) {
    return !!b.setuju_pks && (!!b.perjanjian_scan_path || b.perjanjian_sig?.fase === 'selesai');
  }
  // Form murni data-entry — gak butuh DP beneran confirmed buat mulai diisi,
  // jamaah boleh isi sambil nunggu admin proses DP (lihat render stage 1).
  function formLengkap(b) {
    return b.form_filled >= b.form_total;
  }
  function getStage(b) {
    if (b.pelunasan_status === 'paid') return 5;
    if (formLengkap(b) && b.dp_status === 'confirmed' && perjanjianSelesai(b)) return 4;
    if (formLengkap(b) && b.dp_status === 'confirmed') return 3;
    if (b.dp_status === 'confirmed') return 2;
    return 1;
  }

  // jamaah_data diseed nama-nya sejak checkout (lihat CartPaketKamar) —
  // dipakai buat label kartu supaya booking gampang dibedakan.
  function namaJamaahUtama(b) {
    let jamaah = b.jamaah_data;
    if (typeof jamaah === 'string') {
      try { jamaah = JSON.parse(jamaah); } catch { jamaah = []; }
    }
    if (!Array.isArray(jamaah) || jamaah.length === 0 || !jamaah[0]?.nama) return null;
    return jamaah[0].nama + (jamaah.length > 1 ? ` & ${jamaah.length - 1} lainnya` : '');
  }

  const stageLabels = ['DP', 'Konfirmasi', 'Formulir', 'Perjanjian', 'Lunas'];

  return (
    <Layout>
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#0E2F6E] to-[#2060C0] text-white rounded-2xl p-6 mb-6 text-center md:text-left">
        <h2 className="text-xl md:text-2xl font-bold">Assalamualaikum, {user.name.split(' ')[0]} 👋</h2>
        <p className="text-sm opacity-85 mt-1">Selamat datang di portal jamaah JM Travel</p>
        {user.kode_unik && (
          <span className="inline-block mt-3 bg-white/15 border border-white/30 rounded-full px-3 py-1 text-xs font-bold tracking-wider">
            🔑 Kode: {user.kode_unik}
          </span>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: '🕌', label: 'Lihat Program', action: () => router.push('/programs') },
          { icon: '📜', label: 'Riwayat', action: () => document.getElementById('riwayat-section')?.scrollIntoView({ behavior: 'smooth' }) },
          { icon: '🎟️', label: 'Voucher', action: () => router.push('/voucher') },
          { icon: '📞', label: 'Hubungi Kami', action: () => window.open(waLink(pengaturan.wa_kantor) || '#', '_blank') },
        ].map(item => (
          <div key={item.label} onClick={item.action}
            className="bg-white rounded-xl p-4 text-center cursor-pointer border border-[#e0e8f0] hover:border-[#1A4FA0] hover:shadow-md transition-all">
            <div className="text-2xl mb-2">{item.icon}</div>
            <div className="text-xs font-bold text-[#0E2F6E]">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Booking Aktif */}
      <CollapsibleSection
        title={<h3 className="font-bold text-[#0E2F6E]">📦 Booking Aktif</h3>}
        badge={active.length}
        className="mb-6"
      >
        {active.length === 0 ? (
          <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">
            Belum ada booking aktif.{' '}
            <span className="font-bold cursor-pointer underline" onClick={() => router.push('/programs')}>
              Daftar program →
            </span>
          </div>
        ) : (
          // Satu kolom (bukan grid 2 kolom) SENGAJA — kalau 2 kartu
          // sejajar dan salah satu di-expand, grid stretch bikin kartu
          // sebelahnya ikut setinggi itu walau isinya cuma sebagian
          // (nampak seperti area putih kosong nge-bug).
          <div className="space-y-4">
            {active.map(b => {
              const stage = getStage(b);
              const isOpen = expandBooking === b.id;
              return (
                <div key={b.id} className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden hover:shadow-md transition-all">
                  <div className="bg-gradient-to-r from-[#0E2F6E] to-[#2060C0] p-4 text-white flex justify-between items-start cursor-pointer"
                    onClick={() => setExpandBooking(isOpen ? null : b.id)}>
                    <div>
                      <div className="font-bold">{b.prog_name}</div>
                      {namaJamaahUtama(b) && (
                        <div className="text-sm font-semibold text-[#C9952A] mt-0.5">📛 {namaJamaahUtama(b)}</div>
                      )}
                      <div className="text-xs opacity-80 mt-0.5 font-mono font-bold">{b.id}</div>
                      <div className="text-xs opacity-80">{b.paket} · {b.jumlah_jamaah} jamaah</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {b.status === 'menunggu_batal' ? (
                        <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-full">⏳ Proses Batal</span>
                      ) : (
                        <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-full">Aktif</span>
                      )}
                      <span className="text-[10px] opacity-80">{isOpen ? 'Tutup ▲' : 'Detail ▼'}</span>
                    </div>
                  </div>

                  {isOpen && b.status === 'menunggu_batal' && (
                    <div className="p-4">
                      <div className="bg-yellow-50 text-yellow-700 text-sm text-center py-3 rounded-xl">
                        ⏳ Pengajuan pembatalan booking ini sedang ditinjau admin JM Travel.
                      </div>
                    </div>
                  )}

                  {isOpen && b.status === 'active' && (
                    <div className="p-4">
                      {/* Progress 4 tahap */}
                      <div className="flex items-center mb-4">
                        {stageLabels.map((label, i) => (
                          <div key={label} className="flex items-center flex-1 last:flex-none">
                            <div className="flex flex-col items-center">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                i + 1 <= stage ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-400'
                              }`}>
                                {i + 1 <= stage ? '✓' : i + 1}
                              </div>
                              <div className={`text-[9px] mt-1 ${i + 1 <= stage ? 'text-[#1A4FA0] font-bold' : 'text-gray-400'}`}>{label}</div>
                            </div>
                            {i < stageLabels.length - 1 && (
                              <div className={`flex-1 h-0.5 mx-1 mb-4 ${i + 1 < stage ? 'bg-[#1A4FA0]' : 'bg-gray-200'}`}></div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Status DP */}
                      <div className="text-sm text-gray-500 mb-2">
                        DP: <strong>{b.dp_status === 'confirmed' ? '✅ Dikonfirmasi' : b.dp_status === 'rejected' ? '❌ Ditolak' : '⏳ Menunggu konfirmasi'}</strong>
                      </div>

                      {Array.isArray(b.opsi_tambahan_data) && b.opsi_tambahan_data.length > 0 && (
                        <div className="text-xs text-[#1A4FA0] mb-2">
                          🧳 {b.opsi_tambahan_data.map(o => o.nama).join(', ')} (+Rp {Number(b.opsi_tambahan_total || 0).toLocaleString('id-ID')})
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm mb-3">
                        <span className="text-gray-500">Total Harga</span>
                        <span className="font-bold text-[#0E2F6E]">Rp {b.total_harga?.toLocaleString('id-ID')}</span>
                      </div>

                      {/* Tombol lanjut — dinamis sesuai tahap */}
                      {stage === 1 && (
                        <>
                          <div className="bg-yellow-50 text-yellow-700 text-xs text-center py-2 rounded-full">
                            ⏳ Menunggu admin konfirmasi pembayaran DP
                          </div>
                          {!formLengkap(b) && (
                            <button
                              onClick={() => router.push(`/form-jamaah?booking_id=${b.id}`)}
                              className="w-full mt-2 bg-[#1A4FA0] text-white text-sm font-bold py-2 rounded-full hover:bg-[#0E2F6E] transition-colors"
                            >
                              Isi Formulir Jamaah sambil menunggu ({b.form_filled}/{b.form_total}) →
                            </button>
                          )}
                        </>
                      )}

                      {stage === 2 && (
                        <button
                          onClick={() => router.push(`/form-jamaah?booking_id=${b.id}`)}
                          className="w-full bg-[#1A4FA0] text-white text-sm font-bold py-2 rounded-full hover:bg-[#0E2F6E] transition-colors"
                        >
                          Isi Formulir Jamaah ({b.form_filled}/{b.form_total}) →
                        </button>
                      )}

                      {stage === 3 && !b.setuju_pks && (
                        <button
                          onClick={() => router.push(`/pks?jenis=jamaah&booking_id=${b.id}`)}
                          className="w-full bg-[#C9952A] text-white text-sm font-bold py-2 rounded-full hover:bg-yellow-600 transition-colors"
                        >
                          📜 Baca & Setujui Perjanjian →
                        </button>
                      )}

                      {stage === 3 && b.setuju_pks && b.perjanjian_sig?.metode === 'digital' && b.perjanjian_sig?.fase !== 'selesai' && (
                        <button
                          onClick={() => router.push(`/tanda-tangan/${b.perjanjian_sig.id}`)}
                          className="w-full bg-[#C9952A] text-white text-sm font-bold py-2 rounded-full hover:bg-yellow-600 transition-colors"
                        >
                          ✍️ Lanjutkan Tanda Tangan Digital →
                        </button>
                      )}

                      {stage === 3 && b.setuju_pks && (!b.perjanjian_sig || b.perjanjian_sig.metode === 'fisik') && (
                        <div className="bg-yellow-50 text-yellow-700 text-xs text-center py-2 rounded-full">
                          ⏳ Menunggu materai & TTD fisik Perjanjian Jamaah diproses admin
                        </div>
                      )}

                      {stage === 4 && (
                        <button
                          onClick={() => router.push(`/pelunasan?booking_id=${b.id}`)}
                          className="w-full bg-[#C9952A] text-white text-sm font-bold py-2 rounded-full hover:bg-yellow-600 transition-colors"
                        >
                          {b.pelunasan_status === 'pending_confirm'
                            ? '⏳ Pelunasan Menunggu Konfirmasi'
                            : 'Lanjut Pelunasan →'}
                        </button>
                      )}

                      {stage === 5 && (
                        <div className="bg-green-50 text-green-700 text-xs text-center py-2 rounded-full font-bold">
                          ✅ Lunas — Selamat menunaikan ibadah!
                        </div>
                      )}

                      {/* Upgrade paket/kamar: boleh selama belum lunas & DP sudah confirmed */}
                      {(stage === 2 || stage === 3 || stage === 4) && b.pelunasan_status !== 'pending_confirm' && (
                        <button
                          onClick={() => router.push(`/upgrade-paket?booking_id=${b.id}`)}
                          className="w-full mt-2 border border-[#C9952A] text-[#C9952A] text-xs font-bold py-2 rounded-full hover:bg-[#FEF3DC] transition-colors"
                        >
                          ⬆️ Upgrade Paket / Kamar
                        </button>
                      )}

                      {/* Link balik ke form-jamaah SELALU ada (gak hilang
                          begitu tahap form kelewat) — dokumen pendukung
                          (paspor/KTP/KK/vaksin/foto) opsional & boleh
                          disusulin, jamaah perlu jalan buat lanjutin upload
                          kapan aja selama booking masih aktif. */}
                      <button
                        onClick={() => router.push(`/form-jamaah?booking_id=${b.id}`)}
                        className="w-full mt-2 text-xs text-[#1A4FA0] underline"
                      >
                        📎 Lengkapi/Update Dokumen Pendukung
                      </button>

                      {/* Info Manasik — sekadar info jadwal/lokasi (gak ada
                          gate/tracking kehadiran), muncul begitu DP confirmed
                          dan admin sudah isi jadwalnya di program ini. */}
                      {b.manasik && (
                        <div className="mt-3 bg-[#E8F0FB] rounded-xl p-3">
                          <div className="text-xs font-bold text-[#0E2F6E] mb-1">🕋 Info Manasik</div>
                          <div className="text-xs text-gray-600">
                            📅 {new Date(b.manasik.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                            {b.manasik.lokasi && <> · 📍 {b.manasik.lokasi}</>}
                          </div>
                          {b.manasik.catatan && <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{b.manasik.catatan}</div>}
                        </div>
                      )}

                      {/* Status pengiriman perlengkapan (koper, ihrom/mukena, dll)
                          — cuma muncul begitu DP confirmed, per jamaah karena item
                          gender-spesifik beda per orang. */}
                      {Array.isArray(b.perlengkapan_status) && b.perlengkapan_status.length > 0 && (
                        <div className="mt-3 bg-gray-50 rounded-xl p-3">
                          <div className="text-xs font-bold text-[#0E2F6E] mb-2">📦 Status Perlengkapan</div>
                          <div className="space-y-1.5">
                            {b.perlengkapan_status.map((p, i) => {
                              const key = `${b.id}:${p.idx}`;
                              return (
                                <div key={i} className="flex items-center justify-between text-xs gap-2">
                                  <span className="text-gray-600">{p.nama}</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                      p.status === 'diterima' ? 'bg-green-100 text-green-700' :
                                      p.status === 'dikirim' ? 'bg-yellow-100 text-yellow-700' :
                                      p.status === 'disiapkan' ? 'bg-blue-100 text-blue-700' :
                                      'bg-gray-100 text-gray-500'
                                    }`}>
                                      {p.status === 'diterima' ? '✅ Diterima' :
                                       p.status === 'dikirim' ? '🚚 Dikirim' :
                                       p.status === 'disiapkan' ? '📦 Disiapkan' : '⏳ Belum Diproses'}
                                    </span>
                                    {p.status === 'dikirim' && (
                                      <button onClick={() => konfirmasiTerima(b.id, p.idx)} disabled={konfirmasiLoading === key}
                                        className="text-[10px] font-bold text-white bg-[#1A4FA0] hover:bg-[#0E2F6E] px-2 py-0.5 rounded-full disabled:opacity-50 whitespace-nowrap">
                                        {konfirmasiLoading === key ? '...' : 'Sudah Terima'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {b.perlengkapan_status.some(p => p.status === 'dikirim') && (
                            <div className="text-[10px] text-gray-400 mt-2">
                              Kalau tidak dikonfirmasi, otomatis dianggap diterima setelah 7 hari.
                            </div>
                          )}
                        </div>
                      )}

                      <DokumenSayaList bookingId={b.id} />

                      <button
                        onClick={() => router.push(`/batalkan-program?booking_id=${b.id}`)}
                        className="w-full mt-2 border border-red-300 text-red-500 text-xs font-bold py-2 rounded-full hover:bg-red-50 transition-colors"
                      >
                        ❌ Batalkan Booking
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* Riwayat — booking yang sudah selesai (umroh sudah berangkat) */}
      <div id="riwayat-section">
        <CollapsibleSection
          title={<h3 className="font-bold text-[#0E2F6E]">📜 Riwayat</h3>}
          badge={done.length}
          className="mb-6"
        >
          {done.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-6 text-center text-sm text-gray-400">
              Belum ada riwayat perjalanan.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {done.map(b => {
                const dibatalkan = b.status === 'dibatalkan';
                return (
                <div key={b.id} className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
                  <div onClick={() => setExpandRiwayat(expandRiwayat === b.id ? null : b.id)}
                    className={`p-4 text-white flex justify-between items-start cursor-pointer ${
                    dibatalkan ? 'bg-gradient-to-r from-gray-500 to-gray-600' : 'bg-gradient-to-r from-[#C9952A] to-[#f59e0b]'
                  }`}>
                    <div>
                      <div className="font-bold">{b.prog_name}</div>
                      {namaJamaahUtama(b) && (
                        <div className="text-sm font-semibold mt-0.5">📛 {namaJamaahUtama(b)}</div>
                      )}
                      <div className="text-xs opacity-80 mt-0.5 font-mono font-bold">{b.id}</div>
                      <div className="text-xs opacity-80">{b.paket} · {b.jumlah_jamaah} jamaah</div>
                    </div>
                    <span className="bg-white/20 text-white text-xs font-bold px-2 py-1 rounded-full">
                      {dibatalkan ? '❌ Dibatalkan' : '✅ Selesai'}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Total Harga</span>
                      <span className="font-bold text-[#0E2F6E]">Rp {b.total_harga?.toLocaleString('id-ID')}</span>
                    </div>
                    {dibatalkan && b.refund && (
                      <div className="flex justify-between items-center text-sm mt-1.5">
                        <span className="text-gray-500">💰 Refund</span>
                        <span className="font-bold text-[#0E2F6E]">
                          Rp {Number(b.refund.nominal || 0).toLocaleString('id-ID')} ({b.refund.persen}%)
                          {b.refund.bukti_path ? (
                            <a href={b.refund.bukti_path} target="_blank" rel="noopener noreferrer" className="ml-2 text-[#1A4FA0] underline font-normal">Lihat Bukti</a>
                          ) : (
                            <span className="ml-2 text-yellow-600 font-normal">— diproses</span>
                          )}
                        </span>
                      </div>
                    )}
                    {expandRiwayat === b.id && <DokumenSayaList bookingId={b.id} />}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CollapsibleSection>
      </div>

    </Layout>
  );
}
