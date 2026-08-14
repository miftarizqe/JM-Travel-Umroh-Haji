'use client';
import { useEffect, useState } from 'react';
import { useOpsiTambahan } from '@/lib/useOpsiTambahan';
import WaitlistCTA from '@/app/components/WaitlistCTA';

const kamarKeyOf = (kamar) => kamar?.includes('Quad') ? 'quad' : kamar?.includes('Double') ? 'double' : 'triple';

function hargaProgram(prog, item) {
  if (item.hargaCustom && Number(item.hargaCustom) > 0) return Number(item.hargaCustom);
  const kamarKey = kamarKeyOf(item.kamar);
  return prog?.[`harga_${item.paket}_${kamarKey}`] || prog?.[`harga_${item.paket}`] || 0;
}

// Opsi tambahan harganya per jamaah (dikali jumlah item), ditambahkan ke
// harga program — bukan biaya terpisah, biar semua total (DP, sisa
// pelunasan, dst) otomatis ikut hitungannya tanpa perlu logic tambahan.
function hargaOpsiTambahan(item) {
  return (item.opsiTambahan || []).reduce((s, o) => s + Number(o.harga || 0), 0);
}

function hargaItem(prog, item) {
  return hargaProgram(prog, item) + hargaOpsiTambahan(item);
}

const PAKET_LIST = [
  { key: 'deluxe', label: '⭐⭐⭐ Deluxe', hotel: 'Ramada Al Fayzeen' },
  { key: 'eksekutif', label: '⭐⭐⭐⭐ Eksekutif', hotel: 'Maysan Al Mashaer' },
  { key: 'signature', label: '⭐⭐⭐⭐⭐ Signature', hotel: 'Ghufron Al Shofwa' },
];
const KAMAR_LIST = ['Quad (4/Kamar)', 'Triple (3/Kamar)', 'Double (2/Kamar)'];

// Jaga panjang array nama tetap = jumlah jamaah, tanpa buang nama yang
// sudah diketik kalau jumlahnya cuma naik/turun sedikit.
function resizeNamas(namas, n) {
  const arr = [...(namas || [])];
  while (arr.length < n) arr.push('');
  while (arr.length > n) arr.pop();
  return arr;
}

// Step "Pilih Paket" dipakai bareng di checkout & order-jamaah — tiap item
// (kombinasi paket+kamar+jumlah bebas) ditambahkan ke keranjang satu-satu,
// mirip nambah item menu di Gojek: konfigurasi dulu, "+ Tambahkan ke Pesanan",
// bisa ulang lagi buat kombinasi lain sebelum lanjut bayar.
//
// `onSummaryChange` dipanggil tiap kali angka ringkasan (termasuk voucher)
// berubah, supaya halaman pemanggil bisa nyimpen angka2 itu buat ditampilkan
// lagi di step Invoice DP (komponen ini sendiri unmount begitu pindah step).
// Program Hotel Mix (custom, 1 harga rata) bikin SEMUA 9 kombinasi
// paket×kamar kebetulan sama persis (lihat KalkulatorTerpadu.jsx) — kalau
// gitu, nampilin "Pilih Akomodasi"/"Tipe Kamar" ke jamaah cuma bikin
// keliatan ada pilihan padahal harganya gak pernah beda apapun yang
// dipencet. Dicek di sini (bukan nyimpen flag "hotel_mode" baru di tabel
// programs) — otomatis nyala/mati sendiri ngikutin data harga yang beneran
// kesimpen, gak perlu field tambahan.
function semuaHargaSamaCek(prog) {
  if (!prog) return false;
  const nilai = [];
  for (const pk of ['deluxe', 'eksekutif', 'signature']) {
    for (const km of ['quad', 'triple', 'double']) {
      nilai.push(Number(prog[`harga_${pk}_${km}`]) || 0);
    }
  }
  return nilai[0] > 0 && nilai.every(n => n === nilai[0]);
}

// Slot 0 — TIDAK ada mekanisme auto-release seat di sistem ini (booking
// pending yang gak dibayar TETAP ngunci seat sampai admin approve
// pembatalan manual), jadi jangan biarin orang tetep bisa "checkout"
// (nambah ke keranjang cuma buat mentok pas submit). Diganti tombol
// "Infokan Jika Ada Slot Kosong" (komponen WaitlistCTA, dipakai bareng
// /program/[id]) — nyatet minat ke program_waitlist, dikabarin via
// notifikasi in-app begitu admin approve pembatalan & seat-nya beneran
// kebuka (lihat api/pembatalan PATCH).

