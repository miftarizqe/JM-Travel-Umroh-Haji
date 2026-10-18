'use client';
import { useEffect, useState } from 'react';
import { useOpsiTambahan } from '@/lib/useOpsiTambahan';
import WaitlistCTA from '@/app/components/WaitlistCTA';
import { AddressFields } from '@/app/components/AddressFields';
import { formatAlamatSatuBaris } from '@/lib/formatAlamat';

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

function labelPaketKamar(item) {
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
function komboDefault(prog) {
  for (const pk of PAKET_LIST) {
    for (const km of KAMAR_LIST) {
      const harga = prog?.[`harga_${pk.key}_${kamarKeyOf(km)}`] || prog?.[`harga_${pk.key}`] || 0;
      if (harga > 0) return { paket: pk.key, kamar: km };
    }
  }
  return { paket: PAKET_LIST[0].key, kamar: KAMAR_LIST[1] };
}

export function jamaahKosong(prog) {
  const { paket, kamar } = komboDefault(prog);
  return {
    paket, kamar, hargaCustom: '', customHotel: null,
    nama: '', jk: '', nik: '', tanpaNik: false, wa: '', alamat: '',
    ...ALAMAT_KIRIM_KOSONG,
    opsiTambahan: [], diriSendiri: false,
    // Key React stabil per kartu -- AddressFields nyimpen id wilayah yang
    // dipilih di state lokal, kalau di-key pakai index, hapus kartu #1 bikin
    // kartu #2 kebagian dropdown kartu #1.
    uid: Math.random().toString(36).slice(2),
  };
}

// Alamat kirim per jamaah sekarang terstruktur (dropdown wilayah berjenjang,
// sama kayak AddressFields di pendaftaran), bukan 1 input bebas lagi.
// `alamat` 1 baris TETAP diisi (dirangkai formatAlamatSatuBaris) biar
// payload submit & kolom alamat_kirim di DB gak berubah.
const ALAMAT_KIRIM_KOSONG = {
  jalan_kirim: '', norumah_kirim: '', rt_kirim: '', rw_kirim: '', kp_kirim: '',
  kel_kirim: '', kec_kirim: '', kota_kirim: '', provinsi_kirim: '', negara_kirim: 'Indonesia',
};
function rangkaiAlamatKirim(j) {
  return formatAlamatSatuBaris({
    jalan: j.jalan_kirim, norumah: j.norumah_kirim, rt: j.rt_kirim, rw: j.rw_kirim,
    kel: j.kel_kirim, kec: j.kec_kirim, kota: j.kota_kirim, provinsi: j.provinsi_kirim,
    kp: j.kp_kirim, negara: j.negara_kirim,
  });
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
// Warna per kartu jamaah (gilir berdasarkan urutan) biar kartu Jamaah 1, 2,
// 3, dst gak ketuker pas ngisi banyak orang sekaligus. Class ditulis utuh
// (bukan dirangkai) biar gak ke-purge Tailwind.
const WARNA_KARTU = [
  { kartu: 'border-[#1A4FA0] bg-blue-50/40', badge: 'bg-[#1A4FA0] text-white', judul: 'text-[#0E2F6E]' },
  { kartu: 'border-emerald-500 bg-emerald-50/50', badge: 'bg-emerald-600 text-white', judul: 'text-emerald-800' },
  { kartu: 'border-amber-500 bg-amber-50/50', badge: 'bg-amber-500 text-white', judul: 'text-amber-800' },
  { kartu: 'border-purple-500 bg-purple-50/50', badge: 'bg-purple-600 text-white', judul: 'text-purple-800' },
  { kartu: 'border-rose-500 bg-rose-50/50', badge: 'bg-rose-600 text-white', judul: 'text-rose-800' },
  { kartu: 'border-teal-500 bg-teal-50/50', badge: 'bg-teal-600 text-white', judul: 'text-teal-800' },
];

function JamaahCard({ idx, item, onChange, onPatch, onRemove, canRemove, prog, semuaHargaSama, opsiTambahanList, dataDiriSendiri, allowHargaCustom, diriSendiriBookingId }) {
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

  return (
    <div className={`rounded-xl border-2 p-4 space-y-2.5 ${warna.kartu}`}>
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 font-bold text-sm ${warna.judul}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${warna.badge}`}>{idx + 1}</span>
          Jamaah {idx + 1}
        </div>
        {canRemove && <button onClick={onRemove} className="text-xs text-red-500 font-bold">✕ Hapus</button>}
      </div>

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
              if (harga <= 0) return null;
              return <option key={`${pk.key}|${km}`} value={`${pk.key}|${km}`}>{pk.label} · {km} — Rp {harga.toLocaleString('id-ID')}</option>;
            }))}
            {prog?.custom_hotel_tersedia && <option value="custom">🎨 Custom Hotel — pilih bintang Mekkah/Madinah sendiri</option>}
          </select>

          {item.paket === 'custom' && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
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
          className={(nikTerkunci || item.tanpaNik) ? inpTerkunci : inpNormal} />
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

      <div className="rounded-lg border-2 border-gray-100 bg-white/70 p-3 space-y-2.5">
        <div className="text-xs font-bold text-[#0E2F6E]">📦 Alamat Kirim Perlengkapan <span className="font-normal text-gray-500">(koper, ihrom/mukena, dll)</span></div>
        {/* setF dipanggil beruntun dalam 1 event (ganti provinsi -> kosongin
            kota/kec/kel), jadi WAJIB functional update (onPatch), bukan
            onChange({...item}) yang bakal saling timpa pakai `item` basi. */}
        <AddressFields form={item} suffix="_kirim"
          setF={(key, val) => onPatch(j => { const n = { ...j, [key]: val }; return { ...n, alamat: rangkaiAlamatKirim(n) }; })}
          inp={inpNormal} lbl="block text-[11px] font-semibold text-gray-500 mb-1" />
      </div>

      {allowHargaCustom && item.paket !== 'custom' && (
        <div className="bg-gray-900 rounded-xl p-3 space-y-1.5">
          <div className="font-bold text-white text-xs">💰 Set Harga Sendiri (Admin)</div>
          <div className="text-[11px] text-gray-300">Kosongkan untuk pakai harga normal (Rp {Number(hargaNormal).toLocaleString('id-ID')}).</div>
          <input type="number" value={item.hargaCustom} onChange={e => onChange({ ...item, hargaCustom: e.target.value })}
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
        <div className="space-y-1.5">
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
export default function CartPaketKamar({ prog, list, onChangeList, extra, onSummaryChange, referralPerwId, dataDiriSendiri, allowHargaCustom, diriSendiriBookingId }) {
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
    onChangeList([...list, jamaahKosong(prog)]);
  }
  function patchJamaah(idx, fn) {
    onChangeList(prev => prev.map((j, i) => i === idx ? fn(j) : j));
  }
  function hapusJamaah(idx) {
    onChangeList(list.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-5">
      {sisaSeat <= 0 && list.length === 0 ? <WaitlistCTA progId={prog?.id} /> : (
      <>
      <div className="space-y-3">
        {list.map((item, idx) => (
          <JamaahCard key={item.uid || idx} idx={idx} item={item} onChange={next => ubahJamaah(idx, next)}
            onPatch={fn => patchJamaah(idx, fn)}
            onRemove={() => hapusJamaah(idx)} canRemove={list.length > 1}
            prog={prog} semuaHargaSama={semuaHargaSama} opsiTambahanList={opsiTambahanList}
            dataDiriSendiri={dataDiriSendiri} allowHargaCustom={allowHargaCustom} diriSendiriBookingId={diriSendiriBookingId} />
        ))}
      </div>

      <button onClick={tambahJamaah} disabled={sisaSeat < 1}
        className="w-full border-2 border-dashed border-[#1A4FA0] text-[#1A4FA0] font-bold py-3 rounded-full hover:bg-[#E8F0FB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        + Tambah Jamaah Lain Lagi
      </button>
      {sisaSeat < 1 && <div className="text-center text-xs text-gray-400">Sisa seat habis — gak bisa nambah jamaah lagi.</div>}

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
