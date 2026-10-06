'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import UploadBukti from '@/app/components/UploadBukti';
import CartPaketKamar, { kamarKeyOf } from '@/app/components/CartPaketKamar';
import SearchableSelect from '@/app/components/SearchableSelect';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan, waLink } from '@/lib/usePengaturan';
import { useMetodePembayaran } from '@/lib/useMetodePembayaran';
import { trackLead } from '@/lib/analytics';
import { ambilRefPerwakilan } from '@/lib/referralCapture';

export default function CheckoutPage() {
  return (
    <Suspense fallback={<Layout><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <CheckoutPageInner />
    </Suspense>
  );
}

function CheckoutPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const progId = searchParams.get('prog_id');

  const [user] = useCurrentUser();
  const [pengaturan] = usePengaturan();
  const [metodePembayaran] = useMetodePembayaran();
  const [prog, setProg] = useState(null);
  const [step, setStep] = useState(1);
  const [cart, setCart] = useState([]);
  const [current, setCurrent] = useState({ paket: 'eksekutif', kamar: 'Triple (3/Kamar)', jumlah: 1, hargaCustom: '', customHotel: null, namas: [''], was: [''], jks: [''], opsiTambahan: [] });
  // Dari CartPaketKamar — dipakai isi voucher_kode pas submit & nampilin
  // info sisa pelunasan di step 3 (komponennya sendiri sudah unmount di situ).
  const [summary, setSummary] = useState({ totalHarga: 0, totalDp: 0, voucherKode: null, voucherDiskon: 0, totalHargaSetelahDiskon: 0, sisaPelunasan: 0 });
  const [kodeUnik] = useState(() => Math.floor(Math.random() * 900) + 100);
  // Sumber informasi (siapa yang mengajak) — WAJIB di checkout,
  // karena inilah yang menentukan siapa penerima komisi. Perwakilan/Sahabat
  // Baitullah yang checkout untuk diri sendiri (mis. Closing Langsung)
  // TIDAK perlu ditanya sumber info — closing otomatis ke akun mereka
  // sendiri (dikonfirmasi user 2026-09-27, mirror perilaku /order-jamaah
  // yang sekarang dilebur ke sini). Diisi via lazy initializer dari `user`
  // (sudah resolve duluan lewat useCurrentUser di atas), bukan efek — biar
  // gak kena flag react-hooks/set-state-in-effect.
  const AUTO_LOCK_SUMBER_ROLES = ['perwakilan', 'sahabat_baitullah'];
  const [sumber, setSumber] = useState(() => AUTO_LOCK_SUMBER_ROLES.includes(user?.role) ? user.role : '');
  const [referralKode, setReferralKode] = useState(() => AUTO_LOCK_SUMBER_ROLES.includes(user?.role) ? (user.kode_unik || '') : '');
  // Referral perwakilan PERMANEN (dikunci sejak registrasi) — kalau jamaah
  // punya ini, dropdown "Sumber Informasi" diganti banner read-only di
  // bawah, murni kosmetik karena server (buatSatuBooking) SUDAH memaksa
  // pakai nilai ini apapun yang dikirim client.
  const [permanentReferrer, setPermanentReferrer] = useState(null);
  const [perwList, setPerwList] = useState([]);
  // "Closing langsung" sahabat — jamaah booking langsung (bukan nabung),
  // atribusi ke anggota sahabat yang bantu, pola identik sumber='perwakilan'
  // di atas. MURNI tag (referral_sahabat_id) buat admin proses split
  // rekening pribadi secara manual — TIDAK ikut logic komisi/voucher apa pun.
  // Daftar nama anggota Sahabat SENGAJA gak di-fetch lagi (ditutup
  // 2026-09-28, dikonfirmasi user — dulu dropdown nampilin nama lengkap semua
  // anggota). Jamaah ketik kode_unik Sahabat yang mengajak, diverifikasi
  // server 1 kode (POST /api/referral-list/cek-sahabat, nama disamarkan).
  const [sahabatTerverifikasi, setSahabatTerverifikasi] = useState(null);
  const [cekSahabatStatus, setCekSahabatStatus] = useState('');
  const [buktiPath, setBuktiPath] = useState(null);
  const [buktiNama, setBuktiNama] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bookingIds, setBookingIds] = useState([]);
  const [timer, setTimer] = useState(3599);

  // Checkout mandiri Program Sahabat Baitullah (Jamaah Sahabat Baitullah
  // checkout buat DIRI SENDIRI) — alur beda total dari checkout biasa: gak
  // ada DP, dibayar dari saldo tabungan + sisa pribadi (dikonfirmasi user
  // 2026-08-29). Ditangani sebagai cabang terpisah di bawah, BUKAN nyampur
  // ke step 1-4 di atas yang isinya keranjang multi-item.
  const [paketMandiri, setPaketMandiri] = useState('eksekutif');
  const [kamarMandiri, setKamarMandiri] = useState('Triple (3/Kamar)');
  const [namaMandiri, setNamaMandiri] = useState('');
  const [waMandiri, setWaMandiri] = useState('');
  const [jkMandiri, setJkMandiri] = useState('');
  const [alamatMandiri, setAlamatMandiri] = useState('');
  const [voucherMandiri, setVoucherMandiri] = useState(null);
  const [saldoInfo, setSaldoInfo] = useState(null);
  const [hasilMandiri, setHasilMandiri] = useState(null);
  const [noRekeningUmrohMandiri, setNoRekeningUmrohMandiri] = useState('');

  const isMandiriSahabat = user?.role === 'sahabat_baitullah' && prog?.publish_type === 'sahabat_baitullah';
  // Program eksklusif cuma boleh didaftarkan buat diri sendiri — KECUALI
  // akun non-Muslim (gak bisa umroh sendiri, memberangkatkan orang lain
  // pakai akunnya, lihat migration 192_referral-nonis-sahabat), dikonfirmasi
  // user 2026-10-06. Server-side yang beneran menegakkan (checkout-mandiri
  // route memaksa nama dari profil akun apapun yang dikirim client) — kunci
  // di UI ini cuma biar gak membingungkan (keliatan bisa diedit padahal
  // ditolak server).
  const namaMandiriTerkunci = isMandiriSahabat && user?.agama !== 'non_islam';

  // Udah masuk isi paket/bayar tapi belum kelar (step sukses: 3 buat
  // checkout mandiri Sahabat Baitullah, 4 buat checkout biasa).
  const isDirty = step > 1 && step < (isMandiriSahabat ? 3 : 4);
  useUnsavedGuard(isDirty);

  // Verifikasi kode Sahabat yang diketik jamaah (didebounce 400ms). Akun
  // Sahabat sendiri gak lewat sini — referralKode-nya kode milik sendiri &
  // referral_sahabat_id dipaksa user.id pas submit.
  useEffect(() => {
    if (user?.role === 'sahabat_baitullah' || sumber !== 'sahabat_baitullah') return;
    const kode = referralKode.trim();
    setSahabatTerverifikasi(null);
    if (!kode) { setCekSahabatStatus(''); return; }
    setCekSahabatStatus('cek');
    const timer = setTimeout(() => {
      fetch('/api/referral-list/cek-sahabat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.valid) { setSahabatTerverifikasi(d); setCekSahabatStatus(''); }
          else setCekSahabatStatus('invalid');
        })
        .catch(() => setCekSahabatStatus('invalid'));
    }, 400);
    return () => clearTimeout(timer);
  }, [referralKode, sumber, user?.role]);

  useEffect(() => {
    if (!user) return;

    // Ambil daftar perwakilan AKTIF untuk pilihan "siapa yang mengajak".
    // Pakai /api/referral-list (boleh diakses jamaah), BUKAN /api/admin/users
    // yang admin-only — itu penyebab dropdown kosong & referral_perw_id NULL.
    fetch('/api/referral-list')
      .then(r => r.json())
      .then(d => {
        const list = d.perwakilan || [];
        setPerwList(list);
        // Ref perwakilan yang ketangkep dari link publik (program/[id],
        // programs, register) — auto-isi "Sumber Informasi" kalau jamaah
        // belum milih apa-apa manual, biar gak perlu pilih dropdown lagi
        // (dikonfirmasi user 2026-09-02). Perwakilan checkout sendiri
        // (sumber sudah ke-set dari lazy initializer di atas) TIDAK
        // ditimpa — cek `sumber` masih kosong dulu.
        const ref = ambilRefPerwakilan();
        if (ref && !sumber) {
          const match = list.find(p => p.kode_unik === ref);
          if (match) { setSumber('perwakilan'); setReferralKode(match.kode_unik); }
        }
      })
      .catch(() => {});
    if (progId) {
      fetch('/api/programs')
        .then(r => r.json())
        .then(d => {
          const found = d.programs.find(p => p.id === progId);
          if (found) setProg(found);
        });
    }
  }, [user, progId]);

  useEffect(() => {
    if (user?.role !== 'jamaah') return;
    fetch(`/api/profil?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.user?.perekrut_perwakilan_jamaah_id) {
          setPermanentReferrer({
            id: d.user.perekrut_perwakilan_jamaah_id,
            name: d.user.perekrut_perwakilan_jamaah_nama,
            kode_unik: d.user.perekrut_perwakilan_jamaah_kode,
          });
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (step !== 3) return;
    const interval = setInterval(() => {
      setTimer(t => t > 0 ? t - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  useEffect(() => {
    if (!isMandiriSahabat) return;
    fetch(`/api/profil?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => {
        setNamaMandiri(d.user?.name || '');
        setWaMandiri(d.user?.wa || '');
        setJkMandiri(d.user?.jenis_kelamin || '');
        setAlamatMandiri(d.user?.alamat_kirim || '');
        setNoRekeningUmrohMandiri(d.user?.no_rekening_tabungan_umroh || '');
      })
      .catch(() => {});
    fetch(`/api/sahabat/dashboard?sahabat_id=${user.id}`)
      .then(r => r.json())
      .then(d => {
        setSaldoInfo(d.ringkasan || null);
        if (d.voucher && !d.voucher.used) setVoucherMandiri(d.voucher);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMandiriSahabat]);

  const hargaMandiri = prog ? Number(prog[`harga_${paketMandiri}_${kamarKeyOf(kamarMandiri)}`] || 0) : 0;
  const voucherDiskonMandiri = voucherMandiri ? Math.min(Number(voucherMandiri.potongan || 0), hargaMandiri) : 0;
  const totalMandiri = Math.max(0, hargaMandiri - voucherDiskonMandiri);
  const saldoTersediaMandiri = Math.max(0, Number(saldoInfo?.saldo_tabungan_umroh || 0));
  // Wajib ditutup PENUH dari saldo — gak ada lagi opsi transfer pribadi
  // buat nutup selisih (dikonfirmasi user 2026-09-29). saldoDipakaiMandiri
  // cuma dipakai buat TAMPILAN di sini (server tetap validasi ulang), kalau
  // saldo kurang tombol "Selesaikan Pendaftaran" diganti pesan kurang saldo.
  const saldoCukupMandiri = saldoTersediaMandiri >= totalMandiri;
  const saldoDipakaiMandiri = saldoCukupMandiri ? totalMandiri : saldoTersediaMandiri;
  const kuranganMandiri = Math.max(0, totalMandiri - saldoTersediaMandiri);

  async function submitMandiri() {
    setLoading(true);
    try {
      const res = await fetch('/api/sahabat/checkout-mandiri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prog_id: progId,
          paket: paketMandiri, kamar: kamarMandiri,
          nama: namaMandiri, wa: waMandiri, jk: jkMandiri, alamat: alamatMandiri,
          voucher_kode: voucherMandiri?.kode || null,
        })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); setLoading(false); return; }
      setHasilMandiri(data);
      setBookingIds([data.booking_id]);
      setStep(3);
    } catch (e) {
      alert('Terjadi kesalahan'); setLoading(false);
    }
  }

  async function submitBooking() {
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
            harga_custom_per_jamaah: c.hargaCustom || null,
            customHotel: c.customHotel || null,
            opsi_tambahan_ids: (c.opsiTambahan || []).map(o => o.id),
          })),
          kode_unik_dp: kodeUnik,
          bukti_path: buktiPath,
          bukti_nama: buktiNama,
          voucher_kode: summary.voucherKode,
          // Referral: menentukan siapa penerima komisi. Untuk jamaah dengan
          // referral permanen, nilai ini murni ADVISORY — server
          // (buatSatuBooking) SELALU memaksa pakai users.perekrut_perwakilan_jamaah_id,
          // apapun yang dikirim di sini, jadi gak bisa dimanipulasi dari client.
          sumber_info: sumber,
          referral_kode: referralKode,
          referral_perw_id: user.role === 'perwakilan' ? user.id
            : permanentReferrer ? permanentReferrer.id
            : sumber === 'perwakilan' ? (perwList.find(p => p.kode_unik === referralKode)?.id || null) : null,
          referral_sahabat_id: user.role === 'sahabat_baitullah' ? user.id
            : sumber === 'sahabat_baitullah' ? (sahabatTerverifikasi?.id || null) : null,
          // Dulu cuma dikirim /order-jamaah (sekarang dilebur ke sini,
          // dikonfirmasi user 2026-09-27) — tanpa ini, booking yang
          // diorderkan perwakilan/sahabat/admin lewat checkout salah
          // tercatat "jamaah" di kolom "Dipesan Oleh (Role)" laporan admin.
          ordered_by: user.id,
          ordered_by_role: user.role,
        })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); setLoading(false); return; }
      setBookingIds(data.bookings.map(b => b.booking_id));
      trackLead({ value: summary.totalDp, currency: 'IDR', sumber_info: sumber });
      setStep(4);
    } catch (e) {
      alert('Terjadi kesalahan'); setLoading(false);
    }
  }

  const timerFmt = `${String(Math.floor(timer / 60)).padStart(2, '0')}:${String(timer % 60).padStart(2, '0')}`;

  const totalDP = cart.reduce((s, c) => s + (prog?.dp || 0) * c.jumlah, 0);

  const steps = ['Detail', 'Pilih Paket', 'Bayar DP', 'Selesai'];

  if (!user || !prog) return (
    <Layout><div className="flex items-center justify-center py-20 text-gray-400">Memuat program...</div></Layout>
  );

  // Perwakilan/sahabat yang belum di-ACC admin belum boleh checkout —
  // blokir di awal, jangan biarkan isi form dulu baru gagal di submit akhir
  // (buatSatuBooking di server nolak hal yang sama, ini cuma UX lebih awal).
  if (['perwakilan', 'sahabat_baitullah'].includes(user?.role) && user?.status !== 'active') {
    return (
      <Layout title="🛒 Checkout" backHref="/programs">
        <div className="max-w-md mx-auto bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">⏳</div>
          <h3 className="font-bold text-yellow-800 mb-1">Akun Anda Belum Dikonfirmasi Admin</h3>
          <p className="text-sm text-yellow-700">
            Akun {user.role} Anda masih menunggu ACC admin. Anda belum bisa checkout sampai akun ini aktif.
          </p>
        </div>
      </Layout>
    );
  }

  // Checkout Mandiri Program Sahabat Baitullah — alur terpisah total dari
  // checkout biasa di bawah: 1 orang (diri sendiri), gak ada tahap DP,
  // dibayar dari saldo tabungan (wajib dipakai duluan) + sisa pribadi kalau
  // saldo belum cukup (dikonfirmasi user 2026-08-29).
  if (isMandiriSahabat) {
    const stepsMandiri = ['Pilih Paket', 'Pembayaran', 'Selesai'];
    const paketOpsi = [
      { key: 'deluxe', label: '⭐⭐⭐ Deluxe' },
      { key: 'eksekutif', label: '⭐⭐⭐⭐ Eksekutif' },
      { key: 'signature', label: '⭐⭐⭐⭐⭐ Signature' },
    ];
    const kamarOpsi = ['Quad (4/Kamar)', 'Triple (3/Kamar)', 'Double (2/Kamar)'];

    return (
      <Layout title="🛒 Checkout — Program Sahabat Baitullah" backHref="/programs" confirmLeave={isDirty}
        confirmMessage="Yakin ingin keluar? Data booking yang sedang diisi akan hilang.">
        <div className="max-w-2xl mx-auto">

          <div className="flex items-center mb-8">
            {stepsMandiri.map((s, i) => (
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
                {i < stepsMandiri.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-4 ${i + 1 < step ? 'bg-[#C9952A]' : 'bg-gray-200'}`}></div>
                )}
              </div>
            ))}
          </div>

          {/* STEP 1 — Pilih paket & data diri (checkout buat DIRI SENDIRI) */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-[#0E2F6E] to-[#2060C0] text-white rounded-2xl p-6">
                <div className="text-xs opacity-75 mb-1">{prog.type} · {prog.durasi} Hari</div>
                <div className="text-xl font-bold mb-1">{prog.name}</div>
                <div className="text-sm opacity-85">{prog.highlight}</div>
              </div>

              <div className="bg-purple-50 border-2 border-[#C9952A] rounded-xl p-4 text-sm text-purple-700">
                🌟 Checkout Program Sahabat Baitullah untuk diri sendiri — pembayaran otomatis diambil dari saldo tabungan umroh Anda.
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-xl p-4 space-y-3">
                <div className="font-bold text-[#0E2F6E] text-sm">Pilih Paket</div>
                <div className="grid grid-cols-1 gap-2">
                  {paketOpsi.map(pk => {
                    const harga = Number(prog[`harga_${pk.key}_${kamarKeyOf(kamarMandiri)}`] || 0);
                    const tersedia = harga > 0;
                    return (
                      <div key={pk.key}
                        onClick={() => tersedia && setPaketMandiri(pk.key)}
                        className={`rounded-xl p-3 border-2 flex items-center justify-between ${
                          !tersedia ? 'border-gray-100 opacity-40 cursor-not-allowed' :
                          paketMandiri === pk.key ? 'border-[#1A4FA0] bg-[#E8F0FB] cursor-pointer' : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                        }`}>
                        <div className="text-sm font-semibold text-[#0E2F6E]">{pk.label}</div>
                        <div className="text-sm font-bold text-[#0E2F6E]">{tersedia ? `Rp ${harga.toLocaleString('id-ID')}` : 'Belum tersedia'}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="font-bold text-[#0E2F6E] text-sm pt-1">Pilih Tipe Kamar</div>
                <div className="grid grid-cols-3 gap-2">
                  {kamarOpsi.map(k => (
                    <div key={k} onClick={() => setKamarMandiri(k)}
                      className={`text-center text-xs font-semibold rounded-lg p-2 border-2 cursor-pointer ${
                        kamarMandiri === k ? 'border-[#1A4FA0] bg-[#E8F0FB] text-[#1A4FA0]' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {k}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-xl p-4 space-y-3">
                <div className="font-bold text-[#0E2F6E] text-sm">Data Diri</div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Nama Lengkap *</label>
                  <input value={namaMandiri} onChange={e => setNamaMandiri(e.target.value)} disabled={namaMandiriTerkunci}
                    className={`w-full px-3 py-2 rounded-lg border-2 text-sm ${namaMandiriTerkunci
                      ? 'border-gray-100 bg-gray-50 text-gray-500 cursor-not-allowed'
                      : 'border-gray-200 focus:border-[#1A4FA0] focus:outline-none'}`} />
                  {namaMandiriTerkunci && (
                    <div className="text-[10px] text-gray-400 mt-1">Program Eksklusif Sahabat Baitullah cuma bisa didaftarkan untuk diri sendiri.</div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">No. WhatsApp *</label>
                  <input value={waMandiri} onChange={e => setWaMandiri(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Jenis Kelamin *</label>
                  <select value={jkMandiri} onChange={e => setJkMandiri(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                    <option value="">-- Pilih --</option>
                    <option value="Laki-Laki">Laki-Laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Alamat Pengiriman Perlengkapan Umroh *</label>
                  <textarea value={alamatMandiri} onChange={e => setAlamatMandiri(e.target.value)} rows={2}
                    placeholder="Alamat lengkap untuk pengiriman koper, seragam, dan perlengkapan umroh lainnya"
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
                </div>
              </div>

              <button
                onClick={() => {
                  if (hargaMandiri <= 0) { alert('Kombinasi paket & kamar ini belum tersedia harganya. Pilih kombinasi lain.'); return; }
                  if (!namaMandiri || !waMandiri || !jkMandiri || !alamatMandiri) { alert('Lengkapi data diri terlebih dahulu!'); return; }
                  setStep(2);
                }}
                className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors">
                Lanjut ke Pembayaran →
              </button>
            </div>
          )}

          {/* STEP 2 — Ringkasan pembayaran: saldo dulu, sisa transfer pribadi */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-[#E8F0FB] rounded-xl p-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0] mb-3">📋 Ringkasan Pembayaran</div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Program</span><span className="font-semibold text-[#0E2F6E]">{prog.name}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span className="capitalize">{paketMandiri} · {kamarMandiri}</span>
                  <span className="font-semibold text-[#0E2F6E]">Rp {hargaMandiri.toLocaleString('id-ID')}</span>
                </div>
                {voucherMandiri && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Voucher {voucherMandiri.kode}</span><span>−Rp {voucherDiskonMandiri.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                  <span className="text-gray-500">Total Harga</span><span className="font-bold text-[#0E2F6E]">Rp {totalMandiri.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-sm text-purple-600">
                  <span>Saldo Tabungan Tersedia</span><span className="font-semibold">Rp {saldoTersediaMandiri.toLocaleString('id-ID')}</span>
                </div>
                <div className="border-t border-blue-200 pt-2 flex justify-between font-bold">
                  <span className="text-sm">Dipakai dari Saldo (Pelunasan Penuh)</span>
                  <span className="text-purple-700">−Rp {saldoDipakaiMandiri.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {saldoCukupMandiri ? (
                <>
                  <div className="bg-[#FEF3DC] border border-[#C9952A] rounded-xl p-4 text-sm text-[#8a6516]">
                    ℹ️ Tidak ada tahap DP di jalur ini — booking langsung dianggap lunas penuh begitu pemakaian saldo di-ACC admin.
                  </div>
                  <div className="bg-white border-2 border-[#1A4FA0] rounded-xl p-4 space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0]">🏦 Tabungan Umroh Anda Akan Dibayarkan Ke</div>
                    {metodePembayaran.map(m => (
                      <div key={m.id} className="text-sm text-gray-500 border-t border-gray-100 pt-2 first:border-0 first:pt-0">
                        <div className="font-bold text-[#0E2F6E]">{m.nama}</div>
                        {m.nomor && <div className="flex justify-between"><span>No. Rekening</span><span className="font-bold text-[#0E2F6E]">{m.nomor}</span></div>}
                        {m.atas_nama && <div className="flex justify-between"><span>Atas Nama</span><span className="font-bold text-[#0E2F6E]">{m.atas_nama}</span></div>}
                      </div>
                    ))}
                    <div className="text-xs text-gray-400 pt-1">Untuk pelunasan Program Umroh ini — Anda tidak perlu transfer apa pun, admin yang memprosesnya begitu pemakaian saldo dikonfirmasi.</div>
                  </div>
                </>
              ) : (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-2">
                  <div className="font-bold text-red-700 text-sm">⚠️ Saldo Tabungan Umroh Belum Cukup</div>
                  <div className="text-xs text-red-600">Kurang <b>Rp {kuranganMandiri.toLocaleString('id-ID')}</b> lagi dari total harga.</div>
                  <div className="text-xs text-gray-500 pt-1">
                    Pembayaran program ini SELALU dipotong dari saldo tabungan umroh Anda — tidak ada jalur transfer terpisah. Setor kekurangannya ke rekening tabungan umroh Anda sendiri:
                  </div>
                  {noRekeningUmrohMandiri && (
                    <div className="bg-white rounded-lg p-2.5 text-sm font-bold text-[#0E2F6E] text-center">{noRekeningUmrohMandiri}</div>
                  )}
                  <div className="text-xs text-gray-500">Sudah transfer? Unggah bukti transfernya di <button onClick={() => router.push('/dashboard/sahabat/riwayat?section=pending')} className="text-[#1A4FA0] font-bold underline">Riwayat Tabungan Umroh</button> biar admin bisa langsung verifikasi & menambah saldo Anda — kembali ke sini untuk melanjutkan checkout setelah saldo cukup.</div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(1)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full transition-colors">
                  ← Kembali
                </button>
                <button onClick={submitMandiri} disabled={loading || !saldoCukupMandiri}
                  className="flex-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 px-8 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? 'Memproses...' : saldoCukupMandiri ? 'Selesaikan Pendaftaran' : 'Saldo Belum Cukup'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Selesai */}
          {step === 3 && (
            <div className="text-center space-y-4 py-8">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-[#0E2F6E]">Pendaftaran Terkirim!</h2>
              <p className="text-gray-400 text-sm">Admin akan verifikasi pemakaian saldo dalam 1×24 jam kerja.</p>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-left space-y-1">
                <div className="text-sm text-green-600">Program: {prog.name}</div>
                <div className="font-bold text-green-800">Booking: {hasilMandiri?.booking_id}</div>
                <div className="text-sm text-green-700 pt-1">Dipakai dari saldo: Rp {Number(hasilMandiri?.saldo_dipakai || 0).toLocaleString('id-ID')}</div>
                <span className="inline-block bg-[#FEF3DC] text-[#7a5500] text-xs font-bold px-3 py-1 rounded-full mt-1">⏳ Menunggu Konfirmasi Admin</span>
              </div>
              {/* Status booking (progress DP/pelunasan, dokumen, dst) belum
                  pernah kelihatan di mana pun buat akun Sahabat Baitullah
                  (dikonfirmasi gap dari pertanyaan user 2026-09-29) —
                  /dashboard/jamaah sebenarnya generik by user_id (fetch
                  /api/bookings?user_id=), gak digate role, jadi tinggal
                  diarahkan kesini, gak perlu bikin halaman status baru. */}
              <button onClick={() => router.push('/dashboard/jamaah')}
                className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors">
                Lihat Status Booking →
              </button>
              <button onClick={() => router.push('/dashboard/sahabat')}
                className="w-full text-[#1A4FA0] font-semibold text-sm py-1">
                Ke Beranda Sahabat Baitullah →
              </button>
            </div>
          )}

        </div>
      </Layout>
    );
  }

  return (
    <Layout title="🛒 Checkout" backHref="/programs" confirmLeave={isDirty}
      confirmMessage="Yakin ingin keluar? Data booking yang sedang diisi akan hilang.">
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
        {step === 1 && (
          <div className="space-y-4">
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
            <div className="flex flex-wrap gap-2">
              {['✈️ Tiket PP', '🛂 Visa', '🚌 Transport', '🧳 Bagasi 2x23kg', '💧 Zamzam 5L', '🍗 Al Baik'].map(f => (
                <span key={f} className="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">{f}</span>
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

            {/* SUMBER INFORMASI — wajib, menentukan penerima komisi.
                Perwakilan yang checkout untuk diri sendiri di-skip:
                closing otomatis tercatat ke akun mereka sendiri. Jamaah
                dengan referral permanen (dikunci sejak registrasi) juga
                di-skip dari dropdown — gak ada gunanya nanya lagi kalau
                jawabannya udah gak bisa diubah. */}
            {user?.role === 'perwakilan' ? (
              <div className="rounded-xl p-4 text-sm border-2 bg-purple-50 text-purple-700 border-[#C9952A]">
                {`🏢 Checkout sebagai Perwakilan — closing otomatis tercatat ke akun Anda (${user.name}, ${user.kode_unik})`}
              </div>
            ) : permanentReferrer ? (
              <div className="rounded-xl p-4 text-sm border-2 bg-amber-50 text-amber-700 border-amber-300">
                {`📌 Referral Anda terkunci ke ${permanentReferrer.name} (${permanentReferrer.kode_unik}) sejak pendaftaran akun — tidak bisa diubah.`}
              </div>
            ) : (
            <div className="bg-white border-2 border-[#C9952A] rounded-xl p-4 space-y-3">
              <div>
                <div className="font-bold text-[#0E2F6E] text-sm">📣 Dari mana Anda mengetahui JM Travel?</div>
                <div className="text-xs text-gray-400 mt-0.5">Wajib diisi. Menentukan pencatatan referensi pendaftaran Anda.</div>
              </div>

              <select value={sumber}
                onChange={e => {
                  setSumber(e.target.value);
                  // Akun Sahabat yang pilih "Jamaah Sahabat Baitullah" otomatis
                  // pakai kode miliknya sendiri (kolom kode dikunci di bawah).
                  setReferralKode(user?.role === 'sahabat_baitullah' && e.target.value === 'sahabat_baitullah' ? (user.kode_unik || '') : '');
                }}
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                <option value="">-- Pilih --</option>
                <option value="perwakilan">Perwakilan JM Travel</option>
                <option value="sahabat_baitullah">Jamaah Sahabat Baitullah</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="teman">Rekomendasi Teman / Keluarga</option>
                <option value="website">Website JM Travel</option>
                <option value="langsung_kantor">Langsung ke Kantor</option>
                <option value="lainnya">Lainnya</option>
              </select>

              {sumber === 'perwakilan' && (
                <div>
                  <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Pilih Nama Perwakilan *</label>
                  <SearchableSelect
                    value={referralKode}
                    onChange={setReferralKode}
                    placeholder="Ketik buat cari nama perwakilan..."
                    options={perwList.map(p => ({ value: p.kode_unik, label: `${p.name}${p.wilayah ? ` — ${p.wilayah}` : ''} (${p.kode_unik})` }))}
                  />
                  {perwList.length === 0 && (
                    <div className="text-[10px] text-red-500 mt-1">
                      Belum ada perwakilan aktif. Hubungi admin JM Travel.
                    </div>
                  )}
                </div>
              )}

              {sumber === 'sahabat_baitullah' && user?.role === 'sahabat_baitullah' && (
                // Dropdown sumber tetap bebas dipilih; yang dikunci cuma kode
                // referral-nya — akun Sahabat gak bisa atas-namakan anggota lain.
                <div>
                  <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Kode Referral Sahabat Baitullah</label>
                  <input value={`${user.kode_unik || ''} — ${user.name}`} readOnly disabled
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 bg-gray-50 text-gray-500 text-sm cursor-not-allowed" />
                  <div className="text-[10px] text-gray-400 mt-1">🔒 Terkunci ke akun Anda sendiri.</div>
                </div>
              )}

              {sumber === 'sahabat_baitullah' && user?.role !== 'sahabat_baitullah' && (
                <div>
                  <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Kode Referral Sahabat Baitullah *</label>
                  <input
                    value={referralKode}
                    onChange={e => setReferralKode(e.target.value.toUpperCase())}
                    placeholder="Contoh: SBJM0002 atau 6X8AEVY"
                    className={`w-full px-3 py-2 rounded-lg border-2 focus:outline-none text-sm ${cekSahabatStatus === 'invalid' ? 'border-red-300' : 'border-gray-200 focus:border-[#1A4FA0]'}`}
                  />
                  {cekSahabatStatus === 'cek' && <div className="text-[10px] text-gray-400 mt-1">Mengecek kode...</div>}
                  {cekSahabatStatus === 'invalid' && <div className="text-[10px] text-red-500 mt-1">Kode tidak ditemukan. Tanyakan kode referral ke anggota Sahabat Baitullah yang mengajak Anda.</div>}
                  {sahabatTerverifikasi && <div className="text-[10px] text-green-600 mt-1">✓ {sahabatTerverifikasi.nama} ({sahabatTerverifikasi.kode_unik})</div>}
                </div>
              )}

              {((sumber === 'perwakilan' && referralKode) || (sumber === 'sahabat_baitullah' && (sahabatTerverifikasi || user?.role === 'sahabat_baitullah'))) && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-700">
                  ✅ Pendaftaran akan tercatat atas nama {sumber} yang dipilih.
                </div>
              )}
            </div>
            )}

            <button
              onClick={() => {
                if (user?.role === 'perwakilan' || permanentReferrer) { setStep(2); return; }
                if (!sumber) { alert('Pilih dari mana Anda mengetahui JM Travel!'); return; }
                if (sumber === 'perwakilan' && !referralKode) {
                  alert('Pilih nama perwakilan terlebih dahulu!'); return;
                }
                if (sumber === 'sahabat_baitullah' && user?.role !== 'sahabat_baitullah' && !sahabatTerverifikasi) {
                  alert('Masukkan kode referral Sahabat Baitullah yang valid!'); return;
                }
                setStep(2);
              }}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors">
              Lanjutkan Daftar →
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
              referralPerwId={user.role === 'perwakilan' ? user.id
                : permanentReferrer ? permanentReferrer.id
                : sumber === 'perwakilan' ? (perwList.find(p => p.kode_unik === referralKode)?.id || null) : null}
              // Banner "Chat Admin" TETAP tampil apapun kondisinya (dikonfirmasi
              // user 2026-08-20) — walau kartu "🎨 Custom Hotel" udah nawarin
              // pilih Bintang Mekkah/Madinah langsung in-app, masih ada
              // kemungkinan kombinasi yang jamaah cari gak ke-cover (mis. mau
              // hotel spesifik di luar 3 bintang yang ada), jadi opsi manual
              // chat admin gak boleh dihilangkan. Cuma teksnya nyesuain
              // tergantung custom_hotel_tersedia biar gak keliru dikira
              // satu-satunya cara.
              extra={
                (user.role === 'admin' || user.role === 'super_admin') ? (() => {
                  // Dulu cuma ada di /order-jamaah (sekarang dilebur ke sini,
                  // dikonfirmasi user 2026-09-27) — closing Direct/Kantor
                  // sering pakai harga negosiasi, bukan harga normal program.
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
                })() : (
                  <div className="bg-gradient-to-r from-[#C9952A] to-yellow-500 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white text-sm">✨ Ingin Paket Custom?</div>
                        <div className="text-xs text-white/85 mt-0.5">
                          {prog?.custom_hotel_tersedia
                            ? 'Gak nemu kombinasi yang cocok di atas? Konsultasi langsung'
                            : 'Kombinasi hotel berbeda Mekkah & Madinah'}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const msg = `Halo JM Travel, saya ingin konsultasi paket custom untuk program *${prog?.name}*. Mohon bantuannya 🙏`;
                          window.open(waLink(pengaturan.wa_kantor, msg) || '#', '_blank');
                        }}
                        className="bg-white text-[#C9952A] font-bold text-xs px-4 py-2 rounded-full hover:bg-yellow-50 transition-colors whitespace-nowrap">
                        Chat Admin →
                      </button>
                    </div>
                  </div>
                )
              }
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
            {/* Notice DP non-refundable (dikonfirmasi user 2026-09-27) — cuma
                di flow checkout normal (ada DP), BUKAN di checkout mandiri
                Sahabat Baitullah (dibayar dari saldo tabungan, gak ada DP). */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 text-center">
              ⚠️ DP tidak dapat dikembalikan, namun dapat dialihkan ke program lain.
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
              <button onClick={submitBooking} disabled={!buktiPath || loading}
                className="flex-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 px-8 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Memproses...' : 'Kirim Bukti Transfer'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div className="text-center space-y-4 py-8">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-[#0E2F6E]">Bukti Transfer Terkirim!</h2>
            <p className="text-gray-400 text-sm">Admin akan verifikasi dalam 1×24 jam kerja.</p>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-left space-y-1">
              <div className="text-sm text-green-600">Program: {prog.name}</div>
              {bookingIds.map(id => (
                <div key={id} className="font-bold text-green-800">Booking: {id}</div>
              ))}
              <span className="inline-block bg-[#FEF3DC] text-[#7a5500] text-xs font-bold px-3 py-1 rounded-full mt-1">⏳ Menunggu Konfirmasi Admin</span>
            </div>
            <div className="bg-[#E8F0FB] rounded-xl p-4 text-left text-sm text-[#0E2F6E] space-y-1">
              <div>① Admin verifikasi bukti (maks 1×24 jam)</div>
              <div>② Notif WA saat DP dikonfirmasi</div>
              <div>③ Formulir jamaah terbuka untuk diisi</div>
              <div>④ Lanjutkan pelunasan setelah formulir selesai</div>
            </div>
            <button onClick={() => {
                // Bug ditemukan & diperbaiki 2026-09-27 — dulu hardcode ke
                // /dashboard/jamaah buat semua role, baru kerasa begitu
                // perwakilan/sahabat/admin ikut lewat checkout (dilebur dari
                // /order-jamaah). Key HARUS 'sahabat_baitullah' (bukan
                // 'sahabat') — itu nilai role yang beneran dipakai di sistem.
                const tujuan = { admin: '/admin', super_admin: '/admin', perwakilan: '/dashboard/perwakilan', sahabat_baitullah: '/dashboard/sahabat' };
                router.push(tujuan[user.role] || '/dashboard/jamaah');
              }}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors">
              Ke Dashboard →
            </button>
          </div>
        )}

      </div>
    </Layout>
  );
}