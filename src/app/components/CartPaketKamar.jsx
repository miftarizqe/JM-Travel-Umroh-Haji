'use client';
import { useEffect, useState } from 'react';
import { useOpsiTambahan } from '@/lib/useOpsiTambahan';
import WaitlistCTA from '@/app/components/WaitlistCTA';
import { formatAlamatSatuBaris } from '@/lib/formatAlamat';
import InputNominal from '@/app/components/InputNominal';

export const kamarKeyOf = (kamar) => kamar?.includes('Quad') ? 'quad' : kamar?.includes('Double') ? 'double' : 'triple';

function hargaProgram(prog, item) {
  // Custom Hotel per Kota (paket==='custom') SELALU pakai hargaCustom (harga
  // hasil hitung live dari /api/programs/[id]/hitung-hotel-custom, lihat
  // CustomHotelPicker) — gak ada kolom harga_custom_* statis buat di-fallback,
  // beda dari override admin manual di paket tetap.
  if (item.hargaCustom && Number(item.hargaCustom) > 0) return Number(item.hargaCustom);
  const kamarKey = kamarKeyOf(item.kamar);
  return prog?.[`harga_${item.paket}_${kamarKey}`] || prog?.[`harga_${item.paket}`] || 0;
}

function hargaOpsiTambahan(item) {
  return (item.opsiTambahan || []).reduce((s, o) => s + Number(o.harga || 0), 0);
}

export function hargaItem(prog, item) {
  return hargaProgram(prog, item) + hargaOpsiTambahan(item);
}

// Kekurangan data 1 jamaah (null = lengkap). SATU sumber buat badge ✅/⚠️ di
// header kartu & validasi "Lanjut ke Pembayaran" di checkout/page.jsx, biar
// badge gak bilang lengkap padahal ditolak pas lanjut (atau sebaliknya).
// Index kartu SEBELUMNYA (di atas) yang udah pakai NIK yang sama, -1 kalau
// gak ada. Cuma NIK lengkap 16 digit yang dicek (jangan nyala pas masih
// ngetik). Kartu PERTAMA yang pakai NIK itu dianggap sah, kartu di bawahnya
// yang ditandai dobel (dikonfirmasi user 2026-10-19, constraint FE aja --
// server tetap punya cek NIK dobel sendiri pas lanjut, lihat /api/bookings/cek-nik).
export function nikDobelDengan(list, c) {
  const nik = c.tanpaNik ? '' : String(c.nik || '').trim();
  if (!list || nik.length !== 16) return -1;
  const idx = list.findIndex(x => x.uid === c.uid);
  return list.findIndex((x, i) => i < idx && !x.tanpaNik && String(x.nik || '').trim() === nik);
}

export function masalahJamaah(c, prog, list) {
  if (!c.paket || !c.kamar) return 'Pilih paket & kamar dulu!';
  if (c.paket === 'custom' && (!c.hargaCustom || Number(c.hargaCustom) <= 0)) return 'Lengkapi pilihan Bintang Mekkah & Madinah dulu (Custom Hotel)!';
  // Sama kayak gerbang server di buatSatuBooking (src/lib/booking.js) —
  // harga paket per jamaah (tanpa opsi tambahan) wajib > DP biar ada sisa
  // pelunasan. Paling sering kena harga custom admin yang kekecilan.
  const dp = Number(prog?.dp || 0);
  if (prog && prog.publish_type !== 'sahabat_baitullah' && !(hargaProgram(prog, c) > dp)) {
    return `Harga paket (Rp ${hargaProgram(prog, c).toLocaleString('id-ID')}) harus lebih besar dari DP (Rp ${dp.toLocaleString('id-ID')}).`;
  }
  if (!c.nama.trim()) return 'Isi nama lengkap dulu!';
  if (c.jk !== 'Laki-Laki' && c.jk !== 'Perempuan') return 'Pilih jenis kelamin dulu!';
  if (!c.alamat.trim()) return 'Isi alamat kirim perlengkapan dulu!';
  if (!c.tanpaNik && !/^\d{16}$/.test(c.nik.trim())) return 'NIK wajib 16 digit (atau centang "Belum punya KTP" untuk anak di bawah 17 tahun).';
  const dobel = nikDobelDengan(list, c);
  if (dobel >= 0) return `NIK ini sudah dipakai Jamaah ${dobel + 1}. Satu orang cuma bisa didaftarkan sekali.`;
  return null;
}

