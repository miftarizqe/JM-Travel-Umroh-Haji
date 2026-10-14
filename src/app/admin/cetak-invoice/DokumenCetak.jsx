// Komponen cetak Invoice/Kwitansi/Tanda Terima Uang -- DIPISAH dari
// [id]/page.jsx (2026-10-14) biar bisa dipakai di DUA tempat: (1) preview
// LIVE di halaman admin sebelum dikirim, (2) server-side (ReactDOMServer)
// buat bikin html_snapshot BEKU pas tombol "Kirim ke Jamaah" diklik (lihat
// POST .../setuju & migration 227). Begitu dokumen TTU/Kwitansi punya
// html_snapshot, halaman cetak nampilin snapshot itu apa adanya, BUKAN
// render ulang komponen ini -- jadi kalau komponen ini kena bugfix/redesign
// belakangan, dokumen yang UDAH terkirim gak ikut berubah tampilannya
// (dikonfirmasi user 2026-10-14, "walaupun next time gue ubah paket
// namanya/format/siapa yg ttd, yang udah terkirim gabakal ikutan berubah").
// Murni presentational -- TANPA hook, TANPA 'use client' -- supaya aman
// dipakai di server (Node.js runtime API route).
import KopSurat from '@/app/components/KopSurat';
import { terbilang } from '@/lib/terbilang';

export const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
export const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
export const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
// per-unit = total / qty (dibulatkan) — kalau qty gak ada/0, ya satuan = total (qty tersirat 1).
export const perUnit = (total, qty) => qty > 0 ? Math.round(Number(total) / qty) : Number(total);

// Judul dokumen sengaja "INVOICE" polos aja (bukan "INVOICE — DP"/
// "INVOICE — PELUNASAN") — Invoice sekarang 1 jenis generik, labelnya ambil
// dari `dokumen.judul` yang diisi bebas oleh admin tiap generate (bisa "DP",
// "Pelunasan", "Cicilan ke-2", dst), bukan lagi hardcode di kode.
export const JUDUL = {
  invoice: 'INVOICE',
  kwitansi: 'KWITANSI PEMBAYARAN',
  tanda_terima: 'TANDA TERIMA UANG',
};
// Label pembayaran generik (payments.type) dipakai buat baris Tanda Terima
// Uang, biar keliatan ini bukti terima buat pembayaran YANG MANA (DP/lunas).
export const LABEL_TIPE_PEMBAYARAN = { dp: 'Uang Muka (DP)', lunas: 'Pelunasan' };
export const LABEL_BARIS = {
  kwitansi: 'Pembayaran Total Paket (Paid)',
  tanda_terima: 'Pembayaran Diterima',
};
export const BUTUH_REKENING = ['invoice']; // kwitansi/tanda terima = udah dibayar, gak perlu instruksi transfer
// UU Bea Meterai No. 10/2020 — dokumen yang menyatakan PENERIMAAN uang
// senilai >= Rp5.000.000 wajib materai Rp10.000. Berlaku begitu dokumen ini
// FUNGSINYA jadi tanda terima (Kwitansi selalu, Invoice DP/Pelunasan begitu
// statusnya Paid) — bukan pas masih jadi tagihan yang belum dibayar.
export const BATAS_MATERAI = 5_000_000;

const td = { border: '1px solid #000', padding: '6px 8px' };

// Kombo paket+kamar sama persis buat SEMUA entry? Kalau enggak, baris
// "Paket" dipecah per-orang (dikonfirmasi user 2026-10-14) — jangan cuma
// nulis "Campuran" generik kalau datanya emang ada buat dirinci per orang.
export function uniformCombo(list) {
  if (!list || list.length === 0) return true;
  const first = list[0];
  return list.every(j => j.paket === first.paket && j.kamar === first.kamar);
}