export default function CartPaketKamar({ prog, cart, onAdd, onRemove, current, onChangeCurrent, extra, onSummaryChange, referralPerwId }) {
  const [opsiTambahanList] = useOpsiTambahan(prog?.id);
  const kamarKey = kamarKeyOf(current.kamar);
  // current.paket/kamar tetap kepakai apa adanya (default dari halaman
  // pemanggil) buat nyimpen booking — kombinasi manapun hasilnya sama aja
  // pas harganya emang seragam, jadi gak perlu diubah, cuma UI pemilihnya
  // yang disembunyiin.
  const semuaHargaSama = semuaHargaSamaCek(prog);
  const hargaSeragam = semuaHargaSama ? Number(prog[`harga_${current.paket}_${kamarKey}`]) || 0 : 0;
  const sisaSeat = (prog?.total_seat || 0) - (prog?.used_seat || 0) - cart.reduce((s, c) => s + c.jumlah, 0);
  const maxJumlah = Math.max(1, sisaSeat);

  const totalDpCart = cart.reduce((s, c) => s + (prog?.dp || 0) * c.jumlah, 0);
  const totalHargaCart = cart.reduce((s, c) => s + hargaItem(prog, c) * c.jumlah, 0);

  const [voucherInput, setVoucherInput] = useState('');
  const [voucherChecking, setVoucherChecking] = useState(false);
  const [voucherError, setVoucherError] = useState(null);
  // { kode, total, cartSnapshot } — cartSnapshot dipakai deteksi keranjang
  // berubah SETELAH voucher di-apply, supaya nggak ada angka basi ke-tampilkan.
  const [voucherApplied, setVoucherApplied] = useState(null);

  const cartSnapshot = JSON.stringify(cart.map(c => ({ paket: c.paket, jumlah: c.jumlah })));
  const voucherStale = voucherApplied && voucherApplied.cartSnapshot !== cartSnapshot;
  const voucherDiskonTotal = (voucherApplied && !voucherStale) ? voucherApplied.total : 0;
  const totalHargaSetelahDiskon = Math.max(0, totalHargaCart - voucherDiskonTotal);
  const sisaPelunasan = Math.max(0, totalHargaSetelahDiskon - totalDpCart);

  useEffect(() => {
    onSummaryChange?.({
      totalHarga: totalHargaCart,
      totalDp: totalDpCart,
      voucherKode: (voucherApplied && !voucherStale) ? voucherApplied.kode : null,
      voucherDiskon: voucherDiskonTotal,
      totalHargaSetelahDiskon,
      sisaPelunasan,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalHargaCart, totalDpCart, voucherDiskonTotal, totalHargaSetelahDiskon, sisaPelunasan]);

  async function terapkanVoucher() {
    if (!voucherInput.trim() || cart.length === 0) return;
    setVoucherChecking(true);
    setVoucherError(null);
    try {
      const res = await fetch('/api/vouchers/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kode: voucherInput, prog_id: prog.id,
          items: cart.map(c => ({ paket: c.paket, kamar: c.kamar, jumlah_jamaah: c.jumlah })),
          referral_perw_id: referralPerwId || null,
        }),
      });
      const d = await res.json();
      if (!d.valid) {
        setVoucherError(d.error || 'Voucher tidak valid');
        setVoucherApplied(null);
      } else {
        setVoucherApplied({ kode: d.kode, total: d.potongan_total, cartSnapshot });
      }
    } catch {
      setVoucherError('Terjadi kesalahan saat cek voucher');
      setVoucherApplied(null);
    }
    setVoucherChecking(false);
  }

  function tambahkan() {
    if (current.jumlah < 1) return;
    const namas = resizeNamas(current.namas, current.jumlah).map(n => n.trim());
    if (namas.some(n => !n)) { alert('Isi nama lengkap semua jamaah dulu!'); return; }
    const jks = resizeNamas(current.jks, current.jumlah);
    if (jks.some(j => j !== 'Laki-Laki' && j !== 'Perempuan')) { alert('Pilih jenis kelamin semua jamaah dulu!'); return; }
    const was = resizeNamas(current.was, current.jumlah).map(w => w.trim());
    onAdd({ ...current, namas, was, jks });
    onChangeCurrent({ paket: current.paket, kamar: current.kamar, jumlah: 1, hargaCustom: '', namas: [''], was: [''], jks: [''], opsiTambahan: [] });
  }

  function toggleOpsiTambahan(opsi) {
    const sudahDipilih = (current.opsiTambahan || []).some(o => o.id === opsi.id);
    const opsiTambahan = sudahDipilih
      ? current.opsiTambahan.filter(o => o.id !== opsi.id)
      : [...(current.opsiTambahan || []), opsi];
    onChangeCurrent({ ...current, opsiTambahan });
  }

  function hapusVoucher() {
    if (!confirm('Apakah Anda yakin ingin menghapus voucher ini? Harga akan kembali ke harga normal.')) return;
    setVoucherApplied(null);
    setVoucherInput('');
    setVoucherError(null);
  }

  return (
    <div className="space-y-5">
      {sisaSeat <= 0 ? <WaitlistCTA progId={prog?.id} /> : (
      <>
      {/* Harga seragam (mis. paket Hotel Mix/custom) — gak ada bedanya
          apapun akomodasi/tipe kamar yang dipilih, jadi selector-nya
          disembunyiin (cuma bikin bingung, keliatan ada pilihan padahal
          gak ngaruh apa2 ke harga) — cukup 1 baris info harga polos. */}
      {semuaHargaSama ? (
        <div className="bg-[#E8F0FB] rounded-xl p-4 flex items-center justify-between">
          <div className="font-bold text-[#0E2F6E]">Harga Paket</div>
          <div className="font-black text-[#0E2F6E] text-lg">Rp {(hargaSeragam / 1000000).toFixed(1)} jt</div>
        </div>
      ) : (
        <>
          {/* Pilih Akomodasi */}
          <div>
            <div className="font-bold text-[#0E2F6E] mb-3">Pilih Akomodasi</div>
            <div className="space-y-3">
              {PAKET_LIST.map(pk => {
                const harga = prog?.[`harga_${pk.key}_${kamarKey}`] || prog?.[`harga_${pk.key}`] || 0;
                return (
                  <div key={pk.key} onClick={() => onChangeCurrent({ ...current, paket: pk.key })}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      current.paket === pk.key ? 'border-[#1A4FA0] bg-[#E8F0FB]' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <div>
                      <div className="font-bold text-[#0E2F6E]">{pk.label}</div>
                      <div className="text-xs text-gray-400">{pk.hotel}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-[#0E2F6E]">Rp {(harga / 1000000).toFixed(1)} jt</div>
                      {current.paket === pk.key && <div className="text-xs text-[#1A4FA0] font-semibold">✓ Dipilih</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tipe Kamar */}
          <div>
            <div className="font-bold text-[#0E2F6E] mb-3">Tipe Kamar</div>
            <div className="flex gap-3 flex-wrap">
              {KAMAR_LIST.map(k => (
                <div key={k} onClick={() => onChangeCurrent({ ...current, kamar: k })}
                  className={`px-4 py-2 rounded-full border-2 text-sm font-semibold cursor-pointer transition-all ${
                    current.kamar === k ? 'border-[#1A4FA0] bg-[#E8F0FB] text-[#1A4FA0]' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {k}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Jumlah Jamaah */}
      <div>
        <div className="font-bold text-[#0E2F6E] mb-3">Jumlah Jamaah</div>
        <div className="flex items-center gap-4">
          <button onClick={() => {
              const jumlah = Math.max(1, current.jumlah - 1);
              onChangeCurrent({ ...current, jumlah, namas: resizeNamas(current.namas, jumlah), was: resizeNamas(current.was, jumlah), jks: resizeNamas(current.jks, jumlah) });
            }}
            className="w-10 h-10 rounded-full border-2 border-[#1A4FA0] text-[#1A4FA0] text-xl font-bold hover:bg-[#E8F0FB] transition-colors">−</button>
          <span className="text-2xl font-black text-[#0E2F6E] w-8 text-center">{current.jumlah}</span>
          <button onClick={() => {
              const jumlah = Math.min(maxJumlah, current.jumlah + 1);
              onChangeCurrent({ ...current, jumlah, namas: resizeNamas(current.namas, jumlah), was: resizeNamas(current.was, jumlah), jks: resizeNamas(current.jks, jumlah) });
            }}
            className="w-10 h-10 rounded-full border-2 border-[#1A4FA0] text-[#1A4FA0] text-xl font-bold hover:bg-[#E8F0FB] transition-colors">+</button>
          <span className="text-xs text-gray-400">Sisa seat: {Math.max(0, sisaSeat)}</span>
        </div>
      </div>

      {/* Nama jamaah — wajib per orang, langsung sesuai jumlah di atas.
          Nama ini nanti otomatis ngisi field "Nama" di formulir jamaah
          (tinggal lengkapi sisa field lainnya), bukan cuma label kartu.
          No. WA opsional tapi PENTING buat jamaah yang gak bikin akun sendiri
          (dipesankan admin/perwakilan) — tanpa ini admin gak punya cara kirim info
          status (DP dikonfirmasi, dst) ke jamaah tsb sama sekali. */}
      <div>
        <div className="font-bold text-[#0E2F6E] mb-3">Data Jamaah</div>
        <div className="space-y-3">
          {Array.from({ length: current.jumlah }).map((_, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={current.namas?.[i] || ''}
                onChange={e => {
                  const namas = resizeNamas(current.namas, current.jumlah);
                  namas[i] = e.target.value;
                  onChangeCurrent({ ...current, namas });
                }}
                placeholder={`Nama lengkap jamaah #${i + 1} sesuai KTP/Paspor`}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
              <select
                value={current.jks?.[i] || ''}
                onChange={e => {
                  const jks = resizeNamas(current.jks, current.jumlah);
                  jks[i] = e.target.value;
                  onChangeCurrent({ ...current, jks });
                }}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm text-gray-700">
                <option value="">Jenis kelamin jamaah #{i + 1}</option>
                <option value="Laki-Laki">Laki-Laki</option>
                <option value="Perempuan">Perempuan</option>
              </select>
              <input
                value={current.was?.[i] || ''}
                onChange={e => {
                  const was = resizeNamas(current.was, current.jumlah);
                  was[i] = e.target.value;
                  onChangeCurrent({ ...current, was });
                }}
                placeholder={`No. WhatsApp jamaah #${i + 1} (opsional)`}
                inputMode="numeric"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
          Wajib nama lengkap & jenis kelamin — dipakai buat rencanakan kamar (non-mahram gak sekamar) sejak awal & otomatis mengisi formulir jamaah nanti. No. WA opsional, tapi isi kalau jamaah tidak bikin akun sendiri — dipakai admin buat kirim info status via WhatsApp.
        </div>
      </div>

      {/* Opsi Tambahan — opsional, harga per jamaah (dikali jumlah di atas),
          otomatis nambah ke total harga item ini & tersimpan ke booking. */}
      {opsiTambahanList.length > 0 && (
        <div>
          <div className="font-bold text-[#0E2F6E] mb-3">Opsi Tambahan (opsional)</div>
          <div className="space-y-2">
            {opsiTambahanList.map(o => {
              const dipilih = (current.opsiTambahan || []).some(x => x.id === o.id);
              return (
                <label key={o.id} onClick={() => toggleOpsiTambahan(o)}
                  className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    dipilih ? 'border-[#1A4FA0] bg-[#E8F0FB]' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={dipilih} readOnly className="w-4 h-4 accent-[#1A4FA0]" />
                    <div>
                      <div className="text-sm font-semibold text-gray-700">{o.nama}</div>
                      {o.deskripsi && <div className="text-xs text-gray-400">{o.deskripsi}</div>}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-[#0E2F6E] whitespace-nowrap">+Rp {Number(o.harga).toLocaleString('id-ID')}/jamaah</div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {extra}

      <button onClick={tambahkan} disabled={sisaSeat < 1}
        className="w-full border-2 border-dashed border-[#1A4FA0] text-[#1A4FA0] font-bold py-3 rounded-full hover:bg-[#E8F0FB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        + Tambahkan ke Pesanan
      </button>
      </>
      )}

      {/* Daftar item di keranjang — TETAP kelihatan walau seat abis, siapa
          tau udah ada item ke-add dari sebelum kehabisan. */}
      {cart.length > 0 && (
        <div>
          <div className="font-bold text-[#0E2F6E] mb-2">🛒 Pesanan Anda ({cart.length})</div>
          <div className="space-y-2">
            {cart.map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-white border border-[#e0e8f0] rounded-xl p-3">
                <div>
                  <div className="font-semibold text-[#0E2F6E] text-sm capitalize">{c.paket} · {c.kamar}</div>
                  <div className="text-xs text-gray-400">{c.jumlah} jamaah · Rp {(hargaItem(prog, c) * c.jumlah).toLocaleString('id-ID')}</div>
                  {c.opsiTambahan?.length > 0 && (
                    <div className="text-xs text-[#1A4FA0] mt-0.5">🧳 {c.opsiTambahan.map(o => o.nama).join(', ')}</div>
                  )}
                  {c.namas?.length > 0 && (
                    <div className="text-xs text-[#C9952A] font-semibold mt-0.5">📛 {c.namas.join(', ')}</div>
                  )}
                </div>
                <button onClick={() => onRemove(i)} className="text-red-400 hover:text-red-600 text-sm font-bold px-2">🗑️</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Voucher */}
      {cart.length > 0 && (
        <div>
          <div className="font-bold text-[#0E2F6E] mb-2">🎟️ Kode Voucher (opsional)</div>
          {voucherApplied && !voucherStale ? (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
              <div className="text-xs text-green-700">✅ Voucher <strong>{voucherApplied.kode}</strong> diterapkan — hemat Rp {voucherApplied.total.toLocaleString('id-ID')}</div>
              <button onClick={hapusVoucher} className="text-xs text-red-500 hover:text-red-700 font-bold underline whitespace-nowrap ml-2">Hapus</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={voucherInput} onChange={e => setVoucherInput(e.target.value.toUpperCase())}
                placeholder="Masukkan kode voucher"
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm uppercase"/>
              <button onClick={terapkanVoucher} disabled={voucherChecking || !voucherInput.trim()}
                className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 rounded-xl transition-colors disabled:opacity-50">
                {voucherChecking ? '...' : 'Terapkan'}
              </button>
            </div>
          )}
          {voucherError && <div className="text-xs text-red-500 mt-1.5">⚠️ {voucherError}</div>}
          {voucherStale && (
            <div className="text-xs text-yellow-600 mt-1.5">⚠️ Keranjang berubah, klik Terapkan lagi untuk update voucher.</div>
          )}
        </div>
      )}

      {/* Ringkasan */}
      {cart.length > 0 && (
        <div className="bg-[#E8F0FB] rounded-xl p-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0] mb-3">📋 Ringkasan</div>
          {cart.map((c, i) => (
            <div key={i} className="flex justify-between text-sm text-gray-500">
              <span className="capitalize">{c.paket} · {c.kamar} × {c.jumlah}</span>
              <span className="font-semibold text-[#0E2F6E]">Rp {(hargaItem(prog, c) * c.jumlah).toLocaleString('id-ID')}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm text-gray-500 pt-1 border-t border-blue-200">
            <span>Total Harga</span><span className="font-semibold text-[#0E2F6E]">Rp {totalHargaCart.toLocaleString('id-ID')}</span>
          </div>
          {voucherDiskonTotal > 0 && (
            <>
              <div className="flex justify-between text-sm text-green-600">
                <span>
                  Diskon Voucher ({voucherApplied.kode})
                  <button onClick={hapusVoucher} className="text-red-500 hover:text-red-700 text-xs font-bold underline ml-2">Hapus</button>
                </span>
                <span className="font-semibold">−Rp {voucherDiskonTotal.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Total Harga Setelah Diskon</span><span className="font-semibold text-[#0E2F6E]">Rp {totalHargaSetelahDiskon.toLocaleString('id-ID')}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-sm text-gray-500">
            <span>DP per jamaah</span><span className="font-semibold text-[#0E2F6E]">Rp {(prog?.dp || 0).toLocaleString('id-ID')}</span>
          </div>
          <div className="border-t border-blue-200 pt-2 flex justify-between font-bold">
            <span className="text-sm">Total yang harus dibayarkan (DP)</span>
            <span className="text-[#dc2626]">Rp {totalDpCart.toLocaleString('id-ID')}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400 pt-1">
            <span>Sisa pelunasan (dibayar nanti)</span><span className="font-semibold">Rp {sisaPelunasan.toLocaleString('id-ID')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export { hargaItem, kamarKeyOf };