export function labelPaketKamar(item) {
  if (item.paket === 'custom' && item.customHotel) {
    return `🎨 Mekkah Bintang ${BINTANG_PAKET[item.customHotel.mekkahPaket]} + Madinah Bintang ${BINTANG_PAKET[item.customHotel.madinahPaket]} · ${item.kamar}`;
  }
  return `${PAKET_LABEL[item.paket] || item.paket} · ${item.kamar}`;
}

const PAKET_LIST = [
  { key: 'deluxe', label: 'Deluxe', hotel: 'Ramada Al Fayzeen' },
  { key: 'eksekutif', label: 'Eksekutif', hotel: 'Maysan Al Mashaer' },
  { key: 'signature', label: 'Signature', hotel: 'Ghufron Al Shofwa' },
];
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const KAMAR_LIST = ['Quad (4/Kamar)', 'Triple (3/Kamar)', 'Double (2/Kamar)'];
const BINTANG_PAKET = { deluxe: 3, eksekutif: 4, signature: 5 };

// Custom Hotel per Kota — hitung harga LIVE tiap kali pilihan Bintang/kamar
// berubah (KEY paket aja yang dikirim, server yang resolve rate dari baris
// paket bersangkutan & hitung margin/komisi proporsional, lihat
// /api/programs/[id]/hitung-hotel-custom). Hook sendiri (dipanggil per
// JamaahCard, bukan di komponen utama) biar tiap jamaah yang pilih Custom
// Hotel punya hitungan harga sendiri-sendiri, independen dari jamaah lain.
function useCustomHotelHarga(progId, mekkahPaket, madinahPaket, kamarKey) {
  const [hasil, setHasil] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const valid = !!(progId && mekkahPaket && madinahPaket && kamarKey);

  useEffect(() => {
    if (!valid) return;
    let ignore = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError(null);
    fetch(`/api/programs/${progId}/hitung-hotel-custom`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mekkah_paket: mekkahPaket, madinah_paket: madinahPaket, kamar: kamarKey }),
    }).then(r => r.json()).then(d => {
      if (ignore) return;
      if (d.error) { setError(d.error); setHasil(null); }
      else setHasil({ harga: d.harga_per_orang });
    }).catch(() => { if (!ignore) { setError('Gagal menghitung harga'); setHasil(null); } })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [valid, progId, mekkahPaket, madinahPaket, kamarKey]);

  return { hasil: valid ? hasil : null, loading: valid && loading, error: valid ? error : null };
}

// Program Hotel Mix (custom, 1 harga rata) bikin SEMUA 9 kombinasi
// paket×kamar kebetulan sama persis — kalau gitu, nampilin pilihan paket ke
// jamaah cuma bikin keliatan ada pilihan padahal harganya gak pernah beda
// apapun yang dipencet.
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

// Kombo paket+kamar PERTAMA yang beneran ada harganya — dipakai default
// jamaah baru biar gak nyangkut di pilihan "Rp 0" kalau admin belum isi
// semua tier.
// Kombo yang beneran bisa dijual: harganya diisi & (selain Program Eksklusif
// Sahabat) > DP — kombo harga <= DP pasti ditolak masalahJamaah & server,
// jadi gak ditawarin sama sekali di dropdown/default.
function hargaLayakJual(prog, harga) {
  if (!(harga > 0)) return false;
  return prog?.publish_type === 'sahabat_baitullah' || harga > Number(prog?.dp || 0);
}

function komboDefault(prog) {
  for (const pk of PAKET_LIST) {
    for (const km of KAMAR_LIST) {
      const harga = prog?.[`harga_${pk.key}_${kamarKeyOf(km)}`] || prog?.[`harga_${pk.key}`] || 0;
      if (hargaLayakJual(prog, harga)) return { paket: pk.key, kamar: km };
    }
  }
  return { paket: PAKET_LIST[0].key, kamar: KAMAR_LIST[1] };
}

export function jamaahKosong(prog) {
  const { paket, kamar } = komboDefault(prog);
  return {
    paket, kamar, hargaCustom: '', customHotel: null,
    nama: '', jk: '', nik: '', tanpaNik: false, wa: '', alamat: '',
    opsiTambahan: [], diriSendiri: false,
    // Key React stabil per kartu -- dipakai juga buat id anchor scroll &
    // penanda kartu accordion yang kebuka (index geser kalau ada yang dihapus).
    uid: Math.random().toString(36).slice(2),
  };
}