export function BarisPaket({ booking, listOverride }) {
  // listOverride dipakai Kwitansi (dikonfirmasi user 2026-10-14) — begitu
  // udah "Kirim ke Jamaah", daftar jamaah/qty di baris ini WAJIB ikut
  // jamaah_breakdown_pembayaran yang udah dibekukan (lihat komponen
  // pemanggil), bukan booking.jamaah_breakdown yang selalu dihitung LIVE —
  // kalau enggak, baris ini bisa "berubah" walau nominal di bawahnya udah
  // dikunci. Invoice (listOverride gak dikasih) tetap pakai data booking
  // live seperti biasa, belum ikut lock.
  const list = listOverride || booking.jamaah_breakdown || [];
  const namaList = listOverride ? listOverride.map(j => j.nama) : (booking.jamaah_nama || []);
  const qty = list.length || Number(booking.jumlah_jamaah || 1);

  // Mixed combo & ada datanya — 1 baris PER ORANG, qty/satuan/jumlah masing2
  // pakai harga_jual orang itu sendiri (pre-voucher, snapshot katalog —
  // sama konvensi cetak-formulir).
  if (list.length > 0 && !uniformCombo(list)) {
    return list.map((j, i) => (
      <tr key={i}>
        <td style={td}>{j.nama} — {PAKET_LABEL[j.paket] || j.paket}{j.kamar ? ` · ${j.kamar}` : ''}</td>
        <td style={{ ...td, textAlign: 'center' }}>1</td>
        <td style={{ ...td, textAlign: 'right' }}>{rp(j.hargaJual)}</td>
        <td style={{ ...td, textAlign: 'right' }}>{rp(j.hargaJual)}</td>
      </tr>
    ));
  }

  // Seragam (atau breakdown kosong, fallback) — 1 baris gabungan, PERSIS
  // angka yang sama kayak sebelumnya (total_harga booking, bukan jumlah
  // harga_jual per-orang, biar gak geser dari voucher/opsi tambahan).
  return (
    <tr>
      <td style={td}>
        <div><b>Paket:</b> {PAKET_LABEL[booking.paket] || booking.paket}{booking.kamar ? ` · ${booking.kamar}` : ''}</div>
        {namaList.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <b>Atas Nama Jamaah:</b>
            <ol style={{ margin: '4px 0 0 20px', padding: 0 }}>
              {namaList.map((nama, i) => <li key={i}>{nama}</li>)}
            </ol>
          </div>
        )}
      </td>
      <td style={{ ...td, textAlign: 'center' }}>{qty}</td>
      <td style={{ ...td, textAlign: 'right' }}>{rp(perUnit(booking.total_harga, qty))}</td>
      <td style={{ ...td, textAlign: 'right' }}>{rp(booking.total_harga)}</td>
    </tr>
  );
}

// Daftar "Atas Nama Jamaah" buat baris DP/Pelunasan/Tanda Terima — SCOPED ke
// jamaah yang BENERAN ditutup pembayaran itu (bukan seisi booking, lihat
// jamaah_breakdown_pembayaran di API). Beda dari BarisPaket: amount-nya
// SENGAJA gak dipecah per-orang di sini (DP itu flat per kepala, gak
// tergantung paket — mencoba mecah proporsional cuma bikin angka ambigu),
// cuma label namanya yang dikasih keterangan paket kalau emang campuran.
export function KeteranganPembayaran({ list }) {
  if (!list || list.length === 0) return null;
  const uniform = uniformCombo(list);
  const first = list[0];
  return (
    <div style={{ marginTop: 4 }}>
      {/* Seragam -- nama paket ditulis SEKALI di sini (bukan diulang per
          orang) (ditemukan user 2026-10-14, sebelumnya kasus seragam malah
          GAK nulis paket sama sekali — cuma kasus campuran yang kebagian
          label paket per-nama di bawah). */}
      {uniform && first?.paket && (
        <div><b>Paket:</b> {PAKET_LABEL[first.paket] || first.paket}{first.kamar ? ` · ${first.kamar}` : ''}</div>
      )}
      <b>Atas Nama Jamaah:</b>
      <ol style={{ margin: '4px 0 0 20px', padding: 0 }}>
        {list.map((j, i) => (
          <li key={i}>{j.nama}{!uniform ? ` — ${PAKET_LABEL[j.paket] || j.paket}${j.kamar ? ` · ${j.kamar}` : ''}` : ''}</li>
        ))}
      </ol>
    </div>
  );
}

