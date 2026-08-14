// Generate PDF Invoice/Kwitansi/Tanda Terima — konten inti identik dengan
// src/app/admin/cetak-invoice/[id]/page.jsx (HTML). Cakupan disederhanakan
// ke kasus paling umum (baris paket booking ATAU baris generik + terbilang)
// dibanding versi HTML yang punya banyak cabang jenis dokumen — kalau butuh
// presisi pixel-perfect penuh, admin tetap bisa pakai jalur cetak fisik lama.
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { styles, Kop } from './pdfStyles';
import { terbilang } from '@/lib/terbilang';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
const JUDUL = { invoice: 'INVOICE', kwitansi: 'KWITANSI PEMBAYARAN', tanda_terima: 'TANDA TERIMA UANG' };
const BATAS_MATERAI = 5_000_000;

const tblStyles = {
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000' },
  headRow: { flexDirection: 'row', borderWidth: 1, borderColor: '#000', backgroundColor: '#f0f0f0' },
  cellKet: { flex: 3, padding: 6, borderRightWidth: 1, borderRightColor: '#000' },
  cellQty: { flex: 0.6, padding: 6, borderRightWidth: 1, borderRightColor: '#000', textAlign: 'center' },
  cellSatuan: { flex: 1.2, padding: 6, borderRightWidth: 1, borderRightColor: '#000', textAlign: 'right' },
  cellJumlah: { flex: 1.3, padding: 6, textAlign: 'right' },
};

/**
 * @param {object} opts
 * @param {object} opts.dokumen - baris invoice_kwitansi
 * @param {object|null} opts.booking
 * @param {object} opts.pengaturan
 * @param {string} opts.logoPath
 * @param {boolean} [opts.untukTtdDigital]
 */
export async function renderInvoicePdf({ dokumen, booking, pengaturan, logoPath, untukTtdDigital }) {
  const judul = JUDUL[dokumen.jenis] || 'INVOICE';
  const berfungsiTandaTerima = dokumen.jenis === 'kwitansi' || dokumen.status === 'paid';
  const butuhMaterai = berfungsiTandaTerima && Number(dokumen.nominal) >= BATAS_MATERAI;
  const qty = booking ? Number(booking.jumlah_jamaah || 1) : 1;
  const satuan = qty > 0 ? Math.round(Number(dokumen.nominal) / qty) : Number(dokumen.nominal);
  const label = dokumen.jenis === 'invoice' ? (dokumen.judul || 'Pembayaran')
    : dokumen.jenis === 'kwitansi' ? 'Pembayaran Total Paket (Paid)'
    : 'Pembayaran Diterima';

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Kop pengaturan={pengaturan} logoPath={logoPath} />
        <Text style={{ ...styles.judul, color: '#0E2F6E' }}>{judul}</Text>
        <Text style={styles.subJudul}>No: {dokumen.nomor}</Text>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            <Text>Kepada Yth.</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{dokumen.nama}</Text>
          </View>
          <Text>Tanggal: {tgl(dokumen.tanggal)}</Text>
        </View>

        {booking && (
          <View style={{ backgroundColor: '#f8f9fd', padding: 8, marginBottom: 12 }}>
            <Text>Booking ID: {booking.id}</Text>
            {booking.prog_name && <Text>Program: {booking.prog_name}</Text>}
          </View>
        )}

        <View style={tblStyles.headRow}>
          <Text style={{ ...tblStyles.cellKet, fontFamily: 'Helvetica-Bold' }}>Keterangan</Text>
          <Text style={{ ...tblStyles.cellQty, fontFamily: 'Helvetica-Bold' }}>Qty</Text>
          <Text style={{ ...tblStyles.cellSatuan, fontFamily: 'Helvetica-Bold' }}>Satuan</Text>
          <Text style={{ ...tblStyles.cellJumlah, fontFamily: 'Helvetica-Bold' }}>Jumlah</Text>
        </View>
        <View style={tblStyles.row}>
          <Text style={tblStyles.cellKet}>{label}</Text>
          <Text style={tblStyles.cellQty}>{qty}</Text>
          <Text style={tblStyles.cellSatuan}>{rp(satuan)}</Text>
          <Text style={tblStyles.cellJumlah}>{rp(dokumen.nominal)}</Text>
        </View>
        <View style={{ padding: 6, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000' }}>
          <Text style={{ fontSize: 9.5, fontStyle: 'italic' }}>Terbilang: {terbilang(dokumen.nominal)}</Text>
        </View>

        {dokumen.status === 'paid' && (
          <View style={{ borderWidth: 2, borderColor: '#16a34a', alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 14, paddingVertical: 3 }}>
            <Text style={{ color: '#16a34a', fontFamily: 'Helvetica-Bold' }}>PAID</Text>
          </View>
        )}

        <View style={{ alignItems: 'flex-end', marginTop: 30 }}>
          <View style={{ alignItems: 'center' }}>
            <Text>{tgl(dokumen.tanggal)}</Text>
            <View style={{ height: butuhMaterai ? 60 : 40, justifyContent: 'center', alignItems: 'center' }}>
              {butuhMaterai && (
                <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#999', width: 90, height: 65, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 8, color: '#999', textAlign: 'center' }}>Materai{'\n'}Rp10.000</Text>
                </View>
              )}
              {untukTtdDigital && <Text style={{ fontSize: 8, color: '#999', marginTop: 2 }}>(menunggu TTD digital)</Text>}
            </View>
            <Text style={{ fontFamily: 'Helvetica-Bold', textDecoration: 'underline' }}>
              {pengaturan.nama_penandatangan_keuangan || pengaturan.nama_penandatangan || '-'}
            </Text>
            <Text style={{ color: '#666' }}>{pengaturan.jabatan_penandatangan_keuangan || pengaturan.jabatan_penandatangan || '-'}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