// 1 kartu = 1 jamaah, MANDIRI total (paket/kamar sendiri, data sendiri) --
// restrukturisasi dari model lama "1 item keranjang = qty N jamaah berbagi 1
// paket" (dikonfirmasi user 2026-10-16: "ribet kalo misalkan harus ada 2
// pilihan diri sendiri/orang lain", maunya tiap jamaah kartu sendiri-sendiri
// kayak fitur Tambah Jamaah yang udah ada, lihat src/app/tambah-jamaah/
// page.jsx -- pola yang sama, direplikasi di sini + custom hotel + opsi
// tambahan + harga admin per kartu). `useCustomHotelHarga` WAJIB di
// komponen terpisah (bukan di-inline di loop parent) -- aturan Hooks React,
// tiap kartu butuh hitungan harga custom hotel-nya sendiri-sendiri.
// Warna gilir per jamaah CUMA di badge nomor & judul (border kartu netral) --
// semua kartu sekarang numpuk di 1 card parent, border pelangi per kartu
// bikin rame. Class ditulis utuh (bukan dirangkai) biar gak ke-purge Tailwind.
const WARNA_KARTU = [
  { badge: 'bg-[#1A4FA0] text-white', judul: 'text-[#0E2F6E]' },
  { badge: 'bg-emerald-600 text-white', judul: 'text-emerald-800' },
  { badge: 'bg-amber-500 text-white', judul: 'text-amber-800' },
  { badge: 'bg-purple-600 text-white', judul: 'text-purple-800' },
  { badge: 'bg-rose-600 text-white', judul: 'text-rose-800' },
  { badge: 'bg-teal-600 text-white', judul: 'text-teal-800' },
];

