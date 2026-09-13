'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

// Riwayat Closing Perwakilan — PINDAH jadi halaman sendiri (dikonfirmasi
// user 2026-09-06), sebelumnya numpang jadi tab di /admin/perwakilan/database
// bareng Daftar & Hirarki Pohon. Mirror /admin/sahabat/riwayat-closing.
// 2 histori terpisah: Closing Override (reseller_perwakilan, margin yang
// ngalir ke upline) & Closing Langsung (ujroh_perwakilan, punya si penutup
// sendiri) — baris bisa diklik buat expand detail (dikonfirmasi user
// 2026-09-06, sebelumnya list mati gak ada aksi apa2).
export default function RiwayatClosingPerwakilanPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [closingOverride, setClosingOverride] = useState([]);
  const [closingLangsung, setClosingLangsung] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openOverride, setOpenOverride] = useState(null);
  const [openLangsung, setOpenLangsung] = useState(null);
  // Rincian SEMUA penerima per booking closing (dikonfirmasi user
  // 2026-09-06, mirror Riwayat Closing Sahabat Baitullah) — 1 booking bisa
  // trigger ujroh_perwakilan (si penutup) + reseller_perwakilan berjenjang
  // ke upline, lazy-load pas barisnya diklik, di-cache per booking_id.
  const [rincianCache, setRincianCache] = useState({});
  const [rincianLoading, setRincianLoading] = useState(null);

  function bukaLangsung(bookingId) {
    if (openLangsung === bookingId) { setOpenLangsung(null); return; }
    setOpenLangsung(bookingId);
    if (rincianCache[bookingId]) return;
    setRincianLoading(bookingId);
    fetch(`/api/admin/perwakilan/closing-langsung/rincian?booking_id=${bookingId}`).then(r => r.json())
      .then(d => setRincianCache(prev => ({ ...prev, [bookingId]: d.rincian || [] })))
      .catch(() => setRincianCache(prev => ({ ...prev, [bookingId]: [] })))
      .finally(() => setRincianLoading(null));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    Promise.all([
      fetch('/api/admin/perwakilan/closing-override').then(r => r.json()),
      fetch('/api/admin/perwakilan/closing-langsung').then(r => r.json()),
    ]).then(([override, langsung]) => {
      setClosingOverride(override.override || []);
      setClosingLangsung(langsung.bookings || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  if (!user || !['admin', 'super_admin'].includes(user.role)) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <Layout title="🔁 Riwayat Closing Perwakilan" backHref="/admin/perwakilan/database">
      <div className="space-y-6">
        <div>
          <div className="font-bold text-[#0E2F6E] mb-1">🔁 Closing Override</div>
          <div className="text-xs text-gray-400 mb-3">
            Margin reseller yang ngalir ke upline saat downline-nya closing (jenis <code>reseller_perwakilan</code>) — beda dari Closing Langsung di bawah yang ujroh-nya punya si penutup sendiri. 100 baris terbaru.
          </div>
          {loading ? (
            <div className="text-center text-gray-400 py-6 text-sm">Memuat...</div>
          ) : closingOverride.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">Belum ada closing override.</div>
          ) : (
            <div className="space-y-2">
              {closingOverride.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden text-sm">
                  <button onClick={() => setOpenOverride(o => o === c.id ? null : c.id)} className="w-full text-left p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-[#0E2F6E]">{c.penerima_nama} <span className="text-gray-400 font-normal">({c.penerima_kode_unik})</span></div>
                        <div className="text-xs text-gray-400">{c.prog_name || c.keterangan || '-'}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{new Date(c.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-[#C9952A]">{fmtRp(c.nominal)}</div>
                        <div className={`text-[10px] ${c.dikonfirmasi_at ? 'text-green-600' : 'text-yellow-600'}`}>{c.dikonfirmasi_at ? 'Cair' : 'Pending'}</div>
                      </div>
                    </div>
                  </button>
                  {openOverride === c.id && (
                    <div className="border-t border-gray-100 p-3 space-y-1.5 text-xs bg-gray-50/50">
                      <div>Program: <b className="text-gray-700">{c.prog_name || '-'}</b></div>
                      <div>Keterangan: <b className="text-gray-700">{c.keterangan || '-'}</b></div>
                      <div>Tanggal: <b className="text-gray-700">{new Date(c.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</b></div>
                      <div>Status: <b className={c.dikonfirmasi_at ? 'text-green-600' : 'text-yellow-600'}>{c.dikonfirmasi_at ? `Cair — ${new Date(c.dikonfirmasi_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Pending'}</b></div>
                      <button onClick={() => window.open(`/admin/perwakilan/database?cari=${encodeURIComponent(c.penerima_kode_unik || c.penerima_nama)}`, '_blank')} className="text-[#1A4FA0] font-bold hover:underline">Lihat Profil Penerima →</button>
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
            Booking yang closing langsung atas nama perwakilan sendiri (jenis <code>ujroh_perwakilan</code>). 100 baris terbaru — rekap lengkap per-orang (filter periode/program + download) ada di tombol "Lihat Rekap &amp; Download" di{' '}
            <a href="/admin/perwakilan/database" className="text-[#1A4FA0] font-semibold hover:underline">Database Perwakilan</a>.
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
                        <div className="text-xs text-gray-400 mt-0.5">Via: <b className="text-[#1A4FA0]">{b.perwakilan_nama}</b> ({b.perwakilan_kode_unik})</div>
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
                        <div className="col-span-2">Pemesan: <b className="text-gray-700">{b.pemesan_nama || '-'} ({b.pemesan_wa || '-'})</b></div>
                      </div>

                      {/* Rincian SEMUA penerima dari booking closing ini
                          (dikonfirmasi user 2026-09-06) — ujroh_perwakilan
                          (si penutup) + reseller_perwakilan berjenjang ke
                          upline, sebelumnya kepisah di section Closing
                          Override tanpa nyambung balik ke booking asalnya. */}
                      <div className="pt-1">
                        <div className="font-bold text-gray-500 mb-1">Rincian Ujroh &amp; Margin Reseller:</div>
                        {rincianLoading === b.id ? (
                          <div className="text-gray-400">Memuat rincian...</div>
                        ) : (rincianCache[b.id] || []).length === 0 ? (
                          <div className="text-gray-400">Gak ada rincian.</div>
                        ) : (
                          <div className="space-y-1.5">
                            {(rincianCache[b.id] || []).map(r => {
                              const pax = Number(r.jumlah_jamaah) || 1;
                              const perPax = Math.round(Number(r.nominal || 0) / pax);
                              const paxBooking = Number(r.booking_jumlah_jamaah) || pax;
                              const hargaPerPax = paxBooking > 0 ? Math.round(Number(r.total_harga || 0) / paxBooking) : 0;
                              return (
                                <div key={r.id} className="bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                                  <div className="flex items-center justify-between">
                                    <div className="min-w-0 pr-2">
                                      <div className="font-bold text-gray-700 truncate">{r.penerima_nama}{r.penerima_kode_unik ? ` (${r.penerima_kode_unik})` : ''}</div>
                                      <div className="text-gray-400 truncate">{r.jenis === 'ujroh_perwakilan' ? 'Ujroh Closing (milik sendiri)' : 'Margin Reseller (upline)'}{r.keterangan ? ` · ${r.keterangan}` : ''}</div>
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
                        <button onClick={() => window.open(`/admin/perwakilan/database?cari=${encodeURIComponent(b.perwakilan_kode_unik || b.perwakilan_nama)}`, '_blank')} className="text-[#1A4FA0] font-bold hover:underline">Lihat Profil Perwakilan →</button>
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