export function BarisItem({ label, sub, qty, satuan, jumlah, tebal }) {
  return (
    <tr>
      <td style={{ ...td, fontWeight: tebal ? 700 : 400 }}>
        {label}
        {sub && <div style={{ fontWeight: 400, fontSize: 10, color: '#666', marginTop: 2 }}>{sub}</div>}
      </td>
      <td style={{ ...td, textAlign: 'center', fontWeight: tebal ? 700 : 400 }}>{qty ?? ''}</td>
      <td style={{ ...td, textAlign: 'right', fontWeight: tebal ? 700 : 400 }}>{satuan != null ? rp(satuan) : ''}</td>
      <td style={{ ...td, textAlign: 'right', fontWeight: tebal ? 700 : 400 }}>{rp(jumlah)}</td>
    </tr>
  );
}

export function BarisCatatan({ children }) {
  return (
    <tr>
      <td colSpan={4} style={{ ...td, fontSize: 11 }}>{children}</td>
    </tr>
  );
}

// Komponen utama -- persis isi div.sheet yang dulu inline di halaman admin.
// Props: dokumen (row invoice_kwitansi), booking (null kalau dokumen manual
// tanpa booking_id), payment ({type} kalau dokumen.payment_id ada),
// pengaturan (row pengaturan perusahaan).
export default function DokumenCetak({ dokumen, booking, payment, pengaturan }) {
  const judul = JUDUL[dokumen.jenis];
  const punyaRincianBooking = booking?.total_harga != null;
  // tanda_terima & kwitansi pakai jamaah_breakdown_pembayaran — buat TTU itu
  // SCOPED ke jamaah yang BENERAN ditutup payment itu, buat kwitansi isinya
  // sama kayak booking penuh TAPI dibekukan begitu udah terkirim (lihat
  // migration 224 & lock-on-send di POST .../setuju). Invoice tetap pakai
  // breakdown booking LIVE, belum ikut lock (dikonfirmasi user 2026-10-14).
  const jamaahUntukPembayaran = ['tanda_terima', 'kwitansi'].includes(dokumen.jenis)
    ? (booking?.jamaah_breakdown_pembayaran || booking?.jamaah_breakdown || [])
    : (booking?.jamaah_breakdown || []);
  const qtyJamaah = jamaahUntukPembayaran.length || (booking ? Number(booking.jumlah_jamaah || 1) : 1);
  // Invoice itu TAGIHAN, bukan tanda terima (dikonfirmasi user 2026-10-14)
  // -- gak pernah butuh materai sama sekali, APAPUN status/nominalnya,
  // walau ditandai "Paid" manual. Kwitansi SELALU berfungsi tanda terima.
  // Tanda Terima Uang berfungsi tanda terima pas statusnya 'paid' (selalu
  // begitu, lihat generateTandaTerimaUntukPayment).
  const berfungsiTandaTerima = dokumen.jenis === 'kwitansi' || (dokumen.jenis === 'tanda_terima' && dokumen.status === 'paid');
  // UU Bea Meterai Pasal 3: "nilai nominal LEBIH DARI Rp5.000.000" — strictly
  // di atas, Rp5.000.000 persis TIDAK kena materai (dikonfirmasi user
  // 2026-10-13, sebelumnya salah pakai >=).
  const butuhMaterai = berfungsiTandaTerima && Number(dokumen.nominal) > BATAS_MATERAI;

  return (
    <div className="sheet" style={{ background: '#fff', width: 720, margin: '0 auto', padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
      <KopSurat pengaturan={pengaturan} />

      <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, letterSpacing: 0.5, color: '#0E2F6E' }}>{judul}</div>
      <div style={{ textAlign: 'center', fontSize: 11, color: '#666', marginBottom: 24 }}>No: {dokumen.nomor || '(belum dikirim)'}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: booking ? 10 : 20 }}>
        <div>Kepada Yth.<br /><b>{dokumen.nama}</b></div>
        <div style={{ textAlign: 'right' }}>Tanggal: {tgl(dokumen.tanggal)}</div>
      </div>

      {booking && (
        <div style={{ fontSize: 12, background: '#f8f9fd', border: '1px solid #e0e8f0', borderRadius: 6, padding: '10px 12px', marginBottom: 16, lineHeight: 1.8 }}>
          <div><b>Booking ID:</b> {booking.id}</div>
          {booking.prog_name && <div><b>Program:</b> {booking.prog_name}</div>}
          {booking.tanggal_berangkat && <div><b>Tanggal Keberangkatan:</b> {tgl(booking.tanggal_berangkat)}</div>}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 20 }}>
        <thead>
          <tr>
            <th style={{ ...td, background: '#f0f0f0', textAlign: 'left' }}>Keterangan</th>
            <th style={{ ...td, background: '#f0f0f0', textAlign: 'center', width: 50 }}>Qty</th>
            <th style={{ ...td, background: '#f0f0f0', textAlign: 'right', width: 120 }}>Satuan</th>
            <th style={{ ...td, background: '#f0f0f0', textAlign: 'right', width: 130 }}>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {dokumen.jenis === 'tanda_terima' ? (
            <>
              <BarisItem label={`${LABEL_TIPE_PEMBAYARAN[payment?.type] || 'Pembayaran'} — diterima`}
                sub={<KeteranganPembayaran list={jamaahUntukPembayaran} />}
                qty={qtyJamaah} satuan={perUnit(dokumen.nominal, qtyJamaah)} jumlah={dokumen.nominal} tebal />
              {payment?.type === 'lunas' && booking?.total_harga != null && (
                <>
                  <BarisItem label="Total Harga Program" jumlah={booking.total_harga} />
                  <BarisItem label="DP Sudah Dibayar" jumlah={-Number(booking.dp_amount || 0)} />
                </>
              )}
              <BarisCatatan>Terbilang: <i>{terbilang(dokumen.nominal)}</i></BarisCatatan>
            </>
          ) : dokumen.jenis === 'invoice' ? (
            // Invoice: breakdown pembayaran bersih -- Total Tagihan, Sudah
            // Dibayarkan, [Judul] (yang ditagih SEKARANG, gak perlu
            // qty/satuan), Sisa kalau masih ada (dikonfirmasi user
            // 2026-10-14, "cukup total tagihan, sudah dibayar, mau
            // dibayar, sisanya") -- SENGAJA gak pakai BarisPaket (gak
            // perlu rincian paket/nama jamaah di sini, beda dari Kwitansi/
            // TTU). booking null (invoice manual tanpa booking_id) ->
            // baris Total Tagihan/Sudah Dibayar/Sisa otomatis gak muncul.
            <>
              {booking?.total_harga != null && (
                <BarisItem label="Total Tagihan Paket" jumlah={booking.total_harga} />
              )}
              {booking?.sudah_dibayar > 0 && (
                <BarisItem label="Sudah Dibayarkan" jumlah={-booking.sudah_dibayar} />
              )}
              <BarisItem label={dokumen.judul} jumlah={dokumen.nominal} tebal />
              <BarisCatatan>Terbilang: <i>{terbilang(dokumen.nominal)}</i></BarisCatatan>
              {booking?.sisa_pembayaran > 0 && (
                <BarisItem label="Sisa Pembayaran" sub="*Dilunasi maksimal H-30 sebelum keberangkatan" jumlah={booking.sisa_pembayaran} />
              )}
            </>
          ) : punyaRincianBooking ? (
            <>
              <BarisPaket booking={booking} listOverride={dokumen.jenis === 'kwitansi' ? jamaahUntukPembayaran : undefined} />

              {booking.opsi_tambahan_total > 0 && (
                <BarisItem
                  label={booking.opsi_tambahan_nama?.length > 0 ? `Opsi Tambahan: ${booking.opsi_tambahan_nama.join(', ')}` : 'Opsi Tambahan'}
                  jumlah={booking.opsi_tambahan_total}
                />
              )}

              {dokumen.jenis === 'kwitansi' && dokumen.nominal_dp != null && (
                <>
                  <BarisItem label="Uang Muka (DP) — diterima" qty={qtyJamaah} satuan={perUnit(dokumen.nominal_dp, qtyJamaah)} jumlah={dokumen.nominal_dp} />
                  {dokumen.status === 'paid' ? (
                    <BarisItem label="Pelunasan — diterima" qty={qtyJamaah} satuan={perUnit(dokumen.nominal_pelunasan, qtyJamaah)} jumlah={dokumen.nominal_pelunasan} />
                  ) : (
                    <BarisCatatan>Pelunasan: <i>belum dibayar</i></BarisCatatan>
                  )}
                  <BarisItem label={dokumen.status === 'paid' ? 'TOTAL PAID (diterima)' : 'Total Diterima Sejauh Ini'} jumlah={dokumen.nominal} tebal />
                  <BarisCatatan>Terbilang: <i>{terbilang(dokumen.nominal)}</i></BarisCatatan>
                </>
              )}
            </>
          ) : (
            <>
              <BarisItem label={LABEL_BARIS[dokumen.jenis]} jumlah={dokumen.nominal} tebal />
              <BarisCatatan>Terbilang: <i>{terbilang(dokumen.nominal)}</i></BarisCatatan>
            </>
          )}
        </tbody>
      </table>

      {dokumen.keterangan && dokumen.is_manual ? (
        <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Catatan: {dokumen.keterangan}</div>
      ) : null}

      {BUTUH_REKENING.includes(dokumen.jenis) && dokumen.status !== 'paid' && (pengaturan.bank_nama || pengaturan.bank_rekening) && (
        <div style={{ fontSize: 12, border: '1px dashed #1A4FA0', borderRadius: 6, padding: '10px 12px', marginBottom: 20, background: '#F5F8FE' }}>
          <div style={{ fontWeight: 700, color: '#0E2F6E', marginBottom: 4 }}>Silakan transfer ke rekening berikut:</div>
          <div>{pengaturan.bank_nama} — {pengaturan.bank_rekening}</div>
          <div>a.n. {pengaturan.bank_atas_nama}</div>
        </div>
      )}

      {dokumen.status === 'paid' && (
        <div style={{ display: 'inline-block', border: '3px solid #16a34a', color: '#16a34a', fontWeight: 800, fontSize: 16, padding: '4px 20px', transform: 'rotate(-6deg)', marginBottom: 16 }}>
          PAID
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 40 }}>
        <div style={{ textAlign: 'center', fontSize: 12, position: 'relative' }}>
          {tgl(dokumen.tanggal)}
          <div style={{ height: butuhMaterai ? 110 : 70, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {!butuhMaterai && pengaturan.cap_perusahaan_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pengaturan.cap_perusahaan_path} alt="Cap Perusahaan"
                style={{ position: 'absolute', left: -75, top: '50%', transform: 'translateY(-50%) rotate(-10deg)', width: 95, opacity: 0.85 }} />
            )}
            {butuhMaterai && (
              <div style={{ color: '#999', fontSize: 11, textAlign: 'center', lineHeight: 1.4 }}>
                Materai<br />Rp10.000
              </div>
            )}
            {!butuhMaterai && pengaturan.ttd_penandatangan_keuangan_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pengaturan.ttd_penandatangan_keuangan_path} alt="Tanda Tangan"
                style={{ position: 'absolute', height: 65, objectFit: 'contain' }} />
            )}
          </div>
          <div style={{ fontWeight: 700, textDecoration: 'underline' }}>{pengaturan.nama_penandatangan_keuangan || pengaturan.nama_penandatangan || '-'}</div>
          <div style={{ color: '#666' }}>{pengaturan.jabatan_penandatangan_keuangan || pengaturan.jabatan_penandatangan || '-'}</div>
        </div>
      </div>
    </div>
  );
}