function JamaahCard({ idx, item, semua, onChange, onRemove, canRemove, accordion, terbuka, onToggle, prog, semuaHargaSama, opsiTambahanList, dataDiriSendiri, allowHargaCustom, diriSendiriBookingId }) {
  const kamarKey = kamarKeyOf(item.kamar);
  const hargaNormal = prog?.[`harga_${item.paket}_${kamarKey}`] || prog?.[`harga_${item.paket}`] || 0;

  const customHotelPilihan = item.customHotel || {};
  const { hasil: customHotelHasil, loading: customHotelLoading, error: customHotelError } =
    useCustomHotelHarga(prog?.id, customHotelPilihan.mekkahPaket, customHotelPilihan.madinahPaket, item.paket === 'custom' ? kamarKey : null);
  useEffect(() => {
    if (item.paket !== 'custom') return;
    const harga = customHotelHasil?.harga || '';
    if (String(item.hargaCustom || '') !== String(harga)) onChange({ ...item, hargaCustom: harga });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customHotelHasil]);

  // "Ini saya sendiri" CUMA di kartu #1 (bukan role-gated — berlaku siapa
  // pun yang login & checkout, dikonfirmasi user 2026-10-16), autofill +
  // KUNCI (gak bisa diganti) Nama/JK/NIK/No. Telp dari data identitas akun.
  // Alamat kirim SENGAJA TETAP manual/gak dikunci (alamat pengiriman bisa
  // beda dari alamat identitas).
  const diriSendiriTersedia = idx === 0 && !!dataDiriSendiri;
  // NIK akun ini udah kedaftar di booking aktif lain di program yang sama
  // (dicek di checkout/page.jsx pakai endpoint yang sama dengan validasi
  // final) -> checkbox dijegat dari awal, gak nunggu alert pas submit
  // (dikonfirmasi user 2026-10-16).
  const diriSendiriDiblokir = diriSendiriTersedia && !!diriSendiriBookingId;
  const nikTerkunci = !!item.diriSendiri && !!dataDiriSendiri?.nik;
  const fieldTerkunci = !!item.diriSendiri;

  useEffect(() => {
    if (diriSendiriDiblokir && item.diriSendiri) onChange({ ...item, diriSendiri: false, nama: '', jk: '', nik: '', wa: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diriSendiriDiblokir]);

  function toggleDiriSendiri(checked) {
    if (checked) {
      onChange({
        ...item, diriSendiri: true, tanpaNik: false,
        nama: dataDiriSendiri?.nama || '', jk: dataDiriSendiri?.jk || '',
        nik: dataDiriSendiri?.nik || '', wa: dataDiriSendiri?.wa || '',
      });
    } else {
      onChange({ ...item, diriSendiri: false, nama: '', jk: '', nik: '', wa: '' });
    }
  }

  function toggleOpsi(opsi) {
    const dipilih = (item.opsiTambahan || []).some(o => o.id === opsi.id);
    onChange({ ...item, opsiTambahan: dipilih ? item.opsiTambahan.filter(o => o.id !== opsi.id) : [...(item.opsiTambahan || []), opsi] });
  }

  const inp = 'w-full px-3.5 py-2.5 rounded-lg border-2 text-sm focus:outline-none';
  const inpNormal = `${inp} bg-white border-gray-200 focus:border-[#1A4FA0]`;
  const inpTerkunci = `${inp} border-gray-100 bg-gray-50 text-gray-500 cursor-not-allowed`;

  const warna = WARNA_KARTU[idx % WARNA_KARTU.length];
  const lengkap = !masalahJamaah(item, prog, semua);
  const nikDobel = nikDobelDengan(semua, item);
  // Mode accordion (2+ jamaah): body kartu yang ketutup CUMA di-hidden, bukan
  // di-unmount -- useCustomHotelHarga nyimpen hasil hitung di state lokal,
  // unmount bikin harga custom dihitung ulang (fetch lagi) tiap kartu dibuka.
  const bodyTampil = !accordion || terbuka;

  return (
    <div id={`jamaah-${item.uid}`}
      className={`scroll-mt-24 rounded-xl border-2 bg-white transition-colors ${accordion && terbuka ? 'border-[#1A4FA0]' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={accordion ? onToggle : undefined} disabled={!accordion}
          className="flex-1 min-w-0 flex items-center gap-2 text-left disabled:cursor-default">
          <span className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${warna.badge}`}>{idx + 1}</span>
          <div className="min-w-0 flex-1">
            <div className={`font-bold text-sm truncate ${warna.judul}`}>
              {accordion && item.nama.trim() ? item.nama : `Jamaah ${idx + 1}`}
              {item.diriSendiri && <span className="ml-1.5 text-[10px] font-semibold text-[#8a6516] bg-[#FEF3DC] rounded px-1.5 py-0.5">🙋 Saya</span>}
            </div>
            {accordion && (
              <div className="text-[11px] text-gray-500 truncate">
                {labelPaketKamar(item)} · <b className="text-[#0E2F6E]">Rp {hargaItem(prog, item).toLocaleString('id-ID')}</b>
              </div>
            )}
          </div>
          {accordion && (
            <span className={`flex-shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5 ${lengkap ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {lengkap ? '✅ Lengkap' : '⚠️ Belum lengkap'}
            </span>
          )}
          {accordion && <span className={`flex-shrink-0 text-gray-400 text-xs transition-transform ${terbuka ? 'rotate-180' : ''}`}>▼</span>}
        </button>
        {canRemove && (!accordion || terbuka) && <button type="button" onClick={onRemove} className="flex-shrink-0 text-xs text-red-500 font-bold ml-1">✕ Hapus</button>}
      </div>

      <div className={bodyTampil ? 'px-4 pb-4 space-y-2.5' : 'hidden'}>

      {diriSendiriTersedia && (
        diriSendiriDiblokir ? (
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <input type="checkbox" checked={false} disabled className="w-4 h-4 flex-shrink-0 opacity-50" />
            <span className="text-xs font-semibold text-gray-500">
              🙋 Anda sudah terdaftar sendiri di program ini{diriSendiriBookingId && diriSendiriBookingId !== 'lain' ? ` (booking ${diriSendiriBookingId})` : ''} — satu orang gak bisa checkout diri sendiri dua kali di program yang sama.
            </span>
          </div>
        ) : (
          <label className="flex items-center gap-2 bg-[#FEF3DC] rounded-lg px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={!!item.diriSendiri} onChange={e => toggleDiriSendiri(e.target.checked)}
              className="w-4 h-4 accent-[#1A4FA0] flex-shrink-0" />
            <span className="text-xs font-semibold text-[#8a6516]">🙋 Ini saya sendiri — Nama/JK/NIK/No. Telp otomatis dari data akun & terkunci</span>
          </label>
        )
      )}

      {semuaHargaSama ? (
        <div className="text-xs text-gray-500 bg-[#E8F0FB] rounded-lg px-3 py-2">Harga paket: <b className="text-[#0E2F6E]">Rp {Number(hargaNormal).toLocaleString('id-ID')}</b></div>
      ) : (
        <>
          <select value={item.paket === 'custom' ? 'custom' : `${item.paket}|${item.kamar}`}
            onChange={e => {
              if (e.target.value === 'custom') { onChange({ ...item, paket: 'custom', customHotel: item.customHotel || {}, hargaCustom: '' }); return; }
              const [pk, km] = e.target.value.split('|');
              onChange({ ...item, paket: pk, kamar: km, customHotel: null, hargaCustom: '' });
            }}
            className="w-full px-3.5 py-2.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm font-semibold text-[#0E2F6E]">
            {PAKET_LIST.flatMap(pk => KAMAR_LIST.map(km => {
              const harga = prog?.[`harga_${pk.key}_${kamarKeyOf(km)}`] || prog?.[`harga_${pk.key}`] || 0;
              if (!hargaLayakJual(prog, harga)) return null;
              return <option key={`${pk.key}|${km}`} value={`${pk.key}|${km}`}>{pk.label} · {km} — Rp {harga.toLocaleString('id-ID')}</option>;
            }))}
            {prog?.custom_hotel_tersedia && <option value="custom">🎨 Custom Hotel — pilih bintang Mekkah/Madinah sendiri</option>}
          </select>

          {item.paket === 'custom' && (
            <div className="border-l-2 border-gray-200 pl-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Bintang Mekkah</label>
                  <select value={customHotelPilihan.mekkahPaket ?? ''}
                    onChange={e => onChange({ ...item, customHotel: { ...customHotelPilihan, mekkahPaket: e.target.value || null } })}
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                    <option value="">-- Pilih --</option>
                    {(prog?.hotel_opsi || []).map(o => (
                      <option key={o.paket} value={o.paket}>Bintang {o.bintang}{o.hotel_mekkah ? ` — ${o.hotel_mekkah}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Bintang Madinah</label>
                  <select value={customHotelPilihan.madinahPaket ?? ''}
                    onChange={e => onChange({ ...item, customHotel: { ...customHotelPilihan, madinahPaket: e.target.value || null } })}
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                    <option value="">-- Pilih --</option>
                    {(prog?.hotel_opsi || []).map(o => (
                      <option key={o.paket} value={o.paket}>Bintang {o.bintang}{o.hotel_madinah ? ` — ${o.hotel_madinah}` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              {customHotelPilihan.mekkahPaket && customHotelPilihan.madinahPaket && (
                <div className="text-xs">
                  {customHotelLoading ? <span className="text-gray-400">Menghitung harga...</span>
                    : customHotelError ? <span className="text-red-500">⚠️ {customHotelError}</span>
                    : customHotelHasil?.harga ? <span className="font-black text-[#0E2F6E]">Rp {Number(customHotelHasil.harga).toLocaleString('id-ID')}</span> : null}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <input value={item.nama} readOnly={fieldTerkunci} onChange={e => onChange({ ...item, nama: e.target.value })}
        placeholder="Nama lengkap sesuai paspor/KTP" className={fieldTerkunci ? inpTerkunci : inpNormal} />

      <select value={item.jk} disabled={fieldTerkunci} onChange={e => onChange({ ...item, jk: e.target.value })}
        className={fieldTerkunci ? inpTerkunci : `${inpNormal} text-gray-700`}>
        <option value="">Pilih jenis kelamin...</option>
        <option value="Laki-Laki">Laki-Laki</option>
        <option value="Perempuan">Perempuan</option>
      </select>

      <div className="space-y-1">
        <input value={item.nik} readOnly={nikTerkunci} disabled={item.tanpaNik}
          onChange={e => onChange({ ...item, nik: e.target.value.replace(/\D/g, '').slice(0, 16) })}
          inputMode="numeric" maxLength={16}
          placeholder={item.tanpaNik ? 'Belum punya KTP' : 'NIK (No. KTP) — 16 digit'}
          className={(nikTerkunci || item.tanpaNik) ? inpTerkunci : nikDobel >= 0 ? `${inp} bg-white border-red-400 focus:border-red-500` : inpNormal} />
        {nikDobel >= 0 && (
          <div className="text-[11px] font-semibold text-red-600">⚠️ NIK ini sudah dipakai Jamaah {nikDobel + 1}. Satu orang cuma bisa didaftarkan sekali.</div>
        )}
        {!fieldTerkunci && (
          <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
            <input type="checkbox" checked={!!item.tanpaNik} className="w-3.5 h-3.5 accent-[#1A4FA0]"
              onChange={e => onChange({ ...item, tanpaNik: e.target.checked, nik: e.target.checked ? '' : item.nik })} />
            Belum punya KTP (usia di bawah 17 tahun)
          </label>
        )}
      </div>

      <input value={item.wa} readOnly={fieldTerkunci} onChange={e => onChange({ ...item, wa: e.target.value.replace(/\D/g, '') })}
        placeholder="No. Telepon / WhatsApp (opsional)" inputMode="numeric" maxLength={13}
        className={fieldTerkunci ? inpTerkunci : inpNormal} />

      <div className="border-t border-gray-100 pt-3 space-y-2.5">
        <div className="text-xs font-bold text-[#0E2F6E]">📦 Alamat Kirim Perlengkapan <span className="font-normal text-gray-500">(koper, ihrom/mukena, dll)</span></div>
        {/* "Salin dari Alamat Domisili" CUMA buat "Ini saya sendiri" & akun
            yang punya alamat domisili terstruktur (migration 239,
            dataDiriSendiri.domisili dari checkout/page.jsx; null -> gak
            dirender). Domisili, bukan KTP -- tempat tinggal SEKARANG, lebih
            nyambung buat kirim paket. SEKALI-SALIN ke textarea (dirangkai
            formatAlamatSatuBaris), abis itu tetap bisa diedit manual.
            Diporting dari versi dropdown berjenjang ke textarea pas merge
            2026-10-19. Status centang DITURUNKAN dari isi textarea (sama
            persis alamat domisili = kecentang) -- dulu checked={false}
            permanen, ngisi tapi gak pernah kecentang (dikonfirmasi user
            2026-10-19). Diedit manual -> otomatis lepas; uncentang ->
            textarea dikosongin. */}
        {fieldTerkunci && dataDiriSendiri?.domisili && (() => {
          const alamatDomisili = formatAlamatSatuBaris(dataDiriSendiri.domisili);
          return (
          <label className="flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer">
            <input type="checkbox" className="w-3.5 h-3.5 accent-[#1A4FA0]" checked={item.alamat === alamatDomisili}
              onChange={e => onChange({ ...item, alamat: e.target.checked ? alamatDomisili : '' })} />
            📍 Salin dari Alamat Domisili
          </label>
          );
        })()}
        {/* Textarea bebas (bukan dropdown wilayah berjenjang lagi,
            dikonfirmasi user 2026-10-19) -- langsung masuk `alamat`, payload
            submit & kolom alamat_kirim di DB gak berubah. */}
        <textarea value={item.alamat} onChange={e => onChange({ ...item, alamat: e.target.value })} rows={3}
          placeholder="Alamat lengkap: jalan, no. rumah, RT/RW, kelurahan, kecamatan, kota, kode pos"
          className={`${inpNormal} resize-y`} />
      </div>

      {allowHargaCustom && item.paket !== 'custom' && (
        <div className="bg-gray-900 rounded-xl p-3 space-y-1.5">
          <div className="font-bold text-white text-xs">💰 Set Harga Sendiri (Admin)</div>
          <div className="text-[11px] text-gray-300">Kosongkan untuk pakai harga normal (Rp {Number(hargaNormal).toLocaleString('id-ID')}).</div>
          <InputNominal value={item.hargaCustom} onChange={e => onChange({ ...item, hargaCustom: e.target.value })}
            placeholder={`Rp ${Number(hargaNormal).toLocaleString('id-ID')}`}
            className="w-full px-3 py-2 rounded-lg border-2 border-gray-700 bg-gray-800 text-white placeholder-gray-500 focus:border-[#C9952A] focus:outline-none text-sm" />
          {item.hargaCustom !== '' && (
            <button onClick={() => onChange({ ...item, hargaCustom: '' })} className="text-[11px] text-[#C9952A] font-semibold underline">
              Reset ke harga normal
            </button>
          )}
        </div>
      )}

      {opsiTambahanList.length > 0 && (
        <div className="border-t border-gray-100 pt-3 space-y-1.5">
          <div className="text-xs font-bold text-[#0E2F6E]">Opsi Tambahan (opsional)</div>
          {opsiTambahanList.map(o => {
            const dipilih = (item.opsiTambahan || []).some(x => x.id === o.id);
            return (
              <label key={o.id} onClick={() => toggleOpsi(o)}
                className={`flex items-center justify-between p-2.5 rounded-lg border-2 cursor-pointer transition-all ${dipilih ? 'border-[#1A4FA0] bg-[#E8F0FB]' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={dipilih} readOnly className="w-4 h-4 accent-[#1A4FA0]" />
                  <div>
                    <div className="text-xs font-semibold text-gray-700">{o.nama}</div>
                    {o.deskripsi && <div className="text-[10px] text-gray-400">{o.deskripsi}</div>}
                  </div>
                </div>
                <div className="text-xs font-bold text-[#0E2F6E] whitespace-nowrap">+Rp {Number(o.harga).toLocaleString('id-ID')}</div>
              </label>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}

// Step "Pilih Paket" dipakai checkout & admin booking jamaah. 1 kartu = 1
// jamaah, MANDIRI (paket/kamar sendiri-sendiri) — lihat JamaahCard di atas.
// `onSummaryChange` dipanggil tiap kali angka ringkasan (termasuk voucher)
// berubah, supaya halaman pemanggil bisa nyimpen angka2 itu buat ditampilkan
// lagi di step Invoice DP (komponen ini sendiri unmount begitu pindah step).
//
// `dataDiriSendiri` ({ nama, wa, jk, nik }) opsional — kalau dikirim, kartu
// jamaah #1 nampilin checkbox "Ini saya sendiri" (dikonfirmasi user
// 2026-10-16, berlaku SEMUA role yang checkout, gak lagi khusus Sahabat
// Baitullah).
// `allowHargaCustom` (bool) — tampilkan input "Set Harga Sendiri" per kartu
// (admin/super_admin doang, closing Direct/Kantor sering pakai harga
// negosiasi).
// `jamaahTerbuka` / `onJamaahTerbuka` — uid kartu yang lagi kebuka (2+ jamaah
// = accordion, CUMA 1 kartu kebuka; buka kartu lain otomatis nutup yang lama,
// dikonfirmasi user 2026-10-19). State-nya dipegang pemanggil biar validasi
// "Lanjut ke Pembayaran" bisa langsung bukain kartu yang datanya kurang.
export default function CartPaketKamar({ prog, list, onChangeList, extra, onSummaryChange, referralPerwId, dataDiriSendiri, allowHargaCustom, diriSendiriBookingId, jamaahTerbuka, onJamaahTerbuka }) {
  const [opsiTambahanList] = useOpsiTambahan(prog?.id);
  const semuaHargaSama = semuaHargaSamaCek(prog);
  const sisaSeat = (prog?.total_seat || 0) - (prog?.used_seat || 0) - list.length;

  const totalDpCart = (prog?.dp || 0) * list.length;
  const totalHargaCart = list.reduce((s, c) => s + hargaItem(prog, c), 0);

  const [voucherInput, setVoucherInput] = useState('');
  const [voucherChecking, setVoucherChecking] = useState(false);
  const [voucherError, setVoucherError] = useState(null);
  // { kode, total, listSnapshot } — listSnapshot dipakai deteksi daftar
  // jamaah berubah SETELAH voucher di-apply, supaya nggak ada angka basi
  // ke-tampilkan.
  const [voucherApplied, setVoucherApplied] = useState(null);
  const [voucherList, setVoucherList] = useState([]);

  useEffect(() => {
    fetch('/api/vouchers/saya').then(r => r.json())
      .then(d => setVoucherList((d.vouchers || []).filter(v => !v.prog_id || v.prog_id === prog?.id)))
      .catch(() => {});
  }, [prog?.id]);

  const listSnapshot = JSON.stringify(list.map(c => ({ paket: c.paket, kamar: c.kamar })));
  const voucherStale = voucherApplied && voucherApplied.listSnapshot !== listSnapshot;
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

  async function terapkanVoucher(kodeOverride) {
    const kode = (kodeOverride ?? voucherInput).trim();
    if (!kode || list.length === 0) return;
    setVoucherInput(kode);
    setVoucherChecking(true);
    setVoucherError(null);
    try {
      const res = await fetch('/api/vouchers/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kode, prog_id: prog.id,
          items: list.map(c => ({ paket: c.paket, kamar: c.kamar, jumlah_jamaah: 1 })),
          referral_perw_id: referralPerwId || null,
        }),
      });
      const d = await res.json();
      if (!d.valid) {
        setVoucherError(d.error || 'Voucher tidak valid');
        setVoucherApplied(null);
      } else {
        setVoucherApplied({ kode: d.kode, total: d.potongan_total, listSnapshot });
      }
    } catch {
      setVoucherError('Terjadi kesalahan saat cek voucher');
      setVoucherApplied(null);
    }
    setVoucherChecking(false);
  }

  function hapusVoucher() {
    if (!confirm('Apakah Anda yakin ingin menghapus voucher ini? Harga akan kembali ke harga normal.')) return;
    setVoucherApplied(null);
    setVoucherInput('');
    setVoucherError(null);
  }

  function ubahJamaah(idx, next) {
    onChangeList(list.map((j, i) => i === idx ? next : j));
  }
  function tambahJamaah() {
    const baru = jamaahKosong(prog);
    onChangeList([...list, baru]);
    onJamaahTerbuka?.(baru.uid);
    // Kartu lama ketutup -> layout nyusut, kartu baru bisa lompat keluar layar.
    setTimeout(() => document.getElementById(`jamaah-${baru.uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }
  function hapusJamaah(idx) {
    // Kartu yang dihapus pasti yang lagi kebuka (tombol Hapus cuma muncul di
    // kartu kebuka) -> pindah buka kartu sebelumnya, jangan ketutup semua.
    if (list[idx]?.uid === jamaahTerbuka) onJamaahTerbuka?.(list[idx - 1]?.uid ?? null);
    onChangeList(list.filter((_, i) => i !== idx));
  }
  const accordion = list.length > 1;

  return (
    <div className="space-y-5">
      {sisaSeat <= 0 && list.length === 0 ? <WaitlistCTA progId={prog?.id} /> : (
      <>
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="font-bold text-[#0E2F6E]">👥 Daftar Jamaah <span className="font-normal text-gray-500">({list.length} orang)</span></div>
          <div className="text-[11px] text-gray-500">Sisa seat: <b className="text-[#0E2F6E]">{Math.max(0, sisaSeat)}</b></div>
        </div>

        {list.map((item, idx) => (
          <JamaahCard key={item.uid || idx} idx={idx} item={item} semua={list} onChange={next => ubahJamaah(idx, next)}
            onRemove={() => hapusJamaah(idx)} canRemove={idx > 0}
            accordion={accordion} terbuka={item.uid === jamaahTerbuka}
            onToggle={() => onJamaahTerbuka?.(item.uid === jamaahTerbuka ? null : item.uid)}
            prog={prog} semuaHargaSama={semuaHargaSama} opsiTambahanList={opsiTambahanList}
            dataDiriSendiri={dataDiriSendiri} allowHargaCustom={allowHargaCustom} diriSendiriBookingId={diriSendiriBookingId} />
        ))}

        <button onClick={tambahJamaah} disabled={sisaSeat < 1}
          className="w-full border-2 border-dashed border-[#1A4FA0] text-[#1A4FA0] bg-white font-bold py-3 rounded-full hover:bg-[#E8F0FB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          + Tambah Jamaah Lain Lagi
        </button>
        {sisaSeat < 1 && <div className="text-center text-xs text-gray-400">Sisa seat habis — gak bisa nambah jamaah lagi.</div>}
      </div>

      {extra}

      {/* Voucher */}
      {list.length > 0 && (
        <div>
          <div className="font-bold text-[#0E2F6E] mb-2">🎟️ Kode Voucher (opsional)</div>
          {voucherApplied && !voucherStale ? (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
              <div className="text-xs text-green-700">✅ Voucher <strong>{voucherApplied.kode}</strong> diterapkan — hemat Rp {voucherApplied.total.toLocaleString('id-ID')}</div>
              <button onClick={hapusVoucher} className="text-xs text-red-500 hover:text-red-700 font-bold underline whitespace-nowrap ml-2">Hapus</button>
            </div>
          ) : (
            <>
              {voucherList.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {voucherList.map(v => (
                    <button key={v.kode} onClick={() => terapkanVoucher(v.kode)} disabled={voucherChecking}
                      className="flex items-center gap-2 bg-white border-2 border-dashed border-[#C9952A] hover:bg-[#FEF3DC] rounded-xl px-3 py-2 text-left disabled:opacity-50 transition-colors">
                      <span className="text-lg">🎟️</span>
                      <div>
                        <div className="text-xs font-bold text-[#0E2F6E]">{v.kode} — Rp {v.potongan.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-gray-400">{v.catatan || (v.khusus_untuk_saya ? 'Khusus akun Anda' : 'Klik untuk pakai')}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input value={voucherInput} onChange={e => setVoucherInput(e.target.value.toUpperCase())}
                  placeholder="Atau masukkan kode voucher lain"
                  className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm uppercase"/>
                <button onClick={() => terapkanVoucher()} disabled={voucherChecking || !voucherInput.trim()}
                  className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 rounded-xl transition-colors disabled:opacity-50">
                  {voucherChecking ? '...' : 'Terapkan'}
                </button>
              </div>
            </>
          )}
          {voucherError && <div className="text-xs text-red-500 mt-1.5">⚠️ {voucherError}</div>}
          {voucherStale && (
            <div className="text-xs text-yellow-600 mt-1.5">⚠️ Daftar jamaah berubah, klik Terapkan lagi untuk update voucher.</div>
          )}
        </div>
      )}

      {/* Ringkasan */}
      {list.length > 0 && (
        <div className="bg-[#E8F0FB] rounded-xl p-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0] mb-3">📋 Ringkasan</div>
          {list.map((c, i) => (
            <div key={i} className="flex justify-between text-sm text-gray-500">
              <span className="capitalize">{c.nama || `Jamaah ${i + 1}`} — {labelPaketKamar(c)}</span>
              <span className="font-semibold text-[#0E2F6E]">Rp {hargaItem(prog, c).toLocaleString('id-ID')}</span>
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
      </>
      )}
    </div>
  );
}
