'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { CollapsibleSection } from '@/app/components/Collapsible';
import DokumenSayaList from '@/app/components/DokumenSayaList';
import DokumenPendukungStatus from '@/app/components/DokumenPendukungStatus';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan, waLink } from '@/lib/usePengaturan';
import { formLengkap, getStage, perjanjianSelesai, pembayaranSudahDiAcc } from '@/lib/bookingStage';
import { adaDokumenPendukungDitolak, adaDokumenPendukungMenunggu } from '@/lib/dokumenPendukung';
import { alasanPerluTindakan } from '@/lib/bookingPerluTindakan';
import { dpPerluResubmit } from '@/lib/dpPayments';
import BookingProgressBar from '@/app/components/BookingProgressBar';

export default function DashboardJamaah() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [pengaturan] = usePengaturan();
  const [bookings, setBookings] = useState([]);
  const [expandBooking, setExpandBooking] = useState(null);
  const [expandRiwayat, setExpandRiwayat] = useState(null);
  const [konfirmasiLoading, setKonfirmasiLoading] = useState(null);
  // Pengajuan batal PER-JAMAAH (dikonfirmasi user 2026-10-16) gak ngunci
  // booking.status ke 'menunggu_batal' lagi (booking-nya tetap aktif buat
  // jamaah lain yang gak diajukan) — jadi dicek terpisah di sini biar tetap
  // kelihatan "sedang diajukan" di kartu booking-nya.
  const [pembatalanMenunggu, setPembatalanMenunggu] = useState([]);

  function muatBookings() {
    if (!user) return;
    fetch(`/api/bookings?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => setBookings(d.bookings || []));
    fetch('/api/pembatalan?status=menunggu')
      .then(r => r.json())
      .then(d => setPembatalanMenunggu(d.pembatalan || []))
      .catch(() => {});
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
  // Booking aktif dikelompokin per 1x checkout (checkout_batch_id, lihat
  // GET /api/bookings) -- urutan grup ikut urutan booking pertamanya,
  // booking tanpa batch tetap grup sendiri (1 kartu).
  const grupAktif = [];
  {
    const perBatch = new Map();
    for (const b of active) {
      const key = b.checkout_batch_id;
      if (key && perBatch.has(key)) { perBatch.get(key).push(b); continue; }
      const grup = [b];
      if (key) perBatch.set(key, grup);
      grupAktif.push(grup);
    }
    // Di dalam grup diurut sesuai urutan kartu pas checkout. created_at
    // booking/payment 1 batch sama persis detiknya & id booking random --
    // id payment = UUID() MySQL (v1, segmen depan = timestamp naik), jadi
    // dibandingin string-nya buat payment yang di-insert beruntun dalam
    // hitungan milidetik 1 transaksi.
    for (const grup of grupAktif) grup.sort((x, y) => String(x.dp_payments[0]?.id || '').localeCompare(String(y.dp_payments[0]?.id || '')));
  }
  // Booking dibatalkan tetap masuk histori, bukan hilang begitu saja.
  const done = bookings.filter(b => b.status === 'selesai' || b.status === 'dibatalkan');

  function pembatalanJamaahPending(bookingId) {
    return pembatalanMenunggu.find(p => p.booking_id === bookingId && p.jamaah_idx != null) || null;
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


  // `nomor` diisi kalau kartu ada di dalam card parent 1x checkout (lihat
  // grupAktif) -- header jadi putih + badge nomor, bukan gradient biru
  // berdiri sendiri.
  const kartuBooking = (b, nomor) => {
    const stage = getStage(b);
    const isOpen = expandBooking === b.id;
    const tindakan = alasanPerluTindakan(b);
    return (
      <div key={b.id} className={`bg-white rounded-xl border-2 overflow-hidden hover:shadow-md transition-all ${nomor && isOpen ? 'border-[#1A4FA0]' : nomor ? 'border-gray-200' : 'border-[#e0e8f0]'}`}>
        <div className={`p-4 flex justify-between items-start cursor-pointer ${nomor ? 'text-[#0E2F6E]' : 'bg-gradient-to-r from-[#0E2F6E] to-[#2060C0] text-white'}`}
          onClick={() => setExpandBooking(isOpen ? null : b.id)}>
          {nomor ? (
            <div className="flex gap-2 min-w-0 flex-1">
              <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold bg-[#1A4FA0] text-white">{nomor}</span>
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">{namaJamaahUtama(b) || `Jamaah ${nomor}`}</div>
                <div className="text-[11px] text-gray-500 font-mono font-bold">{b.id}</div>
                <div className="text-[11px] text-gray-500">{b.paket} · {b.kamar}</div>
              </div>
            </div>
          ) : (
          <div className="min-w-0 flex-1">
            <div className="font-bold">{b.prog_name}</div>
            {namaJamaahUtama(b) && (
              <div className="text-sm font-semibold text-[#C9952A] mt-0.5">📛 {namaJamaahUtama(b)}</div>
            )}
            <div className="text-xs opacity-80 mt-0.5 font-mono font-bold">{b.id}</div>
            <div className="text-xs opacity-80">{b.paket} · {b.jumlah_jamaah} jamaah</div>
          </div>
          )}
          {/* Badge "perlu tindakan" sebaris sama badge status di kanan atas
              (dikonfirmasi user 2026-10-19) -- dulu numpuk di bawah info
              paket + bubble angka terpisah yang isinya dobel. */}
          <div className="flex flex-col items-end gap-1 ml-2 max-w-[60%]">
            <div className="flex flex-wrap justify-end gap-1">
              {tindakan.map(t => (
                <span key={t} className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">⚠️ {t}</span>
              ))}
              {b.status === 'menunggu_batal' ? (
                <span className="bg-yellow-100 text-yellow-800 text-[11px] font-bold px-2 py-0.5 rounded-full">⏳ Proses Batal</span>
              ) : (
                <span className="bg-green-100 text-green-800 text-[11px] font-bold px-2 py-0.5 rounded-full">Aktif</span>
              )}
            </div>
            {b.status === 'active' && pembatalanJamaahPending(b.id) && (
              <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-1 rounded-full">⏳ 1 jamaah diajukan batal</span>
            )}
            <span className={`text-[10px] ${nomor ? 'text-gray-400' : 'opacity-80'}`}>{isOpen ? 'Tutup ▲' : 'Detail ▼'}</span>
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
            {pembatalanJamaahPending(b.id) && (
              <div className="bg-yellow-50 text-yellow-700 text-sm text-center py-3 rounded-xl mb-4">
                ⏳ Pengajuan pembatalan 1 jamaah di booking ini sedang ditinjau admin JM Travel. Jamaah lain tetap berjalan normal.
              </div>
            )}
            {/* Progress 5 tahap — komponen sama dengan admin */}
            <BookingProgressBar booking={b} className="mb-4" />

            {/* Perjanjian per booking = SPJ (Surat Perjanjian
                Jamaah), SAMA buat semua program — reguler,
                eksklusif, maupun Program Sahabat Baitullah
                (dikonfirmasi user 2026-10-16). SPK-AK Sahabat
                cuma dokumen pendaftaran (sekali, ada di Profil),
                BUKAN perjanjian checkout — dulu salah ditampilin
                di sini. Belum disetujui -> tombol "Baca & Setujui"
                di bawah yang muncul, bukan ini. */}
            {perjanjianSelesai(b) && (
              <button
                onClick={() => router.push(`/pks?jenis=jamaah&booking_id=${b.id}&lihat=1`)}
                className="w-full mb-3 border border-[#1A4FA0] text-[#1A4FA0] text-xs font-bold py-2 rounded-full hover:bg-[#E8F0FB] transition-colors"
              >
                📜 Lihat Perjanjian (SPJ)
              </button>
            )}

            {/* Rincian pembayaran — DP/Pelunasan per payment (1 booking bisa
                punya LEBIH dari 1 payment DP: DP awal, DP pax tambahan,
                resubmit abis ditolak; cicilan pelunasan juga bisa lebih dari
                1 gelombang — dikonfirmasi user 2026-10-14, lihat
                src/lib/dpPayments.js; booking.dp_status cuma 1 nilai buat DP
                AWAL doang). Dirapihin jadi 1 kotak: label · nominal · badge
                status sejajar, Total Harga di bawah garis (dikonfirmasi user
                2026-10-19, sebelumnya baris lepas-lepas gak sejajar). */}
            <div className="bg-gray-50 rounded-xl p-3 mb-3 text-sm space-y-1.5">
              {[
                ...(b.dp_payments || []).map(p => ({ ...p, label: b.dp_payments.length > 1 ? `DP ${p.urutan}` : 'DP' })),
                ...(b.lunas_payments || []).map(p => ({ ...p, label: b.lunas_payments.length > 1 ? `Pelunasan ${p.urutan}` : 'Pelunasan' })),
              ].map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="text-gray-500">{p.label}</span>
                  <div className="flex items-center gap-2">
                    {/* Checkout mandiri Sahabat Baitullah nyimpen DP Rp 0
                        (langsung lunas dari saldo) — nominal 0 gak ditampilin. */}
                    {Number(p.amount) > 0 && <span className="font-semibold text-[#0E2F6E]">Rp {Number(p.amount).toLocaleString('id-ID')}</span>}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      p.status === 'confirmed' ? 'bg-green-100 text-green-700' : p.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {p.status === 'confirmed' ? '✅ Dikonfirmasi' : p.status === 'rejected' ? '❌ Ditolak' : '⏳ Menunggu konfirmasi'}
                    </span>
                  </div>
                </div>
              ))}
              {Array.isArray(b.opsi_tambahan_data) && b.opsi_tambahan_data.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500 min-w-0 truncate">🧳 {b.opsi_tambahan_data.map(o => o.nama).join(', ')}</span>
                  <span className="font-semibold text-[#0E2F6E] whitespace-nowrap">+Rp {Number(b.opsi_tambahan_total || 0).toLocaleString('id-ID')}</span>
                </div>
              )}
              <div className={`flex items-center justify-between gap-2 ${(b.dp_payments?.length || b.lunas_payments?.length || b.opsi_tambahan_data?.length) ? 'border-t border-gray-200 pt-1.5' : ''}`}>
                <span className="text-gray-500">Total Harga</span>
                <span className="font-bold text-[#0E2F6E]">Rp {Number(b.total_harga || 0).toLocaleString('id-ID')}</span>
              </div>
            </div>

            {(() => {
              const dpResubmit = dpPerluResubmit(b.dp_payments);
              if (!dpResubmit) return null;
              return (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-2">
                  <div className="text-xs text-red-600 mb-1.5">
                    DP {dpResubmit.urutan} ditolak: {dpResubmit.reject_reason || 'Tidak ada alasan spesifik.'}
                  </div>
                  <button onClick={() => router.push(`/bayar-dp?booking_id=${b.id}`)}
                    className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-full transition-colors">
                    Upload Bukti DP Baru →
                  </button>
                </div>
              );
            })()}

            {/* Pelunasan/cicilan ditolak — SEBELUMNYA gak ada jalur
                benerin sama sekali (ditemukan via audit notifikasi
                2026-10-14, cuma DP yang punya ini). Pola SAMA
                PERSIS kayak DP di atas, dpPerluResubmit generik
                dipakai bareng. */}
            {(() => {
              const lunasResubmit = dpPerluResubmit(b.lunas_payments);
              if (!lunasResubmit) return null;
              return (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-2">
                  <div className="text-xs text-red-600 mb-1.5">
                    Pelunasan ke-{lunasResubmit.urutan} ditolak: {lunasResubmit.reject_reason || 'Tidak ada alasan spesifik.'}
                  </div>
                  <button onClick={() => router.push(`/bayar-pelunasan?booking_id=${b.id}`)}
                    className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-full transition-colors">
                    Upload Bukti Pelunasan Baru →
                  </button>
                </div>
              );
            })()}

            {/* Reminder materai+TTD fisik — begitu setuju_pks
                dicentang, jamaah udah boleh lanjut pelunasan
                (dikonfirmasi user 2026-10-13, TTD fisik beneran
                BUKAN syarat pelunasan lagi). Tapi tetap perlu
                diingetin biar gak lupa, soalnya materai+TTD fisik
                itu tetap wajib dilakukan — cuma belakangan, pas ke
                kantor atau paling lambat pas sesi manasik.
                setuju_pks TINYINT -> 0/1 dari MySQL, WAJIB di-!! —
                `{0 && ...}` dirender React jadi teks "0" nyasar
                di bawah baris DP (ditemukan user 2026-10-19). */}
            {!!b.setuju_pks && !(b.perjanjian_scan_path || b.perjanjian_sig?.fase === 'selesai') && (
              <div className="bg-[#E8F0FB] text-[#1A4FA0] text-xs text-center py-2 rounded-full mb-2">
                📜 Perjanjian Jamaah sudah disetujui online. Materai & tanda tangan fisik akan disiapkan manajemen saat Anda ke kantor, atau paling lambat saat sesi manasik.
              </div>
            )}

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

            {/* Stage 3 = form lengkap + DP confirmed, tapi belum
                setuju_pks — SETUJU ONLINE SAJA SUDAH CUKUP buat
                lanjut ke pelunasan (dikonfirmasi user 2026-10-13,
                lihat perjanjianSelesai() di bookingStage.js), jadi
                begitu diklik & tersimpan, stage langsung lompat ke
                4 (reminder materai+TTD fisik ditampilkan terpisah
                di atas, gak lagi nahan di stage ini). */}
            {stage === 3 && (
              <button
                onClick={() => router.push(`/pks?jenis=jamaah&booking_id=${b.id}`)}
                className="w-full bg-[#C9952A] text-white text-sm font-bold py-2 rounded-full hover:bg-yellow-600 transition-colors"
              >
                📜 Baca & Setujui Perjanjian →
              </button>
            )}

            {/* Checkout mandiri Sahabat Baitullah LANGSUNG lunas
                penuh dari saldo pas checkout, gak ada tahap
                "lanjut pelunasan" yang jamaah perlu lakukan --
                cuma nunggu admin konfirmasi pemakaian saldonya
                (dikonfirmasi user 2026-10-08), tombol ke
                /pelunasan gak relevan & bakal nyasar kalau
                diklik. */}
            {stage === 4 && b.prog_publish_type === 'sahabat_baitullah' && (
              <div className="bg-yellow-50 text-yellow-700 text-xs text-center py-2 rounded-full">
                ⏳ Menunggu admin konfirmasi pemakaian saldo tabungan umroh
              </div>
            )}

            {stage === 4 && b.prog_publish_type !== 'sahabat_baitullah' && (
              <button
                onClick={() => router.push(`/pelunasan?booking_id=${b.id}`)}
                className="w-full bg-[#C9952A] text-white text-sm font-bold py-2 rounded-full hover:bg-yellow-600 transition-colors"
              >
                {b.pelunasan_status === 'pending_confirm'
                  ? '⏳ Pelunasan Menunggu Konfirmasi'
                  : 'Lanjut Pelunasan →'}
              </button>
            )}

            {/* stage===5 cuma berarti pelunasan_status='paid' --
                BUKAN jaminan form/perjanjian beneran udah kelar
                (ditemukan user 2026-10-14, "dia gabisa ubah apa2
                lagi": booking yang lunas lewat jalur Invoice-paid-
                override di admin, gak lewat gerbang form/
                perjanjian normal, nyangkut di "stage 5" tanpa
                tombol aksi apa pun karena SEMUA tombol lain cuma
                dirender buat stage 2/3/4). Dicek independen di
                sini, sama pola kayak BookingProgressBar. */}
            {stage === 5 && !formLengkap(b) && (
              <button
                onClick={() => router.push(`/form-jamaah?booking_id=${b.id}`)}
                className="w-full bg-[#1A4FA0] text-white text-sm font-bold py-2 rounded-full hover:bg-[#0E2F6E] transition-colors"
              >
                Isi Formulir Jamaah ({b.form_filled}/{b.form_total}) →
              </button>
            )}
            {stage === 5 && formLengkap(b) && !perjanjianSelesai(b) && (
              <button
                onClick={() => router.push(`/pks?jenis=jamaah&booking_id=${b.id}`)}
                className="w-full bg-[#C9952A] text-white text-sm font-bold py-2 rounded-full hover:bg-yellow-600 transition-colors"
              >
                📜 Baca & Setujui Perjanjian →
              </button>
            )}
            {/* Ada dokumen pendukung yang ditolak ATAU masih
                menunggu verifikasi admin -> JANGAN nampilin
                "Lunas" polos ijo, nyesatin keliatan "beres semua"
                padahal masih ada yang perlu dibenerin/ditunggu
                (dikonfirmasi user 2026-10-15 buat 'ditolak', bug
                ditemukan dari booking sahabat3: 5 dokumen, 1
                ditolak, tapi badge-nya tetep ijo "Selamat
                menunaikan ibadah"; diperluas ke 'menunggu'
                2026-10-16 -- bug kedua: dokumen yang DIPERBAIKI
                abis ditolak balik status ke 'menunggu' [bukan
                'ditolak' lagi], jadi gak kedeteksi fungsi lama &
                banner ijo nongol lagi padahal admin belum sempat
                verifikasi ulang. Dikonfirmasi user: berlaku SEMUA
                status 'menunggu', apapun riwayatnya -- termasuk
                dokumen yang emang baru pertama kali diunggah,
                belum pernah ditolak). Notif ke jamaah udah
                otomatis terkirim SAAT admin nolak dokumennya
                (lihat kirimNotifikasi di
                /api/admin/dokumen-pendukung), gak perlu notif
                tambahan di sini. Warna amber + copy positif (BUKAN
                merah/❌) — ini jamaah yang BARU AJA lunasin
                bayaran, bukan orang yang bikin kesalahan; nadanya
                jangan kayak nuduh/nolak (dikonfirmasi user
                2026-10-15, "jangan merah silang, bikin yang lebih
                manusiawi"). */}
            {stage === 5 && formLengkap(b) && perjanjianSelesai(b) && adaDokumenPendukungDitolak(b.jamaah_data) && (
              <div className="bg-amber-50 text-amber-700 text-xs text-center py-2 rounded-full font-bold">
                📋 Lunas — tinggal lengkapi dokumen pendukung yang perlu diperbaiki di &ldquo;Dokumen Saya&rdquo; di bawah, ya.
              </div>
            )}
            {stage === 5 && formLengkap(b) && perjanjianSelesai(b) && !adaDokumenPendukungDitolak(b.jamaah_data) && adaDokumenPendukungMenunggu(b.jamaah_data) && (
              <div className="bg-amber-50 text-amber-700 text-xs text-center py-2 rounded-full font-bold">
                ⏳ Lunas — dokumen pendukung Anda sedang diverifikasi admin.
              </div>
            )}
            {stage === 5 && formLengkap(b) && perjanjianSelesai(b) && !adaDokumenPendukungDitolak(b.jamaah_data) && !adaDokumenPendukungMenunggu(b.jamaah_data) && (
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

            {/* Tambah Jamaah ke booking yang sudah ada — DP awal
                harus udah confirmed dulu (stage 2/3/4), pax baru
                wajib DP sendiri (dikonfirmasi user 2026-10-13).
                Begitu lunas, pakai jalur "+ Daftarkan jamaah lain"
                di halaman program (bikin booking baru terpisah).
                KHUSUS program umroh biasa — Program Eksklusif
                Sahabat Baitullah sengaja gak ikut (dikonfirmasi
                user 2026-10-13): booking di situ didesain "untuk
                diri sendiri" (1 booking = 1 orang, ordered_by
                wajib sama dengan pemilik akun), nambah pax gak
                sesuai model itu. */}
            {(stage === 2 || stage === 3 || stage === 4) && b.prog_publish_type !== 'sahabat_baitullah' && (
              <button
                onClick={() => router.push(`/tambah-jamaah?booking_id=${b.id}`)}
                className="w-full mt-2 border border-[#1A4FA0] text-[#1A4FA0] text-xs font-bold py-2 rounded-full hover:bg-[#E8F0FB] transition-colors"
              >
                ➕ Tambah Jamaah
              </button>
            )}

            {/* Link balik ke form-jamaah SELALU ada (gak hilang
                begitu tahap form kelewat) — dokumen pendukung
                (paspor/KTP/KK/vaksin/foto) opsional & boleh
                disusulin, jamaah perlu jalan buat lanjutin upload
                kapan aja selama booking masih aktif. */}
            <DokumenPendukungStatus booking={b}
              onUnggah={() => router.push(`/form-jamaah?booking_id=${b.id}&ke=dokumen`)}
              onEdit={() => router.push(`/form-jamaah?booking_id=${b.id}`)} />

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

            <DokumenSayaList bookingId={b.id} booking={b} onUpdated={muatBookings} />

            {!pembayaranSudahDiAcc(b) && (
              <button
                onClick={() => router.push(`/batalkan-program?booking_id=${b.id}`)}
                className="w-full mt-2 border border-red-300 text-red-500 text-xs font-bold py-2 rounded-full hover:bg-red-50 transition-colors"
              >
                ❌ Batalkan Booking
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout title={user.role !== 'jamaah' ? '📦 Booking Saya' : undefined} showBack={user.role !== 'jamaah'}>
      {/* Welcome Banner + Aksi Cepat itu konten BERANDA role jamaah — begitu
          halaman ini dibuka role lain lewat "Booking Saya" (sahabat/
          perwakilan/admin buka booking yang mereka closing-in), sapaan
          "portal jamaah" & pintasan generik jamaah gak relevan buat mereka
          (dikonfirmasi user 2026-10-06, sebelumnya kesorot aneh nongol di
          halaman yang niatnya cuma daftar booking). Kartu ringkasan angka di
          bawah TETAP tampil semua role — itu relevan buat "Booking Saya" juga. */}
      {user.role === 'jamaah' && (
        <>
          <div className="bg-gradient-to-r from-[#0E2F6E] to-[#1A4FA0] text-white rounded-2xl p-6 mb-6 text-center md:text-left">
            <h2 className="text-xl md:text-2xl font-bold">Assalamualaikum, {user.name.split(' ')[0]} 👋</h2>
            <p className="text-sm opacity-85 mt-1">Selamat datang di portal jamaah JM Travel</p>
            {/* Kode unik jamaah disembunyikan sementara, belum ada kegunaannya buat jamaah
                (butuh pengembangan lebih lanjut, dikonfirmasi user 2026-09-27). */}
          </div>

          <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 mb-6">
            <div className="font-bold text-[#0E2F6E] text-sm mb-2">⚡ Aksi Cepat</div>
            <div className="flex flex-wrap gap-2">
              {[
                { icon: '🕌', label: 'Lihat Program', action: () => router.push('/programs') },
                { icon: '📜', label: 'Riwayat', action: () => document.getElementById('riwayat-section')?.scrollIntoView({ behavior: 'smooth' }) },
                { icon: '🎟️', label: 'Voucher', action: () => router.push('/voucher') },
                { icon: '📞', label: 'Hubungi Kami', action: () => window.open(waLink(pengaturan.wa_kantor) || '#', '_blank') },
              ].map(item => (
                <button key={item.label} onClick={item.action}
                  className="text-xs font-semibold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d6e4f7] px-3 py-1.5 rounded-full">
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Ringkasan — susunan kartu warna disamain ke gaya dashboard HoP
          (dikonfirmasi user 2026-10-05, style/tatanan doang, angka yang
          udah ada gak ada yang ditambah/dikurangi). */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-green-50 rounded-xl p-3 md:p-4">
          <div className="text-[11px] md:text-xs text-gray-500">Booking Aktif</div>
          <div className="text-2xl font-black text-green-700">{active.length}</div>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 md:p-4">
          <div className="text-[11px] md:text-xs text-gray-500">Riwayat</div>
          <div className="text-2xl font-black text-[#1A4FA0]">{done.length}</div>
        </div>
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
            {grupAktif.map(grup => grup.length === 1 ? kartuBooking(grup[0]) : (
              // 1x checkout banyak jamaah = beberapa booking row (1 per
              // jamaah, lihat /api/bookings/batch) -> dibungkus 1 card parent
              // biar kebaca 1 pesanan, pola sama kayak Daftar Jamaah di
              // checkout (dikonfirmasi user 2026-10-19).
              <div key={grup[0].checkout_batch_id} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 px-1">
                  <div className="min-w-0">
                    <div className="font-bold text-[#0E2F6E] truncate">🛒 {grup[0].prog_name}</div>
                    <div className="text-[11px] text-gray-500">
                      1x checkout · {grup.length} jamaah{grup[0].created_at ? ` · ${new Date(grup[0].created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                    </div>
                  </div>
                  {grup.some(b => alasanPerluTindakan(b).length > 0) && (
                    <span className="flex-shrink-0 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">⚠️ Perlu tindakan</span>
                  )}
                </div>
                {grup.map((b, i) => kartuBooking(b, i + 1))}
              </div>
            ))}
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
                    {expandRiwayat === b.id && <DokumenSayaList bookingId={b.id} booking={b} />}
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
