'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useIsHop } from '@/lib/useIsHop';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

// Riwayat Closing Sahabat Baitullah — PINDAH jadi halaman sendiri
// (dikonfirmasi user 2026-09-06), sebelumnya numpang jadi tab di
// /admin/sahabat/database bareng Daftar & Hirarki Pohon. Mirror
// /admin/perwakilan/riwayat-closing. 2 histori terpisah: Closing Sahabat
// Baitullah (referral, buka rekening/tabungan) & Closing Langsung (booking)
// — baris bisa diklik buat expand detail (dikonfirmasi user 2026-09-06,
// sebelumnya list mati gak ada aksi apa2).
export default function RiwayatClosingSahabatPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const { isAdminOrHop, checked: hopChecked } = useIsHop(user);
  const [closingReferral, setClosingReferral] = useState([]);
  const [closingLangsung, setClosingLangsung] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openReferral, setOpenReferral] = useState(null);
  const [openLangsung, setOpenLangsung] = useState(null);
  // Rincian SEMUA penerima per closing referral (dikonfirmasi user
  // 2026-09-06) — lazy-load pas barisnya diklik, di-cache per ref_id biar
  // gak fetch ulang tiap buka-tutup.
  const [rincianCache, setRincianCache] = useState({});
  const [rincianLoading, setRincianLoading] = useState(null);

  function bukaReferral(refId) {
    if (openReferral === refId) { setOpenReferral(null); return; }
    setOpenReferral(refId);
    if (rincianCache[refId]) return;
    setRincianLoading(refId);
    fetch(`/api/admin/sahabat/closing-referral/rincian?ref_id=${refId}`).then(r => r.json())
      .then(d => setRincianCache(prev => ({ ...prev, [refId]: d.rincian || [] })))
      .catch(() => setRincianCache(prev => ({ ...prev, [refId]: [] })))
      .finally(() => setRincianLoading(null));
  }

  // Rincian Closing Langsung (booking) — state terpisah dari rincian
  // referral di atas (key beda: booking_id vs ref_id), dikonfirmasi user
  // 2026-09-06, sebelumnya section ini gak punya rincian sama sekali.
  const [rincianLangsungCache, setRincianLangsungCache] = useState({});
  const [rincianLangsungLoading, setRincianLangsungLoading] = useState(null);

  function bukaLangsung(bookingId) {
    if (openLangsung === bookingId) { setOpenLangsung(null); return; }
    setOpenLangsung(bookingId);
    if (rincianLangsungCache[bookingId]) return;
    setRincianLangsungLoading(bookingId);
    fetch(`/api/admin/sahabat/closing-langsung/rincian?booking_id=${bookingId}`).then(r => r.json())
      .then(d => setRincianLangsungCache(prev => ({ ...prev, [bookingId]: d.rincian || [] })))
      .catch(() => setRincianLangsungCache(prev => ({ ...prev, [bookingId]: [] })))
      .finally(() => setRincianLangsungLoading(null));
  }

  useEffect(() => {
    if (!user || !hopChecked) return;
    if (!isAdminOrHop) { router.replace('/login'); return; }
    Promise.all([
      fetch('/api/admin/sahabat/closing-referral').then(r => r.json()),
      fetch('/api/admin/sahabat/closing-langsung').then(r => r.json()),
    ]).then(([referral, langsung]) => {
      setClosingReferral(referral.closing || []);
      setClosingLangsung(langsung.bookings || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user, hopChecked, isAdminOrHop]);

  if (!user || !hopChecked || !isAdminOrHop) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <Layout title="📜 Riwayat Closing Sahabat Baitullah" backHref="/admin/sahabat/database">
      <div className="space-y-6">
        <div>
          <div className="font-bold text-[#0E2F6E] mb-1">🤝 Closing Sahabat Baitullah</div>
          <div className="text-xs text-gray-400 mb-3">
            Orang baru yang berhasil "buka rekening" (aktif jadi Jamaah Sahabat Baitullah) lewat referral anggota lain. Ujroh 5 generasi ke upline otomatis kebagi begitu orangnya aktif.
          </div>
          {loading ? (
            <div className="text-center text-gray-400 py-6 text-sm">Memuat...</div>
          ) : closingReferral.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">Belum ada closing referral.</div>
          ) : (
            <div className="space-y-2">
              {closingReferral.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden text-sm">
                  <button onClick={() => bukaReferral(c.id)} className="w-full text-left p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-[#0E2F6E]">{c.name} <span className="text-gray-400 font-normal">({c.kode_unik})</span></div>
                        <div className="text-xs text-gray-400">Via: <b className="text-[#1A4FA0]">{c.perekrut_nama}</b> ({c.perekrut_kode_unik})</div>
                        <div className="text-xs text-gray-400 mt-0.5">{c.tanggal_aktif ? new Date(c.tanggal_aktif).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</div>
                      </div>
                      <span className="text-xs font-bold text-[#C9952A] shrink-0" title="Total ujroh gen ke UPLINE — belum termasuk HOP/tabungan awal/operasional, lihat rincian lengkap →">{fmtRp(c.total_dibagikan)}</span>
                    </div>
                  </button>
                  {openReferral === c.id && (
                    <div className="border-t border-gray-100 p-3 space-y-1.5 text-xs bg-gray-50/50">
                      <div>Anggota Baru: <b className="text-gray-700">{c.name} ({c.kode_unik})</b></div>
                      <div>Perekrut: <b className="text-gray-700">{c.perekrut_nama} ({c.perekrut_kode_unik})</b></div>
                      <div>Tanggal Aktif: <b className="text-gray-700">{c.tanggal_aktif ? new Date(c.tanggal_aktif).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</b></div>

                      {/* Rincian SEMUA penerima dari setoran Rp1jt pendaftaran
                          ini (dikonfirmasi user 2026-09-06) — biar gak
                          terkesan 1 orang closing dapet total-nya sekaligus,
                          tiap baris di bawah ini penerima BEDA-BEDA. */}
                      <div className="pt-1">
                        <div className="font-bold text-gray-500 mb-1">Rincian Pembagian Rp1.000.000:</div>
                        {rincianLoading === c.id ? (
                          <div className="text-gray-400">Memuat rincian...</div>
                        ) : (rincianCache[c.id] || []).length === 0 ? (
                          <div className="text-gray-400">Gak ada rincian.</div>
                        ) : (
                          <div className="space-y-1">
                            {(rincianCache[c.id] || []).map(r => (
                              <div key={r.id} className="flex items-center justify-between bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                                <div className="min-w-0 pr-2">
                                  <div className="font-bold text-gray-700 truncate">{r.penerima_nama}{r.penerima_kode_unik ? ` (${r.penerima_kode_unik})` : ''}</div>
                                  <div className="text-gray-400 truncate">{r.keterangan}</div>
                                </div>
                                <div className="font-bold text-[#C9952A] shrink-0">{fmtRp(r.nominal)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 pt-1">
                        <button onClick={() => window.open(`/admin/sahabat/database?cari=${encodeURIComponent(c.kode_unik || c.name)}`, '_blank')} className="text-[#1A4FA0] font-bold hover:underline">Lihat Profil Anggota Baru →</button>
                        <button onClick={() => window.open(`/admin/sahabat/database?cari=${encodeURIComponent(c.perekrut_kode_unik || c.perekrut_nama)}`, '_blank')} className="text-[#1A4FA0] font-bold hover:underline">Lihat Profil Perekrut →</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="font-bold text-[#0E2F6E] mb-1">💳 Closing Langsung</div>
          <div className="text-xs text-gray-400 mb-3">
            Jamaah booking langsung (bukan nabung) atas bantuan Jamaah Sahabat Baitullah — nominal &amp; persen split diatur di{' '}
            <a href="/admin/sahabat/pengaturan-komisi" className="text-[#1A4FA0] font-semibold hover:underline">Pengaturan Komisi</a>.
          </div>
          {loading ? (
            <div className="text-center text-gray-400 py-6 text-sm">Memuat...</div>
          ) : closingLangsung.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">Belum ada closing langsung.</div>
          ) : (
            <div className="space-y-2">
              {closingLangsung.map(b => (
                <div key={b.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden text-sm">
                  <button onClick={() => bukaLangsung(b.id)} className="w-full text-left p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-[#0E2F6E]">{b.prog_name}</div>
                        <div className="text-xs text-gray-400">{b.pemesan_nama} · {b.jumlah_jamaah} jamaah · {fmtRp(b.total_harga)}</div>
                        <div className="text-xs text-gray-400 mt-0.5">Via: <b className="text-[#1A4FA0]">{b.sahabat_nama}</b> ({b.sahabat_kode_unik})</div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-500">{b.status}</span>
                    </div>
                  </button>
                  {openLangsung === b.id && (
                    <div className="border-t border-gray-100 p-3 space-y-1.5 text-xs bg-gray-50/50">
                      <div className="grid grid-cols-2 gap-2">
                        <div>Paket: <b className="text-gray-700">{b.paket || '-'}</b></div>
                        <div>Kamar: <b className="text-gray-700">{b.kamar || '-'}</b></div>
                        <div>Booking ID: <b className="text-gray-700">{b.id}</b></div>
                        <div>Tanggal Booking: <b className="text-gray-700">{new Date(b.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</b></div>
                        <div>DP: <b className="text-gray-700">{b.dp_status || '-'}</b></div>
                        <div>Pelunasan: <b className="text-gray-700">{b.pelunasan_status || '-'}</b></div>
                        <div className="col-span-2">Pemesan: <b className="text-gray-700">{b.pemesan_nama || '-'} ({b.pemesan_wa || '-'})</b></div>
                      </div>

                      {/* Rincian SEMUA penerima dari booking closing ini
                          (dikonfirmasi user 2026-09-06) — Head of Program +
                          si closer bisa dua-duanya kebagian dari 1 booking
                          yang sama (closing jamaah lain), sebelumnya gak ada
                          breakdown-nya sama sekali di sini. */}
                      <div className="pt-1">
                        <div className="font-bold text-gray-500 mb-1">Rincian Ujroh:</div>
                        {rincianLangsungLoading === b.id ? (
                          <div className="text-gray-400">Memuat rincian...</div>
                        ) : (rincianLangsungCache[b.id] || []).length === 0 ? (
                          <div className="text-gray-400">Gak ada rincian.</div>
                        ) : (
                          <div className="space-y-1.5">
                            {(rincianLangsungCache[b.id] || []).map(r => {
                              const pax = Number(r.jumlah_jamaah) || 1;
                              const perPax = Math.round(Number(r.nominal || 0) / pax);
                              const paxBooking = Number(r.booking_jumlah_jamaah) || pax;
                              const hargaPerPax = paxBooking > 0 ? Math.round(Number(r.total_harga || 0) / paxBooking) : 0;
                              return (
                                <div key={r.id} className="bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                                  <div className="flex items-center justify-between">
                                    <div className="min-w-0 pr-2">
                                      <div className="font-bold text-gray-700 truncate">{r.penerima_nama}{r.penerima_kode_unik ? ` (${r.penerima_kode_unik})` : ''}</div>
                                      <div className="text-gray-400 truncate">{r.peran}{r.keterangan ? ` · ${r.keterangan}` : ''}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <div className="font-bold text-[#C9952A]">{fmtRp(r.nominal)}</div>
                                      <div className={r.dikonfirmasi_at ? 'text-green-600' : 'text-yellow-600'}>{r.dikonfirmasi_at ? 'Cair' : 'Pending'}</div>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5 pt-1.5 border-t border-gray-100 text-[11px] text-gray-500">
                                    <div>Program: <b className="text-gray-700">{r.prog_name || '-'}</b></div>
                                    <div>Paket: <b className="text-gray-700 capitalize">{r.paket || '-'}</b></div>
                                    <div>Jumlah Pax: <b className="text-gray-700">{pax}</b></div>
                                    <div>Harga Paket/Pax: <b className="text-gray-700">{fmtRp(hargaPerPax)}</b></div>
                                    <div className="col-span-2">Ujroh/Pax: <b className="text-[#C9952A]">{fmtRp(perPax)}</b> × {pax} pax = {fmtRp(r.nominal)}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 pt-1">
                        <button onClick={() => window.open(`/admin/manifest/${encodeURIComponent(b.prog_name)}`, '_blank')} className="text-[#1A4FA0] font-bold hover:underline">Lihat Manifest Program →</button>
                        <button onClick={() => window.open(`/admin/sahabat/database?cari=${encodeURIComponent(b.sahabat_kode_unik || b.sahabat_nama)}`, '_blank')} className="text-[#1A4FA0] font-bold hover:underline">Lihat Profil Sahabat Baitullah →</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
