'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import UploadBukti from '@/app/components/UploadBukti';
import CartPaketKamar from '@/app/components/CartPaketKamar';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useMetodePembayaran } from '@/lib/useMetodePembayaran';

export default function OrderJamaahPage() {
  return (
    <Suspense fallback={<Layout title="➕ Order Jamaah"><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <OrderJamaahPageInner />
    </Suspense>
  );
}

function OrderJamaahPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const progIdParam = searchParams.get('prog_id');

  const [user] = useCurrentUser();
  const [metodePembayaran] = useMetodePembayaran();
  const [programs, setPrograms] = useState([]);
  const [progId, setProgId] = useState('');
  const [step, setStep] = useState(1);
  const [cart, setCart] = useState([]);
  // hargaCustom (admin only, order direct/kantor tanpa ujroh) melekat per item
  // keranjang, bukan state global — tiap item bisa punya harga custom sendiri.
  const [current, setCurrent] = useState({ paket: 'eksekutif', kamar: 'Triple (3/Kamar)', jumlah: 1, hargaCustom: '', namas: [''], was: [''], jks: [''], opsiTambahan: [] });
  // Dari CartPaketKamar — dipakai isi voucher_kode pas submit & nampilin
  // info sisa pelunasan di step 3 (komponennya sendiri sudah unmount di situ).
  const [summary, setSummary] = useState({ totalHarga: 0, totalDp: 0, voucherKode: null, voucherDiskon: 0, totalHargaSetelahDiskon: 0, sisaPelunasan: 0 });
  const [kodeUnik] = useState(() => Math.floor(Math.random() * 900) + 100);
  const [buktiPath, setBuktiPath] = useState(null);
  const [buktiNama, setBuktiNama] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bookingIds, setBookingIds] = useState([]);
  const [timer, setTimer] = useState(3599);
  const [programsLoaded, setProgramsLoaded] = useState(false);

  const isDirty = step > 1 && step < 4;
  useUnsavedGuard(isDirty);

  useEffect(() => {
    if (!user) return;
    if (!['perwakilan', 'sahabat_baitullah', 'admin', 'super_admin'].includes(user.role)) {
      router.push('/dashboard/jamaah'); return;
    }

    fetch('/api/programs')
      .then(r => r.json())
      .then(d => {
        setPrograms(d.programs || []);
        setProgId(prev => prev || progIdParam || d.programs?.[0]?.id || '');
      })
      .catch(() => {})
      .finally(() => setProgramsLoaded(true));
  }, [user]);

  useEffect(() => {
    if (step !== 3) return;
    const interval = setInterval(() => setTimer(t => t > 0 ? t - 1 : 0), 1000);
    return () => clearInterval(interval);
  }, [step]);

  const prog = programs.find(p => p.id === progId);

  async function submitOrder() {
    setLoading(true);
    try {
      const res = await fetch('/api/bookings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          prog_id: progId,
          items: cart.map(c => ({
            paket: c.paket, kamar: c.kamar, jumlah_jamaah: c.jumlah, namas: c.namas, was: c.was, jks: c.jks, alamats: c.alamats,
            harga_custom_per_jamaah: (user.role === 'admin' || user.role === 'super_admin') && c.hargaCustom !== '' ? Number(c.hargaCustom) : null,
            customHotel: c.customHotel || null,
            opsi_tambahan_ids: (c.opsiTambahan || []).map(o => o.id),
          })),
          kode_unik_dp: kodeUnik,
          bukti_path: buktiPath,
          bukti_nama: buktiNama,
          voucher_kode: summary.voucherKode,
          ordered_by: user.id,
          ordered_by_role: user.role,
          // Closing otomatis ke akun yang order — sama seperti checkout,
          // bedanya di sini referral TIDAK perlu dipilih manual.
          referral_perw_id: user.role === 'perwakilan' ? user.id : null,
          // Sahabat: ini "closing langsung" (jamaah booking langsung dibantu
          // anggota sahabat, bukan nabung) — MURNI tag atribusi, tidak ada
          // reseller pricing/komisi berjenjang kayak perwakilan.
          referral_sahabat_id: user.role === 'sahabat_baitullah' ? user.id : null,
          referral_kode: user.kode_unik || null,
          sumber_info: (user.role === 'admin' || user.role === 'super_admin') ? 'langsung_kantor' : user.role,
        })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); setLoading(false); return; }
      setBookingIds(data.bookings.map(b => b.booking_id));
      setStep(4);
    } catch (e) {
      alert('Terjadi kesalahan'); setLoading(false);
    }
  }

  const timerFmt = `${String(Math.floor(timer / 60)).padStart(2, '0')}:${String(timer % 60).padStart(2, '0')}`;

  const totalDP = cart.reduce((s, c) => s + (prog?.dp || 0) * c.jumlah, 0);

  const steps = ['Detail', 'Pilih Paket', 'Bayar DP', 'Selesai'];

  // Dulu nunggu `prog` juga (bukan cuma user+fetch selesai) — begitu
  // /api/programs balik KOSONG (mis. admin gak punya program aktif yang
  // kelihatan, lihat api/programs/route.js), `prog` gak akan pernah kesetel
  // dan halaman ini macet permanen di "Memuat..." (padahal fetch-nya udah
  // kelar, cuma emang gak ada programnya) — pesan "Belum ada program aktif"
  // di bawah jadi gak pernah kesempetan muncul. programsLoaded yang nentuin
  // udah kelar apa belum, bukan ada-tidaknya program.
  if (!user || !programsLoaded) return (
    <Layout title="➕ Order Jamaah"><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>
  );

  // Perwakilan/sahabat yang belum di-ACC admin belum boleh order —
  // blokir di awal, sama seperti gerbang di checkout jamaah.
  if (['perwakilan', 'sahabat_baitullah'].includes(user.role) && user.status !== 'active') {
    return (
      <Layout title="➕ Order Jamaah" showBack>
        <div className="max-w-md mx-auto bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">⏳</div>
          <h3 className="font-bold text-yellow-800 mb-1">Akun Anda Belum Dikonfirmasi Admin</h3>
          <p className="text-sm text-yellow-700">
            Akun {user.role} Anda masih menunggu ACC admin. Anda belum bisa order jamaah sampai akun ini aktif.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="➕ Order Jamaah" showBack confirmLeave={isDirty}
      confirmMessage="Yakin ingin keluar? Data order yang sedang diisi akan hilang.">
      <div className="max-w-2xl mx-auto">

        {/* Steps */}
        <div className="flex items-center mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i + 1 < step ? 'bg-[#C9952A] text-white' :
                  i + 1 === step ? 'bg-[#1A4FA0] text-white' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {i + 1 < step ? '✓' : i + 1}
                </div>
                <div className={`text-[10px] mt-1 text-center ${i + 1 === step ? 'text-[#1A4FA0] font-semibold' : 'text-gray-400'}`}>{s}</div>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 ${i + 1 < step ? 'bg-[#C9952A]' : 'bg-gray-200'}`}></div>
              )}
            </div>
          ))}
        </div>

        {/* STEP 1 */}
        {step === 1 && programs.length === 0 && (
          <div className="text-center text-gray-400 py-16">
            Belum ada program aktif yang bisa di-order. Buka <b>Kelola Program</b> buat bikin/aktifin program dulu.
          </div>
        )}
        {step === 1 && programs.length > 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#0E2F6E] mb-2">Pilih Program *</label>
              <select value={progId} onChange={e => setProgId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name} · {p.total_seat - p.used_seat} seat tersisa</option>
                ))}
              </select>
            </div>

            <div className="bg-gradient-to-br from-[#0E2F6E] to-[#2060C0] text-white rounded-2xl p-6">
              <div className="text-xs opacity-75 mb-1">{prog.type} · {prog.durasi} Hari</div>
              <div className="text-xl font-bold mb-1">{prog.name}</div>
              <div className="text-sm opacity-85">{prog.highlight}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Keberangkatan', val: prog.tanggal },
                { label: 'Durasi', val: prog.durasi + ' Hari' },
                { label: 'Seat Tersisa', val: (prog.total_seat - prog.used_seat) + ' seat' },
                { label: 'DP/Jamaah', val: 'Rp ' + (prog.dp / 1000000).toFixed(0) + ' jt' },
              ].map(item => (
                <div key={item.label} className="bg-[#E8F0FB] rounded-xl p-3">
                  <div className="text-xs text-gray-400">{item.label}</div>
                  <div className="font-bold text-[#0E2F6E] text-sm mt-0.5">{item.val}</div>
                </div>
              ))}
            </div>
            {metodePembayaran.length > 0 && (
              <div className="bg-[#E8F0FB] border border-blue-200 rounded-xl p-4 text-sm text-[#1A4FA0]">
                <div className="font-bold mb-1">⚠️ Pembayaran hanya via:</div>
                {metodePembayaran.map(m => (
                  <div key={m.id}>{m.nama}{m.nomor ? ` — ${m.nomor}` : ''}</div>
                ))}
              </div>
            )}

            {/* Closing — otomatis sesuai akun yang order, tidak perlu dipilih manual */}
            <div className={`rounded-xl p-4 text-sm border-2 ${
              (user.role === 'admin' || user.role === 'super_admin') ? 'bg-gray-900 text-white border-gray-900' :
              'bg-purple-50 text-purple-700 border-[#C9952A]'
            }`}>
              {(user.role === 'admin' || user.role === 'super_admin') && '⚙️ Order sebagai Admin — closing tercatat sebagai Direct/Kantor (tanpa ujroh)'}
              {user.role === 'perwakilan' && `🏢 Order sebagai Perwakilan — closing otomatis tercatat ke akun Anda (${user.name}, ${user.kode_unik})`}
              {user.role === 'sahabat_baitullah' && `🤝 Order sebagai Jamaah Sahabat Baitullah (Closing Langsung) — tercatat atas nama Anda (${user.name}, ${user.kode_unik}). Begitu booking ini selesai, ujroh-nya otomatis tercatat sebagai saldo pending di akun Anda, menunggu proses Pencairan Komisi admin.`}
            </div>

            <button onClick={() => setStep(2)}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors">
              Lanjutkan Order →
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-5">
            <CartPaketKamar
              prog={prog} cart={cart} current={current}
              onAdd={item => setCart(prev => [...prev, item])}
              onRemove={i => setCart(prev => prev.filter((_, idx) => idx !== i))}
              onChangeCurrent={setCurrent}
              onSummaryChange={setSummary}
              referralPerwId={user.role === 'perwakilan' ? user.id : null}
              extra={(user.role === 'admin' || user.role === 'super_admin') && (() => {
                const kamarKey = current.kamar?.includes('Quad') ? 'quad' : current.kamar?.includes('Double') ? 'double' : 'triple';
                const hargaNormal = prog?.[`harga_${current.paket}_${kamarKey}`] || prog?.[`harga_${current.paket}`] || 0;
                return (
                  <div className="bg-gray-900 rounded-xl p-4 space-y-2">
                    <div className="font-bold text-white text-sm">💰 Set Harga Sendiri (Admin)</div>
                    <div className="text-xs text-gray-300">
                      Kosongkan untuk pakai harga normal (Rp {hargaNormal.toLocaleString('id-ID')}/jamaah) untuk item ini.
                    </div>
                    <input
                      type="number"
                      value={current.hargaCustom}
                      onChange={e => setCurrent({ ...current, hargaCustom: e.target.value })}
                      placeholder={`Rp ${hargaNormal.toLocaleString('id-ID')}`}
                      className="w-full px-3 py-2 rounded-lg border-2 border-gray-700 bg-gray-800 text-white placeholder-gray-500 focus:border-[#C9952A] focus:outline-none text-sm"
                    />
                    {current.hargaCustom !== '' && (
                      <button onClick={() => setCurrent({ ...current, hargaCustom: '' })} className="text-xs text-[#C9952A] font-semibold underline">
                        Reset ke harga normal
                      </button>
                    )}
                  </div>
                );
              })()}
            />

            <div className="flex gap-3">
              <button onClick={() => setStep(1)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full transition-colors">
                ← Kembali
              </button>
              <button onClick={() => setStep(3)} disabled={cart.length === 0}
                className="flex-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 px-8 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Lanjut ke Pembayaran →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <div className="text-xs text-red-500 mb-1">⏰ Batas Waktu Pembayaran DP</div>
              <div className="text-4xl font-black text-red-600 font-mono tracking-widest">{timerFmt}</div>
            </div>
            <div className="bg-[#E8F0FB] rounded-xl p-4 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0] mb-3">📋 Invoice DP</div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Program</span><span className="font-semibold text-[#0E2F6E]">{prog.name}</span>
              </div>
              {cart.map((c, i) => (
                <div key={i} className="flex justify-between text-sm text-gray-500">
                  <span className="capitalize">{c.paket} · {c.kamar} × {c.jumlah}</span>
                  <span className="font-semibold text-[#0E2F6E]">Rp {((prog?.dp || 0) * c.jumlah).toLocaleString('id-ID')}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm text-gray-500 pt-1 border-t border-blue-200">
                <span>Total DP</span><span className="font-semibold text-[#0E2F6E]">Rp {totalDP.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Kode Unik</span><span className="font-bold text-red-600">+Rp {kodeUnik}</span>
              </div>
              <div className="border-t border-blue-200 pt-2 flex justify-between font-bold">
                <span className="text-sm">Transfer Tepat</span>
                <span className="text-red-600">Rp {(totalDP + kodeUnik).toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div className="bg-[#FEF3DC] border border-[#C9952A] rounded-xl p-4 text-sm text-[#8a6516]">
              ℹ️ Sisa pelunasan setelah DP ini dikonfirmasi: <strong>Rp {summary.sisaPelunasan.toLocaleString('id-ID')}</strong>
              {summary.voucherKode && (
                <div className="text-xs mt-1">(sudah termasuk diskon voucher {summary.voucherKode} −Rp {summary.voucherDiskon.toLocaleString('id-ID')})</div>
              )}
            </div>

            <div className="bg-white border-2 border-[#1A4FA0] rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0]">🏦 Rekening Tujuan</div>
              {metodePembayaran.map(m => (
                <div key={m.id} className="text-sm text-gray-500 border-t border-gray-100 pt-2 first:border-0 first:pt-0">
                  <div className="font-bold text-[#0E2F6E]">{m.nama}</div>
                  {m.nomor && <div className="flex justify-between"><span>No. Rekening</span><span className="font-bold text-[#0E2F6E]">{m.nomor}</span></div>}
                  {m.atas_nama && <div className="flex justify-between"><span>Atas Nama</span><span className="font-bold text-[#0E2F6E]">{m.atas_nama}</span></div>}
                  {m.catatan && <div className="text-xs text-gray-400 mt-0.5">{m.catatan}</div>}
                </div>
              ))}
            </div>
            <UploadBukti
              onUploaded={(path, nama) => { setBuktiPath(path); setBuktiNama(nama); }}
              label="Klik untuk upload bukti transfer DP"
            />
            <div className="flex gap-3">
              <button onClick={() => setStep(2)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full transition-colors">
                ← Kembali
              </button>
              <button onClick={submitOrder} disabled={!buktiPath || loading}
                className="flex-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 px-8 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Memproses...' : '📤 Kirim Bukti Transfer'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div className="text-center space-y-4 py-8">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-[#0E2F6E]">Order Berhasil Dikirim!</h2>
            <p className="text-gray-400 text-sm">Admin akan verifikasi bukti transfer dalam 1×24 jam.</p>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-left space-y-1">
              <div className="text-sm text-green-600">Program: {prog.name}</div>
              {bookingIds.map(id => (
                <div key={id} className="font-bold text-green-800">Booking: {id}</div>
              ))}
              <div className="text-sm text-green-600">Ordered by: {user.role} — {user.name}</div>
            </div>
            <div className="bg-[#E8F0FB] rounded-xl p-4 text-left text-sm text-[#0E2F6E] space-y-1">
              <div>① Admin verifikasi bukti (maks 1×24 jam)</div>
              <div>② Formulir jamaah terbuka untuk dilengkapi</div>
              <div>③ Lanjutkan pelunasan setelah formulir selesai</div>
            </div>
            <button onClick={() => {
              const tujuan = { admin: '/admin', perwakilan: '/dashboard/perwakilan', sahabat: '/dashboard/sahabat' };
              router.push(tujuan[user.role] || '/dashboard/jamaah');
            }} className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors">
              Ke Dashboard →
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
