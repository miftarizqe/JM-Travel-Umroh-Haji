// Generate PDF Invoice/Kwitansi/Tanda Terima Uang — PDF ASLI (react-pdf,
// server-side), BUKAN HTML+window.print() kayak /admin/cetak-invoice/[id]
// (dikonfirmasi user 2026-10-22, "kenapasih gakbisa kayak perjanjian yang
// gampang rapihnya" -- perjanjian/SK-CIF/dll SELALU render PDF asli jadi
// preview = hasil akhir, gak pernah ada beda browser-print vs layar). Kop
// surat (Kop, pdfStyles.js) dipasang `fixed` per halaman -- react-pdf yang
// handle pagination otomatis kalau tabelnya kepanjangan, kop surat ikut
// ngulang sendiri di SETIAP halaman baru, gak perlu CSS @page/position:fixed
// trik yang sebelumnya dipakai di jalur HTML.
// Isi/logic SENGAJA diporting 1:1 dari DokumenCetak.jsx (HTML) -- JANGAN
// biarkan dua-duanya nyimpang kalau salah satu direvisi belakangan.
import { Document, Page, Text, View, Image, renderToBuffer } from '@react-pdf/renderer';
import { styles, Kop } from './pdfStyles';
import { terbilang } from '@/lib/terbilang';

const px = (n) => n * 0.75;
const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
const perUnit = (total, qty) => qty > 0 ? Math.round(Number(total) / qty) : Number(total);

export const JUDUL = { invoice: 'INVOICE', kwitansi: 'KWITANSI PEMBAYARAN', tanda_terima: 'TANDA TERIMA UANG' };
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const LABEL_TIPE_PEMBAYARAN = { dp: 'Uang Muka (DP)', lunas: 'Pelunasan' };
const LABEL_BARIS = { kwitansi: 'Pembayaran Total Paket (Paid)', tanda_terima: 'Pembayaran Diterima' };
const BATAS_MATERAI = 5_000_000;

function uniformCombo(list) {
  if (!list || list.length === 0) return true;
  const first = list[0];
  return list.every(j => j.paket === first.paket && j.kamar === first.kamar);
}

const tbl = {
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000' },
  headRow: { flexDirection: 'row', borderWidth: 1, borderColor: '#000', backgroundColor: '#f0f0f0' },
  cellKet: { flex: 3, padding: px(6), borderRightWidth: 1, borderRightColor: '#000' },
  cellQty: { flex: 0.6, padding: px(6), borderRightWidth: 1, borderRightColor: '#000', textAlign: 'center' },
  cellSatuan: { flex: 1.2, padding: px(6), borderRightWidth: 1, borderRightColor: '#000', textAlign: 'right' },
  cellJumlah: { flex: 1.3, padding: px(6), textAlign: 'right' },
};

function BarisItem({ label, sub, qty, satuan, jumlah, tebal }) {
  return (
    <View style={tbl.row} wrap={false}>
      <View style={tbl.cellKet}>
        <Text style={tebal ? { fontFamily: 'Helvetica-Bold' } : undefined}>{label}</Text>
        {sub}
      </View>
      <Text style={{ ...tbl.cellQty, fontFamily: tebal ? 'Helvetica-Bold' : undefined }}>{qty ?? ''}</Text>
      <Text style={{ ...tbl.cellSatuan, fontFamily: tebal ? 'Helvetica-Bold' : undefined }}>{satuan != null ? rp(satuan) : ''}</Text>
      <Text style={{ ...tbl.cellJumlah, fontFamily: tebal ? 'Helvetica-Bold' : undefined }}>{rp(jumlah)}</Text>
    </View>
  );
}

// "Paket: X" (kalau seragam) + "Atas Nama Jamaah: [daftar]" — persis
// KeteranganPembayaran versi HTML.
function KeteranganPembayaran({ list }) {
  if (!list || list.length === 0) return null;
  const uniform = uniformCombo(list);
  const first = list[0];
  return (
    <View style={{ marginTop: px(4) }}>
      {uniform && first?.paket && (
        <Text style={{ fontSize: px(9.5) }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Paket: </Text>{PAKET_LABEL[first.paket] || first.paket}{first.kamar ? ` · ${first.kamar}` : ''}</Text>
      )}
      <Text style={{ fontSize: px(9.5), fontFamily: 'Helvetica-Bold' }}>Atas Nama Jamaah:</Text>
      {list.map((j, i) => (
        <Text key={i} style={{ fontSize: px(9.5) }}>
          {'  '}• {j.nama}{!uniform ? ` — ${PAKET_LABEL[j.paket] || j.paket}${j.kamar ? ` · ${j.kamar}` : ''}` : ''}
        </Text>
      ))}
    </View>
  );
}

function BarisPaket({ booking }) {
  const list = booking.jamaah_breakdown || [];
  const namaList = booking.jamaah_nama || [];
  const qty = list.length || Number(booking.jumlah_jamaah || 1);

  if (list.length > 0 && !uniformCombo(list)) {
    return list.map((j, i) => (
      <View key={i} style={tbl.row} wrap={false}>
        <Text style={tbl.cellKet}>{j.nama} — {PAKET_LABEL[j.paket] || j.paket}{j.kamar ? ` · ${j.kamar}` : ''}</Text>
        <Text style={tbl.cellQty}>1</Text>
        <Text style={tbl.cellSatuan}>{rp(j.hargaJual)}</Text>
        <Text style={tbl.cellJumlah}>{rp(j.hargaJual)}</Text>
      </View>
    ));
  }

  return (
    <View style={tbl.row} wrap={false}>
      <View style={tbl.cellKet}>
        <Text><Text style={{ fontFamily: 'Helvetica-Bold' }}>Paket: </Text>{PAKET_LABEL[booking.paket] || booking.paket}{booking.kamar ? ` · ${booking.kamar}` : ''}</Text>
        {namaList.length > 0 && (
          <View style={{ marginTop: px(4) }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Atas Nama Jamaah:</Text>
            {namaList.map((nama, i) => <Text key={i}>{'  '}• {nama}</Text>)}
          </View>
        )}
      </View>
      <Text style={tbl.cellQty}>{qty}</Text>
      <Text style={tbl.cellSatuan}>{rp(perUnit(booking.total_harga, qty))}</Text>
      <Text style={tbl.cellJumlah}>{rp(booking.total_harga)}</Text>
    </View>
  );
}

/**
 * @param {object} opts
 * @param {object} opts.dokumen - baris invoice_kwitansi (butuh `judul` kalau
 *   ada override, lihat generateKwitansiSetoranPendaftaranSahabat)
 * @param {object|null} opts.booking - null kalau dokumen manual/bookingless
 * @param {object|null} opts.payment - {type} kalau dokumen.payment_id ada
 * @param {object} opts.pengaturan
 * @param {Array} [opts.jamaahUntukPembayaran] - PRE-COMPUTED oleh caller,
 *   SAMA PERSIS sumbernya kayak GET /api/admin/invoice-kwitansi/[id]
 *   (jamaah_breakdown_pembayaran booking, ATAU fallback [{nama:dokumen.nama}]
 *   buat dokumen bookingless kayak Kwitansi setoran pendaftaran sahabat).
 */
export async function renderInvoicePdf({ dokumen, booking, payment, pengaturan, jamaahUntukPembayaran = [], untukTtdDigital }) {
  const judul = JUDUL[dokumen.jenis] || 'INVOICE';
  const punyaRincianBooking = booking?.total_harga != null;
  const qtyJamaah = jamaahUntukPembayaran.length || (booking ? Number(booking.jumlah_jamaah || 1) : 1);
  const berfungsiTandaTerima = dokumen.jenis === 'kwitansi' || (dokumen.jenis === 'tanda_terima' && dokumen.status === 'paid');
  const butuhMaterai = berfungsiTandaTerima && Number(dokumen.nominal) > BATAS_MATERAI;

  const doc = (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View fixed><Kop /></View>

        <Text style={{ ...styles.judul, color: '#0E2F6E' }}>{judul}</Text>
        <Text style={styles.subJudul}>No: {dokumen.nomor || '(belum dikirim)'}</Text>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: punyaRincianBooking ? px(10) : px(20) }}>
          <View>
            <Text>Kepada Yth.</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{dokumen.nama}</Text>
          </View>
          <Text>Tanggal: {tgl(dokumen.tanggal)}</Text>
        </View>

        {booking && (
          <View style={{ backgroundColor: '#f8f9fd', padding: px(10), marginBottom: px(16) }}>
            <Text>Booking ID: {booking.id}</Text>
            {booking.prog_name && <Text>Program: {booking.prog_name}</Text>}
            {booking.tanggal_berangkat && <Text>Tanggal Keberangkatan: {tgl(booking.tanggal_berangkat)}</Text>}
          </View>
        )}

        <View style={tbl.headRow}>
          <Text style={{ ...tbl.cellKet, fontFamily: 'Helvetica-Bold' }}>Keterangan</Text>
          <Text style={{ ...tbl.cellQty, fontFamily: 'Helvetica-Bold' }}>Qty</Text>
          <Text style={{ ...tbl.cellSatuan, fontFamily: 'Helvetica-Bold' }}>Satuan</Text>
          <Text style={{ ...tbl.cellJumlah, fontFamily: 'Helvetica-Bold' }}>Jumlah</Text>
        </View>

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
            <View style={{ padding: px(6), borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000' }}>
              <Text style={{ fontSize: px(9.5), fontStyle: 'italic' }}>Terbilang: {terbilang(dokumen.nominal)}</Text>
            </View>
          </>
        ) : dokumen.jenis === 'kwitansi' ? (
          <>
            <BarisItem label={dokumen.judul || LABEL_BARIS.kwitansi}
              sub={<KeteranganPembayaran list={jamaahUntukPembayaran} />}
              qty={qtyJamaah} satuan={perUnit(dokumen.nominal, qtyJamaah)} jumlah={dokumen.nominal} tebal />
            <View style={{ padding: px(6), borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000' }}>
              <Text style={{ fontSize: px(9.5), fontStyle: 'italic' }}>Terbilang: {terbilang(dokumen.nominal)}</Text>
            </View>
          </>
        ) : punyaRincianBooking ? (
          <>
            <BarisPaket booking={booking} />
            {booking.opsi_tambahan_total > 0 && (
              <BarisItem label={booking.opsi_tambahan_nama?.length > 0 ? `Opsi Tambahan: ${booking.opsi_tambahan_nama.join(', ')}` : 'Opsi Tambahan'}
                jumlah={booking.opsi_tambahan_total} />
            )}
            <BarisItem label="Total Tagihan Paket" jumlah={booking.total_harga} />
            {booking.sudah_dibayar > 0 && <BarisItem label="Sudah Dibayarkan" jumlah={-booking.sudah_dibayar} />}
            <BarisItem label={dokumen.judul} jumlah={dokumen.nominal} tebal />
            <View style={{ padding: px(6), borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000' }}>
              <Text style={{ fontSize: px(9.5), fontStyle: 'italic' }}>Terbilang: {terbilang(dokumen.nominal)}</Text>
            </View>
            {booking.sisa_pembayaran > 0 && (
              <BarisItem label="Sisa Pembayaran" jumlah={booking.sisa_pembayaran} />
            )}
          </>
        ) : (
          <>
            <BarisItem label={dokumen.jenis === 'invoice' ? dokumen.judul : LABEL_BARIS[dokumen.jenis]} jumlah={dokumen.nominal} tebal />
            <View style={{ padding: px(6), borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000' }}>
              <Text style={{ fontSize: px(9.5), fontStyle: 'italic' }}>Terbilang: {terbilang(dokumen.nominal)}</Text>
            </View>
          </>
        )}

        {BUTUH_REKENING(dokumen) && (pengaturan.bank_nama || pengaturan.bank_rekening) && (
          <View style={{ borderWidth: 1, borderColor: '#1A4FA0', borderStyle: 'dashed', padding: px(10), marginTop: px(16), backgroundColor: '#F5F8FE' }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: '#0E2F6E', marginBottom: px(4) }}>Silakan transfer ke rekening berikut:</Text>
            <Text>{pengaturan.bank_nama} — {pengaturan.bank_rekening}</Text>
            <Text>a.n. {pengaturan.bank_atas_nama}</Text>
          </View>
        )}

        {dokumen.status === 'paid' && (
          <View style={{ borderWidth: 2, borderColor: '#16a34a', alignSelf: 'flex-start', marginTop: px(16), paddingHorizontal: px(14), paddingVertical: px(3) }}>
            <Text style={{ color: '#16a34a', fontFamily: 'Helvetica-Bold' }}>PAID</Text>
          </View>
        )}

        <View style={{ alignItems: 'flex-end', marginTop: px(40) }} wrap={false}>
          <View style={{ alignItems: 'center' }}>
            <Text>{tgl(dokumen.tanggal)}</Text>
            <View style={{ width: px(95), height: butuhMaterai ? px(80) : px(60), justifyContent: 'center', alignItems: 'center' }}>
              {butuhMaterai ? (
                <Text style={{ fontSize: px(9), color: '#999', textAlign: 'center' }}>Materai{'\n'}Rp10.000</Text>
              ) : (
                <>
                  {/* Cap digeser nimpa TTD (dikonfirmasi user 2026-10-21) --
                      sama posisi relatif kayak versi HTML (DokumenCetak.jsx).
                      Top dalam pt tetap (bukan persen+transform) -- lebih
                      aman buat engine layout react-pdf. */}
                  {pengaturan.cap_perusahaan_path && (
                    <Image src={pengaturan.cap_perusahaan_path}
                      style={{ position: 'absolute', left: px(20), top: px(5), width: px(95), opacity: 0.85 }} />
                  )}
                  {pengaturan.ttd_penandatangan_keuangan_path && (
                    <Image src={pengaturan.ttd_penandatangan_keuangan_path}
                      style={{ position: 'absolute', top: px(10), height: px(40) }} />
                  )}
                  {untukTtdDigital && <Text style={{ fontSize: px(8), color: '#999', marginTop: px(2) }}>(menunggu TTD digital)</Text>}
                </>
              )}
            </View>
            <Text style={{ fontFamily: 'Helvetica-Bold', textDecoration: 'underline' }}>
              {pengaturan.nama_penandatangan_keuangan || '-'}
            </Text>
            <Text style={{ color: '#666' }}>{pengaturan.jabatan_penandatangan_keuangan || '-'}</Text>
          </View>
        </View>

        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => totalPages > 1 ? `${pageNumber} / ${totalPages}` : ''} fixed />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}

// kwitansi/tanda_terima = udah dibayar, gak perlu instruksi transfer —
// sama persis BUTUH_REKENING versi HTML (DokumenCetak.jsx).
function BUTUH_REKENING(dokumen) {
  return dokumen.jenis === 'invoice' && dokumen.status !== 'paid';
}
